-- Add QuickBooks tokens table
CREATE TABLE IF NOT EXISTS quickbooks_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    realm_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_tokens_created ON quickbooks_tokens(created_at);

ALTER TABLE quickbooks_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON quickbooks_tokens FOR ALL USING (true);
