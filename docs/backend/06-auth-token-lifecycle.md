# OAuth and Token Lifecycle

Implement a centralized token provider.

Flow:
1. Check cached access token.
2. If valid, reuse it.
3. If expired/near expiry, refresh.
4. Store refreshed token securely.
5. On unauthorized response, refresh once and retry where safe.
6. Never log token values.

For the POC, keep credentials/configuration in Catalyst environment configuration or the appropriate secret mechanism rather than source code.
