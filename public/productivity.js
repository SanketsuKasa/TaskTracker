// ========================================
// АНАЛИЗ ПРОДУКТИВНОСТИ (интерфейс)
// ----------------------------------------
// Работает только когда в Settings → Productivity включена галочка.
// Файл подключается ДО app.js: здесь только функции и обработчики,
// функции из app.js (api, render, tasks...) вызываются позже, во время работы.
// ========================================

let productivityOn = false;
let serverOffsetMs = 0;             // разница между часами сервера и компьютера

const STALE_HOURS = 3;              // через сколько часов спросить «вы всё ещё работаете?»
const FORECAST_MIN_SAMPLES = 3;     // сколько выполненных задач нужно для прогноза

const difficultyNames = {
    1: "Very easy",
    2: "Easy",
    3: "Medium",
    4: "Hard",
    5: "Very hard"
};

const priorityNames = {
    low: "Low",
    medium: "Medium",
    high: "High"
};


// ========================================
// ВКЛ / ВЫКЛ
// ========================================

const productivityToggle = document.querySelector("#productivityToggle");
const productivityMessage = document.querySelector("#productivityMessage");

function applyProductivityMode(on) {

    productivityOn = Boolean(on);

    document.body.classList.toggle("productivity-on", productivityOn);
    productivityToggle.checked = productivityOn;

    document.querySelector("#deadlineLabel").textContent =
        productivityOn ? "External deadline (optional)" : "Deadline";

    // Если открыта страница с графиками — сразу показываем их
    if (productivityOn && typeof loadAnalytics === "function") loadAnalytics();

    // Неоновый график на фоне работает только вместе с анализом
    if (typeof updateGlow === "function") {
        updateGlow();
        if (appearanceLoaded) fillAppearanceForm();
    }
}

productivityToggle.addEventListener("change", async () => {

    const wanted = productivityToggle.checked;

    try {

        const response = await api("/api/settings", {
            method: "PATCH",
            body: JSON.stringify({ productivityEnabled: wanted })
        });

        const user = await response.json();

        if (!response.ok) {
            throw new Error(user.error || "Error");
        }

        saveUser(user);
        render();

        productivityMessage.classList.remove("error");
        productivityMessage.textContent = wanted
            ? "✓ Productivity analysis is on. New fields appear when you create a task."
            : "✓ Turned off. Your history is kept.";

    } catch (error) {

        productivityToggle.checked = !wanted;
        productivityMessage.classList.add("error");
        productivityMessage.textContent = error.message;

    }
});


// ========================================
// ВРЕМЯ
// ========================================

function serverNow() {
    return Date.now() + serverOffsetMs;
}

function syncServerTime(response) {
    const header = response.headers.get("X-Server-Time");
    if (header) serverOffsetMs = new Date(header).getTime() - Date.now();
}

// Активное время задачи: сумма закрытых сессий + текущая (по меткам времени)
function activeSecondsOf(task) {

    const work = task.work || {};
    let seconds = work.totalSeconds || 0;

    if (work.activeStartedAt) {
        seconds += Math.max(0, Math.floor((serverNow() - new Date(work.activeStartedAt)) / 1000));
    }

    return seconds;
}

// 3725 → "1:02:05"
function formatClock(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor(totalSeconds % 3600 / 60);
    const s = totalSeconds % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// 85 → "1h 25m"
function formatMinutes(minutes) {
    minutes = Math.round(minutes);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
}

// "2026-10-21T15:30" → "21 Oct, 15:30"
function formatDateTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    });
}


// ========================================
// КАРТОЧКА ЗАДАЧИ
// ========================================

function starsText(n) {
    return "★".repeat(n) + "☆".repeat(5 - n);
}

// Подпись под статусом: «Working now» / «Paused»
function workStateHtml(task) {

    if (!productivityOn || task.status !== "progress") return "";

    if (task.workState === "active") {
        return `<span class="work-state active"><i></i>Working now</span>`;
    }

    return `<span class="work-state paused">Paused</span>`;
}

