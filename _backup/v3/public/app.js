// ========================================
// АВТОРИЗАЦИЯ
// ========================================

const token = localStorage.getItem("token");

// Не вошли — на страницу входа
if (!token) {
    location.href = "/login.html";
}

// fetch с токеном. Если сессия истекла — выходим
async function api(url, options = {}) {

    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
            "Authorization": `Bearer ${token}`
        }
    });

    if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        location.href = "/login.html";
        throw new Error("Unauthorized");
    }

    return response;
}


// ========================================
// ЭЛЕМЕНТЫ СТРАНИЦЫ
// ========================================

const main = document.querySelector("#main");
const pageTitle = document.querySelector("#pageTitle");
const pageSubtitle = document.querySelector("#pageSubtitle");

const navItems = document.querySelectorAll(".nav-item");
const filterButtons = document.querySelectorAll(".filter");

const addButton = document.querySelector(".add-button");
const taskList = document.querySelector(".task-list");
const searchInput = document.querySelector(".search input");
const emptyState = document.querySelector("#emptyState");

const dateChip = document.querySelector("#dateChip");
const dateChipText = document.querySelector("#dateChipText");
const clearDate = document.querySelector("#clearDate");

const taskModal = document.querySelector("#taskModal");
const closeModal = document.querySelector("#closeModal");
const cancelModal = document.querySelector("#cancelModal");
const taskForm = document.querySelector("#taskForm");

const taskTitle = document.querySelector("#taskTitle");
const taskDescription = document.querySelector("#taskDescription");
const taskCategory = document.querySelector("#taskCategory");
const taskDeadline = document.querySelector("#taskDeadline");

const totalTasks = document.querySelector("#totalTasks");
const inProgressTasks = document.querySelector("#inProgressTasks");
const completedTasks = document.querySelector("#completedTasks");

const navAll = document.querySelector("#navAll");
const navProgress = document.querySelector("#navProgress");
const navDone = document.querySelector("#navDone");

const calendarTitle = document.querySelector("#calendarTitle");
const calendarGrid = document.querySelector("#calendarGrid");
const prevMonth = document.querySelector("#prevMonth");
const nextMonth = document.querySelector("#nextMonth");
const todayButton = document.querySelector("#todayButton");
const upcomingList = document.querySelector("#upcomingList");


// ========================================
// СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ========================================

let tasks = [];                 // все задачи с сервера
let currentView = "dashboard";  // какая кнопка слева выбрана
let currentFilter = "all";      // какой фильтр сверху выбран
let searchQuery = "";           // текст поиска
let selectedDate = null;        // выбранный день в календаре "YYYY-MM-DD"

// Какой месяц показывает календарь (всегда 1-е число)
const now = new Date();
let calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);

// Настройки страниц левого меню
const views = {
    dashboard: {
        title: "Dashboard",
        subtitle: "Manage your tasks efficiently.",
        filter: "all"
    },
    all: {
        title: "All Tasks",
        subtitle: "Every task in one place.",
        filter: "all"
    },
    progress: {
        title: "In Progress",
        subtitle: "Tasks you are working on right now.",
        filter: "progress"
    },
    done: {
        title: "Completed",
        subtitle: "Everything you have already finished.",
        filter: "done"
    },
    calendar: {
        title: "Calendar",
        subtitle: "Plan your deadlines month by month.",
        filter: "all"
    }
};

const statusNames = {
    todo: "Todo",
    progress: "In Progress",
    done: "Done"
};

const categoryColors = {
    Development: "purple-tag",
    Design: "blue-tag",
    Study: "green-tag",
    Personal: "orange-tag"
};


// ========================================
// РАБОТА С ДАТАМИ
// ========================================

// Date -> "YYYY-MM-DD" (по местному времени, без сдвига часового пояса)
function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// "YYYY-MM-DD" -> Date
function fromDateKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function todayKey() {
    return toDateKey(new Date());
}

// "2026-10-21" -> "21 Oct"
function formatShort(key) {
    return fromDateKey(key).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short"
    });
}

