import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Type definitions for tables
export interface EquipmentCatalog {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  sub_category: string | null;
  partner_price: number | null;
  retail_price: number | null;
  image_url: string | null;
  local_image_path: string | null;
  partner_id: string | null;
  specs: Record<string, any>;
  tags: string[];
  is_active: boolean;
  created_at: string;
}

export interface InHouseInventory {
  id: string;
  catalog_id: string;
  quantity_owned: number;
  quantity_available: number;
  serial_numbers: string[];
  storage_location: string | null;
  condition: string;
  is_active: boolean;
}

export interface EquipmentWithAvailability extends EquipmentCatalog {
  in_house: InHouseInventory | null;
  availability: 'in-house' | 'partner' | 'both';
}
