# QuickBooks Integration Setup

## Overview
- Automatically creates QB Estimates when quotes are submitted
- Uses single line item: "OS RENTAL" (taxable)
- Custom description/price per quote
- Matches customers by email (creates new if not exists)

## Setup Steps

### 1. Create QB Developer Account
1. Go to https://developer.intuit.com/
2. Sign in with your Intuit account
3. Create a new app
4. Select "QuickBooks Online" as the platform
5. Choose "Accounting" scope

### 2. Get Credentials
In your QB Developer app:
1. Go to "Keys & OAuth"
2. Copy **Client ID** and **Client Secret**
3. Add redirect URI: `http://localhost:3001/api/quickbooks/callback`

### 3. Update Environment Variables
Edit `/base-os-backend/.env`:

```
QB_CLIENT_ID=your_actual_client_id
QB_CLIENT_SECRET=your_actual_client_secret
QB_REDIRECT_URI=http://localhost:3001/api/quickbooks/callback
QB_ENVIRONMENT=sandbox  # Change to 'production' when ready
```

### 4. Run Database Migration
In Supabase SQL Editor, run:

```sql
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
```

### 5. Connect to QB
1. Restart backend server
2. Visit: http://localhost:3001/api/quickbooks/connect
3. Sign in to your QB Online account
4. Authorize the app

### 6. Test It
1. Go to http://localhost:5173/
2. Add items to quote
3. Submit quote
4. Check QB Online → Estimates
5. You should see a new estimate with:
   - Customer (matched by email)
   - Single line item: "OS RENTAL"
   - Description: equipment list + rental period
   - Taxable: Yes

## How It Works

**Customer Matching:**
- Searches QB by email
- If found: uses existing customer
- If not: creates new customer

**Line Item:**
- Item name: "OS RENTAL" (auto-created in QB if missing)
- Type: Service
- Taxable: Yes
- Description: All equipment names + rental dates
- Amount: Subtotal (before tax)

**Tax:**
- QB calculates tax based on your tax settings
- NYC 8.875% configured in your quote

## Troubleshooting

**"Not connected to QuickBooks"**
→ Run step 5 to connect

**"Failed to create estimate"**
→ Check QB_CLIENT_ID and QB_CLIENT_SECRET are correct
→ Ensure you're using sandbox for testing

**Customer not found**
→ Check QB Online customer list for matching email

## Going Live

1. Change QB_ENVIRONMENT to 'production' in .env
2. Update redirect URI in QB Developer app to production URL
3. Get production credentials from QB Developer
4. Reconnect using production flow
5. Test with a small quote first
