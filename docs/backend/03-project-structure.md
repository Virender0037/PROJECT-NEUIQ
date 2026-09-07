# Backend Project Structure

```text
src/
  config/
  middleware/
  orchestrator/
  services/
    zoho-people/
      agents/
      controllers/
      tools/
      clients/
      validators/
      transformers/
      routes/
  auth/
  cache/
  rate-limit/
  observability/
  utils/
  app.js
```

## Principle
Keep every external service behind its own module. Adding Zoho CRM later should mean adding `services/zoho-crm/`, not rewriting Zoho People logic.
