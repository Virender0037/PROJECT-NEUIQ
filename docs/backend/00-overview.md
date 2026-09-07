# Zoho People Orchestrator POC

Backend-first POC for a conversational AI layer over Zoho People.

## Goal
- Accept text prompts now; support voice/conversation UI later.
- Use Gemini 2.5 Flash for intent understanding and response formatting.
- Keep Zoho People API data as the source of truth.
- Route requests through an orchestrator and service-specific tools.
- Design for rate limits, token lifecycle, caching, logging, and future multi-service expansion.

## Proposed flow
User -> Orchestrator -> Intent/Tool Selection -> Zoho People Tool -> Zoho People API -> Result -> LLM Response Formatter -> User

UI is intentionally deferred until the backend contract is stable.
