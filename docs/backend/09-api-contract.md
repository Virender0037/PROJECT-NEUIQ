# API Contract

Suggested endpoint:

`POST /api/v1/chat`

Request:
```json
{
  "message": "Show the leave balance for employee 123"
}
```

Response:
```json
{
  "requestId": "uuid",
  "success": true,
  "answer": "Employee 123 has ...",
  "data": {},
  "tool": "zohoPeople.leaveBalance"
}
```

The exact schema should be finalized after the first working People tools are identified.

Keep the contract UI-independent so text input and future voice/conversation clients can use the same backend.
