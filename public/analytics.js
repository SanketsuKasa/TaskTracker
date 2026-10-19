// ========================================
// ГРАФИКИ И АНАЛИТИКА ПРОДУКТИВНОСТИ
// ----------------------------------------
// Settings → Productivity (видно только когда анализ включён).
// Всё считается по реальным рабочим сессиям (метки начала и конца).
// Длительность работы ≠ продуктивность: показываем факты, а не «оценку человека».
// ========================================

// Цвета категорий: проверенная палитра для тёмного фона (порядок важен —
// соседние цвета различимы и при нарушениях цветового зрения).
// Цвет закреплён за категорией по её месту в списке, а не по рангу на графике.
const CHART_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const OTHER_COLOR = "#6b7180";

const analyticsState = {
    mode: "week",           // day | week | month
    anchor: new Date(),     // какой период показываем
    sessions: []
};

const periodSwitch = document.querySelector("#periodSwitch");
const periodLabel = document.querySelector("#periodLabel");
const periodNext = document.querySelector("#periodNext");
const chartTooltip = document.querySelector("#chartTooltip");


// ========================================
// ЗАГРУЗКА И ПЕРИОДЫ
// ========================================

function analyticsVisible() {
    return productivityOn &&
        document.querySelector("#main").dataset.view === "settings" &&
        document.querySelector('.settings-panel[data-panel="productivity"]').classList.contains("active");
}

async function loadAnalytics() {

    if (!analyticsVisible()) return;

    try {
        const response = await api("/api/productivity/sessions");
        syncServerTime(response);
        analyticsState.sessions = await response.json();
    } catch (error) {
        console.error(error);
    }

    renderAnalytics();
}

function periodRange() {

    const a = analyticsState.anchor;
    let start, end, buckets;

    if (analyticsState.mode === "day") {
        start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
        end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
        buckets = Array.from({ length: 24 }, (_, h) => ({
            start: new Date(start.getFullYear(), start.getMonth(), start.getDate(), h),
            end: new Date(start.getFullYear(), start.getMonth(), start.getDate(), h + 1),
            label: String(h),
            title: `${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00`
        }));
    } else if (analyticsState.mode === "week") {
        const offset = (a.getDay() + 6) % 7;
        start = new Date(a.getFullYear(), a.getMonth(), a.getDate() - offset);
        end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
        buckets = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
            return {
                start: d,
                end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
                label: d.toLocaleDateString("en-GB", { weekday: "short" }),
                title: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })
            };
        });
    } else {
        start = new Date(a.getFullYear(), a.getMonth(), 1);
        end = new Date(a.getFullYear(), a.getMonth() + 1, 1);
        const days = Math.round((end - start) / 86400000);
        buckets = Array.from({ length: days }, (_, i) => {
            const d = new Date(start.getFullYear(), start.getMonth(), i + 1);
            return {
                start: d,
                end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
                label: String(i + 1),
                title: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
            };
        });
    }

    return { start, end, buckets };
}

function periodTitle(range) {

    if (analyticsState.mode === "day") {
        return range.start.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    }

    if (analyticsState.mode === "week") {
        const last = new Date(range.end - 86400000);
        const f = d => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        return `${f(range.start)} – ${f(last)}`;
    }

    return range.start.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function shiftPeriod(direction) {

    const a = analyticsState.anchor;

    if (analyticsState.mode === "day") {
        analyticsState.anchor = new Date(a.getFullYear(), a.getMonth(), a.getDate() + direction);
    } else if (analyticsState.mode === "week") {
        analyticsState.anchor = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7 * direction);
    } else {
        analyticsState.anchor = new Date(a.getFullYear(), a.getMonth() + direction, 1);
    }

    renderAnalytics();
}

periodSwitch.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
        analyticsState.mode = button.dataset.value;
        renderAnalytics();
    });
});

document.querySelector("#periodPrev").addEventListener("click", () => shiftPeriod(-1));
periodNext.addEventListener("click", () => shiftPeriod(1));
document.querySelector("#periodToday").addEventListener("click", () => {
    analyticsState.anchor = new Date();
    renderAnalytics();
});

let resizeTimer = null;
window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (analyticsVisible()) renderAnalytics(); }, 150);
});


