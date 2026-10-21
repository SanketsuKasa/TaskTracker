// ========================================
// АВТОРИЗАЦІЯ
// ========================================

const token = localStorage.getItem("token");

// Не увійшли — на сторінку входу
if (!token) {
    location.href = "/login.html";
}

// fetch із токеном. Якщо сесія закінчилася — виходимо
async function api(url, options = {}) {

    let response;

    try {
        response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
                "Authorization": `Bearer ${token}`
            }
        });
    } catch (error) {
        throw new Error("Server is not running. Start it: node server.js");
    }

    // Сервер відповів HTML-сторінкою замість JSON — отже, запущено стару версію server.js
    const type = response.headers.get("Content-Type") || "";

    if (!type.includes("application/json")) {
        const message = "The server is running an old version. Restart it: Ctrl+C, then node server.js";
        showToast(`⚠️ ${message}`);
        throw new Error(message);
    }

    if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        location.href = "/login.html";
        throw new Error("Unauthorized");
    }

    return response;
}


// ========================================
// ЕЛЕМЕНТИ СТОРІНКИ
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
const taskSubcategory = document.querySelector("#taskSubcategory");
const taskStatus = document.querySelector("#taskStatus");
const taskModalTitle = document.querySelector("#taskModalTitle");
const taskModalSubtitle = document.querySelector("#taskModalSubtitle");
const taskSubmit = document.querySelector("#taskSubmit");
const categoryError = document.querySelector("#categoryError");
const categoryFilter = document.querySelector("#categoryFilter");
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
// СТАН ЗАСТОСУНКУ
// ========================================

let tasks = [];                 // усі задачі з сервера
let currentView = "dashboard";  // яка кнопка зліва вибрана
let currentFilter = "all";      // який фільтр зверху вибрано
let searchQuery = "";           // текст пошуку
let selectedDate = null;        // вибраний день у календарі "YYYY-MM-DD"
let categories = [];            // власні категорії користувача
let categoryFilterValue = "";   // "" = усі, "Study" або "Study›English"
let editingTask = null;         // задача, яку зараз редагуємо

// Який місяць показує календар (завжди 1-ше число)
const now = new Date();
let calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);

// Налаштування сторінок лівого меню
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
    },
    wishlist: {
        title: "Wishlist",
        subtitle: "Things you dream about — they never turn into tasks.",
        filter: "all"
    },
    shared: {
        title: "Shared",
        subtitle: "See tasks of people you love — and let them help with yours.",
        filter: "all"
    },
    profile: {
        title: "Profile",
        subtitle: "Your photo, stats and progress.",
        filter: "all"
    },
    settings: {
        title: "Settings",
        subtitle: "Account, appearance, categories and productivity.",
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

// Кольори для нових (своїх) категорій
const extraTagColors = ["pink-tag", "teal-tag", "blue-tag", "orange-tag", "green-tag", "purple-tag"];

function categoryTagClass(name) {

    if (categoryColors[name]) {
        return categoryColors[name];
    }

    // Той самий колір для тієї самої назви
    let hash = 0;
    for (const char of String(name)) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }

    return extraTagColors[hash % extraTagColors.length];
}

// "Study › English" або просто "Study"
function categoryLabel(task) {
    const category = task.category || "Development";
    return task.subcategory ? `${category} › ${task.subcategory}` : category;
}

function categoryTagHtml(task) {
    const category = task.category || "Development";
    return `<span class="tag ${categoryTagClass(category)}">${escapeHtml(categoryLabel(task))}</span>`;
}


// ========================================
// РОБОТА З ДАТАМИ
// ========================================

// Date -> "YYYY-MM-DD" (за місцевим часом, без зсуву часового поясу)
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

// Скільки днів до дедлайну (від'ємне = прострочено)
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
// ЗАВАНТАЖЕННЯ ЗАДАЧ
// ========================================

async function loadTasks() {

    try {

        const response = await api("/api/tasks");

        if (!response.ok) {
            throw new Error("Ошибка загрузки задач");
        }

        syncServerTime(response);

        tasks = await response.json();

        render();

    } catch (error) {

        console.error("Ошибка загрузки:", error);

    }

}


// ========================================
// ГОЛОВНЕ ПЕРЕМАЛЬОВУВАННЯ
// ========================================

function render() {
    renderTasks();
    updateStatistics();
    renderCalendar();
    renderUpcoming();
    renderProfileStats();
    renderCategoryManager();

    // Графіки продуктивності оновлюються разом із задачами (якщо відкриті)
    if (analyticsVisible()) renderAnalytics();
}


// ========================================
// ЛІВЕ МЕНЮ
// ========================================

function setView(view) {

    currentView = view;
    main.dataset.view = view;

    navItems.forEach(item => {
        item.classList.toggle("active", item.dataset.view === view);
    });

    pageTitle.textContent = views[view].title;
    pageSubtitle.textContent = views[view].subtitle;

    // Кожна сторінка вмикає свій фільтр
    setFilter(views[view].filter, false);

    render();

    if (view === "settings") loadAnalytics();

    // Кнопка в шапці: на вішлісті додає бажання
    addButton.textContent = view === "wishlist" ? "+ Add wish" : "+ New Task";
    if (view === "wishlist") renderWishlist();

    if (view === "shared") {
        bindSharedPage();
        renderSharedView();
        loadShares();
    }
}

