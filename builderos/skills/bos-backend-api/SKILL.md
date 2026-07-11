---
name: bos-backend-api
description: Backend API design patterns for REST/GraphQL services — FastAPI, Express, routing, validation, auth middleware, error contracts, pagination, versioning. Use when building any server, API, endpoint, or microservice.
---

# Backend API
- Structure: routes -> service layer -> repository. No business logic in route handlers.
- Every endpoint: validate input at the boundary (pydantic/zod), return typed errors {error: {code, message}}, correct status codes (400 bad input, 401/403 auth, 404, 409 conflict, 422 validation, 500 last resort).
- Pagination from day one on list endpoints (?limit=&cursor=); never return unbounded arrays.
- Auth middleware once, not per-route. Rate-limit public endpoints.
- Version the API path (/api/v1/). Health endpoint (/health) always.
- Idempotency for anything that charges/creates: accept Idempotency-Key header.
- Log requests with a correlation id; never log secrets or full tokens.
- OpenAPI/docs auto-generated (FastAPI free; Express -> zod-openapi).