// ========================================
// ДАННЫЕ
// ========================================

// Категории для графиков: первые 8 по порядку в вашем списке, остальные → «Other»
function chartCategories() {

    const names = categories.map(c => c.name);
    const list = names.slice(0, CHART_COLORS.length).map((name, i) => ({ name, color: CHART_COLORS[i] }));

    return {
        list,
        colorOf(name) {
            const found = list.find(c => c.name === name);
            return found ? found.color : OTHER_COLOR;
        },
        keyOf(name) {
            return list.some(c => c.name === name) ? name : "Other";
        }
    };
}

function sessionEnd(s) {
    return s.endedAt ? new Date(s.endedAt) : new Date(serverNow());
}

// Секунды пересечения двух интервалов
function overlapSeconds(aStart, aEnd, bStart, bEnd) {
    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);
    return Math.max(0, (end - start) / 1000);
}

function collectAnalytics() {

    const range = periodRange();
    const cats = chartCategories();
    const byId = new Map(tasks.map(t => [t.id, t]));

    const sessions = analyticsState.sessions
        .map(s => ({ ...s, start: new Date(s.startedAt), end: sessionEnd(s), task: byId.get(s.taskId) }))
        .filter(s => s.end > s.start);

    const inRange = sessions
        .filter(s => s.start < range.end && s.end > range.start)
        .sort((a, b) => a.start - b.start);

    // ---------- Активное время по категориям в каждом столбике ----------
    const keys = [...cats.list.map(c => c.name), "Other"];

    const buckets = range.buckets.map(bucket => {
        const values = Object.fromEntries(keys.map(k => [k, 0]));
        inRange.forEach(s => {
            const sec = overlapSeconds(s.start, s.end, bucket.start, bucket.end);
            if (sec) values[cats.keyOf(s.task ? s.task.category || "Development" : "Other")] += sec;
        });
        return { ...bucket, values, total: Object.values(values).reduce((a, b) => a + b, 0) };
    });

    const usedKeys = keys.filter(k => buckets.some(b => b.values[k] > 0));
    const totalSeconds = buckets.reduce((sum, b) => sum + b.total, 0);

    // ---------- Задачи периода ----------
    const inPeriod = d => d && new Date(d) >= range.start && new Date(d) < range.end;
    const taskIdsWithWork = new Set(inRange.map(s => s.taskId));

    const completed = tasks.filter(t => t.status === "done" && inPeriod(t.completedAt));

    const periodTasks = tasks.filter(t =>
        inPeriod(t.createdAt) || inPeriod(t.completedAt) || taskIdsWithWork.has(t.id)
    );

    return { range, cats, sessions, inRange, buckets, usedKeys, totalSeconds, completed, periodTasks };
}


// ========================================
// ГЛАВНАЯ ПЕРЕРИСОВКА
// ========================================

function renderAnalytics() {

    if (!productivityOn) return;

    const data = collectAnalytics();

    periodSwitch.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.value === analyticsState.mode));
    periodLabel.textContent = periodTitle(data.range);
    periodNext.disabled = data.range.end > new Date(serverNow());

    renderTiles(data);
    renderActivityChart(data);
    renderTrendChart(data);
    renderWorkStyle(data);
    renderBalance(data);
}


// ========================================
// КАРТОЧКИ-ЦИФРЫ
// ========================================

function renderTiles(data) {

    const lengths = data.inRange.map(s => (s.end - s.start) / 60000);

    const tiles = [
        { label: "Active time", value: data.totalSeconds ? formatMinutes(data.totalSeconds / 60) : "0m", note: "tracked work, breaks excluded" },
        { label: "Tasks completed", value: data.completed.length, note: "finished in this period" },
        { label: "Work sessions", value: data.inRange.length, note: data.inRange.length ? `median ${formatMinutes(median(lengths))}` : "no sessions yet" },
        { label: "Tasks worked on", value: new Set(data.inRange.map(s => s.taskId)).size, note: "had at least one session" }
    ];

    document.querySelector("#analyticsTiles").innerHTML = tiles.map(t => `
        <div class="analytics-tile">
            <span>${t.label}</span>
            <strong>${t.value}</strong>
            <small>${t.note}</small>
        </div>`).join("");
}