function isStale(task) {

    const work = task.work || {};
    if (!work.activeStartedAt) return false;

    const since = new Date(work.activeConfirmedAt || work.activeStartedAt);
    return serverNow() - since > STALE_HOURS * 3600 * 1000;
}

// Дополнительная строка на карточке: сложность, приоритет, время, кнопки
function productivityRowHtml(task) {

    if (!productivityOn) return "";

    const seconds = activeSecondsOf(task);
    const running = Boolean(task.work && task.work.activeStartedAt);
    const parts = [];

    if (task.difficulty) {
        parts.push(`<span class="mini-stars" title="Difficulty: ${difficultyNames[task.difficulty]}">${starsText(task.difficulty)}</span>`);
    }

    if (task.priority && task.priority !== "medium") {
        parts.push(`<span class="priority-badge ${task.priority}">${priorityNames[task.priority]} priority</span>`);
    }

    // Время: «0:42:10 / est 1h»
    if (seconds || running || task.estimateMinutes) {

        let text = `<span class="${running ? "live-timer running" : "live-timer"}" data-timer="${task.id}">${formatClock(seconds)}</span>`;

        if (task.estimateMinutes) {
            text += ` <span class="estimate">/ est ${formatMinutes(task.estimateMinutes)}</span>`;

            // Для выполненных — насколько ошиблись с оценкой
            if (task.status === "done" && seconds >= 60) {
                const diff = Math.round((seconds / 60 / task.estimateMinutes - 1) * 100);
                const cls = Math.abs(diff) <= 15 ? "good" : diff > 0 ? "over" : "under";
                text += ` <span class="accuracy ${cls}">${diff > 0 ? "+" : ""}${diff}%</span>`;
            }
        }

        parts.push(`<span class="time-info">⏱ ${text}</span>`);
    }

    if (task.forecastSnapshot) {
        parts.push(`<span class="app-forecast" title="What the app predicted when the task was created">🤖 ${formatMinutes(task.forecastSnapshot.minutes)}</span>`);
    }

    if (task.plannedFinishAt && task.status !== "done") {
        parts.push(`<span class="planned-finish" title="Planned finish">🎯 ${formatDateTime(task.plannedFinishAt)}</span>`);
    }

    // Кнопки — только те, что подходят к состоянию задачи
    let buttons = "";

    if (task.status === "todo") {
        buttons = `<button type="button" class="work-btn start" data-action="start">▶ Start</button>`;
    } else if (task.status === "progress" && task.workState === "active") {
        buttons = `
            <button type="button" class="work-btn pause" data-action="pause">⏸ Pause</button>
            <button type="button" class="work-btn finish" data-action="finish">✓ Finish</button>`;
    } else if (task.status === "progress") {
        buttons = `
            <button type="button" class="work-btn resume" data-action="resume">▶ Resume</button>
            <button type="button" class="work-btn finish" data-action="finish">✓ Finish</button>`;
    } else {
        buttons = `<button type="button" class="work-btn reopen" data-action="reopen" title="Open again — history is kept">↺ Reopen</button>`;
    }

    // «Таймер идёт уже 5 часов — вы правда работали?»
    let staleHtml = "";

    if (isStale(task)) {
        const hours = formatMinutes((serverNow() - new Date(task.work.activeStartedAt)) / 60000);
        staleHtml = `
            <div class="stale-warning">
                <span>⏰ The timer has been running for <strong>${hours}</strong>. Were you working all this time?</span>
                <div class="stale-actions">
                    <button type="button" class="work-btn" data-action="confirm">Yes, keep it</button>
                    <span class="stale-stop">
                        I stopped at
                        <input type="datetime-local" class="stale-time">
                        <button type="button" class="work-btn pause" data-action="stop_at">Save</button>
                    </span>
                </div>
            </div>`;
    }

    return `
        <div class="work-row">
            <div class="work-info">${parts.join("")}</div>
            <div class="work-buttons">${buttons}</div>
        </div>
        ${staleHtml}`;
}

