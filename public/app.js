const state = {
  token: localStorage.getItem("token") || "",
  me: null,
  projects: [],
  users: []
};

const messageEl = document.getElementById("message");

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? "#c11" : "#0a7a39";
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function renderDashboard(data) {
  const summary = document.getElementById("summary");
  summary.innerHTML = "";
  Object.entries(data.summary).forEach(([k, v]) => {
    const div = document.createElement("div");
    div.className = "metric";
    div.innerHTML = `<strong>${k}</strong><div>${v}</div>`;
    summary.appendChild(div);
  });

  const overdue = document.getElementById("overdueList");
  overdue.innerHTML = "";
  data.overdueTasks.forEach((task) => {
    const li = document.createElement("li");
    li.textContent = `${task.title} (${task.project.name}) due ${new Date(task.dueDate).toLocaleString()}`;
    overdue.appendChild(li);
  });
}

function renderProjects() {
  const projectSelect = document.getElementById("projectSelect");
  projectSelect.innerHTML = "";
  const memberProjectSelect = document.getElementById("memberProjectSelect");
  memberProjectSelect.innerHTML = "";
  state.projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    projectSelect.appendChild(option);
    memberProjectSelect.appendChild(option.cloneNode(true));
  });

  const selectedProject = state.projects.find((p) => p.id === projectSelect.value) || state.projects[0];
  renderTasks(selectedProject);

  const assigneeSelect = document.getElementById("assigneeSelect");
  assigneeSelect.innerHTML = `<option value="">Unassigned</option>`;
  const memberUserSelect = document.getElementById("memberUserSelect");
  memberUserSelect.innerHTML = "";
  state.users.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.name} (${user.role})`;
    assigneeSelect.appendChild(option);
    memberUserSelect.appendChild(option.cloneNode(true));
  });
}

function renderTasks(project) {
  const taskList = document.getElementById("taskList");
  taskList.innerHTML = "";
  if (!project) return;
  project.tasks.forEach((task) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${task.title}</strong> - ${task.status}
      <button data-id="${task.id}" data-status="TODO">TODO</button>
      <button data-id="${task.id}" data-status="IN_PROGRESS">IN_PROGRESS</button>
      <button data-id="${task.id}" data-status="DONE">DONE</button>
    `;
    taskList.appendChild(li);
  });
}

async function refresh() {
  if (!state.token) {
    document.getElementById("authInfo").textContent = "Not logged in";
    document.getElementById("dashboardSection").classList.add("hidden");
    document.getElementById("adminSection").classList.add("hidden");
    document.getElementById("tasksSection").classList.add("hidden");
    return;
  }
  try {
    state.me = await api("/api/auth/me");
    document.getElementById("authInfo").textContent = `${state.me.name} (${state.me.role})`;
    document.getElementById("dashboardSection").classList.remove("hidden");
    document.getElementById("tasksSection").classList.remove("hidden");
    if (state.me.role === "ADMIN") document.getElementById("adminSection").classList.remove("hidden");
    else document.getElementById("adminSection").classList.add("hidden");

    const [dashboard, projects] = await Promise.all([api("/api/dashboard"), api("/api/projects")]);
    renderDashboard(dashboard);
    state.projects = projects;

    if (state.me.role === "ADMIN") state.users = await api("/api/users");
    else state.users = [];
    renderProjects();
  } catch (err) {
    setMessage(err.message, true);
  }
}

document.getElementById("signupBtn").onclick = async () => {
  try {
    const body = {
      name: document.getElementById("name").value,
      email: document.getElementById("email").value,
      password: document.getElementById("password").value,
      role: document.getElementById("role").value
    };
    await api("/api/auth/signup", { method: "POST", body: JSON.stringify(body) });
    setMessage("Signup successful, now login.");
  } catch (err) {
    setMessage(err.message, true);
  }
};

document.getElementById("loginBtn").onclick = async () => {
  try {
    const body = {
      email: document.getElementById("email").value,
      password: document.getElementById("password").value
    };
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
    state.token = data.token;
    localStorage.setItem("token", state.token);
    setMessage("Login successful.");
    await refresh();
  } catch (err) {
    setMessage(err.message, true);
  }
};

document.getElementById("logoutBtn").onclick = () => {
  state.token = "";
  state.me = null;
  localStorage.removeItem("token");
  setMessage("Logged out.");
  refresh();
};

document.getElementById("createProjectBtn").onclick = async () => {
  try {
    const body = {
      name: document.getElementById("projectName").value,
      description: document.getElementById("projectDescription").value
    };
    await api("/api/projects", { method: "POST", body: JSON.stringify(body) });
    setMessage("Project created.");
    await refresh();
  } catch (err) {
    setMessage(err.message, true);
  }
};

document.getElementById("createTaskBtn").onclick = async () => {
  try {
    const projectId = document.getElementById("projectSelect").value;
    const dueDateInput = document.getElementById("taskDueDate").value;
    const body = {
      title: document.getElementById("taskTitle").value,
      description: document.getElementById("taskDescription").value,
      assigneeId: document.getElementById("assigneeSelect").value || undefined,
      dueDate: dueDateInput ? new Date(dueDateInput).toISOString() : undefined
    };
    await api(`/api/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify(body) });
    setMessage("Task created.");
    await refresh();
  } catch (err) {
    setMessage(err.message, true);
  }
};

document.getElementById("addMemberBtn").onclick = async () => {
  try {
    const projectId = document.getElementById("memberProjectSelect").value;
    const userId = document.getElementById("memberUserSelect").value;
    if (!projectId || !userId) throw new Error("Select project and user");
    await api(`/api/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ userId }) });
    setMessage("Member added to project.");
    await refresh();
  } catch (err) {
    setMessage(err.message, true);
  }
};

document.getElementById("projectSelect").onchange = (e) => {
  const project = state.projects.find((p) => p.id === e.target.value);
  renderTasks(project);
};

document.getElementById("taskList").onclick = async (e) => {
  const status = e.target.dataset.status;
  const id = e.target.dataset.id;
  if (!status || !id) return;
  try {
    await api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setMessage("Task status updated.");
    await refresh();
  } catch (err) {
    setMessage(err.message, true);
  }
};

refresh();
