# Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
# Frontend
npm install

# Backend
cd backend
pip install -r requirements.txt
```

### 2. Supabase Setup

1. Create a Supabase project at https://supabase.com
2. Go to SQL Editor and run [database/migrations/ALL_MIGRATIONS.sql](database/migrations/ALL_MIGRATIONS.sql)
   - This is intended for clean bootstrap environments.
   - For environments already using incremental migrations, continue applying ordered migration files.
3. Enable Realtime:
   - Go to Database > Replication
   - Enable replication for the bugs and bug_artifacts tables
4. Enable Email Auth:
   - Go to Authentication > Providers
   - Enable Email provider

### 3. Environment Variables

Create local environment files from templates:

```bash
# Run from repository root
copy frontend\.env.example frontend\.env
copy backend\.env.example backend\.env
```

Edit `frontend/.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_URL=http://localhost:8000
```

Edit `backend/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
TRUSTED_PROXY_IPS=127.0.0.1,::1
```

Important:
- Keep `.env` files local only.
- Do not commit real keys.
- Never place service-role credentials in frontend code.

### 4. Run the Application

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend
cd backend
python run.py
# Or from repository root: uvicorn backend.main:app --reload --port 8000
```

### 5. Create Your First Project and Membership

1. Navigate to http://localhost:5173/auth
2. Click "Sign Up" and create an account
3. Create a project from the dashboard
4. Manage member roles inside the project (owner, admin, developer, reporter)

Note: Global users.role has been removed in favor of project-scoped memberships.

## Testing

### Frontend

```bash
cd frontend
npm run lint
npm run test
npm run build
```

### Backend

```bash
cd ..
pytest backend/tests -q
```

### CI Validation

The same checks run in GitHub Actions via [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Troubleshooting

### Backend Import Errors
If you see import errors, make sure you're running from the `backend/` directory or using the proper Python path.

### Supabase Connection Issues
- Verify your environment variables are correct
- Check that RLS policies are set up correctly
- Verify project membership records exist for your account

### Suspected Key Leak

If you think keys were exposed:
1. Rotate `SUPABASE_SERVICE_ROLE_KEY` in Supabase immediately.
2. Rotate other affected keys/tokens.
3. Update local `.env` files with new values.
4. Verify tracked files are clean with `git grep`.
5. If a secret was committed in the past, rewrite history before publishing.


### Realtime Not Working
- Ensure Realtime is enabled for bugs and bug_artifacts
- Check browser console for connection errors
- Verify your Supabase project has Realtime enabled

# Docker Setup

## Prerequisites

- [Docker](https://www.docker.com/get-started) and [Docker Compose](https://docs.docker.com/compose/) installed

## Build and Run with Docker Compose

```bash
# Build all services (frontend, backend, db)
docker compose build

# Start all services
docker compose up
```

- The frontend will be available at [http://localhost:5173](http://localhost:5173)
- The backend API will be available at [http://localhost:8000](http://localhost:8000)

## Stopping Services

```bash
docker compose down
```

## Rebuilding (if you change dependencies or Dockerfiles)

```bash
docker compose build --no-cache
docker compose up
```
