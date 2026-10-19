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

        const response = await fetch("/api/tasks");

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

        const response = await fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            throw new Error("Ошибка изменения статуса");
        }

        const updated = await response.json();
        task.status = updated.status;

        render();

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

        const response = await fetch(`/api/tasks/${task.id}`, {
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
                return `<span class="day-task ${cls}">${escapeHtml(t.title)}</span>`;
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

        const response = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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

loadTasks();
