// ========================================
// ВНЕШНИЙ ВИД: цвета, фон, шармики, неоновый график
// ----------------------------------------
// Settings → Appearance. Всё сохраняется в аккаунте (и копия в браузере,
// чтобы тема применялась мгновенно при следующем открытии).
// ========================================

// Своя копия экранирования (app.js подключается позже)
function escHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const DEFAULT_APPEARANCE = {
    preset: "midnight",
    colors: null,                  // null = стандартная тема
    panelOpacity: 1,               // прозрачность панелей (видно фон)
    chartColors: null,             // свои цвета графиков (8 слотов)
    background: {
        type: "color",             // color | photo
        color1: "",                // "" = цвет фона темы
        color2: "#2a1f4d",
        gradient: false,
        angle: 160,
        photo: "",
        dim: 0.35,
        blur: 0
    },
    charms: {
        enabled: false,
        size: 1,
        items: []
    },
    glow: {
        enabled: false,
        intensity: 0.6
    }
};

let userAppearance = structuredClone(DEFAULT_APPEARANCE);
let appearanceLoaded = false;

function mergeAppearance(saved) {
    const s = saved || {};
    return {
        ...structuredClone(DEFAULT_APPEARANCE),
        ...s,
        background: { ...DEFAULT_APPEARANCE.background, ...(s.background || {}) },
        charms: { ...DEFAULT_APPEARANCE.charms, ...(s.charms || {}), items: (s.charms && s.charms.items) || [] },
        glow: { ...DEFAULT_APPEARANCE.glow, ...(s.glow || {}) }
    };
}

// Вызывается из app.js, когда пришли данные пользователя
function loadAppearanceFromUser(user) {

    if (appearanceLoaded) return;
    appearanceLoaded = true;

    userAppearance = mergeAppearance(user && user.appearance);
    cacheAppearance();
    applyAppearance();
    fillAppearanceForm();
}

function cacheAppearance() {
    try { localStorage.setItem("appearance", JSON.stringify(userAppearance)); } catch (error) { }
}

let appearanceSaveTimer = null;

