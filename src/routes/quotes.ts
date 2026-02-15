import { Router } from 'express';
import { supabase } from '../supabase.js';
import { createQBEstimate } from './quickbooks.js';

const router = Router();

// POST /api/quotes - Create a new quote
router.post('/', async (req, res) => {
  try {
    const {
      clientName,
      clientEmail,
      clientPhone,
      clientCompany,
      startDate,
      endDate,
      duration,
      items,
      pricing,
      notes
    } = req.body;

    // Validate required fields
    if (!clientName || !clientEmail || !startDate || !endDate || !items || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate quote number
    const date = new Date();
    const quoteNumber = `Q-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    // Create quote record
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert({
        quote_number: quoteNumber,
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone || null,
        client_company: clientCompany || null,
        start_date: startDate,
        end_date: endDate,
        duration_days: duration,
        status: 'pending',
        pricing: pricing,
        notes: notes || null,
        deposit_required: pricing.total * 0.5 // 50% deposit
      })
      .select()
      .single();

    if (quoteError) {
      console.error('Quote creation error:', quoteError);
      throw quoteError;
    }

    // Create quote items
    const quoteItems = items.map((item: any) => ({
      quote_id: quote.id,
      equipment_id: item.equipmentId,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      daily_rate: item.dailyRate,
      total_price: item.total
    }));

    const { error: itemsError } = await supabase
      .from('quote_items')
      .insert(quoteItems);

    if (itemsError) {
      console.error('Quote items error:', itemsError);
      throw itemsError;
    }

    // Create or update lead in CRM
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('email', clientEmail)
      .single();

    if (existingLead) {
      // Update existing lead
      await supabase
        .from('leads')
        .update({
          name: clientName,
          phone: clientPhone || existingLead.phone,
          company: clientCompany || existingLead.company,
          status: 'quote_requested',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingLead.id);
    } else {
      // Create new lead
      await supabase
        .from('leads')
        .insert({
          name: clientName,
          email: clientEmail,
          phone: clientPhone || null,
          company: clientCompany || null,
          status: 'quote_requested',
          source: 'website'
        });
    }

    // Create QuickBooks estimate (if connected)
    let qbEstimate = null;
    try {
      qbEstimate = await createQBEstimate({
        clientName,
        clientEmail,
        clientPhone,
        clientCompany,
        startDate,
        endDate,
        duration,
        items,
        pricing,
        notes
      });
      console.log('QB Estimate created:', qbEstimate.Id);
    } catch (qbErr) {
      console.error('Failed to create QB estimate:', qbErr);
      // Don't fail the quote if QB fails
    }

    res.status(201).json({
      success: true,
      quote: {
        id: quote.id,
        quoteNumber: quote.quote_number,
        total: pricing.total
      },
      qbEstimate: qbEstimate ? {
        id: qbEstimate.Id,
        docNumber: qbEstimate.DocNumber
      } : null
    });
  } catch (err) {
    console.error('Error creating quote:', err);
    res.status(500).json({ error: 'Failed to create quote' });
  }
});

// GET /api/quotes - List quotes (admin)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 25, status } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = supabase
      .from('quotes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit as string) - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      data,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalCount: count,
        totalPages: Math.ceil((count || 0) / parseInt(limit as string))
      }
    });
  } catch (err) {
    console.error('Error fetching quotes:', err);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

// GET /api/quotes/:id - Get single quote with items
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', id)
      .single();

    if (quoteError) throw quoteError;
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const { data: items, error: itemsError } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', id);

    if (itemsError) throw itemsError;

    res.json({
      data: {
        ...quote,
        items
      }
    });
  } catch (err) {
    console.error('Error fetching quote:', err);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

export default router;