// ---------- Вкладки налаштувань ----------

const settingsTabs = document.querySelectorAll(".settings-tab");
const settingsPanels = document.querySelectorAll(".settings-panel");

function setSettingsTab(tab) {

    if (![...settingsTabs].some(t => t.dataset.tab === tab)) {
        tab = "account";
    }

    settingsTabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    settingsPanels.forEach(p => p.classList.toggle("active", p.dataset.panel === tab));

    // Запам'ятовуємо останню вкладку (якщо браузер дозволяє)
    try { localStorage.setItem("settingsTab", tab); } catch (error) { }

    loadAnalytics();
}

function openSettings(tab) {
    setView("settings");
    if (tab) setSettingsTab(tab);
}

settingsTabs.forEach(t => {
    t.addEventListener("click", () => setSettingsTab(t.dataset.tab));
});

document.querySelectorAll("[data-open-settings]").forEach(button => {
    button.addEventListener("click", () => openSettings(button.dataset.openSettings));
});

try { setSettingsTab(localStorage.getItem("settingsTab") || "account"); } catch (error) { }


navItems.forEach(item => {
    item.addEventListener("click", (event) => {
        event.preventDefault();
        setView(item.dataset.view);
    });
});


// ========================================
// ФІЛЬТРИ ЗВЕРХУ
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
// ПОШУК
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
        .filter(task => matchesCategoryFilter(task))
        .filter(task => {
            if (!searchQuery) return true;
            const text = `${task.title} ${task.description || ""} ${categoryLabel(task)}`.toLowerCase();
            return text.includes(searchQuery);
        })
        // Нові задачі зверху
        .sort((a, b) => b.id - a.id);
}

function renderTasks() {

    taskList.innerHTML = "";

    const visible = getVisibleTasks();

    visible.forEach(task => {
        taskList.append(createTaskCard(task));
    });

    emptyState.classList.toggle("visible", visible.length === 0);

    // Плашка вибраного дня
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

    // Картку можна перетягнути на день у календарі
    card.draggable = true;
    makeDraggable(card, task);

    const isDone = task.status === "done";

    if (isDone) {
        card.classList.add("completed-task");
    }

    if (isOverdue(task)) {
        card.classList.add("overdue-task");
    }

    if (productivityOn && task.workState === "active" && task.status === "progress") {
        card.classList.add("working-task");
    }

    if ((task.marks || []).length) {
        card.classList.add("has-marks");
        card.style.setProperty("--strips", task.marks.length);
    }

    card.innerHTML = `
        ${marksStripHtml(task, "owner")}

        <div class="task-check ${isDone ? "checked" : ""}" title="Change status">
            ✓
        </div>

        <div class="task-info">

            <h3>${escapeHtml(task.title)}</h3>

            <p>${escapeHtml(task.description || "Без описания")}</p>

            <div class="task-meta">

                ${categoryTagHtml(task)}

                ${deadlineLabel(task)}

            </div>

            ${productivityRowHtml(task)}

        </div>

        <div class="status-column">
            <div class="task-status ${task.status}">
                ${statusNames[task.status] || "Todo"}
            </div>
            ${workStateHtml(task)}
        </div>

        <button class="more edit-button" title="Edit task" aria-label="Edit task">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
        </button>

        <button class="more delete-button" title="Delete task" aria-label="Delete task">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>
            </svg>
        </button>

    `;

    // Кнопки «Почати / Призупинити / ...» (лише в режимі аналізу)
    bindProductivityRow(card, task);

    // «×» на смужках-мітках помічників
    bindMarkStrips(card, task);

    // Клік по квадратику: Todo → In Progress → Done → Todo
    card.querySelector(".task-check")
        .addEventListener("click", () => cycleStatus(task));

    // Редагування: кнопка-олівець або подвійний клік по назві
    card.querySelector(".edit-button")
        .addEventListener("click", () => openEditModal(task));

    card.querySelector("h3")
        .addEventListener("dblclick", () => openEditModal(task));

    // Видалення
    card.querySelector(".delete-button")
        .addEventListener("click", () => deleteTask(task, card));

    return card;
}


// ========================================
// ЗМІНА СТАТУСУ
// ========================================

async function cycleStatus(task) {

    // У режимі аналізу галочка = «Завершити» (сесія закривається правильно)
    if (productivityOn) {
        workAction(task, task.status === "done" ? "reopen" : "finish");
        return;
    }

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

        // 🎉 Задачу виконано
        if (task.status === "done") {
            celebrate(task);
        }

    } catch (error) {

        console.error(error);

    }

}


// ========================================
// ВИДАЛЕННЯ
// ========================================

const deleteModal = document.querySelector("#deleteModal");
const deleteTaskTitle = document.querySelector("#deleteTaskTitle");
const deleteTaskMeta = document.querySelector("#deleteTaskMeta");
const deleteCancel = document.querySelector("#deleteCancel");
const deleteConfirm = document.querySelector("#deleteConfirm");