function bindProductivityRow(card, task) {

    card.querySelectorAll("[data-action]").forEach(button => {

        button.addEventListener("click", (event) => {

            event.stopPropagation();

            const action = button.dataset.action;

            if (action === "stop_at") {
                const value = card.querySelector(".stale-time").value;
                if (!value) {
                    showToast("Choose when you stopped working");
                    return;
                }
                workAction(task, "stop_at", { endedAt: new Date(value).toISOString() });
                return;
            }

            workAction(task, action);
        });
    });

    // Подставляем в «I stopped at» время начала + 1 час как подсказку
    const staleTime = card.querySelector(".stale-time");

    if (staleTime) {
        const start = new Date(task.work.activeStartedAt);
        staleTime.min = toLocalInput(start);
        staleTime.max = toLocalInput(new Date(serverNow()));
        staleTime.value = toLocalInput(new Date(start.getTime() + 3600 * 1000));
    }
}

// Date → "YYYY-MM-DDTHH:mm" для <input type="datetime-local">
function toLocalInput(date) {
    const pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const workToasts = {
    start: "▶ Started — the timer is running",
    resume: "▶ Back to work",
    pause: "⏸ Paused — break time is not counted",
    reset: "↺ Moved back to «Not started». History is kept",
    reopen: "↺ Task reopened",
    confirm: "✓ Got it, the timer keeps running",
    stop_at: "✓ Session saved with the corrected end time"
};

async function workAction(task, action, extra = {}) {

    try {

        const response = await api(`/api/tasks/${task.id}/work`, {
            method: "POST",
            body: JSON.stringify({ action, ...extra })
        });

        syncServerTime(response);

        const updated = await response.json();

        if (!response.ok) {
            throw new Error(updated.error || "Error");
        }

        Object.assign(task, updated);
        render();

        // Обновить неоновый график на фоне
        if (typeof refreshGlowData === "function") refreshGlowData();

        if (action === "finish") {
            celebrate(task);
        } else if (workToasts[action]) {
            showToast(workToasts[action]);
        }

    } catch (error) {

        showToast(error.message);

    }
}

// Живой таймер: каждую секунду обновляем только текст, сами данные — из меток времени
setInterval(() => {

    if (!productivityOn) return;

    document.querySelectorAll(".live-timer.running").forEach(el => {
        const task = tasks.find(t => t.id === Number(el.dataset.timer));
        if (task) el.textContent = formatClock(activeSecondsOf(task));
    });

}, 1000);


// ========================================
// ОКНО ЗАДАЧИ: звёзды, приоритет, оценка, прогноз
// ========================================

const difficultyStars = document.querySelector("#difficultyStars");
const difficultyHint = document.querySelector("#difficultyHint");
const prioritySegment = document.querySelector("#prioritySegment");
const energySegment = document.querySelector("#energySegment");
const loadSegment = document.querySelector("#loadSegment");
const estimateHours = document.querySelector("#estimateHours");
const estimateMins = document.querySelector("#estimateMins");
const taskTypeSelect = document.querySelector("#taskType");
const plannedFinishInput = document.querySelector("#plannedFinishAt");
const plannedStartInput = document.querySelector("#plannedStartAt");
const familiaritySelect = document.querySelector("#familiarity");
const forecastBox = document.querySelector("#forecastBox");
const resetWorkButton = document.querySelector("#resetWorkButton");

let formDifficulty = null;

function setDifficulty(value) {

    formDifficulty = value || null;

    difficultyStars.querySelectorAll("button").forEach(button => {
        button.classList.toggle("on", Number(button.dataset.value) <= (formDifficulty || 0));
    });

    difficultyHint.textContent = formDifficulty
        ? `${formDifficulty} — ${difficultyNames[formDifficulty]}`
        : "Not rated";

    updateForecast();
}

difficultyStars.querySelectorAll("button").forEach(button => {

    const value = Number(button.dataset.value);

    // Повторный клик по той же звезде — снять оценку
    button.addEventListener("click", () => setDifficulty(formDifficulty === value ? null : value));

    // Подсветка при наведении
    button.addEventListener("mouseenter", () => {
        difficultyStars.querySelectorAll("button").forEach(b => {
            b.classList.toggle("hover", Number(b.dataset.value) <= value);
        });
    });
});

difficultyStars.addEventListener("mouseleave", () => {
    difficultyStars.querySelectorAll("button").forEach(b => b.classList.remove("hover"));
});

// Сегментные кнопки (приоритет, энергия, нагрузка). allowEmpty — можно снять выбор
function setupSegment(segment, allowEmpty) {

    segment.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", () => {
            const already = button.classList.contains("on");
            setSegment(segment, already && allowEmpty ? "" : button.dataset.value);
        });
    });
}

