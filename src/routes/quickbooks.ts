import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

// QB API credentials (from environment)
const QB_CLIENT_ID = process.env.QB_CLIENT_ID || '';
const QB_CLIENT_SECRET = process.env.QB_CLIENT_SECRET || '';
const QB_REDIRECT_URI = process.env.QB_REDIRECT_URI || 'http://localhost:3001/api/quickbooks/callback';
const QB_ENVIRONMENT = process.env.QB_ENVIRONMENT || 'sandbox'; // or 'production'

// QB API base URL
const QB_BASE_URL = QB_ENVIRONMENT === 'production' 
  ? 'https://quickbooks.api.intuit.com/v3/company'
  : 'https://sandbox-quickbooks.api.intuit.com/v3/company';

// Get stored tokens
async function getQBTokens() {
  const { data, error } = await supabase
    .from('quickbooks_tokens')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error || !data) return null;
  return data;
}

// Store tokens
async function storeQBTokens(tokens: any) {
  const { error } = await supabase
    .from('quickbooks_tokens')
    .insert({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      realm_id: tokens.realm_id
    });
  
  if (error) throw error;
}

// Refresh access token
async function refreshAccessToken(refreshToken: string) {
  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) throw new Error('Failed to refresh token');
  
  const tokens = await response.json();
  await storeQBTokens({
    ...tokens,
    refresh_token: tokens.refresh_token || refreshToken // QB may return same refresh token
  });
  
  return tokens.access_token;
}

// Get valid access token
async function getValidAccessToken() {
  const tokens = await getQBTokens();
  if (!tokens) throw new Error('Not connected to QuickBooks');
  
  // Check if expired
  if (new Date(tokens.expires_at) < new Date()) {
    return await refreshAccessToken(tokens.refresh_token);
  }
  
  return tokens.access_token;
}

// Find or create customer in QB
async function findOrCreateCustomer(accessToken: string, realmId: string, customerData: {
  name: string;
  email: string;
  phone?: string;
  company?: string;
}) {
  // First, search for existing customer by email
  const searchResponse = await fetch(
    `${QB_BASE_URL}/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Customer WHERE PrimaryEmailAddr.Address = '${customerData.email}'`)}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    }
  );

  if (!searchResponse.ok) throw new Error('Failed to search customers');
  
  const searchData = await searchResponse.json();
  
  // If found, return existing customer
  if (searchData.QueryResponse?.Customer?.length > 0) {
    return searchData.QueryResponse.Customer[0];
  }

  // Create new customer
  const displayName = customerData.company 
    ? `${customerData.company} - ${customerData.name}`
    : customerData.name;

  const newCustomer = {
    DisplayName: displayName,
    PrimaryEmailAddr: { Address: customerData.email },
    PrimaryPhone: customerData.phone ? { FreeFormNumber: customerData.phone } : undefined,
    CompanyName: customerData.company || undefined
  };

  const createResponse = await fetch(`${QB_BASE_URL}/${realmId}/customer`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(newCustomer)
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Failed to create customer: ${error}`);
  }

  return await createResponse.json();
}

// Find or create "OS RENTAL" item
async function findOrCreateRentalItem(accessToken: string, realmId: string) {
  // Search for existing item
  const searchResponse = await fetch(
    `${QB_BASE_URL}/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Item WHERE Name = 'OS RENTAL'`)}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    }
  );

  if (!searchResponse.ok) throw new Error('Failed to search items');
  
  const searchData = await searchResponse.json();
  
  // If found, return existing item
  if (searchData.QueryResponse?.Item?.length > 0) {
    return searchData.QueryResponse.Item[0];
  }

  // Create new service item
  const newItem = {
    Name: 'OS RENTAL',
    Type: 'Service',
    IncomeAccountRef: {
      name: 'Sales of Product Income', // Default income account
      value: '1' // QB will match by name
    },
    Taxable: true
  };

  const createResponse = await fetch(`${QB_BASE_URL}/${realmId}/item`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(newItem)
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Failed to create item: ${error}`);
  }

  return await createResponse.json();
}

