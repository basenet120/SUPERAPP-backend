import { Router } from 'express';
import { supabase, type EquipmentWithAvailability } from '../supabase.js';

const router = Router();

// GET /api/equipment - List all equipment with availability (paginated)
router.get('/', async (req, res) => {
  try {
    const { category, search, availability, page = '1', limit = '25' } = req.query;
    
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 25));
    const offset = (pageNum - 1) * limitNum;
    
    let query = supabase
      .from('equipment_catalog')
      .select(`
        *,
        in_house:in_house_inventory(*)
      `, { count: 'exact' })
      .eq('is_active', true);

    // Filter by category
    if (category) {
      query = query.eq('category', category);
    }

    // Search by name or SKU
    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limitNum - 1);
    
    // Order by name
    query = query.order('name');

    const { data: equipment, error, count } = await query;

    if (error) throw error;

    // Transform to include availability status
    const transformed: EquipmentWithAvailability[] = equipment.map((item: any) => {
      const hasInHouse = item.in_house && item.in_house.length > 0;
      const inHouseQty = hasInHouse ? item.in_house[0].quantity_available : 0;
      
      return {
        ...item,
        in_house: hasInHouse ? item.in_house[0] : null,
        availability: hasInHouse && inHouseQty > 0 ? 'in-house' : 'partner'
      };
    });

    // Filter by availability if requested (post-query filter)
    let filtered = transformed;
    if (availability === 'in-house') {
      filtered = transformed.filter(e => e.availability === 'in-house');
    } else if (availability === 'partner') {
      filtered = transformed.filter(e => e.availability === 'partner');
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      data: filtered,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
  } catch (err) {
    console.error('Error fetching equipment:', err);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});

// GET /api/equipment/categories - Get all categories
router.get('/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('equipment_categories')
      .select('*')
      .eq('is_active', true)
      .order('display_order');

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/equipment/:id - Get single equipment item
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('equipment_catalog')
      .select(`
        *,
        in_house:in_house_inventory(*),
        partner:rental_partners(name, discount_rate)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const hasInHouse = data.in_house && data.in_house.length > 0;
    const transformed = {
      ...data,
      in_house: hasInHouse ? data.in_house[0] : null,
      availability: hasInHouse && data.in_house[0].quantity_available > 0 ? 'in-house' : 'partner'
    };

    res.json({ data: transformed });
  } catch (err) {
    console.error('Error fetching equipment:', err);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});

export default router;
