import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

// GET /api/inventory - Get in-house inventory with equipment details
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('in_house_inventory')
      .select(`
        *,
        equipment:equipment_catalog(*)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Error fetching inventory:', err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// POST /api/inventory - Add equipment to in-house inventory
router.post('/', async (req, res) => {
  try {
    const { catalogId, quantityOwned, storageLocation, serialNumbers, purchasePrice } = req.body;

    // Check if already exists
    const { data: existing } = await supabase
      .from('in_house_inventory')
      .select('*')
      .eq('catalog_id', catalogId)
      .single();

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('in_house_inventory')
        .update({
          quantity_owned: quantityOwned,
          quantity_available: quantityOwned, // Reset available to owned
          storage_location: storageLocation,
          serial_numbers: serialNumbers || [],
          purchase_price: purchasePrice,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ data, message: 'Inventory updated' });
    } else {
      // Create new
      const { data, error } = await supabase
        .from('in_house_inventory')
        .insert({
          catalog_id: catalogId,
          quantity_owned: quantityOwned,
          quantity_available: quantityOwned,
          storage_location: storageLocation,
          serial_numbers: serialNumbers || [],
          purchase_price: purchasePrice,
          condition: 'New'
        })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json({ data, message: 'Inventory added' });
    }
  } catch (err) {
    console.error('Error adding inventory:', err);
    res.status(500).json({ error: 'Failed to add inventory' });
  }
});

// PUT /api/inventory/:id - Update inventory item
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantityOwned, quantityAvailable, storageLocation, condition } = req.body;

    const { data, error } = await supabase
      .from('in_house_inventory')
      .update({
        quantity_owned: quantityOwned,
        quantity_available: quantityAvailable,
        storage_location: storageLocation,
        condition: condition,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Error updating inventory:', err);
    res.status(500).json({ error: 'Failed to update inventory' });
  }
});

// POST /api/inventory/fulfillment-lists - Generate fulfillment lists for a quote
router.post('/fulfillment-lists', async (req, res) => {
  try {
    const { items } = req.body; // Array of { equipmentId, quantity, name, sku }

    const basePullList: any[] = [];
    const partnerOrderList: any[] = [];

    for (const item of items) {
      // Check in-house inventory
      const { data: inventory } = await supabase
        .from('in_house_inventory')
        .select('*')
        .eq('catalog_id', item.equipmentId)
        .eq('is_active', true)
        .single();

      const inHouseAvailable = inventory?.quantity_available || 0;

      if (inHouseAvailable >= item.quantity) {
        // All from Base inventory
        basePullList.push({
          ...item,
          storageLocation: inventory.storage_location,
          serialNumbers: inventory.serial_numbers?.slice(0, item.quantity) || []
        });
      } else if (inHouseAvailable > 0) {
        // Split: some from Base, rest from partner
        basePullList.push({
          ...item,
          quantity: inHouseAvailable,
          storageLocation: inventory.storage_location,
          serialNumbers: inventory.serial_numbers?.slice(0, inHouseAvailable) || []
        });
        partnerOrderList.push({
          ...item,
          quantity: item.quantity - inHouseAvailable
        });
      } else {
        // All from partner
        partnerOrderList.push(item);
      }
    }

    res.json({
      data: {
        basePullList,
        partnerOrderList,
        summary: {
          baseItems: basePullList.reduce((sum, i) => sum + i.quantity, 0),
          partnerItems: partnerOrderList.reduce((sum, i) => sum + i.quantity, 0),
          totalItems: items.reduce((sum: number, i: any) => sum + i.quantity, 0)
        }
      }
    });
  } catch (err) {
    console.error('Error generating fulfillment lists:', err);
    res.status(500).json({ error: 'Failed to generate fulfillment lists' });
  }
});

export default router;
