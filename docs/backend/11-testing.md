# Testing Strategy

## Unit tests
- Intent/tool selection.
- Parameter validation.
- Token provider.
- Rate limiter.
- Cache behavior.
- Response transformation.

## Integration tests
- Catalyst endpoint -> orchestrator -> mocked Zoho People API.
- OAuth refresh flow.
- Rate-limit/backoff behavior.

## POC acceptance tests
- Simple employee lookup.
- Leave-related query.
- Invalid/missing employee identifier.
- Zoho API failure.
- Token expiry.
- Rate-limit response.
- Ambiguous user prompt.