// "2026-10-21" -> "Wednesday, 21 October"
function formatLong(key) {
    return fromDateKey(key).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long"
    });
}

// Сколько дней до дедлайна (отрицательное = просрочено)
function daysUntil(key) {
    const diff = fromDateKey(key) - fromDateKey(todayKey());
    return Math.round(diff / 86400000);
}

function isOverdue(task) {
    return Boolean(task.deadline) &&
        task.status !== "done" &&
        daysUntil(task.deadline) < 0;
}


// ========================================
// ЗАГРУЗКА ЗАДАЧ
// ========================================

async function loadTasks() {

    try {

        const response = await api("/api/tasks");

        if (!response.ok) {
            throw new Error("Ошибка загрузки задач");
        }

        tasks = await response.json();

        render();

    } catch (error) {

        console.error("Ошибка загрузки:", error);

    }

}


// ========================================
// ГЛАВНАЯ ПЕРЕРИСОВКА
// ========================================

function render() {
    renderTasks();
    updateStatistics();
    renderCalendar();
    renderUpcoming();
}


// ========================================
// ЛЕВОЕ МЕНЮ
// ========================================

function setView(view) {

    currentView = view;
    main.dataset.view = view;

    navItems.forEach(item => {
        item.classList.toggle("active", item.dataset.view === view);
    });

    pageTitle.textContent = views[view].title;
    pageSubtitle.textContent = views[view].subtitle;

    // Каждая страница включает свой фильтр
    setFilter(views[view].filter, false);

    render();
}

navItems.forEach(item => {
    item.addEventListener("click", (event) => {
        event.preventDefault();
        setView(item.dataset.view);
    });
});


// ========================================
// ФИЛЬТРЫ СВЕРХУ
// ========================================

function setFilter(filter, shouldRender = true) {

    currentFilter = filter;

    filterButtons.forEach(button => {
        button.classList.toggle("active", button.dataset.filter === filter);
    });

    if (shouldRender) {
        renderTasks();
    }
}

filterButtons.forEach(button => {
    button.addEventListener("click", () => {
        setFilter(button.dataset.filter);
    });
});


// ========================================
// ПОИСК
// ========================================

searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderTasks();
});


// ========================================
// СПИСОК ЗАДАЧ
// ========================================

function getVisibleTasks() {

    return tasks
        .filter(task => currentFilter === "all" || task.status === currentFilter)
        .filter(task => !selectedDate || task.deadline === selectedDate)
        .filter(task => {
            if (!searchQuery) return true;
            const text = `${task.title} ${task.description || ""}`.toLowerCase();
            return text.includes(searchQuery);
        })
        // Новые задачи сверху
        .sort((a, b) => b.id - a.id);
}

function renderTasks() {

    taskList.innerHTML = "";

    const visible = getVisibleTasks();

    visible.forEach(task => {
        taskList.append(createTaskCard(task));
    });

    emptyState.classList.toggle("visible", visible.length === 0);

    // Плашка выбранного дня
    if (selectedDate) {
        dateChip.classList.add("visible");
        dateChipText.textContent = `Tasks for ${formatLong(selectedDate)}`;
    } else {
        dateChip.classList.remove("visible");
    }
}

function deadlineLabel(task) {

    if (!task.deadline) {
        return `<span class="deadline">No deadline</span>`;
    }

    const days = daysUntil(task.deadline);
    let text = `📅 ${formatShort(task.deadline)}`;
    let extraClass = "";

    if (task.status !== "done") {
        if (days < 0) {
            text += ` · overdue`;
            extraClass = "overdue";
        } else if (days === 0) {
            text = "📅 Today";
            extraClass = "soon";
        } else if (days === 1) {
            text = "📅 Tomorrow";
            extraClass = "soon";
        }
    }

    return `<span class="deadline ${extraClass}">${text}</span>`;
}