// Сохранение с небольшой задержкой — чтобы не слать запрос на каждый сдвиг ползунка
function saveAppearance() {

    cacheAppearance();

    clearTimeout(appearanceSaveTimer);
    appearanceSaveTimer = setTimeout(async () => {
        try {
            const response = await api("/api/appearance", {
                method: "PUT",
                body: JSON.stringify({ appearance: userAppearance })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Error");
            setAppearanceStatus("✓ Saved");
        } catch (error) {
            setAppearanceStatus(error.message, true);
        }
    }, 600);
}

function setAppearanceStatus(text, isError) {
    const el = document.querySelector("#appearanceStatus");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("error", Boolean(isError));
    clearTimeout(setAppearanceStatus.timer);
    setAppearanceStatus.timer = setTimeout(() => { el.textContent = ""; }, 2500);
}

function applyAppearance() {
    applyThemeColors(userAppearance);
    applyBackground();
    renderCharms();
    updateGlow();

    // Графики продуктивности перерисовываются со своими цветами
    if (typeof analyticsVisible === "function" && analyticsVisible()) renderAnalytics();
}

// Цвета графиков: свои или стандартная проверенная палитра
function getChartColors() {
    const own = userAppearance.chartColors;
    return Array.isArray(own) && own.length === CHART_COLORS.length ? own : CHART_COLORS;
}

function themeAccent() {
    return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#7c5cff";
}


// ========================================
// ФОН: цвет или фото
// ========================================

const bgBase = document.querySelector("#bgBase");
const bgDim = document.querySelector("#bgDim");

function applyBackground() {

    const bg = userAppearance.background;

    if (bg.type === "photo" && bg.photo) {
        bgBase.style.background = `center / cover no-repeat url("${bg.photo}")`;
        bgBase.style.filter = bg.blur ? `blur(${bg.blur}px)` : "";
        bgBase.style.transform = bg.blur ? "scale(1.06)" : "";
        bgDim.style.opacity = bg.dim;
    } else {
        const c1 = bg.color1 || "var(--bg)";
        bgBase.style.background = bg.gradient
            ? `linear-gradient(${bg.angle}deg, ${c1}, ${bg.color2})`
            : c1;
        bgBase.style.filter = "";
        bgBase.style.transform = "";
        bgDim.style.opacity = 0;
    }

    document.body.classList.toggle("has-photo-bg", bg.type === "photo" && Boolean(bg.photo));
}


// ========================================
// ШАРМИКИ: маленькие неоновые фигурки с фразами
// ========================================

// Фигурки в рамке 100×100, центр (50, 50), радиус ~28 (вокруг — кольцо текста)
const CHARM_SHAPES = {
    star: { name: "Star", svg: `<polygon points="50,22 56.5,41 76.6,41.4 60.5,53.5 66.4,72.6 50,61.2 33.6,72.6 39.5,53.5 23.4,41.4 43.5,41"/>` },
    heart: { name: "Heart", svg: `<path d="M50,72 C30,58 24,47 24,38 C24,29 31,24 38,24 C44,24 48,28 50,32 C52,28 56,24 62,24 C69,24 76,29 76,38 C76,47 70,58 50,72 Z"/>` },
    moon: { name: "Moon", svg: `<path d="M60,24 C46,26 36,37 36,50 C36,63 46,74 60,76 C52,79 40,77 32,70 C21,60 21,40 32,30 C40,23 52,21 60,24 Z"/><circle cx="66" cy="36" r="1.6"/><circle cx="71" cy="52" r="1.1"/>` },
    flower: { name: "Flower", svg: `<circle cx="50" cy="35" r="10"/><circle cx="63" cy="44" r="10"/><circle cx="58" cy="60" r="10"/><circle cx="42" cy="60" r="10"/><circle cx="37" cy="44" r="10"/><circle cx="50" cy="50" r="5"/>` },
    sparkle: { name: "Sparkle", svg: `<path d="M50,20 C52,40 60,48 80,50 C60,52 52,60 50,80 C48,60 40,52 20,50 C40,48 48,40 50,20 Z"/><path d="M70,26 C70.6,30 72,31.4 76,32 C72,32.6 70.6,34 70,38 C69.4,34 68,32.6 64,32 C68,31.4 69.4,30 70,26 Z"/>` },
    snowflake: { name: "Snowflake", svg: `<path d="M50,22 V78 M25.8,36 L74.2,64 M25.8,64 L74.2,36 M50,30 L45,25 M50,30 L55,25 M50,70 L45,75 M50,70 L55,75 M32.7,40 L26,41.8 M32.7,40 L30.9,33.3 M67.3,60 L74,58.2 M67.3,60 L69.1,66.7 M32.7,60 L30.9,66.7 M32.7,60 L26,58.2 M67.3,40 L69.1,33.3 M67.3,40 L74,41.8"/>` },
    diamond: { name: "Crystal", svg: `<path d="M50,22 L72,42 L50,78 L28,42 Z M28,42 H72 M40,42 L50,22 L60,42 M40,42 L50,78 L60,42"/>` },
    cloud: { name: "Cloud", svg: `<path d="M34,64 C26,64 22,58 22,53 C22,47 27,43 32,43 C33,35 40,30 47,30 C55,30 61,35 63,42 C70,42 78,47 78,54 C78,60 73,64 67,64 Z"/>` },
    butterfly: { name: "Butterfly", svg: `<path d="M50,36 V68 M50,40 C44,28 28,24 26,34 C24,44 36,50 50,50 C64,50 76,44 74,34 C72,24 56,28 50,40 Z M50,52 C42,52 32,56 34,64 C36,72 46,68 50,58 C54,68 64,72 66,64 C68,56 58,52 50,52 Z M50,36 L45,28 M50,36 L55,28"/>` }
};

const MOTIVATION_PHRASES = [
    "Ти можеш більше, ніж думаєш",
    "Маленькі кроки — теж рух уперед",
    "Дихай. Ти все встигаєш",
    "Прогрес важливіший за ідеал",
    "Ти вже на своєму шляху",
    "Зроби трішки — і стане легше",
    "Вір у себе, як у зорі",
    "Кожна задача — це крок",
    "Відпочинок — теж частина роботи",
    "Ти сяєш, навіть коли втомлена",
    "Одне за одним — і все вийде",
    "Зосередься на «зараз»",
    "Ти робиш краще, ніж здається",
    "Будь ніжною до себе",
    "Мрії люблять дії",
    "Почни з малого",
    "Твоя енергія — твоя магія",
    "Навіть зорі світять по черзі",
    "Сьогодні — гарний день почати",
    "Ти заслуговуєш на свої мрії",
    "Повільно — теж рахується",
    "Довіряй процесу",
    "Твоя наполегливість — суперсила",
    "Усе важливе починається з першого кроку"
];

const charmLayer = document.querySelector("#charmLayer");
const charmZoom = document.querySelector("#charmZoom");

function randomOf(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function newCharm(shape, phrase) {
    return {
        id: Math.random().toString(36).slice(2, 9),
        shape: CHARM_SHAPES[shape] ? shape : randomOf(Object.keys(CHARM_SHAPES)),
        phrase: String(phrase || randomOf(MOTIVATION_PHRASES)).slice(0, 80),
        x: 0.05 + Math.random() * 0.9,
        y: 0.06 + Math.random() * 0.88,
        scale: 0.85 + Math.random() * 0.35,
        tone: Math.random() < 0.5 ? "a" : "b"
    };
}

// SVG одного шармика: фигурка + фраза мелким шрифтом по кругу
function charmSvg(item, idPrefix = "c") {

    const ringId = `${idPrefix}-ring-${item.id}`;
    // Повторяем фразу, чтобы она обошла весь круг
    const text = `${item.phrase} ✦ `.repeat(item.phrase.length < 22 ? 3 : item.phrase.length < 40 ? 2 : 1);

    return `
        <svg viewBox="0 0 100 100" aria-hidden="true">
            <defs>
                <path id="${ringId}" d="M50,50 m-39,0 a39,39 0 1,1 78,0 a39,39 0 1,1 -78,0"/>
            </defs>
            <circle class="charm-ring" cx="50" cy="50" r="44"/>
            <g class="charm-shape">${CHARM_SHAPES[item.shape].svg}</g>
            <text class="charm-text"><textPath href="#${ringId}" textLength="242" lengthAdjust="spacing">${escHtml(text)}</textPath></text>
        </svg>`;
}

function renderCharms() {

    const c = userAppearance.charms;
    charmLayer.innerHTML = "";
    charmLayer.style.display = c.enabled ? "" : "none";

    if (!c.enabled) return;

    c.items.forEach((item, i) => {

        const el = document.createElement("div");
        el.className = `charm tone-${item.tone || "a"}`;
        el.dataset.id = item.id;

        const size = Math.round(72 * (c.size || 1) * (item.scale || 1));
        el.style.left = `${item.x * 100}%`;
        el.style.top = `${item.y * 100}%`;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;

        // Плавание: у каждого свой ритм
        const float = document.createElement("div");
        float.className = "charm-float";
        float.style.animationDuration = `${7 + (i * 1.7) % 5}s`;
        float.style.animationDelay = `${-(i * 1.3) % 6}s`;

        const push = document.createElement("div");
        push.className = "charm-push";
        push.innerHTML = charmSvg(item);

        float.append(push);
        el.append(float);
        charmLayer.append(el);
    });

    cacheCharmRects();
}

// ---------- Реакция на мышку: шармики мягко отплывают ----------

let charmRects = [];

function cacheCharmRects() {
    charmRects = [...charmLayer.querySelectorAll(".charm")].map(el => {
        const r = el.getBoundingClientRect();
        return { el, push: el.querySelector(".charm-push"), cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2 };
    });
}

window.addEventListener("resize", () => cacheCharmRects());

let mouseFrame = null;
let lastMouse = null;

document.addEventListener("mousemove", (event) => {

    if (!userAppearance.charms.enabled || !charmRects.length) return;

    lastMouse = { x: event.clientX, y: event.clientY };

    if (mouseFrame) return;

    mouseFrame = requestAnimationFrame(() => {

        mouseFrame = null;
        const R = 130;

        charmRects.forEach(c => {
            const dx = c.cx - lastMouse.x;
            const dy = c.cy - lastMouse.y;
            const d = Math.hypot(dx, dy);

            if (d < R && d > 0.1) {
                const force = (1 - d / R) * 22;
                c.push.style.transform = `translate(${(dx / d) * force}px, ${(dy / d) * force}px) rotate(${(dx / d) * force * 0.6}deg)`;
                c.el.classList.add("near");
            } else if (c.el.classList.contains("near")) {
                c.push.style.transform = "";
                c.el.classList.remove("near");
            }
        });
    });
});

// ---------- Двойной клик — увеличить и прочитать фразу ----------

// Где двойной клик считается «по фону», а не по панели или кнопке
const NOT_BACKGROUND = "button, a, input, textarea, select, label, .sidebar, .stat-card, .tasks-section, .calendar-card, .profile-card, .settings-tabs, .analytics-tile, .modal-overlay, .header h1, .header p, .toast, .task-card";

let zoomedCharm = null;

document.addEventListener("dblclick", (event) => {

    if (zoomedCharm) {
        closeCharmZoom();
        return;
    }

    if (!userAppearance.charms.enabled) return;
    if (event.target.closest(NOT_BACKGROUND)) return;

    const hit = charmRects.find(c => Math.hypot(c.cx - event.clientX, c.cy - event.clientY) <= c.r);
    if (!hit) return;

    window.getSelection && window.getSelection().removeAllRanges();

    const item = userAppearance.charms.items.find(i => i.id === hit.el.dataset.id);
    if (item) openCharmZoom(item, hit);
});

function openCharmZoom(item, hit) {

    zoomedCharm = { item, hit };

    charmZoom.innerHTML = `
        <div class="charm-zoom-card tone-${item.tone || "a"}">
            <div class="charm-zoom-art">${charmSvg(item, "z")}</div>
            <p class="charm-zoom-phrase">${escHtml(item.phrase)}</p>
            <small>Double-click or press Esc to make it small again</small>
        </div>`;

    charmZoom.classList.add("visible");
    hit.el.classList.add("hidden-while-zoomed");

    // Вылетает из своего места на фоне (FLIP-анимация)
    const art = charmZoom.querySelector(".charm-zoom-art");
    const to = art.getBoundingClientRect();
    const scale = (hit.r * 2) / to.width;
    const dx = hit.cx - (to.left + to.width / 2);
    const dy = hit.cy - (to.top + to.height / 2);

    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        art.animate(
            [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.6 }, { transform: "none", opacity: 1 }],
            { duration: 520, easing: "cubic-bezier(.2,.9,.25,1.1)" }
        );
    }
}

function closeCharmZoom() {

    if (!zoomedCharm) return;

    const { hit } = zoomedCharm;
    const art = charmZoom.querySelector(".charm-zoom-art");
    zoomedCharm = null;

    const finish = () => {
        charmZoom.classList.remove("visible");
        charmZoom.innerHTML = "";
        hit.el.classList.remove("hidden-while-zoomed");
    };

    if (!art || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        finish();
        return;
    }

    const from = art.getBoundingClientRect();
    const scale = (hit.r * 2) / from.width;
    const dx = hit.cx - (from.left + from.width / 2);
    const dy = hit.cy - (from.top + from.height / 2);

    charmZoom.classList.add("closing");
    art.animate(
        [{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.7 }],
        { duration: 380, easing: "cubic-bezier(.5,0,.75,0)" }
    ).onfinish = () => {
        charmZoom.classList.remove("closing");
        finish();
    };
}

charmZoom.addEventListener("click", (event) => {
    if (event.target === charmZoom) closeCharmZoom();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && zoomedCharm) closeCharmZoom();
});


