# Cache Strategy

Use caching only where stale data is acceptable.

Good candidates:
- OAuth access tokens.
- Service metadata/configuration.
- Short-lived frequently requested reference data.

Avoid caching highly dynamic employee/attendance/leave results unless the business explicitly accepts a TTL.

Every cache entry should define:
- Key.
- TTL.
- Source.
- Invalidation strategy.
