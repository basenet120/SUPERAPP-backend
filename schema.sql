-- Base OS Equipment Rental Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Rental partners (KM Rental, etc.)
CREATE TABLE rental_partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    contact_name VARCHAR(100),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    discount_rate DECIMAL(5,2) DEFAULT 60.00, -- 60% off retail
    payment_terms VARCHAR(100) DEFAULT 'Net 30',
    api_endpoint VARCHAR(500),
    csv_import_url VARCHAR(500),
    last_imported_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Equipment catalog (imported from partners)
CREATE TABLE equipment_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    sub_category VARCHAR(100),
    
    -- Pricing
    partner_price DECIMAL(10,2), -- Cost to you
    retail_price DECIMAL(10,2),  -- Your selling price
    
    -- Media
    image_url VARCHAR(500),
    local_image_path VARCHAR(500),
    
    -- Source
    partner_id UUID REFERENCES rental_partners(id),
    partner_url VARCHAR(500),
    
    -- Metadata
    specs JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- In-house inventory (YOUR stock)
CREATE TABLE in_house_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    catalog_id UUID REFERENCES equipment_catalog(id) ON DELETE CASCADE,
    
    -- Stock levels
    quantity_owned INTEGER DEFAULT 0,
    quantity_available INTEGER DEFAULT 0,
    
    -- Tracking
    serial_numbers TEXT[] DEFAULT '{}',
    purchase_date DATE,
    purchase_price DECIMAL(10,2),
    condition VARCHAR(50) DEFAULT 'New',
    
    -- Location
    storage_location VARCHAR(100),
    
    -- Maintenance
    last_maintenance DATE,
    next_maintenance DATE,
    maintenance_notes TEXT,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Categories for filtering
CREATE TABLE equipment_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_order INTEGER DEFAULT 0,
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT true
);

-- Insert default partner: KM Rental
INSERT INTO rental_partners (name, discount_rate, payment_terms) 
VALUES ('KM Rental Equipment', 60.00, 'Net 30');

-- Insert categories from KM Rental data
INSERT INTO equipment_categories (name, display_order) VALUES
('Cameras', 1),
('Lighting', 2),
('Grip & Support', 3),
('Lenses', 4),
('Power', 5),
('Sound', 6),
('Motion', 7),
('Production', 8),
('Accessories', 9),
('Styling', 10);

-- Create indexes for performance
CREATE INDEX idx_equipment_category ON equipment_catalog(category);
CREATE INDEX idx_equipment_sku ON equipment_catalog(sku);
CREATE INDEX idx_equipment_partner ON equipment_catalog(partner_id);
CREATE INDEX idx_inventory_catalog ON in_house_inventory(catalog_id);

-- Enable Row Level Security (RLS)
ALTER TABLE rental_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_house_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_categories ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for now - will restrict later)
CREATE POLICY "Allow all" ON rental_partners FOR ALL USING (true);
CREATE POLICY "Allow all" ON equipment_catalog FOR ALL USING (true);
CREATE POLICY "Allow all" ON in_house_inventory FOR ALL USING (true);
CREATE POLICY "Allow all" ON equipment_categories FOR ALL USING (true);