// ========================================
// НЕОНОВЫЙ ГРАФИК НА ФОНЕ (только активные участки)
// ========================================

const bgGlow = document.querySelector("#bgGlow");
let glowSessions = [];
let glowTimer = null;

async function refreshGlowData() {

    if (!userAppearance.glow.enabled || !productivityOn) return;

    try {
        const response = await api("/api/productivity/sessions");
        glowSessions = await response.json();
    } catch (error) {
        console.error(error);
    }

    drawGlow();
}

function updateGlow() {

    const on = userAppearance.glow.enabled && productivityOn;

    bgGlow.style.display = on ? "" : "none";
    clearInterval(glowTimer);

    if (!on) return;

    refreshGlowData();

    // Раз в минуту — перерисовать (идущая сессия растёт), раз в 5 минут — свежие данные
    let tick = 0;
    glowTimer = setInterval(() => {
        tick++;
        if (tick % 5 === 0) refreshGlowData();
        else drawGlow();
    }, 60000);
}

function drawGlow() {

    if (!userAppearance.glow.enabled || !productivityOn) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    // Последние 7 дней по 30 минут
    const step = 30 * 60 * 1000;
    const end = serverNow();
    const start = end - 7 * 24 * 3600 * 1000;
    const n = Math.ceil((end - start) / step);
    const values = new Array(n).fill(0);

    glowSessions.forEach(s => {
        const a = Math.max(start, new Date(s.startedAt).getTime());
        const b = Math.min(end, s.endedAt ? new Date(s.endedAt).getTime() : end);
        for (let t = a; t < b;) {
            const i = Math.floor((t - start) / step);
            const bucketEnd = start + (i + 1) * step;
            const part = Math.min(b, bucketEnd) - t;
            if (i >= 0 && i < n) values[i] += part / 60000;
            t += part;
        }
    });

    // Мягкое сглаживание (гаусс), чтобы вместо острых пиков были плавные волны
    const sigma = 3;
    const kernel = [];
    for (let k = -3 * sigma; k <= 3 * sigma; k++) kernel.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
    const ksum = kernel.reduce((a, b) => a + b, 0);
    const raw = values.slice();
    for (let i = 0; i < n; i++) {
        let acc = 0;
        kernel.forEach((kv, j) => {
            const idx = i + j - 3 * sigma;
            if (idx >= 0 && idx < n) acc += raw[idx] * kv;
        });
        values[i] = acc / ksum;
    }

    const max = Math.max(...values, 1);
    const minVisible = max * 0.04;
    const x = i => (i / (n - 1)) * w;
    const base = h * 0.9;
    const y = v => base - (v / max) * h * 0.42;

    // Разбиваем на «живые» участки — без длинной прямой по нулю
    const runs = [];
    let run = null;

    values.forEach((v, i) => {
        if (v > minVisible) {
            if (!run) run = { from: Math.max(0, i - 1), to: i };
            run.to = i;
        } else if (run && i - run.to > 2) {
            run.to = Math.min(n - 1, run.to + 1);
            runs.push(run);
            run = null;
        }
    });
    if (run) runs.push({ ...run, to: Math.min(n - 1, run.to + 1) });

    const intensity = userAppearance.glow.intensity;
    const color = themeAccent();

    const paths = runs.map(r => {
        const pts = [];
        for (let i = r.from; i <= r.to; i++) pts.push([x(i), y(values[i])]);
        return pts.length > 1 ? smoothPath(pts) : "";
    }).filter(Boolean);

    bgGlow.setAttribute("viewBox", `0 0 ${w} ${h}`);
    bgGlow.style.color = color;
    bgGlow.style.opacity = intensity;
    bgGlow.innerHTML = paths.map((d, i) => `
        <path class="glow-wide" d="${d}" stroke="${color}"/>
        <path class="glow-line" d="${d}" stroke="${color}"/>
        <path class="glow-spark" d="${d}" style="animation-delay:${-i * 1.7}s"/>`).join("");
}

