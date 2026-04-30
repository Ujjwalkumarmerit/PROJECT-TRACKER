/* ═══════════════════════════════════════════════════════════════
   TaskFlow — Frontend
════════════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────
const S = {
  token:         localStorage.getItem("tf_token") || "",
  me:            null,
  projects:      [],
  users:         [],
  project:       null,   // current project detail
  taskFilter:    "ALL",
  myTaskFilter:  "ALL"
};

// ── API ───────────────────────────────────────────────────────
async function api(url, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (S.token) headers["Authorization"] = "Bearer " + S.token;
  const res  = await fetch(url, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Request failed");
  return body;
}

// ── Toast ─────────────────────────────────────────────────────
let _toastT = null;
function toast(msg, type = "ok") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className   = "toast " + type;
  el.classList.remove("hidden");
  if (_toastT) clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.add("hidden"), 3500);
}

// ── Auth tab ──────────────────────────────────────────────────
function switchTab(t) {
  document.getElementById("loginForm").classList.toggle("hidden",  t !== "login");
  document.getElementById("signupForm").classList.toggle("hidden", t !== "signup");
  document.getElementById("tabLogin").classList.toggle("active",   t === "login");
  document.getElementById("tabSignup").classList.toggle("active",  t === "signup");
}

// ── Login ─────────────────────────────────────────────────────
async function doLogin(e) {
  e.preventDefault();
  const btn = document.getElementById("loginBtn");
  const err = document.getElementById("loginErr");
  err.classList.add("hidden");
  btn.disabled = true; btn.textContent = "Logging in…";
  try {
    const d = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email:    document.getElementById("lEmail").value.trim(),
        password: document.getElementById("lPass").value
      })
    });
    S.token = d.token;
    localStorage.setItem("tf_token", S.token);
    await boot();
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove("hidden");
  } finally {
    btn.disabled = false; btn.textContent = "Login";
  }
}

// ── Signup ────────────────────────────────────────────────────
async function doSignup(e) {
  e.preventDefault();
  const btn = document.getElementById("signupBtn");
  const err = document.getElementById("signupErr");
  const ok  = document.getElementById("signupOk");
  err.classList.add("hidden"); ok.classList.add("hidden");
  btn.disabled = true; btn.textContent = "Creating…";
  try {
    await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name:     document.getElementById("sName").value.trim(),
        email:    document.getElementById("sEmail").value.trim(),
        password: document.getElementById("sPass").value,
        role:     document.getElementById("sRole").value
      })
    });
    ok.textContent = "Account created! Logging you in…";
    ok.classList.remove("hidden");
    document.getElementById("signupForm").reset();
    setTimeout(() => switchTab("login"), 1200);
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove("hidden");
  } finally {
    btn.disabled = false; btn.textContent = "Create Account";
  }
}

// ── Logout ────────────────────────────────────────────────────
function doLogout() {
  S.token = ""; S.me = null; S.projects = []; S.users = []; S.project = null;
  localStorage.removeItem("tf_token");
  document.getElementById("app").classList.add("hidden");
  document.getElementById("authScreen").classList.remove("hidden");
  toast("Logged out", "info");
}

// ── Boot ──────────────────────────────────────────────────────
async function boot() {
  try {
    S.me = await api("/api/auth/me");
  } catch {
    S.token = ""; localStorage.removeItem("tf_token"); return;
  }
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  document.getElementById("meName").textContent   = S.me.name;
  document.getElementById("meRole").textContent   = S.me.role;
  document.getElementById("meAvatar").textContent = S.me.name[0].toUpperCase();
  document.getElementById("rolePill").textContent = S.me.role;

  // Show admin-only elements
  document.querySelectorAll(".admin-gate").forEach(el =>
    el.classList.toggle("hidden", S.me.role !== "ADMIN")
  );

  goto("dashboard");
}

// ── Navigation ────────────────────────────────────────────────
function goto(view, projectId) {
  // Update nav
  document.querySelectorAll(".nav-link").forEach(el =>
    el.classList.toggle("active", el.dataset.view === view)
  );
  // Hide all views
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));

  const titles = { dashboard:"Dashboard", projects:"Projects", mytasks:"My Tasks", users:"Users", detail:"" };

  if (view === "detail" && projectId) {
    document.getElementById("viewDetail").classList.add("active");
    document.getElementById("viewTitle").textContent = "Project";
    loadDetail(projectId);
    closeSidebar();
    return false;
  }

  const el = document.getElementById("view" + view.charAt(0).toUpperCase() + view.slice(1));
  if (el) el.classList.add("active");
  document.getElementById("viewTitle").textContent = titles[view] || view;

  if (view === "dashboard") loadDashboard();
  else if (view === "projects") loadProjects();
  else if (view === "mytasks") loadMyTasks();
  else if (view === "users")   loadUsers();

  closeSidebar();
  return false;
}

function openSidebar()  { document.getElementById("sidebar").classList.add("open"); }
function closeSidebar() { document.getElementById("sidebar").classList.remove("open"); }

// ── Dashboard ─────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const { stats, overdueTasks, recentTasks } = await api("/api/dashboard");

    // Stats cards
    const cards = [
      { lbl:"Total Tasks",  val:stats.total,      icon:"📋", cls:"c-accent" },
      { lbl:"To Do",        val:stats.todo,        icon:"⏳", cls:"c-blue"   },
      { lbl:"In Progress",  val:stats.inProgress,  icon:"🔄", cls:"c-yellow" },
      { lbl:"Done",         val:stats.done,        icon:"✅", cls:"c-green"  },
      { lbl:"Overdue",      val:stats.overdue,     icon:"🚨", cls:"c-red"    },
      { lbl:"Projects",     val:stats.projects,    icon:"📁", cls:"c-accent" }
    ];
    if (stats.users !== undefined)
      cards.push({ lbl:"Users", val:stats.users, icon:"👥", cls:"c-blue" });

    document.getElementById("statGrid").innerHTML = cards.map(c =>
      `<div class="stat-card ${c.cls}">
        <div class="stat-icon">${c.icon}</div>
        <div class="stat-val">${c.val}</div>
        <div class="stat-lbl">${c.lbl}</div>
      </div>`
    ).join("");

    // Overdue
    document.getElementById("overdueCount").textContent = overdueTasks.length;
    document.getElementById("overdueList").innerHTML = overdueTasks.length
      ? overdueTasks.map(t =>
          `<div class="simple-item">
            <span class="pill danger">OVERDUE</span>
            <span class="simple-title">${esc(t.title)}</span>
            <span class="simple-proj">${esc(t.project.name)}</span>
          </div>`
        ).join("")
      : '<p class="empty">No overdue tasks 🎉</p>';

    // Recent
    document.getElementById("recentList").innerHTML = recentTasks.length
      ? recentTasks.map(t =>
          `<div class="simple-item">
            <span class="status-badge s-${t.status}">${fmtStatus(t.status)}</span>
            <span class="simple-title">${esc(t.title)}</span>
            <span class="simple-proj">${esc(t.project.name)}</span>
          </div>`
        ).join("")
      : '<p class="empty">No tasks yet.</p>';

  } catch (ex) { toast(ex.message, "err"); }
}

// ── Projects list ─────────────────────────────────────────────
async function loadProjects() {
  try {
    S.projects = await api("/api/projects");
    if (S.me.role === "ADMIN") S.users = await api("/api/users");
    renderProjects();
  } catch (ex) { toast(ex.message, "err"); }
}

function renderProjects() {
  const grid = document.getElementById("projectGrid");
  if (!S.projects.length) {
    grid.innerHTML = `<p class="empty" style="grid-column:1/-1">
      ${S.me.role === "ADMIN"
        ? "No projects yet. Create one to get started!"
        : "You haven't been added to any projects yet."}
    </p>`;
    return;
  }
  grid.innerHTML = S.projects.map(p => {
    const total   = p.tasks.length;
    const done    = p.tasks.filter(t => t.status === "DONE").length;
    const pct     = total ? Math.round(done / total * 100) : 0;
    const overdue = p.tasks.filter(t => t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < new Date()).length;
    return `
      <div class="project-card" onclick="goto('detail','${p.id}')"
           role="button" tabindex="0"
           onkeydown="if(event.key==='Enter')goto('detail','${p.id}')">
        <div class="pc-head">
          <div class="pc-name">${esc(p.name)}</div>
          ${overdue ? `<span class="pill danger">${overdue} overdue</span>` : ""}
        </div>
        <div class="pc-desc">${esc(p.description || "No description.")}</div>
        <div class="progress-wrap">
          <div class="progress-lbl"><span>Progress</span><span>${pct}%</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="pc-meta">
          <span>📋 ${total} tasks</span>
          <span>✅ ${done} done</span>
          <span>👥 ${p.members.length} members</span>
        </div>
      </div>`;
  }).join("");
}

// ── Project Detail ────────────────────────────────────────────
async function loadDetail(id) {
  try {
    S.project = await api("/api/projects/" + id);
    if (S.me.role === "ADMIN") S.users = await api("/api/users");
    document.getElementById("viewTitle").textContent = S.project.name;
    renderDetail();
  } catch (ex) {
    toast(ex.message, "err");
    goto("projects");
  }
}

function renderDetail() {
  const p     = S.project;
  const total = p.tasks.length;
  const done  = p.tasks.filter(t => t.status === "DONE").length;
  const inPr  = p.tasks.filter(t => t.status === "IN_PROGRESS").length;
  const todo  = p.tasks.filter(t => t.status === "TODO").length;
  const pct   = total ? Math.round(done / total * 100) : 0;

  document.getElementById("projectHeader").innerHTML = `
    <h2>${esc(p.name)}</h2>
    <p>${esc(p.description || "No description.")}</p>
    <div class="ph-meta">
      <span>📋 ${total} tasks</span>
      <span>⏳ ${todo} to do</span>
      <span>🔄 ${inPr} in progress</span>
      <span>✅ ${done} done</span>
      <span>👥 ${p.members.length} members</span>
      <span>Owner: ${esc(p.owner.name)}</span>
    </div>
    <div class="ph-progress">
      <div class="progress-lbl"><span>Completion</span><span>${pct}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>`;

  renderTasks();
  renderMembers();
  fillAssigneeDropdowns();
}

function renderTasks() {
  const p      = S.project;
  const filter = S.taskFilter;
  const tasks  = filter === "ALL" ? p.tasks : p.tasks.filter(t => t.status === filter);
  const list   = document.getElementById("taskList");
  const now    = new Date();

  if (!tasks.length) {
    list.innerHTML = `<p class="empty">No tasks${filter !== "ALL" ? ` with status "${fmtStatus(filter)}"` : ""}.</p>`;
    return;
  }

  list.innerHTML = tasks.map(t => {
    const overdue    = t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < now;
    const checkCls   = t.status === "DONE" ? "done" : t.status === "IN_PROGRESS" ? "in-progress" : "";
    const checkIcon  = t.status === "DONE" ? "✓" : t.status === "IN_PROGRESS" ? "●" : "";
    const isAdmin    = S.me.role === "ADMIN";
    const isAssignee = t.assigneeId === S.me.id;
    return `
      <div class="task-item${overdue ? " overdue" : ""}">
        <button class="task-check ${checkCls}"
          onclick="cycleStatus('${t.id}','${t.status}')"
          title="Cycle status" aria-label="Status: ${fmtStatus(t.status)}">
          ${checkIcon}
        </button>
        <div class="task-body">
          <div class="task-title${t.status === "DONE" ? " done" : ""}">${esc(t.title)}</div>
          ${t.description ? `<div class="task-desc">${esc(t.description)}</div>` : ""}
          <div class="task-meta">
            <span class="status-badge s-${t.status}">${fmtStatus(t.status)}</span>
            <span class="pri-badge p-${t.priority}">${t.priority}</span>
            <span class="task-assignee">${t.assignee ? "👤 " + esc(t.assignee.name) : "Unassigned"}</span>
            ${t.dueDate ? `<span class="task-due${overdue ? " overdue" : ""}">📅 ${fmtDate(t.dueDate)}</span>` : ""}
          </div>
        </div>
        <div class="task-actions">
          ${isAdmin || isAssignee
            ? `<button class="icon-btn" onclick="openEditTask('${t.id}')" title="Edit">✏️</button>`
            : ""}
          ${isAdmin
            ? `<button class="icon-btn del" onclick="deleteTask('${t.id}')" title="Delete">🗑️</button>`
            : ""}
        </div>
      </div>`;
  }).join("");
}

function renderMembers() {
  const p    = S.project;
  const list = document.getElementById("memberList");
  if (!p.members.length) {
    list.innerHTML = '<p class="empty">No members yet.</p>';
    return;
  }
  list.innerHTML = p.members.map(m => {
    const u = m.user;
    return `
      <div class="member-item">
        <div class="member-avatar">${u.name[0].toUpperCase()}</div>
        <div class="member-info">
          <div class="member-name">${esc(u.name)}</div>
          <div class="member-email">${esc(u.email)}</div>
        </div>
        <span class="pill ${u.role === "ADMIN" ? "accent" : "gray"}">${u.role}</span>
        ${S.me.role === "ADMIN"
          ? `<button class="icon-btn del" onclick="removeMember('${u.id}')" title="Remove">✕</button>`
          : ""}
      </div>`;
  }).join("");
}

function fillAssigneeDropdowns() {
  const members = S.project.members.map(m => m.user);
  ["ctAssignee", "etAssignee"].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Unassigned</option>';
    members.forEach(u => {
      const o = document.createElement("option");
      o.value = u.id;
      o.textContent = u.name + " (" + u.role + ")";
      sel.appendChild(o);
    });
    if (cur) sel.value = cur;
  });
}

function setTaskFilter(btn) {
  document.querySelectorAll("#taskFilterBar .filter").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  S.taskFilter = btn.dataset.f;
  renderTasks();
}

// ── My Tasks ──────────────────────────────────────────────────
async function loadMyTasks() {
  try {
    S.projects = await api("/api/projects");
    renderMyTasks();
  } catch (ex) { toast(ex.message, "err"); }
}

function renderMyTasks() {
  const filter = S.myTaskFilter;
  const all    = [];
  S.projects.forEach(p =>
    p.tasks.forEach(t => all.push({ ...t, projectName: p.name, projectId: p.id }))
  );
  const mine = all.filter(t => {
    const owned = S.me.role === "ADMIN" || t.assigneeId === S.me.id;
    return owned && (filter === "ALL" || t.status === filter);
  });

  const list = document.getElementById("myTaskList");
  const now  = new Date();

  if (!mine.length) {
    list.innerHTML = '<p class="empty">No tasks found.</p>';
    return;
  }

  list.innerHTML = mine.map(t => {
    const overdue   = t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < now;
    const checkCls  = t.status === "DONE" ? "done" : t.status === "IN_PROGRESS" ? "in-progress" : "";
    const checkIcon = t.status === "DONE" ? "✓" : t.status === "IN_PROGRESS" ? "●" : "";
    return `
      <div class="task-item${overdue ? " overdue" : ""}">
        <button class="task-check ${checkCls}"
          onclick="cycleStatusGlobal('${t.id}','${t.status}')"
          title="Cycle status" aria-label="Status: ${fmtStatus(t.status)}">
          ${checkIcon}
        </button>
        <div class="task-body">
          <div class="task-title${t.status === "DONE" ? " done" : ""}">${esc(t.title)}</div>
          <div class="task-meta">
            <span class="task-project" onclick="goto('detail','${t.projectId}')">${esc(t.projectName)}</span>
            <span class="status-badge s-${t.status}">${fmtStatus(t.status)}</span>
            <span class="pri-badge p-${t.priority}">${t.priority}</span>
            ${t.dueDate ? `<span class="task-due${overdue ? " overdue" : ""}">📅 ${fmtDate(t.dueDate)}</span>` : ""}
          </div>
        </div>
      </div>`;
  }).join("");
}

function setMyTaskFilter(btn) {
  document.querySelectorAll("#myTaskFilterBar .filter").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  S.myTaskFilter = btn.dataset.f;
  renderMyTasks();
}

// ── Users ─────────────────────────────────────────────────────
async function loadUsers() {
  try {
    S.users = await api("/api/users");
    document.getElementById("userCountPill").textContent = S.users.length;
    document.getElementById("userTableBody").innerHTML = S.users.map(u => {
      const self = u.id === S.me.id;
      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="member-avatar" style="width:30px;height:30px;font-size:12px">${u.name[0].toUpperCase()}</div>
              ${esc(u.name)}
            </div>
          </td>
          <td>${esc(u.email)}</td>
          <td><span class="pill ${u.role === "ADMIN" ? "accent" : "gray"}">${u.role}</span></td>
          <td>${fmtDate(u.createdAt)}</td>
          <td>
            ${self
              ? '<span style="color:var(--g400);font-size:12px">You</span>'
              : `<div style="display:flex;gap:6px">
                  <button class="btn secondary sm" onclick="toggleRole('${u.id}','${u.role}')">
                    ${u.role === "ADMIN" ? "Make Member" : "Make Admin"}
                  </button>
                  <button class="btn danger sm" onclick="deleteUser('${u.id}','${esc(u.name)}')">Delete</button>
                </div>`}
          </td>
        </tr>`;
    }).join("");
  } catch (ex) { toast(ex.message, "err"); }
}

async function toggleRole(id, cur) {
  const role = cur === "ADMIN" ? "MEMBER" : "ADMIN";
  try {
    await api("/api/users/" + id + "/role", { method: "PATCH", body: JSON.stringify({ role }) });
    toast("Role updated to " + role);
    loadUsers();
  } catch (ex) { toast(ex.message, "err"); }
}

async function deleteUser(id, name) {
  if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
  try {
    await api("/api/users/" + id, { method: "DELETE" });
    toast("User deleted");
    loadUsers();
  } catch (ex) { toast(ex.message, "err"); }
}

// ── Project CRUD ──────────────────────────────────────────────
async function submitCreateProject(e) {
  e.preventDefault();
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name:        document.getElementById("cpName").value.trim(),
        description: document.getElementById("cpDesc").value.trim() || undefined
      })
    });
    closeModal("modalCreateProject");
    e.target.reset();
    toast("Project created!");
    loadProjects();
  } catch (ex) { toast(ex.message, "err"); }
  finally { btn.disabled = false; }
}

function openEditProject() {
  const p = S.project;
  if (!p) return;
  document.getElementById("epName").value = p.name;
  document.getElementById("epDesc").value = p.description || "";
  openModal("modalEditProject");
}

async function submitEditProject(e) {
  e.preventDefault();
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    await api("/api/projects/" + S.project.id, {
      method: "PATCH",
      body: JSON.stringify({
        name:        document.getElementById("epName").value.trim(),
        description: document.getElementById("epDesc").value.trim() || undefined
      })
    });
    closeModal("modalEditProject");
    toast("Project updated!");
    loadDetail(S.project.id);
  } catch (ex) { toast(ex.message, "err"); }
  finally { btn.disabled = false; }
}

async function deleteProject() {
  if (!confirm(`Delete project "${S.project.name}" and all its tasks? This cannot be undone.`)) return;
  try {
    await api("/api/projects/" + S.project.id, { method: "DELETE" });
    toast("Project deleted");
    goto("projects");
  } catch (ex) { toast(ex.message, "err"); }
}

// ── Task CRUD ─────────────────────────────────────────────────
async function submitCreateTask(e) {
  e.preventDefault();
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true;
  const due = document.getElementById("ctDue").value;
  try {
    await api("/api/projects/" + S.project.id + "/tasks", {
      method: "POST",
      body: JSON.stringify({
        title:       document.getElementById("ctTitle").value.trim(),
        description: document.getElementById("ctDesc").value.trim() || undefined,
        priority:    document.getElementById("ctPriority").value,
        assigneeId:  document.getElementById("ctAssignee").value || undefined,
        dueDate:     due ? new Date(due).toISOString() : undefined
      })
    });
    closeModal("modalCreateTask");
    e.target.reset();
    document.getElementById("ctPriority").value = "MEDIUM";
    toast("Task created!");
    loadDetail(S.project.id);
  } catch (ex) { toast(ex.message, "err"); }
  finally { btn.disabled = false; }
}

function openEditTask(taskId) {
  const t = S.project.tasks.find(x => x.id === taskId);
  if (!t) return;

  document.getElementById("etId").value     = t.id;
  document.getElementById("etTitle").value  = t.title;
  document.getElementById("etDesc").value   = t.description || "";
  document.getElementById("etStatus").value = t.status;
  document.getElementById("etPriority").value = t.priority || "MEDIUM";
  document.getElementById("etDue").value    = t.dueDate ? toLocalInput(t.dueDate) : "";

  fillAssigneeDropdowns();
  document.getElementById("etAssignee").value = t.assigneeId || "";

  // Show/hide admin-only fields
  const isAdmin = S.me.role === "ADMIN";
  ["etTitleField","etDescField","etPriorityField","etAdminRow"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdmin ? "" : "none";
  });

  openModal("modalEditTask");
}

async function submitEditTask(e) {
  e.preventDefault();
  const btn    = e.target.querySelector('[type="submit"]');
  const taskId = document.getElementById("etId").value;
  const isAdmin = S.me.role === "ADMIN";
  btn.disabled = true;

  const body = { status: document.getElementById("etStatus").value };
  if (isAdmin) {
    const due = document.getElementById("etDue").value;
    body.title       = document.getElementById("etTitle").value.trim();
    body.description = document.getElementById("etDesc").value.trim() || null;
    body.priority    = document.getElementById("etPriority").value;
    body.assigneeId  = document.getElementById("etAssignee").value || null;
    body.dueDate     = due ? new Date(due).toISOString() : null;
  }

  try {
    await api("/api/tasks/" + taskId, { method: "PATCH", body: JSON.stringify(body) });
    closeModal("modalEditTask");
    toast("Task updated!");
    loadDetail(S.project.id);
  } catch (ex) { toast(ex.message, "err"); }
  finally { btn.disabled = false; }
}

async function cycleStatus(taskId, cur) {
  const next = { TODO:"IN_PROGRESS", IN_PROGRESS:"DONE", DONE:"TODO" };
  try {
    await api("/api/tasks/" + taskId, { method:"PATCH", body: JSON.stringify({ status: next[cur] }) });
    loadDetail(S.project.id);
  } catch (ex) { toast(ex.message, "err"); }
}

async function cycleStatusGlobal(taskId, cur) {
  const next = { TODO:"IN_PROGRESS", IN_PROGRESS:"DONE", DONE:"TODO" };
  try {
    await api("/api/tasks/" + taskId, { method:"PATCH", body: JSON.stringify({ status: next[cur] }) });
    S.projects = await api("/api/projects");
    renderMyTasks();
  } catch (ex) { toast(ex.message, "err"); }
}

async function deleteTask(taskId) {
  if (!confirm("Delete this task? This cannot be undone.")) return;
  try {
    await api("/api/tasks/" + taskId, { method: "DELETE" });
    toast("Task deleted");
    loadDetail(S.project.id);
  } catch (ex) { toast(ex.message, "err"); }
}

// ── Members ───────────────────────────────────────────────────
function openAddMember() {
  const memberIds  = S.project.members.map(m => m.user.id);
  const nonMembers = S.users.filter(u => !memberIds.includes(u.id));
  const sel        = document.getElementById("amUser");
  const errEl      = document.getElementById("amErr");
  const submitBtn  = document.getElementById("amSubmit");

  sel.innerHTML = '<option value="">Choose…</option>';
  nonMembers.forEach(u => {
    const o = document.createElement("option");
    o.value = u.id;
    o.textContent = u.name + " (" + u.role + ")";
    sel.appendChild(o);
  });

  if (nonMembers.length === 0) {
    errEl.classList.remove("hidden");
    submitBtn.disabled = true;
  } else {
    errEl.classList.add("hidden");
    submitBtn.disabled = false;
  }
  openModal("modalAddMember");
}

async function submitAddMember(e) {
  e.preventDefault();
  const userId = document.getElementById("amUser").value;
  if (!userId) { toast("Select a user", "err"); return; }
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    await api("/api/projects/" + S.project.id + "/members", {
      method: "POST",
      body: JSON.stringify({ userId })
    });
    closeModal("modalAddMember");
    toast("Member added!");
    loadDetail(S.project.id);
  } catch (ex) { toast(ex.message, "err"); }
  finally { btn.disabled = false; }
}

async function removeMember(userId) {
  if (!confirm("Remove this member from the project?")) return;
  try {
    await api("/api/projects/" + S.project.id + "/members/" + userId, { method: "DELETE" });
    toast("Member removed");
    loadDetail(S.project.id);
  } catch (ex) { toast(ex.message, "err"); }
}

// ── Modals ────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  el.classList.remove("hidden");
  const first = el.querySelector("input,select,textarea");
  if (first) setTimeout(() => first.focus(), 60);
}
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }
function overlayClose(e, id) { if (e.target === e.currentTarget) closeModal(id); }

document.addEventListener("keydown", e => {
  if (e.key === "Escape")
    document.querySelectorAll(".overlay:not(.hidden)").forEach(el => el.classList.add("hidden"));
});

// ── Utilities ─────────────────────────────────────────────────
function esc(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function fmtStatus(s) {
  return { TODO:"To Do", IN_PROGRESS:"In Progress", DONE:"Done" }[s] || s;
}
function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
}
function toLocalInput(iso) {
  const d   = new Date(iso);
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Init ──────────────────────────────────────────────────────
if (S.token) boot();
