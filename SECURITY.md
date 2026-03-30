# Security Implementation Guide

This document outlines security controls and operational guidance for this project.

## Implemented Security Features

### 1. Input Validation & Data Sanitization

- **Pydantic schemas**: backend endpoints validate request models before business logic.
- **Input sanitization**: user-facing text is sanitized using backend security utilities:
  - HTML entity escaping to prevent XSS
  - Maximum length constraints
  - Enum value validation
  - URL/path sanitization
- **Validation location**: validation is enforced before database access.

### 2. SQL Injection Prevention

- Supabase client/database APIs are used instead of string-built SQL in request paths.
- No user input is interpolated into ad hoc SQL in API handlers.
- Row-level security policies enforce access controls in the database layer.

### 3. API Key & Secret Management

- Secrets are read from local environment files and runtime environment variables.
- Frontend uses only public client configuration values.
- Backend-only credentials must never be shipped to frontend bundles.
- Error responses should avoid leaking internal configuration details.

### 4. Secure API Design

- **Rate limiting** is enforced in [backend/middleware/rate_limit.py](backend/middleware/rate_limit.py):
  - Auth endpoints: 5 requests/minute
  - Bug/Artifact endpoints: 20 requests/minute
  - Default: 30 requests/minute
- Generic client-facing errors are returned while detailed traces are logged server-side.
- CORS uses configured allow-lists.

### 5. Authentication & Authorization

- Protected endpoints validate auth tokens.
- Authorization is backend-enforced.
- Project access is based on project membership roles (owner/admin/developer/reporter).
- Frontend checks are for UX only; backend remains authoritative.

### 6. Audit Logging

- Critical actions are logged using [backend/utils/audit_log.py](backend/utils/audit_log.py):
  - Bug creation/updates/status changes
  - Artifact creation/updates
  - Authentication events
- Logs include actor/resource/action context and timestamp.

### 7. Cross-Site Protections

- XSS risk is reduced through sanitization and escaping patterns.
- JWT-based auth reduces cookie-based CSRF exposure patterns.
- User content is not rendered as trusted raw HTML.

### 8. Error Handling

- Generic client error payloads are preferred.
- Internal details are logged server-side.
- Global exception handlers are used to reduce information leakage.

## Security Testing

Run backend security tests with:

```bash
pytest backend/tests/test_security.py -v
```

Run frontend tests from the frontend workspace:

```bash
cd frontend
npm run test -- --run
```

Run a single frontend test file (example):

```bash
npm run test -- --run src/pages/Dashboard.test.tsx
```

Run multiple specific frontend test files (example):

```bash
npm run test -- --run src/pages/Auth.test.tsx src/pages/Profile.test.tsx src/pages/Bugs.test.tsx
```

Run frontend tests in watch mode:

```bash
npm run test
```

Tests cover:
- SQL injection prevention
- XSS prevention
- Input validation
- Rate limiting
- Unauthorized access
- Role-based access control
- Error message sanitization

## Feature Test Coverage Checklist

Use this checklist to verify core product behavior and security controls.

### Account Feature Tests

- [ ] Create an account
- [ ] Log in
- [ ] Log out
- [ ] Update profile picture
- [ ] Update light mode/dark mode preference
- [ ] Change username
- [ ] Change password

### Dashboard Feature Tests

- [ ] Add member to project
- [ ] Remove member from project
- [ ] Update member role
- [ ] Create project
- [ ] Delete project
- [ ] Update project phases
- [ ] Roll project phase forward
- [ ] Roll project phase backward

### Artifact Feature Tests

- [ ] Create artifact and persist to database
- [ ] Delete artifact and remove from database
- [ ] Display updated artifact data in frontend after changes
- [ ] Filter artifacts by supported criteria
- [ ] Enforce artifact data security controls and access rules

### Bug Feature Tests

- [ ] Report/create bug and persist to database
- [ ] Delete bug
- [ ] Display updated bug data in frontend after changes
- [ ] Filter bugs
- [ ] Search bugs
- [ ] Detect duplicate bugs
- [ ] Enforce role-based bug access

### Security Test Cases

- [ ] XSS handling and output sanitization
- [ ] SQL injection resistance
- [ ] Rate limiting behavior and guardrails
- [ ] Unauthorized access rejection
- [ ] Improper input handling and validation

## Configuration

### Environment Variables

Important runtime values (never commit production values):
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- ALLOWED_ORIGINS
- TRUSTED_PROXY_IPS
- ENVIRONMENT (set production to disable docs endpoints)

### Rate Limiting Configuration

Adjust rules in [backend/middleware/rate_limit.py](backend/middleware/rate_limit.py):

```python
RATE_LIMITS = {
    "/api/auth": {"requests": 5, "window": 60},
    "/api/bugs": {"requests": 20, "window": 60},
    # ...
}
```

## Monitoring & Auditing

### Audit Logs

Monitor audit trails for:
- Failed authentication attempts
- Unusual access patterns
- Privilege escalation attempts
- Data modification events

### Log Rotation

Use log rotation in production to avoid unbounded disk growth:

```bash
# Example logrotate configuration
/var/log/bugtracker/audit.log {
    daily
    rotate 30
    compress
    missingok
    notifempty
}
```

## CI and Supply Chain

- GitHub Actions workflow in [.github/workflows/ci.yml](.github/workflows/ci.yml) runs frontend lint/test/build and backend tests.
- Keep dependencies up to date and review advisories regularly.
- Prefer pull requests with review for security-sensitive changes.

## Security Checklist

Before deploying to production:

- [ ] All environment variables set and secure
- [ ] CORS origins restricted to production domains
- [ ] API docs disabled in production (`ENVIRONMENT=production`)
- [ ] Rate limiting configured appropriately
- [ ] Audit logging enabled and monitored
- [ ] HTTPS enforced (via reverse proxy/load balancer)
- [ ] Dependencies updated to latest secure versions
- [ ] Security tests passing
- [ ] RLS policies verified in Supabase
- [ ] Error handling verified (no information leakage)

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly. Do not create public GitHub issues for security vulnerabilities.