window.addEventListener("resize", () => {
    clearTimeout(drawGlow.timer);
    drawGlow.timer = setTimeout(drawGlow, 200);
});


// ========================================
// НАСТРОЙКИ: Settings → Appearance
// ========================================

const COLOR_FIELDS = [
    { key: "bg", label: "Background" },
    { key: "panel", label: "Panels" },
    { key: "border", label: "Lines & borders" },
    { key: "accent", label: "Accent" },
    { key: "text", label: "Text" },
    { key: "muted", label: "Secondary text" }
];

const $ = sel => document.querySelector(sel);   // короткая запись для этого файла

function currentColors() {
    return { ...DEFAULT_THEME_COLORS, ...(userAppearance.colors || {}) };
}

function fillAppearanceForm() {

    const a = userAppearance;

    // Готовые темы
    $("#themePresets").innerHTML = Object.entries(THEME_PRESETS).map(([key, p]) => {
        const c = { ...DEFAULT_THEME_COLORS, ...(p.colors || {}) };
        return `
            <button type="button" class="preset ${a.preset === key ? "on" : ""}" data-preset="${key}">
                <span class="preset-swatch" style="background:${c.bg}; border-color:${c.border}">
                    <i style="background:${c.panel}"></i><b style="background:${c.accent}; box-shadow:0 0 10px ${c.accent}"></b>
                </span>
                <span>${p.name}</span>
            </button>`;
    }).join("");

    $("#themePresets").querySelectorAll(".preset").forEach(button => {
        button.addEventListener("click", () => {
            const preset = THEME_PRESETS[button.dataset.preset];
            userAppearance.preset = button.dataset.preset;
            userAppearance.colors = preset.colors ? { ...preset.colors } : null;
            applyAppearance();
            fillAppearanceForm();
            saveAppearance();
        });
    });

    // Свои цвета
    const colors = currentColors();
    $("#colorFields").innerHTML = COLOR_FIELDS.map(f => `
        <label class="color-field">
            <input type="color" data-color="${f.key}" value="${colors[f.key]}">
            <span>${f.label}<small>${colors[f.key]}</small></span>
        </label>`).join("");

    $("#colorFields").querySelectorAll("input").forEach(input => {
        input.addEventListener("input", () => {
            userAppearance.colors = { ...currentColors(), [input.dataset.color]: input.value };
            userAppearance.preset = "custom";
            input.nextElementSibling.querySelector("small").textContent = input.value;
            $("#themePresets").querySelectorAll(".preset").forEach(b => b.classList.remove("on"));
            applyThemeColors(userAppearance);
            applyBackground();
            drawGlow();
            saveAppearance();
        });
    });

    $("#panelOpacity").value = a.panelOpacity;
    $("#panelOpacityValue").textContent = `${Math.round(a.panelOpacity * 100)}%`;

    // Цвета графиков
    const chartColors = getChartColors();
    $("#chartColorFields").innerHTML = chartColors.map((color, i) => {
        const name = (typeof categories !== "undefined" && categories[i]) ? categories[i].name : `Color ${i + 1}`;
        return `
            <label class="color-field">
                <input type="color" data-slot="${i}" value="${color}">
                <span>${escHtml(name)}<small>${color}</small></span>
            </label>`;
    }).join("");

    $("#chartColorFields").querySelectorAll("input").forEach(input => {
        input.addEventListener("input", () => {
            const list = [...getChartColors()];
            list[Number(input.dataset.slot)] = input.value;
            userAppearance.chartColors = list;
            input.nextElementSibling.querySelector("small").textContent = input.value;
            if (analyticsVisible()) renderAnalytics();
            saveAppearance();
        });
    });

    // Фон
    const bg = a.background;
    setSegment($("#bgTypeSegment"), bg.type);
    $("#bgColorBlock").style.display = bg.type === "color" ? "" : "none";
    $("#bgPhotoBlock").style.display = bg.type === "photo" ? "" : "none";
    $("#bgColor1").value = bg.color1 || colors.bg;
    $("#bgColor2").value = bg.color2;
    $("#bgGradient").checked = bg.gradient;
    $("#bgAngle").value = bg.angle;
    $("#bgAngleRow").style.display = bg.gradient ? "" : "none";
    $("#bgColor2Field").style.display = bg.gradient ? "" : "none";
    $("#bgDimRange").value = bg.dim;
    $("#bgBlurRange").value = bg.blur;
    $("#bgPhotoPreview").style.backgroundImage = bg.photo ? `url("${bg.photo}")` : "";
    $("#bgPhotoPreview").classList.toggle("empty", !bg.photo);
    $("#bgPhotoRemove").style.display = bg.photo ? "" : "none";

    // Шармики
    $("#charmsToggle").checked = a.charms.enabled;
    $("#charmsBody").classList.toggle("disabled", !a.charms.enabled);
    $("#charmSize").value = a.charms.size;

    $("#charmShapePicker").innerHTML = `
        <button type="button" class="shape-chip on" data-shape="random" title="Random">🎲</button>` +
        Object.entries(CHARM_SHAPES).map(([key, s]) => `
        <button type="button" class="shape-chip" data-shape="${key}" title="${s.name}">
            <svg viewBox="0 0 100 100"><g class="charm-shape">${s.svg}</g></svg>
        </button>`).join("");

    $("#charmShapePicker").querySelectorAll(".shape-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            $("#charmShapePicker").querySelectorAll(".shape-chip").forEach(c => c.classList.remove("on"));
            chip.classList.add("on");
        });
    });

    renderCharmList();

    // Неоновый график
    $("#glowToggle").checked = a.glow.enabled;
    $("#glowIntensity").value = a.glow.intensity;
    $("#glowHint").textContent = productivityOn
        ? "Draws only the moments you were actually working during the last 7 days."
        : "Turn on productivity analysis (Settings → Productivity) to use this background.";
    $("#glowToggle").disabled = !productivityOn;
}

