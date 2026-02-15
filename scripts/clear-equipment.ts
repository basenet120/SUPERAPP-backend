import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearEquipment() {
  console.log('Clearing existing equipment...');
  const { error } = await supabase.from('equipment_catalog').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) {
    console.error('Clear error:', error);
    process.exit(1);
  }
  console.log('Cleared existing equipment');
  
  // Verify count
  const { count } = await supabase.from('equipment_catalog').select('*', { count: 'exact', head: true });
  console.log(`Current count: ${count}`);
}

clearEquipment();
