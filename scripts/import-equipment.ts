import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL || 'https://ljwsviibrdgutpgrzjli.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseKey) {
  console.error('Missing SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface CSVEquipment {
  SKU: string;
  url: string;
  name: string;
  Unit: string;
  'QTY on Hand': string;
  'Our Price': string;
  'Selling Price': string;
  'KM PRICE': string;
  Account: string;
  'Taxable?': string;
  Description: string;
  'Cost Price': string;
  'Account.1': string;
  'Owner Type': string;
  'Equipment Category': string;
  image_url: string;
}

function parseCSV(content: string): CSVEquipment[] {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map(line => {
    // Handle quoted fields
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const obj: any = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] || '';
    });
    return obj as CSVEquipment;
  });
}

function parsePrice(price: string): number | null {
  if (!price || price === '$' || price === '-') return null;
  const cleaned = price.replace('$', '').replace(',', '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

async function importEquipment() {
  const csvPath = '/Users/bobbotsworth/.openclaw/workspace/base-super-app/backend/km_equipment.csv';
  
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found:', csvPath);
    process.exit(1);
  }
  
  console.log('Reading CSV...');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const items = parseCSV(content);
  
  console.log(`Found ${items.length} items`);
  
  // Get KM Rental partner ID
  const { data: partner } = await supabase
    .from('rental_partners')
    .select('id')
    .eq('name', 'KM Rental Equipment')
    .single();
  
  if (!partner) {
    console.error('KM Rental Equipment partner not found');
    process.exit(1);
  }
  
  const partnerId = partner.id;
  console.log('Partner ID:', partnerId);
  
  // Import first 20 items as sample
  const sampleItems = items.slice(0, 20);
  
  let success = 0;
  let failed = 0;
  
  for (const item of sampleItems) {
    const partnerPrice = parsePrice(item['KM PRICE']);
    const retailPrice = parsePrice(item['Selling Price']);
    
    // Map category names
    let category = item['Equipment Category'];
    if (category === 'Stills Cameras') category = 'Cameras';
    if (category === 'Power & Media') category = 'Power';
    
    const { error } = await supabase.from('equipment_catalog').insert({
      sku: item.SKU,
      name: item.name,
      description: item.Description || null,
      category: category,
      sub_category: null,
      partner_price: partnerPrice,
      retail_price: retailPrice,
      image_url: item.image_url || null,
      partner_id: partnerId,
      partner_url: item.url,
      specs: {},
      tags: [],
      is_active: true
    });
    
    if (error) {
      console.error(`Failed to import ${item.SKU}:`, error.message);
      failed++;
    } else {
      console.log(`✓ Imported: ${item.name.substring(0, 50)}...`);
      success++;
    }
  }
  
  console.log(`\nImport complete: ${success} success, ${failed} failed`);
  
  // Show count
  const { count } = await supabase
    .from('equipment_catalog')
    .select('*', { count: 'exact', head: true });
  
  console.log(`Total equipment in database: ${count}`);
}

importEquipment().catch(console.error);
