# Bug Tracking System

A comprehensive bug tracking system built with React, FastAPI, and Supabase.

## Features

- **Authentication & Authorization**: Complete auth flow with Supabase Auth, role-based access control (RBAC)
- **Artifact Management**: Create, view, edit, and delete development artifacts
- **Bug Management**: Full CRUD operations for bugs with artifact relationships
- **Real-time Updates**: Live synchronization of bug list using Supabase Realtime
- **Advanced Filtering**: Filter bugs by status, type, reporter, artifact type, and date range

## Tech Stack

### Frontend
- React 18 + Vite
- TypeScript
- Tailwind CSS
- React Router
- React Query (TanStack Query)
- React Hook Form + Zod
- Supabase JS Client

### Backend
- FastAPI
- Python 3.11+
- Supabase (PostgreSQL + Auth + Realtime)

## Setup Instructions

### Prerequisites
- Node.js 18+
- Python 3.11+
- Supabase account

### 1. Clone and Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
pip install -r requirements.txt
```

### 2. Supabase Setup

1. Create a new Supabase project
2. Run the SQL migration file: `database/migrations/001_initial_schema.sql`
3. Enable Realtime for the `bugs` table in Supabase dashboard
4. Enable Email Authentication in Supabase Auth settings

### 3. Environment Variables

Create local environment files from the templates:

```bash
# From repository root
copy .env.example .env
copy backend\.env.example backend\.env
```

Then edit local values.

Root `.env`:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=http://localhost:8000
```

`backend/.env`:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
TRUSTED_PROXY_IPS=127.0.0.1,::1
```

Never commit real keys in `.env` files. The repository ignores these files by default.

### 4. Run the Application

```bash
# Terminal 1: Start frontend dev server
npm run dev

# Terminal 2: Start backend server
cd backend
python main.py
# Or with uvicorn:
uvicorn main:app --reload --port 8000
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

## Database Schema

### Tables
- `users`: Extended user profiles with roles
- `artifacts`: Development artifacts (documents, files, etc.)
- `bugs`: Bug reports
- `bug_artifacts`: Many-to-many relationship between bugs and artifacts

### Roles
- `reporter`: Can create bugs and artifacts
- `developer`: Can create and update bugs/artifacts
- `admin`: Full access to all resources

## API Endpoints

### Authentication
- `GET /api/auth/me` - Get current user info

### Users
- `GET /api/user/me` - Get current user profile
- `PATCH /api/user/me` - Update current user profile
- `GET /api/users` - List all users (admin only)

### Artifacts
- `GET /api/artifacts` - List all artifacts
- `GET /api/artifacts/{id}` - Get artifact by ID
- `POST /api/artifacts` - Create artifact
- `PATCH /api/artifacts/{id}` - Update artifact
- `DELETE /api/artifacts/{id}` - Delete artifact (admin only)

### Bugs
- `GET /api/bugs` - List bugs with filtering
- `GET /api/bugs/{id}` - Get bug by ID
- `POST /api/bugs` - Create bug
- `PATCH /api/bugs/{id}` - Update bug
- `DELETE /api/bugs/{id}` - Delete bug (admin only)

## Development

### Project Structure

```
cps406/
├── src/                    # Frontend source
│   ├── components/        # React components
│   ├── contexts/          # React contexts (Auth)
│   ├── hooks/             # Custom hooks
│   ├── lib/              # Utilities (API, Supabase)
│   └── pages/            # Page components
├── backend/              # FastAPI backend
│   ├── api/              # API routes
│   ├── crud/             # Database operations
│   ├── schemas/          # Pydantic models
│   └── main.py           # FastAPI app
├── database/             # Database migrations
└── README.md
```

## License

MIT

## Security Notes

- Treat `SUPABASE_SERVICE_ROLE_KEY` as highly sensitive. If exposed, rotate immediately in Supabase.
- `VITE_SUPABASE_ANON_KEY` is public by design, but should still be managed through environment files, not hardcoded in source.
- If a key leak is suspected:
	1. Rotate exposed keys in Supabase.
	2. Replace local `.env` values.
	3. Confirm no secrets appear in tracked files with `git grep`.
	4. If secrets were ever committed, rewrite git history before publishing.
