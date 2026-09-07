# Orchestrator Design

Responsibilities:
1. Receive normalized user input.
2. Determine intent.
3. Extract required parameters.
4. Select an approved tool.
5. Validate parameters.
6. Execute the tool.
7. Return retrieved data to the response formatter.
8. Produce a concise human-readable answer.

The orchestrator should not directly contain Zoho People endpoint details.

## Guardrails
- Tool allow-list.
- Strict parameter schemas.
- No fabricated API results.
- Clear failure messages.
- Bounded retries.
- Request/correlation ID propagation.