// ========================================
// ГРАФИК: активное время по категориям (столбики с накоплением)
// ========================================

function niceStep(max) {
    // Шаг сетки в минутах: 5, 10, 15, 30, 60, 120...
    const steps = [5, 10, 15, 30, 60, 120, 180, 240, 360, 480, 720];
    const target = max / 4;
    return steps.find(s => s >= target) || 720;
}

function renderActivityChart(data) {

    const box = document.querySelector("#activityChart");
    const legend = document.querySelector("#activityLegend");
    const table = document.querySelector("#activityTable");

    document.querySelector("#activityHint").textContent =
        analyticsState.mode === "day" ? "Active minutes in each hour" : "Active time each day";

    if (!data.totalSeconds) {
        box.innerHTML = `<div class="chart-empty">No tracked work in this period. Press ▶ Start on a task to begin.</div>`;
        legend.innerHTML = "";
        table.innerHTML = "";
        return;
    }

    const width = Math.max(300, box.clientWidth || 600);
    const height = 240;
    const pad = { top: 12, right: 8, bottom: 26, left: 44 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxMin = Math.max(...data.buckets.map(b => b.total / 60), 1);
    const step = niceStep(maxMin);
    const top = Math.ceil(maxMin / step) * step;
    const y = min => pad.top + plotH - (min / top) * plotH;

    const n = data.buckets.length;
    const slot = plotW / n;
    const barW = Math.max(3, Math.min(28, slot * 0.62));

    const fmtAxis = m => step >= 60 ? `${m / 60}h` : `${m}m`;

    let svg = `<svg width="${width}" height="${height}" role="img" aria-label="Active time by category">`;

    // Сетка и подписи оси
    for (let m = 0; m <= top; m += step) {
        svg += `<line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(m)}" y2="${y(m)}"/>`;
        svg += `<text class="axis" x="${pad.left - 8}" y="${y(m) + 4}" text-anchor="end">${fmtAxis(m)}</text>`;
    }

    // Подписи по оси X — не все, если их много
    const every = n > 24 ? 3 : n > 14 ? 2 : 1;

    data.buckets.forEach((bucket, i) => {

        const cx = pad.left + slot * i + slot / 2;
        let base = 0;

        // Сегменты снизу вверх в постоянном порядке категорий
        const segs = data.usedKeys.filter(k => bucket.values[k] > 0);

        segs.forEach((key, j) => {

            const minutes = bucket.values[key] / 60;
            const y1 = y(base + minutes);
            const y0 = y(base);
            const h = Math.max(0, y0 - y1);
            const isTop = j === segs.length - 1;
            const x = cx - barW / 2;
            const color = data.cats.colorOf(key);

            if (isTop && h > 4) {
                // Верхний сегмент со скруглённым верхом
                const r = Math.min(4, barW / 2, h);
                svg += `<path fill="${color}" d="M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 + r} V${y0} Z"/>`;
            } else {
                svg += `<rect fill="${color}" x="${x}" y="${y1}" width="${barW}" height="${h}"/>`;
            }

            // 2px зазор между сегментами цвета фона
            if (j > 0) {
                svg += `<line class="seg-gap" x1="${x}" x2="${x + barW}" y1="${y0}" y2="${y0}"/>`;
            }

            base += minutes;
        });

        if (i % every === 0) {
            svg += `<text class="axis" x="${cx}" y="${height - 8}" text-anchor="middle">${bucket.label}</text>`;
        }

        // Невидимая зона наведения на весь столбец
        svg += `<rect class="hit" data-bucket="${i}" x="${pad.left + slot * i}" y="${pad.top}" width="${slot}" height="${plotH}"/>`;
    });

    svg += `<line class="baseline" x1="${pad.left}" x2="${width - pad.right}" y1="${y(0)}" y2="${y(0)}"/>`;
    svg += `</svg>`;

    box.innerHTML = svg;

    // Подсказка при наведении
    box.querySelectorAll(".hit").forEach(hit => {

        const bucket = data.buckets[Number(hit.dataset.bucket)];

        hit.addEventListener("mousemove", (event) => {
            const rows = data.usedKeys
                .filter(k => bucket.values[k] > 0)
                .map(k => `<div class="tt-row"><i style="background:${data.cats.colorOf(k)}"></i>${escapeHtml(k)}<b>${formatMinutes(bucket.values[k] / 60)}</b></div>`)
                .join("");
            showChartTooltip(event, `
                <div class="tt-title">${bucket.title}</div>
                ${rows || `<div class="tt-row muted">No tracked work</div>`}
                ${rows ? `<div class="tt-total">Total <b>${formatMinutes(bucket.total / 60)}</b></div>` : ""}`);
        });

        hit.addEventListener("mouseleave", hideChartTooltip);
    });

    // Легенда (≥ 2 категорий) с итогами
    legend.innerHTML = data.usedKeys.map(k => {
        const sec = data.buckets.reduce((sum, b) => sum + b.values[k], 0);
        return `<span><i style="background:${data.cats.colorOf(k)}"></i>${escapeHtml(k)} <b>${formatMinutes(sec / 60)}</b></span>`;
    }).join("");

    // Таблица (доступность)
    table.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Period</th>${data.usedKeys.map(k => `<th>${escapeHtml(k)}</th>`).join("")}<th>Total</th></tr></thead>
            <tbody>${data.buckets.filter(b => b.total).map(b => `
                <tr><td>${b.title}</td>${data.usedKeys.map(k => `<td>${b.values[k] ? formatMinutes(b.values[k] / 60) : "—"}</td>`).join("")}<td><b>${formatMinutes(b.total / 60)}</b></td></tr>`).join("")}
            </tbody>
        </table>`;
}


// ========================================
// ГРАФИК-ЛИНИЯ: тренд активного времени по категориям
// ========================================

const hiddenTrendSeries = new Set();

// Плавная кривая без «выбросов» ниже нуля (монотонная интерполяция Фрича–Карлсона)
function smoothPath(points) {

    if (points.length < 2) return "";

    const n = points.length;
    const dx = [], dy = [], m = [];

    for (let i = 0; i < n - 1; i++) {
        dx[i] = points[i + 1][0] - points[i][0];
        dy[i] = points[i + 1][1] - points[i][1];
        m[i] = dy[i] / dx[i];
    }

    const t = [m[0]];
    for (let i = 1; i < n - 1; i++) {
        t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    }
    t[n - 1] = m[n - 2];

    for (let i = 0; i < n - 1; i++) {
        if (m[i] === 0) {
            t[i] = 0;
            t[i + 1] = 0;
            continue;
        }
        const a = t[i] / m[i];
        const b = t[i + 1] / m[i];
        const s = a * a + b * b;
        if (s > 9) {
            const k = 3 / Math.sqrt(s);
            t[i] = k * a * m[i];
            t[i + 1] = k * b * m[i];
        }
    }

    let d = `M${points[0][0]},${points[0][1]}`;

    for (let i = 0; i < n - 1; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        const h = dx[i] / 3;
        d += ` C${x0 + h},${y0 + t[i] * h} ${x1 - h},${y1 - t[i + 1] * h} ${x1},${y1}`;
    }

    return d;
}

function renderTrendChart(data) {

    const box = document.querySelector("#trendChart");
    const legend = document.querySelector("#trendLegend");

    if (!data.totalSeconds) {
        box.innerHTML = `<div class="chart-empty">No tracked work in this period yet.</div>`;
        legend.innerHTML = "";
        return;
    }

    const keys = data.usedKeys;
    const visible = keys.filter(k => !hiddenTrendSeries.has(k));

    const width = Math.max(300, box.clientWidth || 600);
    const height = 260;
    const pad = { top: 44, right: 16, bottom: 26, left: 44 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const n = data.buckets.length;
    const x = i => pad.left + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));

    const maxMin = Math.max(1, ...visible.flatMap(k => data.buckets.map(b => b.values[k] / 60)));
    const step = niceStep(maxMin);
    const top = Math.ceil(maxMin / step) * step;
    const y = min => pad.top + plotH - (min / top) * plotH;
    const fmtAxis = m => step >= 60 ? `${m / 60}h` : `${m}m`;

    let svg = `<svg width="${width}" height="${height}" role="img" aria-label="Active time trend by category">`;

    for (let m = 0; m <= top; m += step) {
        svg += `<line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(m)}" y2="${y(m)}"/>`;
        svg += `<text class="axis" x="${pad.left - 8}" y="${y(m) + 4}" text-anchor="end">${fmtAxis(m)}</text>`;
    }

    const every = n > 24 ? 3 : n > 14 ? 2 : 1;
    data.buckets.forEach((b, i) => {
        if (i % every === 0) {
            svg += `<text class="axis" x="${x(i)}" y="${height - 8}" text-anchor="middle">${b.label}</text>`;
        }
    });

    // Мягкая заливка под линиями + сами линии
    visible.forEach(key => {
        const color = data.cats.colorOf(key);
        const pts = data.buckets.map((b, i) => [x(i), y(b.values[key] / 60)]);
        const line = smoothPath(pts);
        const gradId = `trend-${key.replace(/[^a-z0-9]/gi, "")}`;

        svg += `
            <defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
                    <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <path d="${line} L${pts[pts.length - 1][0]},${y(0)} L${pts[0][0]},${y(0)} Z" fill="url(#${gradId})"/>
            <path class="trend-line" d="${line}" stroke="${color}"/>`;
    });

    // Слой наведения: вертикальная линия, точки, подпись над точкой
    svg += `<line class="crosshair" id="trendCross" x1="0" x2="0" y1="${pad.top - 8}" y2="${y(0)}"/>`;
    svg += `<g id="trendDots"></g>`;
    svg += `<g id="trendBadge" class="trend-badge" style="display:none">
                <rect rx="8" ry="8" height="36"/>
                <text class="badge-title" y="15"></text>
                <text class="badge-sub" y="29"></text>
            </g>`;
    svg += `<rect class="hit" x="${pad.left - 10}" y="${pad.top - 10}" width="${plotW + 20}" height="${plotH + 10}"/>`;
    svg += `</svg>`;

    box.innerHTML = svg;

    const svgEl = box.querySelector("svg");
    const cross = svgEl.querySelector("#trendCross");
    const dots = svgEl.querySelector("#trendDots");
    const badge = svgEl.querySelector("#trendBadge");
    const hit = svgEl.querySelector(".hit");

    function showAt(i, event) {

        const bucket = data.buckets[i];
        const cx = x(i);

        cross.setAttribute("x1", cx);
        cross.setAttribute("x2", cx);
        cross.classList.add("visible");

        dots.innerHTML = visible.map(k =>
            `<circle cx="${cx}" cy="${y(bucket.values[k] / 60)}" r="5" fill="${data.cats.colorOf(k)}" class="trend-dot"/>`
        ).join("");

        // Подпись над самой высокой точкой — как на образце
        const topKey = visible.reduce((best, k) => bucket.values[k] > bucket.values[best] ? k : best, visible[0]);
        const topY = y(bucket.values[topKey] / 60);
        const visibleTotal = visible.reduce((sum, k) => sum + bucket.values[k], 0);

        const title = badge.querySelector(".badge-title");
        const sub = badge.querySelector(".badge-sub");
        title.textContent = bucket.title;
        sub.textContent = visibleTotal ? `${formatMinutes(visibleTotal / 60)} of work` : "no tracked work";

        badge.style.display = "";
        const w = Math.max(title.getComputedTextLength(), sub.getComputedTextLength()) + 20;
        const bx = Math.min(Math.max(cx - w / 2, pad.left), width - pad.right - w);
        const by = Math.max(2, topY - 46);

        badge.querySelector("rect").setAttribute("width", w);
        badge.setAttribute("transform", `translate(${bx},${by})`);
        title.setAttribute("x", w / 2);
        sub.setAttribute("x", w / 2);

        // Подробности по категориям — в обычной подсказке
        const rows = visible
            .filter(k => bucket.values[k] > 0)
            .map(k => `<div class="tt-row"><i style="background:${data.cats.colorOf(k)}"></i>${escapeHtml(k)}<b>${formatMinutes(bucket.values[k] / 60)}</b></div>`)
            .join("");

        if (rows) {
            showChartTooltip(event, `<div class="tt-title">${bucket.title}</div>${rows}`);
        } else {
            hideChartTooltip();
        }
    }

    function hide() {
        cross.classList.remove("visible");
        dots.innerHTML = "";
        badge.style.display = "none";
        hideChartTooltip();
    }

    hit.addEventListener("mousemove", (event) => {
        const rect = svgEl.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const i = n === 1 ? 0 : Math.round(((px - pad.left) / plotW) * (n - 1));
        showAt(Math.max(0, Math.min(n - 1, i)), event);
    });

    hit.addEventListener("mouseleave", hide);

    // Легенда-переключатель
    legend.innerHTML = keys.map(k => `
        <button type="button" class="legend-toggle ${hiddenTrendSeries.has(k) ? "off" : ""}" data-key="${escapeHtml(k)}">
            <i style="background:${data.cats.colorOf(k)}"></i>${escapeHtml(k)}
        </button>`).join("");

    legend.querySelectorAll(".legend-toggle").forEach(button => {
        button.addEventListener("click", () => {
            const key = button.dataset.key;

            // Последнюю видимую линию не прячем
            if (!hiddenTrendSeries.has(key) && visible.length === 1) return;

            hiddenTrendSeries.has(key) ? hiddenTrendSeries.delete(key) : hiddenTrendSeries.add(key);
            renderTrendChart(data);
        });
    });
}


