# Errors and Observability

Use structured logs with:
- requestId
- timestamp
- operation
- selected tool
- latency
- HTTP status
- retry count

Never log:
- access tokens
- refresh tokens
- secrets
- unnecessary employee-sensitive data

Error classes:
- Validation error.
- Authentication/token error.
- Zoho API error.
- Rate-limit error.
- Timeout.
- Tool selection failure.
- LLM failure.

Expose safe, human-readable errors to the client.
