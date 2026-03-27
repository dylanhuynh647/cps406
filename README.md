# Bug Tracking System

Bug tracking platform with a React frontend and FastAPI backend, backed by Supabase/PostgreSQL. The project includes project-scoped permissions, invitation workflows, artifact linkage, and phase-aware bug management.

## Current Feature Set

- Authentication with Supabase Auth
- Project-scoped RBAC through project membership roles
- Bug lifecycle support with status, severity, assignment invitations, and phase context
- Artifact management with project-scoped visibility
- Dashboard tooling for project/member management and phase actions
- Profile preferences (including persisted dark mode)
- Frontend realtime updates for bugs and bug-artifact links

## Stack

### Frontend
- React 18 + Vite
- TypeScript
- React Router
- TanStack Query
- React Hook Form + Zod
- Tailwind CSS
- Vitest + Testing Library

### Backend
- FastAPI
- Python 3.11
- Pydantic v2
- Supabase Python client
- Pytest

### Database
- PostgreSQL (Supabase)
- SQL migrations in [database/migrations](database/migrations)

## Repository Layout

```text
cps406/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── lib/
│   │   └── pages/
│   └── package.json
├── backend/
│   ├── api/
│   ├── crud/
│   ├── schemas/
│   ├── middleware/
│   └── tests/
├── database/
│   └── migrations/
├── SETUP.md
├── SECURITY.md
└── docker-compose.yml
```

## Quick Start

Use the detailed guide in [SETUP.md](SETUP.md). High-level flow:

1. Install dependencies (frontend npm + backend pip).
2. Configure local environment files from .env.example templates.
3. Bootstrap database schema using [database/migrations/ALL_MIGRATIONS.sql](database/migrations/ALL_MIGRATIONS.sql).
4. Run frontend and backend services.

## Scripts

### Frontend (run in frontend)
- npm run dev
- npm run lint
- npm run test
- npm run build

### Backend (run in repository root)
- pytest backend/tests -q

## Testing

Frontend tests include component and page coverage for loading UI, theme helpers, sanitization, auth/user flow, navbar, bugs, inbox, and profile behavior.

Backend tests cover schema validation, sanitization guards, and security/rate-limit helpers.

## CI

GitHub Actions workflow: [.github/workflows/ci.yml](.github/workflows/ci.yml)

- Frontend job: install, lint, test, build
- Backend job: install Python dependencies and run backend tests

## Security and Secrets

- Do not commit any production keys, tokens, or service credentials.
- Keep environment values in local .env files only.
- Treat backend service-role credentials as sensitive.
- If key exposure is suspected, rotate immediately and update environment files.

See [SECURITY.md](SECURITY.md) for operational guidance.