function renderCharmList() {

    const items = userAppearance.charms.items;

    $("#charmCount").textContent = items.length ? `${items.length} on your background` : "No charms yet";

    $("#charmList").innerHTML = items.map(item => `
        <div class="charm-chip tone-${item.tone || "a"}">
            <svg viewBox="0 0 100 100"><g class="charm-shape">${CHARM_SHAPES[item.shape].svg}</g></svg>
            <span title="${escHtml(item.phrase)}">${escHtml(item.phrase)}</span>
            <button type="button" data-remove="${item.id}" title="Remove">×</button>
        </div>`).join("");

    $("#charmList").querySelectorAll("[data-remove]").forEach(button => {
        button.addEventListener("click", () => {
            userAppearance.charms.items = userAppearance.charms.items.filter(i => i.id !== button.dataset.remove);
            renderCharms();
            renderCharmList();
            saveAppearance();
        });
    });
}

// ---------- Обработчики полей (подключаются один раз) ----------

$("#panelOpacity").addEventListener("input", (event) => {
    userAppearance.panelOpacity = Number(event.target.value);
    $("#panelOpacityValue").textContent = `${Math.round(userAppearance.panelOpacity * 100)}%`;
    applyThemeColors(userAppearance);
    saveAppearance();
});

$("#resetColors").addEventListener("click", () => {
    userAppearance.colors = null;
    userAppearance.preset = "midnight";
    userAppearance.panelOpacity = 1;
    applyAppearance();
    fillAppearanceForm();
    saveAppearance();
});