let resolveDelete = null;

// Показує вікно й чекає відповіді: true — видалити, false — скасувати
function askDelete(task) {

    deleteTaskTitle.textContent = task.title;

    deleteTaskMeta.innerHTML = `
        ${categoryTagHtml(task)}
        <span class="task-status ${task.status}">${statusNames[task.status] || "Todo"}</span>
        ${deleteLabelForModal(task)}
    `;

    deleteModal.classList.add("active");

    // Фокус на "Cancel" — щоб випадковий Enter нічого не видалив
    setTimeout(() => deleteCancel.focus(), 50);

    return new Promise(resolve => {
        resolveDelete = resolve;
    });
}

function deleteLabelForModal(task) {
    return task.deadline ? deadlineLabel(task) : "";
}

function closeDeleteModal(answer) {

    if (!resolveDelete) return;

    deleteModal.classList.remove("active");

    resolveDelete(answer);
    resolveDelete = null;
}

deleteCancel.addEventListener("click", () => closeDeleteModal(false));
deleteConfirm.addEventListener("click", () => closeDeleteModal(true));

// Клік по темному фону — скасування
deleteModal.addEventListener("click", (event) => {
    if (event.target === deleteModal) {
        closeDeleteModal(false);
    }
});

document.addEventListener("keydown", (event) => {

    if (!deleteModal.classList.contains("active")) return;

    if (event.key === "Escape") {
        closeDeleteModal(false);
    }

    // Delete на клавіатурі — підтвердити
    if (event.key === "Delete") {
        closeDeleteModal(true);
    }
});