// ========================================
// КАК ВЫ РАБОТАЕТЕ: переключения, паузы, параллельные задачи
// ========================================

const MIN_OBSERVATIONS = 3;

function styleItem(icon, title, value, text, n, enough) {
    return `
        <div class="style-item ${enough ? "" : "not-enough"}">
            <div class="style-icon">${icon}</div>
            <div>
                <div class="style-title">${title}</div>
                <div class="style-value">${enough ? value : "Not enough data yet"}</div>
                <div class="style-text">${enough ? text : `Needs at least ${MIN_OBSERVATIONS} observations in this period.`}</div>
                <div class="style-n">Based on ${n} ${n === 1 ? "observation" : "observations"} · ${periodLabel.textContent}</div>
            </div>
        </div>`;
}

function renderWorkStyle(data) {

    const box = document.querySelector("#workStyle");
    const sessions = data.inRange;
    const byId = new Map(tasks.map(t => [t.id, t]));

    // ---------- 1. Переключения между задачами ----------
    // Переключение = следующая сессия по другой задаче, когда предыдущая ещё не завершена
    let switches = 0;
    for (let i = 1; i < sessions.length; i++) {
        const prev = sessions[i - 1];
        const cur = sessions[i];
        if (cur.taskId === prev.taskId) continue;
        const prevTask = byId.get(prev.taskId);
        const prevDone = prevTask && prevTask.completedAt && new Date(prevTask.completedAt) <= cur.start;
        if (!prevDone) switches++;
    }

    // Задачи, завершённые в периоде и имеющие сессии: сделаны «за один заход»
    // (между их первой и последней сессией не было сессий других задач)?
    const completedWithWork = data.completed.filter(t => data.sessions.some(s => s.taskId === t.id));

    const focused = completedWithWork.filter(task => {
        const own = data.sessions.filter(s => s.taskId === task.id);
        const first = Math.min(...own.map(s => s.start));
        const last = Math.max(...own.map(s => s.end));
        return !data.sessions.some(s => s.taskId !== task.id && s.start > first && s.start < last);
    });

    const focusShare = completedWithWork.length ? focused.length / completedWithWork.length : 0;
    const activeHours = data.totalSeconds / 3600;

    let focusValue, focusText;

    if (focusShare >= 0.6) {
        focusValue = `${Math.round(focusShare * 100)}% of tasks finished without switching`;
        focusText = "You usually stay with one task until it is done.";
    } else if (focusShare <= 0.3) {
        focusValue = `${switches} switches · ${activeHours ? (switches / activeHours).toFixed(1) : 0} per active hour`;
        focusText = "You often move between tasks before finishing them.";
    } else {
        focusValue = `${Math.round(focusShare * 100)}% finished in one go · ${switches} switches`;
        focusText = "A mixed style: some tasks in one go, others in parallel pieces.";
    }

    // ---------- 2. Паузы ----------
    const perTask = new Map();
    sessions.forEach(s => perTask.set(s.taskId, (perTask.get(s.taskId) || []).concat(s)));

    const breaks = [];
    perTask.forEach(list => {
        for (let i = 1; i < list.length; i++) {
            breaks.push((list[i].start - list[i - 1].end) / 60000);
        }
    });

    const sessionsPerTask = [...perTask.values()].map(list => list.length);
    const sessionLengths = sessions.map(s => (s.end - s.start) / 60000);

    const pausesMedian = sessionsPerTask.length ? median(sessionsPerTask) - 1 : 0;
    const pausesText = pausesMedian % 1 ? pausesMedian.toFixed(1) : String(pausesMedian);

    const pauseValue = sessionsPerTask.length
        ? `${pausesText} ${pausesMedian === 1 ? "pause" : "pauses"} per task (median)`
        : "";

    const pauseText = sessionLengths.length
        ? `Typical work block: ${formatMinutes(median(sessionLengths))}` +
          (breaks.length ? ` · typical break: ${formatMinutes(median(breaks))}` : " · no breaks recorded")
        : "";

    // ---------- 3. Сколько задач «в процессе» одновременно ----------
    // Задача открыта с первого старта до завершения (или до сейчас)
    const now = new Date(serverNow());
    const intervals = tasks
        .filter(t => t.firstStartedAt)
        .map(t => ({ start: new Date(t.firstStartedAt), end: t.completedAt ? new Date(t.completedAt) : now }))
        .filter(iv => iv.start < data.range.end && iv.end > data.range.start);

    // Сколько задач было «в процессе» в каждый день периода (только прошедшие дни)
    const days = analyticsState.mode === "day"
        ? [{ start: data.range.start, end: data.range.end }]
        : data.range.buckets.filter(b => b.start <= now);

    const perDay = days.map(d => intervals.filter(iv => iv.start < d.end && iv.end > d.start).length);
    const peak = perDay.length ? Math.max(...perDay) : 0;
    const avgOpen = perDay.length ? perDay.reduce((a, b) => a + b, 0) / perDay.length : 0;

    const parallelValue = analyticsState.mode === "day"
        ? `${peak} ${peak === 1 ? "task" : "tasks"} in progress this day`
        : `${avgOpen.toFixed(1)} tasks in progress on a typical day`;

    const parallelText = peak <= 1
        ? "You keep only one task open at a time."
        : analyticsState.mode === "day"
            ? "Started but not finished tasks count as in progress."
            : `Busiest day: ${peak} tasks in progress. Started but not finished tasks count.`;

    box.innerHTML =
        styleItem("🎯", "Focus or switching",
            focusValue, focusText,
            completedWithWork.length, completedWithWork.length >= MIN_OBSERVATIONS) +
        styleItem("⏸", "Pauses",
            pauseValue, pauseText,
            sessions.length, sessions.length >= MIN_OBSERVATIONS) +
        styleItem("🗂", "Tasks in parallel",
            parallelValue, parallelText,
            intervals.length, intervals.length >= 1) +
        `<p class="style-note">Working longer does not mean being more productive — these are patterns, not grades.</p>`;
}