$("#resetChartColors").addEventListener("click", () => {
    userAppearance.chartColors = null;
    fillAppearanceForm();
    if (analyticsVisible()) renderAnalytics();
    saveAppearance();
});

$("#bgTypeSegment").querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
        userAppearance.background.type = button.dataset.value;
        applyBackground();
        fillAppearanceForm();
        saveAppearance();
    });
});

function onBackgroundInput() {
    const bg = userAppearance.background;
    bg.color1 = $("#bgColor1").value;
    bg.color2 = $("#bgColor2").value;
    bg.gradient = $("#bgGradient").checked;
    bg.angle = Number($("#bgAngle").value);
    bg.dim = Number($("#bgDimRange").value);
    bg.blur = Number($("#bgBlurRange").value);
    $("#bgAngleRow").style.display = bg.gradient ? "" : "none";
    $("#bgColor2Field").style.display = bg.gradient ? "" : "none";
    applyBackground();
    saveAppearance();
}

["#bgColor1", "#bgColor2", "#bgGradient", "#bgAngle", "#bgDimRange", "#bgBlurRange"].forEach(sel => {
    $(sel).addEventListener("input", onBackgroundInput);
});

$("#bgUseTheme").addEventListener("click", () => {
    userAppearance.background.color1 = "";
    userAppearance.background.gradient = false;
    applyBackground();
    fillAppearanceForm();
    saveAppearance();
});