async function deleteTask(task, card) {

    const confirmed = await askDelete(task);

    if (!confirmed) {
        return;
    }

    try {

        const response = await api(`/api/tasks/${task.id}`, {
            method: "DELETE"
        });

        if (!response.ok) {
            throw new Error("Ошибка удаления");
        }

        // Плавно прибираємо картку, потім перемальовуємо
        if (card && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            card.classList.add("removing");
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        tasks = tasks.filter(t => t.id !== task.id);

        render();

        showToast(`🗑 «${task.title}» deleted`);

    } catch (error) {

        console.error(error);

        showToast("Не удалось удалить задачу");

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
// КАЛЕНДАР
// ========================================

function renderCalendar() {

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();

    calendarTitle.textContent = calendarMonth.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric"
    });

    // Тиждень починається з понеділка
    const firstDay = new Date(year, month, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);

    // Групуємо задачі за датою дедлайну
    const byDate = {};
    tasks.forEach(task => {
        if (!task.deadline) return;
        (byDate[task.deadline] = byDate[task.deadline] || []).push(task);
    });

    const isBig = currentView === "calendar";
    const today = todayKey();

    calendarGrid.innerHTML = "";

    // 6 тижнів = 42 клітинки
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
            // Великий календар: назви задач прямо в клітинці
            const shown = dayTasks.slice(0, 3).map(t => {
                const cls = isOverdue(t) ? "overdue" : t.status;
                return `<span class="day-task ${cls}" draggable="true" data-id="${t.id}">${escapeHtml(t.title)}</span>`;
            }).join("");

            const more = dayTasks.length > 3
                ? `<span class="day-more">+${dayTasks.length - 3} more</span>`
                : "";

            content += `<span class="day-tasks">${shown}${more}</span>`;
        } else if (dayTasks.length) {
            // Маленький календар: кольорові крапки
            const dots = dayTasks.slice(0, 4).map(t => {
                const cls = isOverdue(t) ? "overdue-dot" : `${t.status}-dot`;
                return `<i class="dot ${cls}"></i>`;
            }).join("");

            content += `<span class="day-dots">${dots}</span>`;
        }

        cell.innerHTML = content;

        // Задачі всередині великого календаря теж можна перетягувати
        cell.querySelectorAll(".day-task").forEach(el => {
            const t = tasks.find(x => x.id === Number(el.dataset.id));
            if (t) makeDraggable(el, t);
        });

        // Сюди можна кинути задачу
        makeDropTarget(cell, key);

        // Клік — показати задачі цього дня (повторний клік — зняти вибір)
        cell.addEventListener("click", () => {
            selectedDate = selectedDate === key ? null : key;

            if (date.getMonth() !== month) {
                calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
            }

            render();
        });

        // Подвійний клік — створити задачу на цей день
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

        // Клік — перейти до цього дня в календарі
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
// КАТЕГОРІЇ ТА ПІДКАТЕГОРІЇ
// ========================================

const SUB_SEPARATOR = "›";

// Базові категорії (є в усіх, видалити не можна)
const BASE_CATEGORIES = [
    { name: "Development", subs: [], base: true },
    { name: "Design", subs: [], base: true },
    { name: "Study", subs: ["Aviation Security Labs", "English"], base: true },
    { name: "Personal", subs: [], base: true }
];

async function loadCategories() {

    try {
        const response = await api("/api/categories");
        categories = await response.json();
    } catch (error) {
        console.error(error);
    }

    // Хоч би що сталося — базові категорії в списку є завжди
    if (!Array.isArray(categories) || !categories.length) {
        categories = BASE_CATEGORIES.map(c => ({ ...c, subs: [...c.subs] }));
    }

    renderCategoryFilter();
    renderCategoryManager();

    // Підписи кольорів графіків = назви категорій
    if (appearanceLoaded) fillAppearanceForm();
}

// Зберегти весь список на сервері. Повертає true, якщо вийшло
async function saveCategories(newList) {

    const response = await api("/api/categories", {
        method: "PUT",
        body: JSON.stringify({ categories: newList })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Error");
    }

    categories = data;

    renderCategoryFilter();
    renderCategoryManager();

    return true;
}

function findCategory(name) {
    return categories.find(c => c.name === name);
}

function option(value, text, selected) {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = text;
    el.selected = Boolean(selected);
    return el;
}

// Заповнити випадний список категорій у вікні задачі
function fillCategorySelect(selectedCategory, selectedSub) {

    taskCategory.innerHTML = "";

    const names = categories.map(c => c.name);

    // Якщо в задачі категорія, якої вже немає в списку, — однаково показуємо її
    if (selectedCategory && !names.includes(selectedCategory)) {
        taskCategory.append(option(selectedCategory, selectedCategory, true));
    }

    categories.forEach(c => {
        taskCategory.append(option(c.name, c.name, c.name === selectedCategory));
    });

    fillSubcategorySelect(selectedSub);
}

function fillSubcategorySelect(selectedSub) {

    const category = findCategory(taskCategory.value);
    const subs = category ? category.subs : [];

    taskSubcategory.innerHTML = "";
    taskSubcategory.append(option("", "— none —", !selectedSub));

    if (selectedSub && !subs.includes(selectedSub)) {
        taskSubcategory.append(option(selectedSub, selectedSub, true));
    }

    subs.forEach(sub => {
        taskSubcategory.append(option(sub, sub, sub === selectedSub));
    });

    updateDeleteSubButton();
}

taskCategory.addEventListener("change", () => fillSubcategorySelect(""));
taskSubcategory.addEventListener("change", updateDeleteSubButton);


// ---------- Видалити вибрану підкатегорію прямо у вікні задачі ----------

const deleteSubcategoryButton = document.querySelector("#deleteSubcategoryButton");

function updateDeleteSubButton() {
    deleteSubcategoryButton.disabled = !taskSubcategory.value;
    deleteSubcategoryButton.classList.remove("confirm");
}

deleteSubcategoryButton.addEventListener("click", async () => {

    const sub = taskSubcategory.value;
    const categoryName = taskCategory.value;

    if (!sub) return;

    // Перший клік — запитати, другий — видалити
    if (!deleteSubcategoryButton.classList.contains("confirm")) {
        deleteSubcategoryButton.classList.add("confirm");
        deleteSubcategoryButton.title = `Click again to delete «${sub}»`;
        categoryError.textContent = `Click the red button again to delete «${sub}» from ${categoryName}.`;
        return;
    }

    try {

        await saveCategories(categories.map(c => c.name === categoryName
            ? { ...c, subs: c.subs.filter(s => s !== sub) }
            : c));

        fillCategorySelect(categoryName, "");
        categoryError.textContent = "";
        showToast(`Subcategory «${sub}» deleted`);

    } catch (error) {

        categoryError.textContent = error.message;

    }
});


// ---------- Швидке додавання прямо у вікні задачі ----------

const pendingInlineAdds = [];

function setupInlineAdd(buttonId, rowId, inputId, saveId, onSave) {

    const button = document.querySelector(buttonId);
    const row = document.querySelector(rowId);
    const input = document.querySelector(inputId);
    const save = document.querySelector(saveId);

    button.addEventListener("click", () => {
        row.classList.toggle("visible");
        categoryError.textContent = "";
        if (row.classList.contains("visible")) input.focus();
    });

    async function submit() {

        const value = input.value.trim();

        if (!value) {
            input.focus();
            return;
        }

        try {
            await onSave(value);
            input.value = "";
            row.classList.remove("visible");
            categoryError.textContent = "";
        } catch (error) {
            categoryError.textContent = error.message;
        }
    }

    save.addEventListener("click", submit);

    // Щоб під час збереження задачі введена, але не додана назва теж збереглася
    pendingInlineAdds.push(async () => {
        if (row.classList.contains("visible") && input.value.trim()) {
            await submit();
        }
    });

    // Enter у полі — додати, а не надіслати всю форму
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            submit();
        }
        if (event.key === "Escape") {
            event.stopPropagation();
            row.classList.remove("visible");
        }
    });
}

setupInlineAdd("#addCategoryButton", "#newCategoryRow", "#newCategoryInput", "#saveCategoryButton", async (name) => {

    await saveCategories([...categories, { name, subs: [] }]);

    fillCategorySelect(name, "");
    showToast(`Category «${name}» added`);
});

