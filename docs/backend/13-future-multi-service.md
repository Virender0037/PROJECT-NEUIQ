# Future Multi-Service Expansion

Once Zoho People is stable:

```text
Orchestrator
   |
   +-- Zoho People tools
   +-- Zoho CRM tools
   +-- Zoho Projects tools
   +-- Future Zoho service tools
```

Each service owns its:
- API client.
- Tools.
- Validators.
- Transformers.
- Service-specific error handling.

The orchestrator owns cross-service intent routing.

For multi-service questions, the orchestrator can execute multiple approved tools and combine their factual results before the final response is generated.
