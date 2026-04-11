# Setup Guide

## Prerequisites

- Node.js 20+ (includes npm)
- Python 3.11 (recommended; 3.10 also supported)
- A Supabase project

## Quick Start (Recommended)

Run these commands from repository root.

### 1) Frontend dependencies

```bash
cd frontend
npm install
```

### 2) Backend virtual environment + dependencies

From repository root:

```bash
cd backend
```

Create the venv with Python 3.11 (choose your OS):

Linux/macOS:

```bash
python3.11 -m venv .venv
```

Windows:

```bash
py -3.11 -m venv .venv
```

If Python 3.11 is not installed on your machine:

```bash
py -3.10 -m venv .venv
```

Install backend dependencies (choose your OS):

Linux/macOS:

```bash
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
```

Windows:

```bash
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Activate the venv in your current terminal (so `python` uses `.venv`):

Linux/macOS:

```bash
source .venv/bin/activate
```

Windows:

```bash
.venv\Scripts\Activate.ps1
```

## Environment Variables

Create local environment files from templates:

Linux/macOS:

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

Windows:

```bash
copy frontend\.env.example frontend\.env
copy backend\.env.example backend\.env
```

Edit frontend/.env:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_URL=http://localhost:8000
```

Edit backend/.env:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
TRUSTED_PROXY_IPS=127.0.0.1,::1
```

Important:
- Keep `.env` files local only.
- Do not commit real keys.
- Never put service-role credentials in frontend code.

## Supabase Setup

1. Create a project at https://supabase.com
2. In SQL Editor, run [database/migrations/ALL_MIGRATIONS.sql](database/migrations/ALL_MIGRATIONS.sql)
   - Use this for clean bootstrap environments.
   - If you already apply incremental migrations, continue ordered migration files instead.
3. Enable Realtime replication for `bugs` and `bug_artifacts`.
4. Enable Email auth provider.

## Run the App

Open two terminals.

Terminal 1 (frontend):

```bash
cd frontend
npm run dev
```

Terminal 2 (backend):

Linux/macOS:

```bash
cd backend
source .venv/bin/activate
python run.py
```

Windows:

```bash
cd backend
.venv\Scripts\Activate.ps1
python run.py
```

## Testing

Frontend:

```bash
cd frontend
npm run lint
npm run test
npm run build
```

Backend:

```bash
cd backend
python -m pytest tests -q
```

CI uses the same checks in [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Troubleshooting

### Backend import errors

Make sure commands are using the backend venv interpreter:

```bash
python --version
python -c "import sys; print(sys.executable)"
```

### Supabase connection issues

- Verify environment variables.
- Verify RLS policies.
- Verify project membership records for your account.

### Realtime not working

- Ensure Realtime replication is enabled for `bugs` and `bug_artifacts`.
- Check browser console/network errors.

### Suspected key leak

1. Rotate `SUPABASE_SERVICE_ROLE_KEY` immediately.
2. Rotate other affected tokens.
3. Update local `.env` values.
4. Verify tracked files are clean with `git grep`.
5. If a secret was committed, rewrite history before publishing.

## Docker Setup

Prerequisites:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Docker Compose](https://docs.docker.com/compose/)

Build and run:

```bash
docker compose up --build
docker compose up
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000

Stop services:

```bash
docker compose down
```

Rebuild without cache:

```bash
docker compose build --no-cache
docker compose up
```
