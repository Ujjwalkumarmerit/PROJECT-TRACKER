"use strict";
require("dotenv").config();

const path    = require("path");
const express = require("express");
const cors    = require("cors");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { z }   = require("zod");
const { PrismaClient } = require("@prisma/client");

const app    = express();
const prisma = new PrismaClient();
const PORT   = process.env.PORT || 4000;
const SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ─── Zod Schemas ─────────────────────────────────────────────────────────────
const S = {
  signup: z.object({
    name:     z.string().min(2).max(80),
    email:    z.string().email(),
    password: z.string().min(6),
    role:     z.enum(["ADMIN","MEMBER"]).optional()
  }),
  login: z.object({
    email:    z.string().email(),
    password: z.string().min(1)
  }),
  project: z.object({
    name:        z.string().min(2).max(100),
    description: z.string().max(500).optional()
  }),
  task: z.object({
    title:       z.string().min(2).max(120),
    description: z.string().max(500).optional(),
    priority:    z.enum(["LOW","MEDIUM","HIGH"]).optional(),
    assigneeId:  z.string().optional(),
    dueDate:     z.string().optional()
  }),
  taskUpdate: z.object({
    title:       z.string().min(2).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    status:      z.enum(["TODO","IN_PROGRESS","DONE"]).optional(),
    priority:    z.enum(["LOW","MEDIUM","HIGH"]).optional(),
    assigneeId:  z.string().nullable().optional(),
    dueDate:     z.string().nullable().optional()
  }),
  role: z.object({ role: z.enum(["ADMIN","MEMBER"]) }),
  member: z.object({ userId: z.string().min(1) })
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const err = (res, status, msg) => res.status(status).json({ error: msg });

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return err(res, 401, "No token provided");
  try {
    const payload = jwt.verify(header.slice(7), SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return err(res, 401, "User not found");
    req.user = user;
    next();
  } catch {
    return err(res, 401, "Invalid or expired token");
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "ADMIN") return err(res, 403, "Admins only");
  next();
}

async function requireProjectAccess(req, res, next) {
  const { projectId } = req.params;
  if (req.user.role === "ADMIN") return next();
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: req.user.id } }
  });
  if (!m) return err(res, 403, "Not a member of this project");
  next();
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  try {
    const body = S.signup.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) return err(res, 409, "Email already registered");

    const count = await prisma.user.count();
    const role  = count === 0 ? "ADMIN" : (body.role || "MEMBER");
    const hash  = await bcrypt.hash(body.password, 12);

    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash: hash, role },
      select: { id: true, name: true, email: true, role: true }
    });
    res.status(201).json(user);
  } catch (e) {
    if (e instanceof z.ZodError) return err(res, 400, e.errors[0].message);
    err(res, 500, "Signup failed");
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const body = S.login.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return err(res, 401, "Invalid email or password");
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) return err(res, 401, "Invalid email or password");

    const token = jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    if (e instanceof z.ZodError) return err(res, 400, e.errors[0].message);
    err(res, 500, "Login failed");
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const { id, name, email, role } = req.user;
  res.json({ id, name, email, role });
});

// ─── USERS ────────────────────────────────────────────────────────────────────
app.get("/api/users", requireAuth, async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });
  res.json(users);
});

app.patch("/api/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = S.role.parse(req.body);
    if (req.params.id === req.user.id) return err(res, 400, "Cannot change your own role");
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true }
    });
    res.json(user);
  } catch (e) {
    if (e instanceof z.ZodError) return err(res, 400, e.errors[0].message);
    err(res, 500, "Role update failed");
  }
});

app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) return err(res, 400, "Cannot delete yourself");
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    err(res, 500, "Delete failed");
  }
});

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
const projectInclude = {
  owner:   { select: { id: true, name: true } },
  members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
  tasks:   { include: { assignee: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } }
};

app.post("/api/projects", requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = S.project.parse(req.body);
    const project = await prisma.project.create({
      data: { name: body.name, description: body.description, ownerId: req.user.id },
      include: projectInclude
    });
    res.status(201).json(project);
  } catch (e) {
    if (e instanceof z.ZodError) return err(res, 400, e.errors[0].message);
    err(res, 500, "Could not create project");
  }
});

app.get("/api/projects", requireAuth, async (req, res) => {
  const where = req.user.role === "ADMIN"
    ? {}
    : { members: { some: { userId: req.user.id } } };
  const projects = await prisma.project.findMany({
    where,
    include: projectInclude,
    orderBy: { createdAt: "desc" }
  });
  res.json(projects);
});

app.get("/api/projects/:projectId", requireAuth, requireProjectAccess, async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: projectInclude
  });
  if (!project) return err(res, 404, "Project not found");
  res.json(project);
});

app.patch("/api/projects/:projectId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = S.project.partial().parse(req.body);
    const project = await prisma.project.update({
      where: { id: req.params.projectId },
      data: body,
      include: projectInclude
    });
    res.json(project);
  } catch (e) {
    if (e instanceof z.ZodError) return err(res, 400, e.errors[0].message);
    err(res, 500, "Update failed");
  }
});