// ========================================
// БАЛАНС ЖИЗНИ: кольцевая диаграмма по категориям
// Яркая часть сектора — доля выполненных задач в этой сфере
// ========================================

function arcPath(cx, cy, rOuter, rInner, a0, a1) {

    const p = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = p(rOuter, a0);
    const [x1, y1] = p(rOuter, a1);
    const [x2, y2] = p(rInner, a1);
    const [x3, y3] = p(rInner, a0);

    return `M${x0},${y0} A${rOuter},${rOuter} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rInner},${rInner} 0 ${large} 0 ${x3},${y3} Z`;
}

function renderBalance(data) {

    const box = document.querySelector("#balanceChart");
    const list = data.periodTasks;

    if (!list.length) {
        box.innerHTML = `<div class="chart-empty">No tasks in this period yet.</div>`;
        return;
    }

    // Группы по категориям в постоянном порядке
    const groups = new Map();
    list.forEach(t => {
        const key = data.cats.keyOf(t.category || "Development");
        const g = groups.get(key) || { key, total: 0, done: 0 };
        g.total++;
        if (t.status === "done") g.done++;
        groups.set(key, g);
    });

    const order = [...data.cats.list.map(c => c.name), "Other"];
    const slices = order.filter(k => groups.has(k)).map(k => groups.get(k));

    const total = list.length;
    const doneTotal = slices.reduce((s, g) => s + g.done, 0);

    const size = 220, cx = size / 2, cy = size / 2, rO = 100, rI = 62;
    const gap = slices.length > 1 ? 0.025 : 0;     // зазор между секторами
    let angle = 0;
    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Tasks by life area">`;

    slices.forEach((g, i) => {

        const sweep = (g.total / total) * Math.PI * 2;
        const a0 = angle + gap / 2;
        const a1 = angle + sweep - gap / 2;
        const color = data.cats.colorOf(g.key);

        if (sweep >= Math.PI * 2 - 0.001) {
            // Один сектор на весь круг — рисуем двумя половинами
            svg += `<path class="slice-dim" fill="${color}" d="${arcPath(cx, cy, rO, rI, 0, Math.PI)}"/>`;
            svg += `<path class="slice-dim" fill="${color}" d="${arcPath(cx, cy, rO, rI, Math.PI, Math.PI * 2 - 0.0001)}"/>`;
        } else {
            svg += `<path class="slice-dim" fill="${color}" d="${arcPath(cx, cy, rO, rI, a0, a1)}"/>`;
        }

        // Яркая заливка = доля выполненных
        if (g.done) {
            const doneEnd = a0 + (a1 - a0) * (g.done / g.total);
            const half = a0 + Math.min(Math.PI, doneEnd - a0);
            svg += `<path fill="${color}" d="${arcPath(cx, cy, rO, rI, a0, half)}"/>`;
            if (doneEnd > half) svg += `<path fill="${color}" d="${arcPath(cx, cy, rO, rI, half, doneEnd)}"/>`;
        }

        // Зона наведения
        svg += `<path class="slice-hit" data-slice="${i}" d="${arcPath(cx, cy, rO + 4, rI - 4, a0, Math.max(a0 + 0.01, a1))}"/>`;

        angle += sweep;
    });

    svg += `
        <text class="donut-value" x="${cx}" y="${cy - 2}" text-anchor="middle">${total}</text>
        <text class="donut-label" x="${cx}" y="${cy + 18}" text-anchor="middle">tasks · ${Math.round(doneTotal / total * 100)}% done</text>
    </svg>`;

    const legend = slices.map(g => `
        <div class="balance-row">
            <i style="background:${data.cats.colorOf(g.key)}"></i>
            <span class="balance-name">${escapeHtml(g.key)}</span>
            <span class="balance-count">${g.total} ${g.total === 1 ? "task" : "tasks"}</span>
            <span class="balance-bar"><span style="width:${g.done / g.total * 100}%;background:${data.cats.colorOf(g.key)}"></span></span>
            <span class="balance-done">${Math.round(g.done / g.total * 100)}% done</span>
        </div>`).join("");

    box.innerHTML = `
        <div class="balance-wrap">
            <div class="donut">${svg}</div>
            <div class="balance-legend">
                ${legend}
                <p class="style-n">Pale part — tasks in this area · bright part — how many are done. ${periodLabel.textContent}</p>
            </div>
        </div>`;

    box.querySelectorAll(".slice-hit").forEach(hit => {
        const g = slices[Number(hit.dataset.slice)];
        hit.addEventListener("mousemove", (event) => showChartTooltip(event, `
            <div class="tt-title">${escapeHtml(g.key)}</div>
            <div class="tt-row">Tasks<b>${g.total} (${Math.round(g.total / total * 100)}%)</b></div>
            <div class="tt-row">Done<b>${g.done} (${Math.round(g.done / g.total * 100)}%)</b></div>`));
        hit.addEventListener("mouseleave", hideChartTooltip);
    });
}


// ========================================
// ПОДСКАЗКА
// ========================================

function showChartTooltip(event, html) {

    chartTooltip.innerHTML = html;
    chartTooltip.classList.add("visible");

    const pad = 14;
    const rect = chartTooltip.getBoundingClientRect();
    let x = event.clientX + pad;
    let y = event.clientY + pad;

    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;

    chartTooltip.style.left = `${x}px`;
    chartTooltip.style.top = `${y}px`;
}

function hideChartTooltip() {
    chartTooltip.classList.remove("visible");
}