function setSegment(segment, value) {
    segment.querySelectorAll("button").forEach(b => {
        b.classList.toggle("on", b.dataset.value === String(value ?? ""));
    });
}

function getSegment(segment) {
    const on = segment.querySelector("button.on");
    return on ? on.dataset.value : "";
}

setupSegment(prioritySegment, false);
setupSegment(energySegment, true);
setupSegment(loadSegment, true);

[estimateHours, estimateMins].forEach(input => input.addEventListener("input", updateForecast));
document.querySelector("#taskCategory").addEventListener("change", updateForecast);

function readEstimateMinutes() {
    const total = (Number(estimateHours.value) || 0) * 60 + (Number(estimateMins.value) || 0);
    return total > 0 ? Math.round(total) : null;
}

// Заполнить поля при открытии окна (task = null для новой задачи)
function productivityFillForm(task) {

    const t = task || {};

    setDifficulty(t.difficulty || null);
    setSegment(prioritySegment, t.priority || "medium");
    setSegment(energySegment, t.energy || "");
    setSegment(loadSegment, t.load || "");

    estimateHours.value = t.estimateMinutes ? Math.floor(t.estimateMinutes / 60) || "" : "";
    estimateMins.value = t.estimateMinutes ? t.estimateMinutes % 60 || "" : "";

    taskTypeSelect.value = t.taskType || "once";
    plannedFinishInput.value = t.plannedFinishAt || "";
    plannedStartInput.value = t.plannedStartAt || "";
    familiaritySelect.value = t.familiarity || "";

    // Кнопка «Вернуть в Не начато» — только для начатых задач
    resetWorkButton.style.display = productivityOn && task && task.status !== "todo" ? "" : "none";

    updateForecast();
}

// Прочитать поля для сохранения (только если анализ включён)
function productivityReadForm() {

    if (!productivityOn) return {};

    return {
        difficulty: formDifficulty,
        priority: getSegment(prioritySegment) || "medium",
        estimateMinutes: readEstimateMinutes(),
        taskType: taskTypeSelect.value,
        plannedFinishAt: plannedFinishInput.value,
        plannedStartAt: plannedStartInput.value,
        energy: getSegment(energySegment) || null,
        load: getSegment(loadSegment) || null,
        familiarity: familiaritySelect.value,
        forecastSnapshot: currentForecastSnapshot()
    };
}

resetWorkButton.addEventListener("click", async () => {
    if (!editingTask) return;
    const task = editingTask;
    closeTaskModal();
    await workAction(task, "reset");
});