app.delete("/api/projects/:projectId", requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.project.delete({ where: { id: req.params.projectId } });
    res.json({ ok: true });
  } catch {
    err(res, 500, "Delete failed");
  }
});

// ─── PROJECT MEMBERS ──────────────────────────────────────────────────────────
app.post("/api/projects/:projectId/members", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = S.member.parse(req.body);
    const { projectId } = req.params;
    const already = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } }
    });
    if (already) return err(res, 409, "User is already a member");
    await prisma.projectMember.create({ data: { projectId, userId } });
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return err(res, 400, e.errors[0].message);
    err(res, 500, "Could not add member");
  }
});

app.delete("/api/projects/:projectId/members/:userId", requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId: req.params.projectId, userId: req.params.userId } }
    });
    res.json({ ok: true });
  } catch {
    err(res, 500, "Could not remove member");
  }
});

// ─── TASKS ────────────────────────────────────────────────────────────────────
app.post("/api/projects/:projectId/tasks", requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const body = S.task.parse(req.body);
    const task = await prisma.task.create({
      data: {
        title:       body.title,
        description: body.description,
        priority:    body.priority || "MEDIUM",
        assigneeId:  body.assigneeId || null,
        dueDate:     parseDate(body.dueDate),
        projectId:   req.params.projectId,
        creatorId:   req.user.id
      },
      include: { assignee: { select: { id: true, name: true } } }
    });
    res.status(201).json(task);
  } catch (e) {
    if (e instanceof z.ZodError) return err(res, 400, e.errors[0].message);
    err(res, 500, "Could not create task");
  }
});

app.patch("/api/tasks/:taskId", requireAuth, async (req, res) => {
  try {
    const body = S.taskUpdate.parse(req.body);
    const task = await prisma.task.findUnique({ where: { id: req.params.taskId } });
    if (!task) return err(res, 404, "Task not found");

    // Check project access
    if (req.user.role !== "ADMIN") {
      const m = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: task.projectId, userId: req.user.id } }
      });
      if (!m) return err(res, 403, "Not a member of this project");
      // Members can only update status on their own assigned tasks
      const adminFields = ["title","description","priority","assigneeId","dueDate"];
      const hasAdminField = adminFields.some(f => body[f] !== undefined);
      if (hasAdminField) return err(res, 403, "Members can only update task status");
      if (task.assigneeId !== req.user.id) return err(res, 403, "You can only update tasks assigned to you");
    }

    const updated = await prisma.task.update({
      where: { id: req.params.taskId },
      data: {
        ...(body.title       !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.status      !== undefined && { status: body.status }),
        ...(body.priority    !== undefined && { priority: body.priority }),
        ...(body.assigneeId  !== undefined && { assigneeId: body.assigneeId }),
        ...(body.dueDate     !== undefined && { dueDate: parseDate(body.dueDate) })
      },
      include: { assignee: { select: { id: true, name: true } } }
    });
    res.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return err(res, 400, e.errors[0].message);
    err(res, 500, "Update failed");
  }
});

app.delete("/api/tasks/:taskId", requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: req.params.taskId } });
    res.json({ ok: true });
  } catch {
    err(res, 500, "Delete failed");
  }
});

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
app.get("/api/dashboard", requireAuth, async (req, res) => {
  const isAdmin = req.user.role === "ADMIN";

  // Determine which project IDs this user can see
  let projectIds;
  if (!isAdmin) {
    const memberships = await prisma.projectMember.findMany({
      where: { userId: req.user.id },
      select: { projectId: true }
    });
    projectIds = memberships.map(m => m.projectId);
  }

  const taskWhere = isAdmin ? {} : {
    projectId: { in: projectIds.length ? projectIds : ["__none__"] }
  };

  const [tasks, projectCount, userCount] = await Promise.all([
    prisma.task.findMany({
      where: taskWhere,
      include: {
        project:  { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    isAdmin
      ? prisma.project.count()
      : Promise.resolve(projectIds ? projectIds.length : 0),
    isAdmin ? prisma.user.count() : Promise.resolve(null)
  ]);

  const now = new Date();
  const overdue = tasks.filter(t => t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < now);

  res.json({
    stats: {
      total:      tasks.length,
      todo:       tasks.filter(t => t.status === "TODO").length,
      inProgress: tasks.filter(t => t.status === "IN_PROGRESS").length,
      done:       tasks.filter(t => t.status === "DONE").length,
      overdue:    overdue.length,
      projects:   projectCount,
      ...(userCount !== null ? { users: userCount } : {})
    },
    overdueTasks: overdue.slice(0, 10),
    recentTasks:  tasks.slice(0, 10)
  });
});

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── SPA FALLBACK ─────────────────────────────────────────────────────────────
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`TaskFlow running → http://localhost:${PORT}`));
