require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "change_this_in_production";
const ROLE = { ADMIN: "ADMIN", MEMBER: "MEMBER" };
const TASK_STATUS = { TODO: "TODO", IN_PROGRESS: "IN_PROGRESS", DONE: "DONE" };

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const signupSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum([ROLE.ADMIN, ROLE.MEMBER]).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const createProjectSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string()).optional()
});

const createTaskSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().datetime().optional()
});

const updateTaskSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum([TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.DONE]).optional()
});

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function getToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

async function auth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return sendError(res, 401, "Missing token");
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return sendError(res, 401, "Invalid user");
    req.user = user;
    return next();
  } catch (err) {
    return sendError(res, 401, "Unauthorized");
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== ROLE.ADMIN) {
    return sendError(res, 403, "Admin only");
  }
  return next();
}

async function canAccessProject(userId, role, projectId) {
  if (role === ROLE.ADMIN) return true;
  const membership = await prisma.projectMember.findFirst({
    where: { userId, projectId }
  });
  return Boolean(membership);
}

app.post("/api/auth/signup", async (req, res) => {
  try {
    const parsed = signupSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (exists) return sendError(res, 400, "Email already in use");

    const usersCount = await prisma.user.count();
    const role = usersCount === 0 ? ROLE.ADMIN : parsed.role || ROLE.MEMBER;
    const passwordHash = await bcrypt.hash(parsed.password, 10);

    const user = await prisma.user.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        passwordHash,
        role
      }
    });

    return res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    });
  } catch (err) {
    if (err instanceof z.ZodError) return sendError(res, 400, err.issues[0].message);
    return sendError(res, 500, "Signup failed");
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (!user) return sendError(res, 401, "Invalid credentials");
    const ok = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!ok) return sendError(res, 401, "Invalid credentials");

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    if (err instanceof z.ZodError) return sendError(res, 400, err.issues[0].message);
    return sendError(res, 500, "Login failed");
  }
});

app.get("/api/auth/me", auth, async (req, res) => {
  return res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role
  });
});

app.get("/api/users", auth, requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: { createdAt: "desc" }
  });
  return res.json(users);
});

app.post("/api/projects", auth, requireAdmin, async (req, res) => {
  try {
    const parsed = createProjectSchema.parse(req.body);
    const project = await prisma.project.create({
      data: {
        name: parsed.name,
        description: parsed.description,
        createdById: req.user.id,
        members: parsed.memberIds?.length
          ? { create: parsed.memberIds.map((id) => ({ userId: id })) }
          : undefined
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } }
      }
    });
    return res.status(201).json(project);
  } catch (err) {
    if (err instanceof z.ZodError) return sendError(res, 400, err.issues[0].message);
    return sendError(res, 500, "Project creation failed");
  }
});

app.get("/api/projects", auth, async (req, res) => {
  const where =
    req.user.role === ROLE.ADMIN
      ? {}
      : {
          members: { some: { userId: req.user.id } }
        };

  const projects = await prisma.project.findMany({
    where,
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
      tasks: true
    },
    orderBy: { createdAt: "desc" }
  });
  return res.json(projects);
});

app.post("/api/projects/:projectId/members", auth, requireAdmin, async (req, res) => {
  const bodySchema = z.object({ userId: z.string() });
  try {
    const { userId } = bodySchema.parse(req.body);
    const { projectId } = req.params;
    await prisma.projectMember.create({
      data: { projectId, userId }
    });
    return res.status(201).json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) return sendError(res, 400, err.issues[0].message);
    return sendError(res, 500, "Could not add member");
  }
});

app.post("/api/projects/:projectId/tasks", auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const allowed = await canAccessProject(req.user.id, req.user.role, projectId);
    if (!allowed) return sendError(res, 403, "Not allowed in this project");

    const parsed = createTaskSchema.parse(req.body);
    const task = await prisma.task.create({
      data: {
        projectId,
        title: parsed.title,
        description: parsed.description,
        assigneeId: parsed.assigneeId,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
        createdById: req.user.id
      }
    });
    return res.status(201).json(task);
  } catch (err) {
    if (err instanceof z.ZodError) return sendError(res, 400, err.issues[0].message);
    return sendError(res, 500, "Task creation failed");
  }
});

app.patch("/api/tasks/:taskId", auth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const parsed = updateTaskSchema.parse(req.body);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return sendError(res, 404, "Task not found");

    const allowedProject = await canAccessProject(req.user.id, req.user.role, task.projectId);
    if (!allowedProject) return sendError(res, 403, "Not allowed in this project");

    if (req.user.role === ROLE.MEMBER) {
      const updatingOtherFields =
        parsed.title || parsed.description || parsed.assigneeId !== undefined || parsed.dueDate !== undefined;
      if (updatingOtherFields) {
        return sendError(res, 403, "Members can only update task status");
      }
      if (task.assigneeId !== req.user.id) {
        return sendError(res, 403, "Only assignee can update this task");
      }
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        title: parsed.title,
        description: parsed.description,
        status: parsed.status,
        assigneeId: parsed.assigneeId === undefined ? undefined : parsed.assigneeId,
        dueDate: parsed.dueDate === undefined ? undefined : parsed.dueDate ? new Date(parsed.dueDate) : null
      }
    });
    return res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return sendError(res, 400, err.issues[0].message);
    return sendError(res, 500, "Task update failed");
  }
});

app.get("/api/dashboard", auth, async (req, res) => {
  const projectIds =
    req.user.role === ROLE.ADMIN
      ? undefined
      : (
          await prisma.projectMember.findMany({
            where: { userId: req.user.id },
            select: { projectId: true }
          })
        ).map((p) => p.projectId);

  const baseWhere =
    req.user.role === ROLE.ADMIN
      ? {}
      : {
          projectId: { in: projectIds.length ? projectIds : [""] }
        };

  const tasks = await prisma.task.findMany({
    where: baseWhere,
    include: {
      assignee: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } }
    }
  });

  const now = new Date();
  const summary = {
    total: tasks.length,
    todo: tasks.filter((t) => t.status === TASK_STATUS.TODO).length,
    inProgress: tasks.filter((t) => t.status === TASK_STATUS.IN_PROGRESS).length,
    done: tasks.filter((t) => t.status === TASK_STATUS.DONE).length,
    overdue: tasks.filter((t) => t.dueDate && t.status !== TASK_STATUS.DONE && t.dueDate < now).length
  };

  return res.json({
    summary,
    overdueTasks: tasks.filter((t) => t.dueDate && t.status !== TASK_STATUS.DONE && t.dueDate < now)
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