// ========================================
// ПРОГНОЗ
// ----------------------------------------
// Сравниваем вашу оценку времени с реальным активным временем по выполненным задачам.
// Коэффициент = факт / оценка. Берём медиану по самым похожим задачам:
// та же категория и сложность → та же категория → та же сложность → все задачи.
// ========================================

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function forecastFor(category, difficulty, estimateMinutes) {

    const finished = tasks.filter(t =>
        t.status === "done" &&
        (t.work && t.work.totalSeconds >= 60) &&
        (!editingTask || t.id !== editingTask.id)
    );

    // Задачи, где была и оценка, и замеренное время — для коэффициента ошибки
    const rated = finished.filter(t => t.estimateMinutes > 0);

    const groupsFor = list => [
        { label: `${category} tasks of this difficulty`, list: list.filter(t => t.category === category && difficulty && t.difficulty === difficulty) },
        { label: `${category} tasks`, list: list.filter(t => t.category === category) },
        { label: "tasks of this difficulty", list: list.filter(t => difficulty && t.difficulty === difficulty) },
        { label: "all your tasks", list }
    ];

    // Уверенность: сколько примеров и насколько они разбросаны
    function confidence(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
        const spread = (q(0.75) - q(0.25)) / (median(values) || 1);
        if (values.length >= 10 && spread <= 0.4) return "high";
        if (values.length >= 5 && spread <= 0.8) return "medium";
        return "low";
    }

    // 1) Есть ваша оценка → корректируем её вашим личным коэффициентом
    if (estimateMinutes) {

        const group = groupsFor(rated).find(g => g.list.length >= FORECAST_MIN_SAMPLES);

        if (!group) {
            return { ready: false, count: rated.length };
        }

        const ratios = group.list.map(t => t.work.totalSeconds / 60 / t.estimateMinutes);
        const ratio = median(ratios);

        return {
            ready: true,
            mode: "ratio",
            ratio,
            count: group.list.length,
            label: group.label,
            confidence: confidence(ratios),
            minutes: estimateMinutes * ratio
        };
    }

    // 2) Оценки нет → сколько обычно длятся похожие выполненные задачи
    const group = groupsFor(finished).find(g => g.list.length >= FORECAST_MIN_SAMPLES);

    if (!group) {
        return { ready: false, count: rated.length };
    }

    const actual = group.list.map(t => t.work.totalSeconds / 60);

    return {
        ready: true,
        mode: "similar",
        count: group.list.length,
        label: group.label,
        confidence: confidence(actual),
        minutes: median(actual)
    };
}

let lastForecast = null;

const confidenceNames = {
    low: "Low confidence",
    medium: "Medium confidence",
    high: "High confidence"
};

function updateForecast() {

    if (!productivityOn) return;

    const estimate = readEstimateMinutes();
    const result = forecastFor(taskCategory.value, formDifficulty, estimate);

    lastForecast = result.ready ? result : null;

    if (!result.ready) {
        forecastBox.className = "forecast waiting";
        forecastBox.innerHTML = `
            <div class="forecast-label">🤖 Predicted by the app</div>
            <div class="forecast-text">Not enough history yet. The forecast appears after <strong>${FORECAST_MIN_SAMPLES} finished tasks</strong> with your time estimate and tracked time (you have ${result.count}).</div>`;
        return;
    }

    let explanation;

    if (result.mode === "ratio") {
        const times = `×${result.ratio.toFixed(2).replace(/\.?0+$/, "")}`;
        explanation = result.ratio > 1.1
            ? `On ${escapeHtml(result.label)} you usually work <strong>${times}</strong> longer than you plan.`
            : result.ratio < 0.9
                ? `On ${escapeHtml(result.label)} you usually finish faster: <strong>${times}</strong> of your plan.`
                : `On ${escapeHtml(result.label)} your estimates are usually accurate.`;
    } else {
        explanation = `Similar ${escapeHtml(result.label)} usually take this long. Add your own estimate for a personal correction.`;
    }

    forecastBox.className = `forecast ${result.confidence}`;
    forecastBox.innerHTML = `
        <div class="forecast-head">
            <div>
                <div class="forecast-label">🤖 Predicted by the app</div>
                <div class="forecast-value">~${formatMinutes(result.minutes)} <small>of active work</small></div>
            </div>
            <span class="confidence ${result.confidence}" title="Based on how many similar tasks you have and how stable they are">${confidenceNames[result.confidence]}</span>
        </div>
        <div class="forecast-text">${explanation} <span>Based on ${result.count} finished tasks.</span></div>`;
}

// Прогноз, который сохраним вместе с новой задачей
function currentForecastSnapshot() {

    if (!lastForecast || editingTask) return null;

    return {
        minutes: Math.round(lastForecast.minutes),
        ratio: lastForecast.ratio || null,
        basis: `${lastForecast.mode}: ${lastForecast.label}`,
        samples: lastForecast.count,
        algorithm: "v1-median"
    };
}