setupInlineAdd("#addSubcategoryButton", "#newSubcategoryRow", "#newSubcategoryInput", "#saveSubcategoryButton", async (sub) => {

    const categoryName = taskCategory.value;

    const newList = categories.map(c =>
        c.name === categoryName ? { ...c, subs: [...c.subs, sub] } : c
    );

    // Категорії немає в списку (стара задача) — додаємо її разом із підкатегорією
    if (!findCategory(categoryName)) {
        newList.push({ name: categoryName, subs: [sub] });
    }

    await saveCategories(newList);

    fillCategorySelect(categoryName, sub);
    showToast(`Subcategory «${sub}» added to ${categoryName}`);
});


// ---------- Фільтр за категорією (поруч із пошуком) ----------

function renderCategoryFilter() {

    const current = categoryFilterValue;

    categoryFilter.innerHTML = "";
    categoryFilter.append(option("", "All categories", !current));

    categories.forEach(c => {

        categoryFilter.append(option(c.name, c.name, current === c.name));

        c.subs.forEach(sub => {
            const value = `${c.name}${SUB_SEPARATOR}${sub}`;
            categoryFilter.append(option(value, `\u00A0\u00A0\u00A0› ${sub}`, current === value));
        });
    });

    // Вибрана категорія зникла — скидаємо фільтр
    if (categoryFilter.value !== current) {
        categoryFilterValue = "";
    }

    categoryFilter.classList.toggle("active", Boolean(categoryFilterValue));
}

function matchesCategoryFilter(task) {

    if (!categoryFilterValue) return true;

    const [name, sub] = categoryFilterValue.split(SUB_SEPARATOR);

    if ((task.category || "Development") !== name) return false;

    return sub === undefined || task.subcategory === sub;
}

categoryFilter.addEventListener("change", () => {
    categoryFilterValue = categoryFilter.value;
    categoryFilter.classList.toggle("active", Boolean(categoryFilterValue));
    renderTasks();
});


// ---------- Керування категоріями в профілі ----------

const categoryList = document.querySelector("#categoryList");
const profileCategoryForm = document.querySelector("#profileCategoryForm");
const profileCategoryInput = document.querySelector("#profileCategoryInput");
const categoriesMessage = document.querySelector("#categoriesMessage");

function renderCategoryManager() {

    categoryList.innerHTML = "";

    categories.forEach(category => {

        const used = tasks.filter(t => (t.category || "Development") === category.name).length;

        const item = document.createElement("div");
        item.className = "category-item";

        item.innerHTML = `
            <div class="category-head">
                <span class="tag ${categoryTagClass(category.name)} category-name">${escapeHtml(category.name)}</span>
                <small>${used} task${used === 1 ? "" : "s"}</small>
                ${category.base
                    ? `<span class="base-badge" title="Basic category — always stays">base</span>`
                    : `<button type="button" class="chip-action rename-category" title="Rename category">✎</button>
                       <button type="button" class="chip-remove" title="Delete category">×</button>`}
            </div>
            <div class="sub-chips">
                ${category.subs.map((sub, i) => `
                    <span class="sub-chip"><span class="sub-name" data-sub="${i}" title="Click to rename">${escapeHtml(sub)}</span><button type="button" data-remove="${i}" title="Delete subcategory">×</button></span>
                `).join("")}
                <form class="sub-add">
                    <input type="text" placeholder="+ subcategory" maxlength="40">
                </form>
            </div>
        `;

        // ---------- Своя категорія: перейменувати / видалити ----------

        if (!category.base) {

            item.querySelector(".rename-category").addEventListener("click", () => {
                startInlineRename(item.querySelector(".category-name"), category.name, 30,
                    (newName) => renameCategory({ category: category.name, newName }));
            });

            // Перший клік — запитати, другий — видалити
            const removeButton = item.querySelector(".chip-remove");

            removeButton.addEventListener("click", async () => {

                if (!removeButton.classList.contains("confirm")) {
                    removeButton.classList.add("confirm");
                    removeButton.textContent = "Delete?";
                    setTimeout(() => {
                        removeButton.classList.remove("confirm");
                        removeButton.textContent = "×";
                    }, 3000);
                    return;
                }

                await updateCategories(categories.filter(c => c !== category),
                    `Category «${category.name}» deleted. Its tasks keep the label.`);
            });
        }

        // ---------- Підкатегорії: перейменувати (клік) / видалити ----------

        item.querySelectorAll(".sub-name").forEach(el => {
            el.addEventListener("click", () => {
                const sub = category.subs[Number(el.dataset.sub)];
                startInlineRename(el, sub, 40,
                    (newName) => renameCategory({ category: category.name, sub, newName }));
            });
        });

        item.querySelectorAll("[data-remove]").forEach(button => {
            button.addEventListener("click", () => {
                const index = Number(button.dataset.remove);
                updateCategories(
                    categories.map(c => c === category
                        ? { ...c, subs: c.subs.filter((_, i) => i !== index) }
                        : c),
                    "Subcategory deleted"
                );
            });
        });

        // Додати підкатегорію
        const subForm = item.querySelector(".sub-add");

        // Зберігаємо і по Enter, і коли виходимо з поля
        subForm.querySelector("input").addEventListener("blur", () => {
            if (subForm.querySelector("input").value.trim()) {
                subForm.requestSubmit();
            }
        });

        subForm.addEventListener("submit", (event) => {

            event.preventDefault();

            const input = subForm.querySelector("input");
            const value = input.value.trim();
            if (!value) return;
            input.value = "";

            updateCategories(
                categories.map(c => c === category ? { ...c, subs: [...c.subs, value] } : c),
                `Subcategory «${value}» added`
            );
        });

        categoryList.append(item);
    });
}

