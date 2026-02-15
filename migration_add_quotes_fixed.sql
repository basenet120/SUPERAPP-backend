-- Add quotes and leads tables (migration)
-- Run this in Supabase SQL Editor

-- Quotes table
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_number VARCHAR(50) UNIQUE NOT NULL,
    
    -- Client info
    client_name VARCHAR(100) NOT NULL,
    client_email VARCHAR(255) NOT NULL,
    client_phone VARCHAR(50),
    client_company VARCHAR(100),
    
    -- Rental period
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    duration_days INTEGER NOT NULL,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Pricing
    pricing JSONB NOT NULL,
    deposit_required DECIMAL(10,2),
    deposit_paid DECIMAL(10,2) DEFAULT 0,
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Quote items
CREATE TABLE IF NOT EXISTS quote_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    equipment_id UUID REFERENCES equipment_catalog(id),
    sku VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    daily_rate DECIMAL(10,2),
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Leads (CRM)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    company VARCHAR(100),
    status VARCHAR(50) DEFAULT 'new',
    source VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quotes_email ON quotes(client_email);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- Enable RLS
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (to avoid errors)
DROP POLICY IF EXISTS "Allow all" ON quotes;
DROP POLICY IF EXISTS "Allow all" ON quote_items;
DROP POLICY IF EXISTS "Allow all" ON leads;

-- Create policies
CREATE POLICY "Allow all" ON quotes FOR ALL USING (true);
CREATE POLICY "Allow all" ON quote_items FOR ALL USING (true);
CREATE POLICY "Allow all" ON leads FOR ALL USING (true);