// Create estimate in QB
export async function createQBEstimate(quoteData: {
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  clientCompany?: string;
  startDate: string;
  endDate: string;
  duration: number;
  items: any[];
  pricing: {
    lineItemsTotal: number;
    insurance: number;
    delivery: number;
    subtotal: number;
    tax: number;
    total: number;
  };
  notes?: string;
}) {
  const accessToken = await getValidAccessToken();
  const tokens = await getQBTokens();
  const realmId = tokens?.realm_id;
  
  if (!realmId) throw new Error('No realm ID found');

  // Find or create customer
  const customer = await findOrCreateCustomer(accessToken, realmId, {
    name: quoteData.clientName,
    email: quoteData.clientEmail,
    phone: quoteData.clientPhone,
    company: quoteData.clientCompany
  });

  // Find or create rental item
  const rentalItem = await findOrCreateRentalItem(accessToken, realmId);

  // Build description
  const itemDescriptions = quoteData.items.map(item => 
    `${item.name} (${item.quantity} × ${item.duration} days)`
  ).join(', ');

  const description = `Equipment Rental: ${itemDescriptions}\n\n` +
    `Rental Period: ${quoteData.startDate} to ${quoteData.endDate} (${quoteData.duration} days)\n` +
    (quoteData.notes ? `\nNotes: ${quoteData.notes}` : '');

  // Create estimate
  const estimate = {
    CustomerRef: {
      value: customer.Id
    },
    Line: [
      {
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: {
            value: rentalItem.Id,
            name: 'OS RENTAL'
          },
          Qty: 1,
          UnitPrice: quoteData.pricing.subtotal,
          TaxCodeRef: {
            value: 'TAX' // Taxable
          }
        },
        Amount: quoteData.pricing.subtotal,
        Description: description.substring(0, 4000) // QB limit
      },
      // Tax line
      {
        DetailType: 'SubTotalLineDetail',
        Amount: quoteData.pricing.tax
      }
    ],
    TotalAmt: quoteData.pricing.total,
    TxnTaxDetail: {
      TotalTax: quoteData.pricing.tax
    },
    PrivateNote: `Insurance: $${quoteData.pricing.insurance.toFixed(2)}, Delivery: $${quoteData.pricing.delivery.toFixed(2)}`
  };

  const response = await fetch(`${QB_BASE_URL}/${realmId}/estimate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(estimate)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create estimate: ${error}`);
  }

  return await response.json();
}

// Routes

// OAuth: Initiate connection
router.get('/connect', (req, res) => {
  if (!QB_CLIENT_ID) {
    return res.status(500).json({ error: 'QuickBooks not configured' });
  }

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?` +
    `client_id=${QB_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(QB_REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=com.intuit.quickbooks.accounting&` +
    `state=${Math.random().toString(36).substring(7)}`;

  res.json({ url: authUrl });
});

// OAuth: Callback
router.get('/callback', async (req, res) => {
  const { code, realmId } = req.query;
  
  if (!code || !realmId) {
    return res.status(400).json({ error: 'Missing code or realmId' });
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: QB_REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Token exchange failed');
    }

    const tokens = await tokenResponse.json();
    
    // Store tokens with realmId
    await storeQBTokens({
      ...tokens,
      realm_id: realmId
    });

    res.send('<html><body><h1>QuickBooks Connected!</h1><p>You can close this window.</p><script>window.close()</script></body></html>');
  } catch (err) {
    console.error('OAuth error:', err);
    res.status(500).json({ error: 'Failed to connect QuickBooks' });
  }
});

// Check connection status
router.get('/status', async (req, res) => {
  const tokens = await getQBTokens();
  res.json({ 
    connected: !!tokens,
    environment: QB_ENVIRONMENT
  });
});

// Disconnect
router.post('/disconnect', async (req, res) => {
  await supabase.from('quickbooks_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  res.json({ success: true });
});

export default router;
export { createQBEstimate };
