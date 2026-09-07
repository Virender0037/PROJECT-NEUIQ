# Zoho People Integration

Create a dedicated Zoho People client.

Responsibilities:
- Build authenticated requests.
- Handle HTTP errors.
- Normalize API responses.
- Centralize endpoint configuration.
- Avoid leaking access tokens into logs.

Example tool categories:
- Employee lookup.
- Employee details.
- Leave balance/status.
- Attendance/time data.
- Approved additional People endpoints.

Do not expose raw HTTP calls throughout the application; route them through the People client/tools.
