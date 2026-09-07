# Rate Limiting and Throttling

Rate limits must be treated as configuration, not hard-coded assumptions.

Track:
- Requests per minute/window.
- Endpoint-specific limits where applicable.
- Remaining quota when the API exposes it.
- Retry-after information.
- Concurrent requests.

Recommended behavior:
1. Local request guard.
2. Shared counter/cache where multiple Catalyst instances can run.
3. Queue/backoff when quota is close to exhaustion.
4. Respect `Retry-After` when supplied.
5. Return a controlled response instead of repeatedly hammering the API.

Verify the exact Zoho People limits from current Zoho documentation during implementation; do not assume a universal number.
