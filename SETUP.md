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
2. Go to SQL Editor and run the migration: `database/migrations/001_initial_schema.sql`
3. Enable Realtime:
   - Go to Database > Replication
   - Enable replication for the `bugs` table
4. Enable Email Auth:
   - Go to Authentication > Providers
   - Enable Email provider

### 3. Environment Variables

Create local environment files from templates:

```bash
# Run from repository root
copy .env.example .env
copy backend\.env.example backend\.env
```

Edit root `.env`:

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

### 4. Run the Application

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend
cd backend
python run.py
# Or: uvicorn main:app --reload --port 8000
```

### 5. Create Your First User

1. Navigate to http://localhost:5173/auth
2. Click "Sign Up" and create an account
3. The user will be created with role 'reporter' by default
4. To change a user's role to 'admin' or 'developer', update it in Supabase:
   ```sql
   UPDATE public.users SET role = 'admin' WHERE email = 'your-email@example.com';
   ```

## Testing

### Test Authentication
- Sign up with a new account
- Log in
- Access protected routes
- Update profile

### Test Artifacts
- Create an artifact (requires reporter/developer/admin role)
- View artifact list
- Edit artifact (admin or creator)
- Delete artifact (admin only)

### Test Bugs
- Create a bug with associated artifacts
- View bug list with filters
- Update bug status (developer/admin)

### Test RBAC
- Try accessing admin-only endpoints with different roles
- Verify UI elements are hidden/shown based on role

## Troubleshooting

### Backend Import Errors
If you see import errors, make sure you're running from the `backend/` directory or using the proper Python path.

### Supabase Connection Issues
- Verify your environment variables are correct
- Check that RLS policies are set up correctly
- Ensure the `get_user_role` function exists

### Suspected Key Leak

If you think keys were exposed:
1. Rotate `SUPABASE_SERVICE_ROLE_KEY` in Supabase immediately.
2. Rotate other affected keys/tokens.
3. Update local `.env` files with new values.
4. Verify tracked files are clean with `git grep`.
5. If a secret was committed in the past, rewrite history before publishing.


### Realtime Not Working
- Ensure Realtime is enabled for the `bugs` table in Supabase
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