// Фото: уменьшаем в браузере до 2400px, сохраняем на сервере
$("#bgPhotoButton").addEventListener("click", () => $("#bgPhotoInput").click());

$("#bgPhotoInput").addEventListener("change", async () => {

    const file = $("#bgPhotoInput").files[0];
    $("#bgPhotoInput").value = "";
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setAppearanceStatus("Choose a JPG, PNG or WEBP image", true);
        return;
    }

    setAppearanceStatus("Uploading…");

    try {
        const image = await shrinkImage(file, 2400);
        const response = await api("/api/appearance/photo", {
            method: "PUT",
            body: JSON.stringify({ image })
        });
        const user = await response.json();
        if (!response.ok) throw new Error(user.error || "Error");

        userAppearance.background.photo = user.appearance.background.photo;
        userAppearance.background.type = "photo";
        cacheAppearance();
        applyBackground();
        fillAppearanceForm();
        setAppearanceStatus("✓ Photo set as background");
    } catch (error) {
        setAppearanceStatus(error.message, true);
    }
});

function shrinkImage(file, maxSide) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const k = Math.min(1, maxSide / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * k);
            canvas.height = Math.round(img.height * k);
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/jpeg", 0.86));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read this image")); };
        img.src = url;
    });
}

$("#bgPhotoRemove").addEventListener("click", async () => {
    try {
        const response = await api("/api/appearance/photo", { method: "DELETE" });
        if (!response.ok) throw new Error("Error");
        userAppearance.background.photo = "";
        userAppearance.background.type = "color";
        cacheAppearance();
        applyBackground();
        fillAppearanceForm();
    } catch (error) {
        setAppearanceStatus(error.message, true);
    }
});