function createTaskCard(task) {

    const card = document.createElement("div");
    card.className = "task-card";

    // Карточку можно перетащить на день в календаре
    card.draggable = true;
    makeDraggable(card, task);

    const isDone = task.status === "done";

    if (isDone) {
        card.classList.add("completed-task");
    }

    if (isOverdue(task)) {
        card.classList.add("overdue-task");
    }

    const category = task.category || "Development";
    const tagClass = categoryColors[category] || "purple-tag";

    card.innerHTML = `

        <div class="task-check ${isDone ? "checked" : ""}" title="Change status">
            ✓
        </div>

        <div class="task-info">

            <h3>${escapeHtml(task.title)}</h3>

            <p>${escapeHtml(task.description || "Без описания")}</p>

            <div class="task-meta">

                <span class="tag ${tagClass}">
                    ${escapeHtml(category)}
                </span>

                ${deadlineLabel(task)}

            </div>

        </div>

        <div class="task-status ${task.status}">
            ${statusNames[task.status] || "Todo"}
        </div>

        <button class="more" title="Delete task">
            ⋮
        </button>

    `;

    // Клик по квадратику: Todo → In Progress → Done → Todo
    card.querySelector(".task-check")
        .addEventListener("click", () => cycleStatus(task));

    // Удаление
    card.querySelector(".more")
        .addEventListener("click", () => deleteTask(task));

    return card;
}


// ========================================
// ИЗМЕНЕНИЕ СТАТУСА
// ========================================

