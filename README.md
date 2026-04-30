# ⚡ TaskFlow — Project & Task Manager with RBAC

A full-stack web app for managing projects, assigning tasks, and tracking progress with role-based access control (Admin / Member).

---

## 🚀 Live Demo

> Add your Railway URL here after deployment.

## 📦 GitHub Repo

> Add your GitHub repo link here.

---

## ✨ Features

### 🔐 Authentication
- Signup & Login with JWT (7-day tokens)
- Passwords hashed with bcrypt (12 rounds)
- First registered user is automatically **Admin**

### 👥 Role-Based Access Control

| Action | Admin | Member |
|---|:---:|:---:|
| Create / edit / delete projects | ✅ | ❌ |
| Add / remove project members | ✅ | ❌ |
| Create tasks in their projects | ✅ | ✅ |
| Edit task details (title, priority, assignee, due date) | ✅ | ❌ |
| Update status on assigned tasks | ✅ | ✅ |
| Delete tasks | ✅ | ❌ |
| Manage users (role change, delete) | ✅ | ❌ |
| View all projects | ✅ | Assigned only |

### 📁 Project Management
- Create, edit, delete projects
- Add / remove team members per project
- Progress bar (% of tasks done)
- Overdue task count per project card

### ✅ Task Management
- Title, description, priority (Low / Medium / High), due date, assignee
- Status: **To Do → In Progress → Done** (click the circle to cycle)
- Filter tasks by status
- Overdue highlighting

### 📊 Dashboard
- Stats: total, to-do, in-progress, done, overdue, projects, users (admin)
- Overdue tasks list
- Recent tasks list

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| ORM | Prisma 5 |
| Database | PostgreSQL (Railway) |
| Auth | JWT + bcryptjs |
| Validation | Zod |
| Frontend | Vanilla JS + HTML5 + CSS3 |

---

## ⚙️ Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL database

### Setup

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd taskflow

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL and JWT_SECRET

# 4. Push schema to database
npx prisma db push

# 5. Generate Prisma client
npx prisma generate

# 6. Start dev server
npm run dev
```

Open **http://localhost:4000**

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Long random secret for signing JWTs |
| `PORT` | Server port (default: 4000) |

---

## 🌐 Deploy on Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project**
3. Add a **PostgreSQL** plugin to your project
4. Deploy from your GitHub repo
5. Set environment variables in Railway:
   - `DATABASE_URL` → copy from the PostgreSQL plugin's **Connect** tab
   - `JWT_SECRET` → any long random string
6. Railway runs `npx prisma db push && node src/server.js` automatically on deploy

---

## 📡 REST API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|:---:|---|
| POST | `/api/auth/signup` | — | Register |
| POST | `/api/auth/login` | — | Login → JWT |
| GET | `/api/auth/me` | ✅ | Current user |

### Users
| Method | Endpoint | Auth | Description |
|---|---|:---:|---|
| GET | `/api/users` | ✅ | List all users |
| PATCH | `/api/users/:id/role` | Admin | Change role |
| DELETE | `/api/users/:id` | Admin | Delete user |

### Projects
| Method | Endpoint | Auth | Description |
|---|---|:---:|---|
| POST | `/api/projects` | Admin | Create project |
| GET | `/api/projects` | ✅ | List accessible projects |
| GET | `/api/projects/:id` | ✅ | Project detail |
| PATCH | `/api/projects/:id` | Admin | Update project |
| DELETE | `/api/projects/:id` | Admin | Delete project |
| POST | `/api/projects/:id/members` | Admin | Add member |
| DELETE | `/api/projects/:id/members/:uid` | Admin | Remove member |

### Tasks
| Method | Endpoint | Auth | Description |
|---|---|:---:|---|
| POST | `/api/projects/:id/tasks` | ✅ | Create task |
| PATCH | `/api/tasks/:id` | ✅ | Update task |
| DELETE | `/api/tasks/:id` | Admin | Delete task |

### Dashboard
| Method | Endpoint | Auth | Description |
|---|---|:---:|---|
| GET | `/api/dashboard` | ✅ | Stats + overdue + recent |

---

## 📂 Project Structure

```
taskflow/
├── prisma/
│   └── schema.prisma        # DB schema (User, Project, ProjectMember, Task)
├── public/
│   ├── index.html           # Single-page app shell
│   ├── app.js               # All frontend logic (~500 lines)
│   └── styles.css           # All styles (~500 lines)
├── src/
│   └── server.js            # Express API + middleware
├── .env                     # Local environment variables
├── package.json
├── railway.json             # Railway deploy config
└── README.md
```
