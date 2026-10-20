// ========================================
// АНАЛИЗ ПРОДУКТИВНОСТИ: рабочие сессии и журнал событий
// ----------------------------------------
// worksessions.json — когда реально работали над задачей
// events.json       — что и когда менялось в плане (ничего не перезаписывается)
// ========================================

const { readJson, writeJson } = require("./storage");
const path = require("path");
const crypto = require("crypto");

const sessionsFile = path.join(__dirname, "worksessions.json");
const eventsFile = path.join(__dirname, "events.json");

function newId(prefix) {
    return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`;
}


// ========================================
// СОБЫТИЯ
// ========================================

// Записать одно или несколько событий: [{ type, data }]
function logEvents(userId, taskId, list) {

    if (!list.length) return;

    const events = readJson(eventsFile);
    const at = new Date().toISOString();

    list.forEach(item => {
        events.push({
            id: newId("evt"),
            userId,
            taskId,
            type: item.type,
            at,
            data: item.data || {}
        });
    });

    writeJson(eventsFile, events);
}

function getEvents(userId, taskId) {
    return readJson(eventsFile)
        .filter(e => e.userId === userId && (taskId === undefined || e.taskId === taskId));
}


// ========================================
// РАБОЧИЕ СЕССИИ
// ========================================

function readSessions() {
    return readJson(sessionsFile);
}

function findActive(sessions, taskId) {
    return sessions.find(s => s.taskId === taskId && s.status === "active");
}

function openSession(sessions, userId, taskId) {

    const session = {
        id: newId("ses"),
        taskId,
        userId,
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationSeconds: null,
        status: "active",
        confirmedAt: null,
        note: ""
    };

    sessions.push(session);
    return session;
}

function closeSession(session, endTime = new Date(), note = "") {
    session.endedAt = endTime.toISOString();
    session.durationSeconds = Math.max(0, Math.round((endTime - new Date(session.startedAt)) / 1000));
    session.status = "closed";
    if (note) session.note = note;
}

// Итог по задаче: время считается по меткам начала и конца, а не по таймеру браузера
function summaryOf(own) {

    const active = own.find(s => s.status === "active");

    return {
        totalSeconds: own
            .filter(s => s.status === "closed")
            .reduce((sum, s) => sum + (s.durationSeconds || 0), 0),
        sessionsCount: own.length,
        activeStartedAt: active ? active.startedAt : null,
        activeConfirmedAt: active ? active.confirmedAt : null
    };
}

// Сессии, сгруппированные по задачам. Считается один раз на массив сессий,
// а не заново для каждой задачи (список задач грузится быстро даже при большой истории)
const groupedCache = new WeakMap();

function sessionsByTask(sessions) {

    let grouped = groupedCache.get(sessions);

    if (!grouped || grouped.length !== sessions.length) {
        const map = new Map();
        sessions.forEach(s => {
            if (!map.has(s.taskId)) map.set(s.taskId, []);
            map.get(s.taskId).push(s);
        });
        grouped = { length: sessions.length, map };
        groupedCache.set(sessions, grouped);
    }

    return grouped.map;
}

function workSummary(taskId, sessions) {
    return summaryOf(sessionsByTask(sessions).get(taskId) || []);
}

function withWork(task, sessions) {
    return { ...task, work: workSummary(task.id, sessions) };
}


// ========================================
// ПОЛЯ ПЛАНА (сложность, оценка, сроки...)
// ========================================

const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function intOrNull(value, min, max) {
    if (value === null || value === "" || value === undefined) return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error("bad");
    return n;
}

function oneOf(value, list, fallback) {
    if (value === null || value === "" || value === undefined) return fallback;
    if (!list.includes(value)) throw new Error("bad");
    return value;
}

function datetimeOrEmpty(value) {
    if (value === null || value === "" || value === undefined) return "";
    if (!DATETIME.test(String(value))) throw new Error("bad");
    return String(value);
}

const PLAN_FIELDS = {
    difficulty: v => intOrNull(v, 1, 5),
    estimateMinutes: v => intOrNull(v, 1, 100000),
    plannedFinishAt: datetimeOrEmpty,
    plannedStartAt: datetimeOrEmpty,
    priority: v => oneOf(v, ["low", "medium", "high"], "medium"),
    taskType: v => oneOf(v, ["once", "recurring", "project"], "once"),
    energy: v => intOrNull(v, 1, 5),
    load: v => intOrNull(v, 1, 5),
    familiarity: v => oneOf(v, ["new", "similar", "routine"], "")
};

const FIELD_NAMES = {
    difficulty: "складность",
    estimateMinutes: "оценка времени",
    plannedFinishAt: "желаемое время завершения",
    plannedStartAt: "время начала",
    priority: "приоритет",
    taskType: "тип задачи",
    energy: "уровень энергии",
    load: "уровень нагрузки",
    familiarity: "знакомство с задачей"
};

// Проверяет только переданные поля. Возвращает { values } или бросает ошибку
function parsePlanFields(body) {

    const values = {};

    for (const [field, parse] of Object.entries(PLAN_FIELDS)) {
        if (body[field] === undefined) continue;
        try {
            values[field] = parse(body[field]);
        } catch (error) {
            throw new Error(`Недопустимое значение: ${FIELD_NAMES[field]}`);
        }
    }

    return values;
}

// Какие изменения плана записываем в журнал
const TRACKED_CHANGES = {
    estimateMinutes: "estimate_changed",
    plannedFinishAt: "planned_finish_changed",
    plannedStartAt: "planned_start_changed",
    deadline: "deadline_changed",
    difficulty: "difficulty_changed",
    priority: "priority_changed"
};

// Сравнить старые и новые значения, вернуть события об изменениях
function planChangeEvents(before, after) {

    const list = [];

    for (const [field, type] of Object.entries(TRACKED_CHANGES)) {

        const from = before[field] ?? null;
        const to = after[field] ?? null;

        if ((from || null) !== (to || null) && after[field] !== undefined) {
            list.push({ type, data: { from: from || null, to: to || null } });
        }
    }

    return list;
}

// Снимок первоначального плана — не меняется никогда
function initialPlan(task) {
    return {
        estimateMinutes: task.estimateMinutes ?? null,
        plannedFinishAt: task.plannedFinishAt || "",
        plannedStartAt: task.plannedStartAt || "",
        deadline: task.deadline || "",
        difficulty: task.difficulty ?? null,
        priority: task.priority || "medium"
    };
}


// ========================================
// КНОПКИ: Почати / Призупинити / Продовжити / Завершити
// ========================================

// Меняет task и sessions. Возвращает { events } или { error, code }
function applyWorkAction(task, sessions, action, body = {}) {

    const now = new Date();
    const active = findActive(sessions, task.id);
    const events = [];

    switch (action) {

        case "start": {

            if (task.status === "done") {
                return { error: "Задача уже выполнена — сначала откройте её снова", code: 400 };
            }
            if (active || task.workState === "active") {
                return { error: "Задача уже выполняется", code: 409 };
            }

            openSession(sessions, task.userId, task.id);

            const first = !task.firstStartedAt;
            if (first) task.firstStartedAt = now.toISOString();

            task.status = "progress";
            task.workState = "active";

            events.push({ type: first ? "first_start" : "start" });
            break;
        }

        case "pause": {

            if (!active) {
                return { error: "Сейчас задача не выполняется", code: 409 };
            }

            closeSession(active, now);
            task.workState = "paused";

            events.push({ type: "pause", data: { sessionSeconds: active.durationSeconds } });
            break;
        }

        case "resume": {

            if (task.status !== "progress") {
                return { error: "Задача не в процессе", code: 400 };
            }
            if (active) {
                return { error: "Задача уже выполняется", code: 409 };
            }

            openSession(sessions, task.userId, task.id);
            task.workState = "active";

            events.push({ type: "resume" });
            break;
        }

        case "finish": {

            if (task.status === "done") {
                return { error: "Задача уже выполнена", code: 400 };
            }

            if (active) closeSession(active, now);

            task.status = "done";
            task.workState = null;
            task.completedAt = now.toISOString();

            events.push({ type: "finish" });
            break;
        }

        case "reset": {

            // Вернуть в «Не начато». История сессий остаётся
            if (active) closeSession(active, now);

            task.status = "todo";
            task.workState = null;
            task.completedAt = null;

            events.push({ type: "reset" });
            break;
        }

        case "reopen": {

            if (task.status !== "done") {
                return { error: "Задача не выполнена", code: 400 };
            }

            task.status = "progress";
            task.workState = "paused";
            task.completedAt = null;

            events.push({ type: "reopen" });
            break;
        }

        case "confirm": {

            // «Да, я всё это время работал(а)»
            if (!active) {
                return { error: "Нет активной сессии", code: 409 };
            }

            active.confirmedAt = now.toISOString();
            events.push({ type: "session_confirmed" });
            break;
        }

        case "stop_at": {

            // «Я забыл(а) нажать паузу» — закрываем сессию в указанное время
            if (!active) {
                return { error: "Нет активной сессии", code: 409 };
            }

            const end = new Date(body.endedAt);

            if (isNaN(end) || end < new Date(active.startedAt) || end > now) {
                return { error: "Время окончания должно быть между началом сессии и сейчас", code: 400 };
            }

            closeSession(active, end, "corrected by user");
            task.workState = "paused";

            events.push({ type: "pause", data: { corrected: true, sessionSeconds: active.durationSeconds } });
            break;
        }

        default:
            return { error: "Неизвестное действие", code: 400 };
    }

    return { events };
}

// Если статус меняется обычным способом (галочка, редактирование) — закрываем активную сессию
function onStatusChange(task, sessions, newStatus) {

    const events = [];

    if (newStatus === task.status) return events;

    const active = findActive(sessions, task.id);

    if (newStatus !== "progress" && active) {
        closeSession(active, new Date());
    }

    if (newStatus === "done") {
        task.completedAt = new Date().toISOString();
        events.push({ type: "finish" });
    } else if (newStatus === "todo") {
        task.completedAt = null;
        if (task.status !== "todo") events.push({ type: "reset" });
    } else if (newStatus === "progress" && task.status === "done") {
        task.completedAt = null;
        events.push({ type: "reopen" });
    }

    task.workState = newStatus === "progress"
        ? (active ? "active" : (task.workState === "active" ? "paused" : task.workState || null))
        : null;

    return events;
}

// Прогноз, который видел пользователь при создании задачи (сохраняется один раз)
function cleanForecastSnapshot(input) {

    if (!input || typeof input !== "object") return null;

    const minutes = Number(input.minutes);

    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 100000) return null;

    return {
        minutes: Math.round(minutes),
        ratio: Number.isFinite(Number(input.ratio)) ? Number(Number(input.ratio).toFixed(3)) : null,
        basis: String(input.basis || "").slice(0, 80),
        samples: Number.isInteger(input.samples) ? input.samples : null,
        algorithm: String(input.algorithm || "v1").slice(0, 20),
        createdAt: new Date().toISOString()
    };
}

module.exports = {
    cleanForecastSnapshot,
    readSessions,
    saveSessions: data => writeJson(sessionsFile, data),
    withWork,
    getEvents,
    logEvents,
    parsePlanFields,
    planChangeEvents,
    initialPlan,
    applyWorkAction,
    onStatusChange
};