async function cycleStatus(task) {

    const next = {
        todo: "progress",
        progress: "done",
        done: "todo"
    };

    const newStatus = next[task.status] || "todo";

    try {

        const response = await api(`/api/tasks/${task.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            throw new Error("Ошибка изменения статуса");
        }

        const updated = await response.json();
        task.status = updated.status;

        render();

        // 🎉 Задача выполнена
        if (task.status === "done") {
            celebrate(task);
        }

    } catch (error) {

        console.error(error);

    }

}


// ========================================
// УДАЛЕНИЕ
// ========================================

async function deleteTask(task) {

    if (!confirm("Удалить эту задачу?")) {
        return;
    }

    try {

        const response = await api(`/api/tasks/${task.id}`, {
            method: "DELETE"
        });

        if (!response.ok) {
            throw new Error("Ошибка удаления");
        }

        tasks = tasks.filter(t => t.id !== task.id);

        render();

    } catch (error) {

        console.error(error);

    }

}


// ========================================
// СТАТИСТИКА
// ========================================

function updateStatistics() {

    const total = tasks.length;
    const inProgress = tasks.filter(t => t.status === "progress").length;
    const completed = tasks.filter(t => t.status === "done").length;

    totalTasks.textContent = total;
    inProgressTasks.textContent = inProgress;
    completedTasks.textContent = completed;

    navAll.textContent = total;
    navProgress.textContent = inProgress;
    navDone.textContent = completed;
}


// ========================================
// КАЛЕНДАРЬ
// ========================================

function renderCalendar() {

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();

    calendarTitle.textContent = calendarMonth.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric"
    });

    // Неделя начинается с понедельника
    const firstDay = new Date(year, month, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);

    // Группируем задачи по дате дедлайна
    const byDate = {};
    tasks.forEach(task => {
        if (!task.deadline) return;
        (byDate[task.deadline] = byDate[task.deadline] || []).push(task);
    });

    const isBig = currentView === "calendar";
    const today = todayKey();

    calendarGrid.innerHTML = "";

    // 6 недель = 42 клетки
    for (let i = 0; i < 42; i++) {

        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const key = toDateKey(date);
        const dayTasks = byDate[key] || [];

        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "calendar-day";

        if (date.getMonth() !== month) cell.classList.add("other-month");
        if (key === today) cell.classList.add("today");
        if (key === selectedDate) cell.classList.add("selected");
        if (dayTasks.length) cell.classList.add("has-tasks");

        cell.title = dayTasks.length
            ? dayTasks.map(t => `• ${t.title}`).join("\n")
            : formatLong(key);

        let content = `<span class="day-number">${date.getDate()}</span>`;

        if (isBig) {
            // Большой календарь: названия задач прямо в клетке
            const shown = dayTasks.slice(0, 3).map(t => {
                const cls = isOverdue(t) ? "overdue" : t.status;
                return `<span class="day-task ${cls}" draggable="true" data-id="${t.id}">${escapeHtml(t.title)}</span>`;
            }).join("");

            const more = dayTasks.length > 3
                ? `<span class="day-more">+${dayTasks.length - 3} more</span>`
                : "";

            content += `<span class="day-tasks">${shown}${more}</span>`;
        } else if (dayTasks.length) {
            // Маленький календарь: цветные точки
            const dots = dayTasks.slice(0, 4).map(t => {
                const cls = isOverdue(t) ? "overdue-dot" : `${t.status}-dot`;
                return `<i class="dot ${cls}"></i>`;
            }).join("");

            content += `<span class="day-dots">${dots}</span>`;
        }

        cell.innerHTML = content;

        // Задачи внутри большого календаря тоже можно перетаскивать
        cell.querySelectorAll(".day-task").forEach(el => {
            const t = tasks.find(x => x.id === Number(el.dataset.id));
            if (t) makeDraggable(el, t);
        });

        // Сюда можно бросить задачу
        makeDropTarget(cell, key);

        // Клик — показать задачи этого дня (повторный клик — снять выбор)
        cell.addEventListener("click", () => {
            selectedDate = selectedDate === key ? null : key;

            if (date.getMonth() !== month) {
                calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
            }

            render();
        });

        // Двойной клик — создать задачу на этот день
        cell.addEventListener("dblclick", () => {
            selectedDate = key;
            render();
            openTaskModal(key);
        });

        calendarGrid.append(cell);
    }
}

function renderUpcoming() {

    const upcoming = tasks
        .filter(t => t.deadline && t.status !== "done")
        .sort((a, b) => a.deadline.localeCompare(b.deadline))
        .slice(0, 5);

    upcomingList.innerHTML = "";

    if (!upcoming.length) {
        upcomingList.innerHTML = `<li class="upcoming-empty">No upcoming deadlines 🎉</li>`;
        return;
    }

    upcoming.forEach(task => {

        const days = daysUntil(task.deadline);

        let when;
        if (days < 0) when = `${-days}d overdue`;
        else if (days === 0) when = "today";
        else if (days === 1) when = "tomorrow";
        else when = `in ${days} days`;

        const li = document.createElement("li");
        if (days < 0) li.classList.add("overdue");
        else if (days <= 1) li.classList.add("soon");

        li.innerHTML = `
            <span class="upcoming-title">${escapeHtml(task.title)}</span>
            <span class="upcoming-when">${formatShort(task.deadline)} · ${when}</span>
        `;

        // Клик — перейти к этому дню в календаре
        li.addEventListener("click", () => {
            selectedDate = task.deadline;
            const d = fromDateKey(task.deadline);
            calendarMonth = new Date(d.getFullYear(), d.getMonth(), 1);
            render();
        });

        upcomingList.append(li);
    });
}

prevMonth.addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendar();
});

nextMonth.addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendar();
});

todayButton.addEventListener("click", () => {
    const d = new Date();
    calendarMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    selectedDate = todayKey();
    render();
});

clearDate.addEventListener("click", () => {
    selectedDate = null;
    render();
});


// ========================================
// МОДАЛЬНОЕ ОКНО
// ========================================

function openTaskModal(deadline = selectedDate) {

    taskModal.classList.add("active");

    // Если выбран день в календаре — подставляем его как дедлайн
    taskDeadline.value = deadline || "";

    taskTitle.focus();
}

function closeTaskModal() {
    taskModal.classList.remove("active");
    taskForm.reset();
}

addButton.addEventListener("click", () => openTaskModal());

closeModal.addEventListener("click", closeTaskModal);
cancelModal.addEventListener("click", closeTaskModal);

taskModal.addEventListener("click", (event) => {
    if (event.target === taskModal) {
        closeTaskModal();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && taskModal.classList.contains("active")) {
        closeTaskModal();
    }
});


// ========================================
// СОЗДАНИЕ ЗАДАЧИ
// ========================================

taskForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const title = taskTitle.value.trim();

    if (!title) {
        return;
    }

    try {

        const response = await api("/api/tasks", {
            method: "POST",
            body: JSON.stringify({
                title: title,
                description: taskDescription.value.trim(),
                category: taskCategory.value,
                deadline: taskDeadline.value
            })
        });

        if (!response.ok) {
            throw new Error("Ошибка создания задачи");
        }

        const task = await response.json();

        tasks.push(task);

        closeTaskModal();

        // Чтобы новая задача точно была видна
        if (currentFilter !== "all" && currentFilter !== task.status) {
            setFilter("all", false);
        }

        render();

    } catch (error) {

        console.error("Ошибка:", error);

        alert("Не удалось создать задачу");

    }

});


// ========================================
// ПОЛЬЗОВАТЕЛЬ И ВЫХОД
// ========================================

const userAvatar = document.querySelector("#userAvatar");
const userName = document.querySelector("#userName");
const userEmail = document.querySelector("#userEmail");
const logoutButton = document.querySelector("#logoutButton");

function showUser(user) {
    if (!user) return;
    userName.textContent = user.name;
    userEmail.textContent = user.email;
    userAvatar.textContent = user.name.trim().charAt(0).toUpperCase() || "U";
}

async function loadUser() {

    // Сначала показываем то, что сохранено, потом уточняем у сервера
    try {
        showUser(JSON.parse(localStorage.getItem("user")));
    } catch (error) { }

    try {
        const response = await api("/api/me");
        const user = await response.json();
        localStorage.setItem("user", JSON.stringify(user));
        showUser(user);
    } catch (error) {
        console.error(error);
    }
}

logoutButton.addEventListener("click", async () => {

    try {
        await api("/api/logout", { method: "POST" });
    } catch (error) { }

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    location.href = "/login.html";
});


// ========================================
// DRAG & DROP — перенос дедлайна
// ========================================

let draggedTask = null;

function makeDraggable(element, task) {

    element.addEventListener("dragstart", (event) => {
        draggedTask = task;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(task.id));
        // Чтобы клик по дню не срабатывал от перетаскивания
        event.stopPropagation();
        setTimeout(() => element.classList.add("dragging"), 0);
        document.body.classList.add("is-dragging");
    });

    element.addEventListener("dragend", () => {
        draggedTask = null;
        element.classList.remove("dragging");
        document.body.classList.remove("is-dragging");
        document.querySelectorAll(".drop-over")
            .forEach(el => el.classList.remove("drop-over"));
    });
}

function makeDropTarget(cell, dateKey) {

    cell.addEventListener("dragover", (event) => {
        if (!draggedTask) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        cell.classList.add("drop-over");
    });

    cell.addEventListener("dragleave", () => {
        cell.classList.remove("drop-over");
    });

    cell.addEventListener("drop", (event) => {
        event.preventDefault();
        cell.classList.remove("drop-over");

        if (draggedTask && draggedTask.deadline !== dateKey) {
            moveDeadline(draggedTask, dateKey);
        }
    });
}

async function moveDeadline(task, dateKey) {

    const oldDeadline = task.deadline;

    // Сразу показываем изменение, не дожидаясь сервера
    task.deadline = dateKey;
    render();

    try {

        const response = await api(`/api/tasks/${task.id}`, {
            method: "PATCH",
            body: JSON.stringify({ deadline: dateKey })
        });

        if (!response.ok) {
            throw new Error("Ошибка переноса");
        }

        showToast(`📅 «${task.title}» → ${formatShort(dateKey)}`);

    } catch (error) {

        // Не получилось — возвращаем как было
        console.error(error);
        task.deadline = oldDeadline;
        render();
        showToast("Не удалось перенести задачу");

    }
}


// ========================================
// УВЕДОМЛЕНИЕ ВНИЗУ ЭКРАНА
// ========================================

let toastTimer = null;

function showToast(text) {

    let toast = document.querySelector(".toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.className = "toast";
        document.body.append(toast);
    }

    toast.textContent = text;
    toast.classList.add("visible");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2500);
}


// ========================================
// КОНФЕТТИ 🎉
// ========================================

function celebrate(task) {

    // Все задачи этого дня выполнены?
    const sameDay = task.deadline
        ? tasks.filter(t => t.deadline === task.deadline)
        : [];
    const dayDone = sameDay.length > 1 && sameDay.every(t => t.status === "done");

    // Вообще все задачи выполнены?
    const allDone = tasks.length > 1 && tasks.every(t => t.status === "done");

    if (allDone) {
        confetti(220);
        showToast("🏆 All tasks completed! Amazing!");
    } else if (dayDone) {
        confetti(140);
        showToast(`🎉 Every task for ${formatShort(task.deadline)} is done!`);
    } else {
        confetti(70);
        showToast("✅ Task completed!");
    }
}

function confetti(amount) {

    // Уважаем настройку "уменьшить анимацию"
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
    }

    const canvas = document.createElement("canvas");
    canvas.className = "confetti-canvas";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.append(canvas);

    const ctx = canvas.getContext("2d");
    const colors = ["#7c5cff", "#a98cff", "#55a9ff", "#51d48a", "#d8b35c", "#ff6b6b", "#ffffff"];

    // Частицы вылетают снизу из двух углов
    const pieces = [];
    for (let i = 0; i < amount; i++) {
        const fromLeft = i % 2 === 0;
        pieces.push({
            x: fromLeft ? 0 : canvas.width,
            y: canvas.height * 0.8,
            vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 9),
            vy: -(10 + Math.random() * 12),
            size: 5 + Math.random() * 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            angle: Math.random() * Math.PI,
            spin: (Math.random() - 0.5) * 0.3
        });
    }

    const start = performance.now();

    function frame(time) {

        const elapsed = time - start;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        pieces.forEach(p => {
            p.vy += 0.35;      // гравитация
            p.vx *= 0.99;      // сопротивление воздуха
            p.x += p.vx;
            p.y += p.vy;
            p.angle += p.spin;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.globalAlpha = Math.max(0, 1 - elapsed / 2600);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            ctx.restore();
        });

        if (elapsed < 2600) {
            requestAnimationFrame(frame);
        } else {
            canvas.remove();
        }
    }

    requestAnimationFrame(frame);
}


// ========================================
// ЭКСПОРТ В GOOGLE CALENDAR / OUTLOOK (.ics)
// ========================================

const exportIcs = document.querySelector("#exportIcs");

// Экранирование текста для формата iCalendar
function icsText(text) {
    return String(text || "")
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");
}

exportIcs.addEventListener("click", () => {

    const withDeadline = tasks.filter(t => t.deadline);

    if (!withDeadline.length) {
        showToast("No tasks with deadlines to export");
        return;
    }

    const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TaskTracker//EN",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:Task Tracker"
    ];

    withDeadline.forEach(task => {

        // Событие на весь день: DTEND = следующий день
        const start = task.deadline.replace(/-/g, "");
        const d = fromDateKey(task.deadline);
        const end = toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)).replace(/-/g, "");

        const mark = task.status === "done" ? "✓ " : "";

        lines.push(
            "BEGIN:VEVENT",
            `UID:task-${task.id}@tasktracker`,
            `DTSTAMP:${stamp}`,
            `DTSTART;VALUE=DATE:${start}`,
            `DTEND;VALUE=DATE:${end}`,
            `SUMMARY:${icsText(mark + task.title)}`,
            `DESCRIPTION:${icsText([
                task.description,
                `Category: ${task.category || "Development"}`,
                `Status: ${statusNames[task.status] || "Todo"}`
            ].filter(Boolean).join("\n"))}`,
            `CATEGORIES:${icsText(task.category || "Development")}`,
            "END:VEVENT"
        );
    });

    lines.push("END:VCALENDAR");

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "tasktracker.ics";
    link.click();
    URL.revokeObjectURL(link.href);

    showToast(`⇩ Exported ${withDeadline.length} tasks — open the file in Google Calendar`);
});


// ========================================
// ЗАЩИТА ОТ HTML
// ========================================

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}


// ========================================
// ЗАПУСК
// ========================================

if (token) {
    loadUser();
    loadTasks();
}