// Шармики
$("#charmsToggle").addEventListener("change", (event) => {
    userAppearance.charms.enabled = event.target.checked;

    // Первое включение — сразу несколько случайных, чтобы было видно
    if (userAppearance.charms.enabled && !userAppearance.charms.items.length) {
        for (let i = 0; i < 6; i++) userAppearance.charms.items.push(newCharm());
    }

    renderCharms();
    fillAppearanceForm();
    saveAppearance();
});

$("#charmSize").addEventListener("input", (event) => {
    userAppearance.charms.size = Number(event.target.value);
    renderCharms();
    saveAppearance();
});

$("#charmRandomPhrase").addEventListener("click", () => {
    $("#charmPhrase").value = randomOf(MOTIVATION_PHRASES);
});

function addCharmFromForm() {

    if (userAppearance.charms.items.length >= 40) {
        setAppearanceStatus("Maximum 40 charms", true);
        return;
    }

    const chip = $("#charmShapePicker .shape-chip.on");
    const shape = chip ? chip.dataset.shape : "random";
    const phrase = $("#charmPhrase").value.trim();

    userAppearance.charms.items.push(newCharm(shape === "random" ? null : shape, phrase || null));
    userAppearance.charms.enabled = true;
    $("#charmPhrase").value = "";

    renderCharms();
    fillAppearanceForm();
    saveAppearance();
    setAppearanceStatus("✨ Charm added — look at the background");
}

$("#charmAdd").addEventListener("click", addCharmFromForm);

$("#charmPhrase").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        addCharmFromForm();
    }
});

$("#charmAddRandom").addEventListener("click", () => {
    const room = 40 - userAppearance.charms.items.length;
    for (let i = 0; i < Math.min(5, room); i++) userAppearance.charms.items.push(newCharm());
    userAppearance.charms.enabled = true;
    renderCharms();
    fillAppearanceForm();
    saveAppearance();
});

$("#charmShuffle").addEventListener("click", () => {
    userAppearance.charms.items.forEach(item => {
        item.x = 0.05 + Math.random() * 0.9;
        item.y = 0.06 + Math.random() * 0.88;
    });
    renderCharms();
    saveAppearance();
});

// Неоновый график
$("#glowToggle").addEventListener("change", (event) => {
    userAppearance.glow.enabled = event.target.checked;
    updateGlow();
    saveAppearance();
});

$("#glowIntensity").addEventListener("input", (event) => {
    userAppearance.glow.intensity = Number(event.target.value);
    bgGlow.style.opacity = userAppearance.glow.intensity;
    saveAppearance();
});

// Сразу показываем сохранённый в браузере вид (до ответа сервера)
try {
    const cached = JSON.parse(localStorage.getItem("appearance") || "null");
    if (cached) {
        userAppearance = mergeAppearance(cached);
        applyBackground();
        renderCharms();
    }
} catch (error) { }