// Перетворює назву на поле введення. Enter — зберегти, Esc — скасувати
function startInlineRename(element, currentName, maxLength, onSave) {

    const input = document.createElement("input");
    input.type = "text";
    input.className = "rename-input";
    input.value = currentName;
    input.maxLength = maxLength;

    element.replaceWith(input);
    input.focus();
    input.select();

    let done = false;

    async function finish(save) {

        if (done) return;
        done = true;

        const value = input.value.trim();

        if (save && value && value !== currentName) {
            await onSave(value);
        } else {
            renderCategoryManager();
        }
    }

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            finish(true);
        }
        if (event.key === "Escape") {
            finish(false);
        }
    });

    input.addEventListener("blur", () => finish(true));
}

async function renameCategory(body) {

    try {

        const response = await api("/api/categories/rename", {
            method: "POST",
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Error");
        }

        categories = data.categories;
        tasks = data.tasks;

        // Фільтр указував на стару назву — скидаємо
        categoryFilterValue = "";

        renderCategoryFilter();
        render();

        showFormMessage(categoriesMessage, `✓ Renamed to «${body.newName}»`);

    } catch (error) {

        showFormMessage(categoriesMessage, error.message, true);
        renderCategoryManager();

    }
}

async function updateCategories(newList, successText) {

    try {
        await saveCategories(newList);
        showFormMessage(categoriesMessage, `✓ ${successText}`);
        renderTasks();
    } catch (error) {
        showFormMessage(categoriesMessage, error.message, true);
    }
}

profileCategoryForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const name = profileCategoryInput.value.trim();
    if (!name) return;

    await updateCategories([...categories, { name, subs: [] }], `Category «${name}» added`);

    if (!categoriesMessage.classList.contains("error")) {
        profileCategoryInput.value = "";
    }
});


// ========================================
// МОДАЛЬНЕ ВІКНО (створення та редагування)
// ========================================

function resetInlineAdds() {
    document.querySelectorAll("#taskForm .inline-add").forEach(row => row.classList.remove("visible"));
    categoryError.textContent = "";
}

// Нова задача
function openTaskModal(deadline = selectedDate) {

    editingTask = null;
    taskForm.reset();
    resetInlineAdds();

    taskModal.classList.remove("editing");
    taskModalTitle.textContent = "Create New Task";
    taskModalSubtitle.textContent = "Add a new task to your project.";
    taskSubmit.textContent = "Create Task";

    // Якщо вибрано фільтр категорії — одразу підставляємо її
    const [filterCat, filterSub] = categoryFilterValue ? categoryFilterValue.split(SUB_SEPARATOR) : [];
    fillCategorySelect(filterCat || (categories[0] && categories[0].name) || "Development", filterSub || "");

    // Якщо вибрано день у календарі — підставляємо його як дедлайн
    taskDeadline.value = deadline || "";

    productivityFillForm(null);

    taskModal.classList.add("active");
    taskTitle.focus();
}

// Редагування наявної задачі
function openEditModal(task) {

    editingTask = task;
    resetInlineAdds();

    taskModal.classList.add("editing");
    taskModalTitle.textContent = "Edit Task";
    taskModalSubtitle.textContent = "Change anything and save.";
    taskSubmit.textContent = "Save Changes";

    taskTitle.value = task.title;
    taskDescription.value = task.description || "";
    fillCategorySelect(task.category || "Development", task.subcategory || "");
    taskDeadline.value = task.deadline || "";
    taskStatus.value = task.status || "todo";

    productivityFillForm(task);

    taskModal.classList.add("active");

    taskTitle.focus();
    taskTitle.setSelectionRange(taskTitle.value.length, taskTitle.value.length);
}

function closeTaskModal() {
    taskModal.classList.remove("active");
    taskForm.reset();
    editingTask = null;
}

addButton.addEventListener("click", () => {
    if (currentView === "wishlist") openWishModal();
    else openTaskModal();
});

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
// ЗБЕРЕЖЕННЯ ЗАДАЧІ (нової або зміненої)
// ========================================

taskForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const title = taskTitle.value.trim();

    if (!title) {
        return;
    }

    // Спершу зберігаємо категорію/підкатегорію, яку ввели, але не натиснули «Add»
    for (const savePending of pendingInlineAdds) {
        await savePending();
    }

    const fields = {
        title: title,
        description: taskDescription.value.trim(),
        category: taskCategory.value,
        subcategory: taskSubcategory.value,
        deadline: taskDeadline.value,
        ...productivityReadForm()
    };

    taskSubmit.disabled = true;

    try {

        if (editingTask) {

            // ---------- Редагування ----------

            const task = editingTask;
            const wasDone = task.status === "done";

            const response = await api(`/api/tasks/${task.id}`, {
                method: "PATCH",
                // У режимі аналізу статус змінюють кнопки «Почати / Завершити», а не це поле
                body: JSON.stringify(productivityOn ? fields : { ...fields, status: taskStatus.value })
            });

            const updated = await response.json();

            if (!response.ok) {
                throw new Error(updated.error || "Ошибка сохранения");
            }

            Object.assign(task, updated);

            closeTaskModal();
            render();

            if (!wasDone && task.status === "done") {
                celebrate(task);
            } else {
                showToast("✏️ Task updated");
            }

        } else {

            // ---------- Створення ----------

            const response = await api("/api/tasks", {
                method: "POST",
                body: JSON.stringify(fields)
            });

            if (!response.ok) {
                throw new Error("Ошибка создания задачи");
            }

            const task = await response.json();

            tasks.push(task);

            closeTaskModal();

            // Щоб нова задача точно була видна
            if (currentFilter !== "all" && currentFilter !== task.status) {
                setFilter("all", false);
            }

            render();
        }

    } catch (error) {

        console.error("Ошибка:", error);

        showToast(editingTask ? "Не удалось сохранить изменения" : "Не удалось создать задачу");

    } finally {

        taskSubmit.disabled = false;

    }

});


// ========================================
// КОРИСТУВАЧ І ВИХІД
// ========================================

const userAvatar = document.querySelector("#userAvatar");
const userName = document.querySelector("#userName");
const userEmail = document.querySelector("#userEmail");
const logoutButton = document.querySelector("#logoutButton");

let currentUser = null;

// Аватарка: фото, якщо є, інакше перша літера імені
function paintAvatar(element, user) {

    const initial = (user.name || "U").trim().charAt(0).toUpperCase() || "U";

    if (user.avatar) {
        element.style.backgroundImage = `url("${user.avatar}")`;
        element.classList.add("has-photo");
    } else {
        element.style.backgroundImage = "";
        element.classList.remove("has-photo");
    }

    return initial;
}

function showUser(user) {

    if (!user) return;

    currentUser = user;

    userName.textContent = user.name;
    userEmail.textContent = user.email;
    const initial = paintAvatar(userAvatar, user);
    userAvatar.textContent = user.avatar ? "" : initial;

    fillProfile(user);

    applyProductivityMode(user.settings && user.settings.productivityEnabled);
}

async function loadUser() {

    // Спершу показуємо те, що збережено, потім уточнюємо в сервера
    try {
        showUser(JSON.parse(localStorage.getItem("user")));
    } catch (error) { }

    try {
        const response = await api("/api/me");
        const user = await response.json();
        saveUser(user);

        // Оформлення беремо лише зі свіжої відповіді сервера
        loadAppearanceFromUser(user);
    } catch (error) {
        console.error(error);
    }
}

function saveUser(user) {
    localStorage.setItem("user", JSON.stringify(user));
    showUser(user);
}

document.querySelector("#userLink").addEventListener("click", () => {
    setView("profile");
});

logoutButton.addEventListener("click", async () => {

    try {
        await api("/api/logout", { method: "POST" });
    } catch (error) { }

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    location.href = "/login.html";
});


// ========================================
// ПРОФІЛЬ
// ========================================

const profilePhoto = document.querySelector("#profilePhoto");
const profileInitial = document.querySelector("#profileInitial");
const profileNameTitle = document.querySelector("#profileNameTitle");
const profileEmailText = document.querySelector("#profileEmailText");
const verifiedBadge = document.querySelector("#verifiedBadge");
const profileSince = document.querySelector("#profileSince");
const profileName = document.querySelector("#profileName");
const profileEmail = document.querySelector("#profileEmail");
const photoInput = document.querySelector("#photoInput");
const uploadPhoto = document.querySelector("#uploadPhoto");
const removePhoto = document.querySelector("#removePhoto");
const nameForm = document.querySelector("#nameForm");
const nameMessage = document.querySelector("#nameMessage");
const passwordForm = document.querySelector("#passwordForm");
const passwordMessage = document.querySelector("#passwordMessage");

function fillProfile(user) {

    profileInitial.textContent = paintAvatar(profilePhoto, user);
    document.querySelector("#profileHeroInitial").textContent =
        paintAvatar(document.querySelector("#profileHeroPhoto"), user);
    profileNameTitle.textContent = user.name;
    profileEmailText.textContent = user.email;
    verifiedBadge.style.display = user.emailVerified ? "" : "none";
    removePhoto.style.display = user.avatar ? "" : "none";

    profileSince.textContent = user.createdAt
        ? `Member since ${new Date(user.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`
        : "";

    // Не перезаписуємо ім'я, поки людина його редагує
    if (document.activeElement !== profileName) {
        profileName.value = user.name;
    }

    profileEmail.value = user.email;
}

