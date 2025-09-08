# API Testing Guide for Trading Platform Endpoints

## Prerequisites
1. **Server running**: Make sure the server is running on `http://localhost:3001`
2. **Kafka running**: Ensure Kafka is running on `localhost:9092`
3. **Redis running**: Redis should be available on default port
4. **Postman**: Install Postman for API testing

## Environment Setup
Create a new Postman environment with these variables:
- `base_url`: `http://localhost:3001`
- `auth_token`: (will be set automatically after authentication)

## Authentication Flow

### Step 1: Sign Up (Create User)
**Endpoint**: `POST {{base_url}}/signup`

**Headers**:
- `Content-Type: application/json`

**Body** (raw JSON):
```json
{
  "email": "test@example.com"
}
```

**Expected Response**: "Magic link sent to your email"

### Step 2: Verify Email (Get Auth Token)
**Endpoint**: `GET {{base_url}}/verify?token=<JWT_TOKEN>`

**Note**: You'll need to extract the JWT token from the email or check the server logs. The token will be set as an HTTP-only cookie automatically.

**Expected Response**: Redirect to `/profile` and sets `auth_token` cookie

### Step 3: Get Profile (Verify Authentication)
**Endpoint**: `GET {{base_url}}/profile`

**Headers**:
- `Cookie: auth_token=<JWT_TOKEN>`

**Expected Response**: "Welcome to your profile! Your balance is: 5000"

## Testing the New Endpoints

### 1. GET USD Balance
**Endpoint**: `GET {{base_url}}/api/v1/balance/usd`

**Headers**:
- `Cookie: auth_token=<JWT_TOKEN>`

**Expected Response**:
```json
{
  "balance": 5000
}
```

### 2. GET Asset Balances (Open Orders)
**Endpoint**: `GET {{base_url}}/api/v1/balance`

**Headers**:
- `Cookie: auth_token=<JWT_TOKEN>`

**Expected Response** (example with open orders):
```json
{
  "BTC": {
    "balance": 0.5,
    "decimals": 8
  },
  "SOL": {
    "balance": 10.2,
    "decimals": 8
  }
}
```

**Note**: This will return empty if no open orders exist for the user.

### 3. GET Supported Assets
**Endpoint**: `GET {{base_url}}/api/v1/supportedAssets`

**Headers**: None required (public endpoint)

**Expected Response**:
```json
{
  "assets": [
    {
      "symbol": "BTC",
      "name": "Bitcoin",
      "imageUrl": "https://cryptologos.cc/logos/bitcoin-btc-logo.png"
    },
    {
      "symbol": "SOL",
      "name": "Solana",
      "imageUrl": "https://cryptologos.cc/logos/solana-sol-logo.png"
    },
    {
      "symbol": "ETH",
      "name": "Ethereum",
      "imageUrl": "https://cryptologos.cc/logos/ethereum-eth-logo.png"
    }
  ]
}
```

## Complete Testing Workflow

1. **Start all services**:
   ```bash
   # Terminal 1 - Start server
   cd apps/server
   npm run dev

   # Terminal 2 - Start create-order-engine
   cd apps/create-order-engine
   npm run start

   # Terminal 3 - Start Kafka and Redis
   # (Assuming they're running via docker-compose or system services)
   ```

2. **Test authentication**:
   - Sign up with email
   - Verify email (get auth token)
   - Test profile endpoint

3. **Test balance endpoints**:
   - Get USD balance
   - Get asset balances (may be empty initially)
   - Get supported assets

4. **Create test orders** (optional):
   Use the trade creation endpoint to create some orders, then test the balance endpoint again to see updated balances.

## Troubleshooting

### Common Issues:
1. **"Access Denied: No Token Provided"**: Make sure the auth_token cookie is being sent with requests
2. **Kafka connection errors**: Ensure Kafka is running on localhost:9092
3. **Empty asset balances**: Create some trades first using `/api/v1/trade/create`
4. **CORS issues**: The server may need CORS headers for browser testing

### Debug Tips:
- Check server logs for authentication tokens
- Use Postman's "Cookies" feature to manage session cookies
- Verify Kafka topics are created: `recieved-backpack-data`, `query-open-orders`, `open-orders-response`

## Postman Collection Setup

You can create a Postman collection with these requests:
1. Sign Up (POST)
2. Verify (GET) 
3. Profile (GET)
4. USD Balance (GET)
5. Asset Balances (GET)
6. Supported Assets (GET)

Use environment variables to store the base URL and auth token between requests.
