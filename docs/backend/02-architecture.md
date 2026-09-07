# High-Level Architecture

```text
Client/UI
   |
   v
Catalyst API Layer
   |
   v
Orchestrator
   |
   +--> Intent/parameter extraction (Gemini 2.5 Flash)
   |
   +--> Zoho People Tool Registry
             |
             +--> Employee Tool
             +--> Leave Tool
             +--> Attendance/Time Tool
             +--> Other approved People APIs
                         |
                         v
                 Zoho People API
                         |
                         v
                  Normalized result
                         |
                         v
              Response formatter (LLM)
                         |
                         v
                       User
```

The LLM must not invent business data. Retrieved Zoho People data is the source of truth.
