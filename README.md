# Project Tracker RBAC App

A full-stack web app where users can create projects, assign tasks, and track progress with role-based access (`ADMIN` / `MEMBER`).

## Features

- Authentication: signup/login with JWT
- Role-based access control:
  - `ADMIN`: manage users, create projects, assign members, create/update all tasks
  - `MEMBER`: view assigned projects, update status for own assigned tasks
- Project and team management
- Task creation, assignment, status tracking (`TODO`, `IN_PROGRESS`, `DONE`)
- Dashboard with task summary and overdue task list
- REST API + SQL database (SQLite via Prisma)
- Input validation using Zod

## Tech Stack

- Backend: Node.js, Express
- Database: PostgreSQL (Prisma ORM)
- Auth: JWT + bcrypt
- Frontend: Vanilla HTML/CSS/JavaScript (served by Express)
- Deployment: Railway

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Set environment variables in `.env`

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public"
JWT_SECRET="super_secret_change_me"
```

3. Sync schema

```bash
npx prisma db push
```

4. Start app

```bash
npm run dev
```

App runs at `http://localhost:4000`.

## API Endpoints

### Auth
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Users (Admin)
- `GET /api/users`

### Projects
- `POST /api/projects` (Admin)
- `GET /api/projects` (Admin/Member)
- `POST /api/projects/:projectId/members` (Admin)

### Tasks
- `POST /api/projects/:projectId/tasks` (Admin/Member with access)
- `PATCH /api/tasks/:taskId` (Admin all, Member status-only for own assigned task)

### Dashboard
- `GET /api/dashboard`

## Railway Deployment (Mandatory)

1. Push code to GitHub.
2. Go to [Railway](https://railway.app/) and create a new project from your GitHub repo.
3. Add environment variables in Railway:
   - `DATABASE_URL` (Railway Postgres connection URL)
   - `JWT_SECRET`
4. Deploy. Railway uses `railway.json` start command:
   - `npx prisma db push && npm start`
5. Open the generated Railway domain.

## Submission

- **Live URL:** `ADD_YOUR_RAILWAY_URL_HERE`
- **GitHub Repo:** `https://github.com/Ujjwalkumarmerit/PROJECT-TRACKER`

## Notes

- First signed-up account becomes `ADMIN` automatically.
- Keep `.env` out of version control.
