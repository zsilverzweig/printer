# Alpaca OAuth Debug Sandbox

This sandbox provides comprehensive debugging utilities for your Alpaca OAuth connection setup.

## Access the Sandbox

Navigate to `/sandbox` in your application to access the debugging tools.

## Available Tests

### 1. Environment Variables Check

- **Purpose**: Verify that all required Alpaca OAuth environment variables are properly configured
- **Tests**:
  - Checks for `ALPACA_CLIENT_ID` and `ALPACA_CLIENT_SECRET`
  - Validates `ALPACA_AUTH_URL`, `ALPACA_TOKEN_URL`, and API base URLs
  - Confirms `NEXT_PUBLIC_APP_URL` is set correctly
- **What to look for**: All environment variables should be present and properly formatted

### 2. OAuth URL Generation

- **Purpose**: Test OAuth authorization URL generation for different environments
- **Tests**: Generates auth URLs for paper trading, live trading, and both environments
- **What to look for**: URLs should be properly formatted with correct parameters

### 3. API Connectivity Test

- **Purpose**: Test basic connectivity to Alpaca API endpoints
- **Tests**:
  - Live API clock endpoint (`https://api.alpaca.markets/v2/clock`)
  - Paper API clock endpoint (`https://paper-api.alpaca.markets/v2/clock`)
- **What to look for**: Both endpoints should be reachable (status 200)

### 4. OAuth Flow Test

- **Purpose**: Test the complete OAuth authorization flow
- **Tests**: Generates a complete authorization URL with proper state management
- **What to look for**: Should generate a valid auth URL that can be used for testing

### 5. Token Validation Test

- **Purpose**: Test token validation endpoint connectivity
- **Tests**: Attempts to access the account endpoint with a mock token
- **What to look for**: Should return 401 (Unauthorized) but confirm the endpoint is reachable

### 6. Token Tester (Advanced)

- **Purpose**: Test OAuth token operations with real tokens
- **Tests**:
  - **Token Exchange**: Exchange authorization code for access token
  - **Token Refresh**: Refresh access token using refresh token
  - **User Info**: Get user information using access token
  - **Token Revocation**: Revoke access token (⚠️ This invalidates the token)
- **⚠️ Security Warning**: Only use with test tokens, never in production

### 7. Scope Validation (New)

- **Purpose**: Test OAuth scope combinations according to Alpaca's official documentation
- **Tests**: Validates different scope combinations:
  - `trading` - Trading operations only
  - `account:write` - Account write access only
  - `trading account:write` - Combined trading and account access
  - `trading account:write data` - All available scopes
- **What to look for**: All scope combinations should generate valid OAuth URLs

## Common Issues and Solutions

### Environment Variables Not Set

- **Symptom**: Environment check fails
- **Solution**: Ensure all required environment variables are set in your `.env.local` file
- **Required variables**:
  ```
  ALPACA_CLIENT_ID=your_client_id
  ALPACA_CLIENT_SECRET=your_client_secret
  ALPACA_AUTH_URL=https://app.alpaca.markets/oauth/authorize
  ALPACA_TOKEN_URL=https://api.alpaca.markets/oauth/token
  NEXT_PUBLIC_APP_URL=http://localhost:3000
  ```

### API Connectivity Issues

- **Symptom**: API connectivity tests fail
- **Solution**: Check your internet connection and firewall settings
- **Note**: Alpaca APIs should be accessible from most networks

### OAuth URL Generation Errors

- **Symptom**: URL generation fails
- **Solution**: Check that your environment variables are properly formatted
- **Common issues**: Missing or malformed client ID/secret

### Token Exchange Failures

- **Symptom**: Token exchange test fails
- **Solution**:
  - Ensure the authorization code is valid and not expired
  - Verify the redirect URI matches exactly what was used in the auth URL
  - Check that your Alpaca app is properly configured

## Testing the Full OAuth Flow

1. **Start with Environment Check**: Ensure all variables are set
2. **Test URL Generation**: Verify auth URLs are generated correctly
3. **Test API Connectivity**: Confirm you can reach Alpaca APIs
4. **Use OAuth Flow Test**: Generate a test auth URL
5. **Manual OAuth Test**:
   - Copy the generated auth URL
   - Open it in a browser
   - Complete the OAuth flow with your Alpaca account
   - Use the returned authorization code in the Token Tester

## API Endpoints

The sandbox uses these API endpoints:

- `GET /api/debug/alpaca-oauth` - Environment and connectivity tests
- `POST /api/debug/alpaca-token-test` - Token operation tests
- `GET /api/alpaca/oauth/authorize` - OAuth authorization URL generation
- `GET /api/alpaca/oauth/callback` - OAuth callback handler

## Security Notes

- The sandbox is designed for development and debugging only
- Never use real user tokens in production
- The Token Tester component includes security warnings
- All sensitive data is masked in the debug output

## Troubleshooting

If you encounter issues:

1. Check the browser console for JavaScript errors
2. Check the server logs for API errors
3. Verify your environment variables are correctly set
4. Ensure your Alpaca app is properly configured in the Alpaca dashboard
5. Test with a fresh authorization code if token operations fail

## Next Steps

After debugging your OAuth setup:

1. Implement proper token storage in your database
2. Add error handling for production use
3. Implement token refresh logic
4. Add proper user session management
5. Test with real user accounts in a staging environment