function renderProfileStats() {

    const total = tasks.length;
    const done = tasks.filter(t => t.status === "done").length;

    document.querySelector("#pTotal").textContent = total;
    document.querySelector("#pDone").textContent = done;
    document.querySelector("#pRate").textContent = total ? `${Math.round(done / total * 100)}%` : "0%";
    document.querySelector("#pOverdue").textContent = tasks.filter(isOverdue).length;
}

function showFormMessage(element, text, isError) {
    element.textContent = text;
    element.classList.toggle("error", Boolean(isError));
}

// Читаємо відповідь сервера й викидаємо помилку, якщо щось не так
async function readResult(response) {
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || "Error");
    }
    return data;
}


// ---------- Фото ----------

profilePhoto.addEventListener("click", () => photoInput.click());
document.querySelector("#profileHeroPhoto").addEventListener("click", () => photoInput.click());
uploadPhoto.addEventListener("click", () => photoInput.click());

// Обрізаємо фото до квадрата 256×256 прямо в браузері
function cropToSquare(file) {

    return new Promise((resolve, reject) => {

        const url = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {

            const size = 256;
            const side = Math.min(image.width, image.height);

            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;

            canvas.getContext("2d").drawImage(
                image,
                (image.width - side) / 2,
                (image.height - side) / 2,
                side,
                side,
                0,
                0,
                size,
                size
            );

            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/jpeg", 0.88));
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Could not read this image"));
        };

        image.src = url;
    });
}

photoInput.addEventListener("change", async () => {

    const file = photoInput.files[0];
    photoInput.value = "";

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        showToast("Choose a JPG, PNG or WEBP image");
        return;
    }

    if (file.size > 15 * 1024 * 1024) {
        showToast("This image is too large (max 15 MB)");
        return;
    }

    profilePhoto.classList.add("loading");

    try {

        const image = await cropToSquare(file);

        const user = await readResult(await api("/api/profile/avatar", {
            method: "PUT",
            body: JSON.stringify({ image })
        }));

        saveUser(user);
        showToast("📷 Photo updated");

    } catch (error) {

        showToast(error.message);

    } finally {

        profilePhoto.classList.remove("loading");

    }
});

removePhoto.addEventListener("click", async () => {

    try {
        const user = await readResult(await api("/api/profile/avatar", { method: "DELETE" }));
        saveUser(user);
        showToast("Photo removed");
    } catch (error) {
        showToast(error.message);
    }
});


// ---------- Ім'я ----------

nameForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const name = profileName.value.trim();

    if (!name) {
        showFormMessage(nameMessage, "Enter your name", true);
        return;
    }

    try {

        const user = await readResult(await api("/api/profile", {
            method: "PATCH",
            body: JSON.stringify({ name })
        }));

        profileName.blur();
        saveUser(user);
        showFormMessage(nameMessage, "✓ Saved");

    } catch (error) {

        showFormMessage(nameMessage, error.message, true);

    }
});


// ---------- Пароль ----------

passwordForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const currentPassword = document.querySelector("#currentPassword").value;
    const newPassword = document.querySelector("#newPassword").value;

    if (newPassword.length < 6) {
        showFormMessage(passwordMessage, "New password must be at least 6 characters", true);
        return;
    }

    try {

        await readResult(await api("/api/profile/password", {
            method: "POST",
            body: JSON.stringify({ currentPassword, newPassword })
        }));

        passwordForm.reset();
        showFormMessage(passwordMessage, "✓ Password changed. Other devices were signed out.");

    } catch (error) {

        showFormMessage(passwordMessage, error.message, true);

    }
});


// ========================================
// DRAG & DROP — перенесення дедлайну
// ========================================

let draggedTask = null;

function makeDraggable(element, task) {

    element.addEventListener("dragstart", (event) => {
        draggedTask = task;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(task.id));
        // Щоб клік по дню не спрацьовував від перетягування
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

    // Одразу показуємо зміну, не чекаючи на сервер
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

        // Не вийшло — повертаємо як було
        console.error(error);
        task.deadline = oldDeadline;
        render();
        showToast("Не удалось перенести задачу");

    }
}


// ========================================
// СПОВІЩЕННЯ ВНИЗУ ЕКРАНА
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
// КОНФЕТІ 🎉
// ========================================

function celebrate(task) {

    // Усі задачі цього дня виконано?
    const sameDay = task.deadline
        ? tasks.filter(t => t.deadline === task.deadline)
        : [];
    const dayDone = sameDay.length > 1 && sameDay.every(t => t.status === "done");

    // Узагалі всі задачі виконано?
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

    // Поважаємо налаштування "зменшити анімацію"
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

    // Частинки вилітають знизу з двох кутів
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
            p.vy += 0.35;      // гравітація
            p.vx *= 0.99;      // опір повітря
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
// ЕКСПОРТ У GOOGLE CALENDAR / OUTLOOK (.ics)
// ========================================

const exportIcs = document.querySelector("#exportIcs");

// Екранування тексту для формату iCalendar
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

        // Подія на весь день: DTEND = наступний день
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
                `Category: ${categoryLabel(task)}`,
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
// ЗАХИСТ ВІД HTML
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
    loadCategories();
    loadTasks();
    startSharesPolling();
    loadWishlist();
}
