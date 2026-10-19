// ========================================
// ТЕМА: цвета интерфейса
// ----------------------------------------
// Подключается в <head>, чтобы применить сохранённые цвета
// ещё до того, как страница нарисуется (без «вспышки» старой темы).
// ========================================

// Готовые темы. null = стандартная тема из style.css
const THEME_PRESETS = {
    midnight: { name: "Midnight Violet", colors: null },
    rose: { name: "Neon Rose", colors: { bg: "#120b14", panel: "#1a1020", border: "#33203a", accent: "#ff5fa2", text: "#fff4f8", muted: "#a88a9c" } },
    mint: { name: "Mint Glow", colors: { bg: "#08110f", panel: "#0e1a17", border: "#1f332d", accent: "#3ee6b0", text: "#effff9", muted: "#7fa398" } },
    academia: { name: "Dark Academia", colors: { bg: "#17120f", panel: "#211a16", border: "#3a2e26", accent: "#c8925a", text: "#f3e9dc", muted: "#a8957f" } },
    ocean: { name: "Ocean Night", colors: { bg: "#060c16", panel: "#0b1424", border: "#1b2a40", accent: "#4fb3ff", text: "#eef6ff", muted: "#7d93ad" } },
    lavender: { name: "Lavender Dream", colors: { bg: "#13101c", panel: "#1b1727", border: "#302944", accent: "#c3a6ff", text: "#f7f2ff", muted: "#9d93b8" } }
};

const DEFAULT_THEME_COLORS = {
    bg: "#0d0f14",
    panel: "#11141b",
    border: "#222631",
    accent: "#7c5cff",
    text: "#ffffff",
    muted: "#858b9b"
};


// ---------- Математика цвета ----------

function hexToRgb(hex) {
    let h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
    return "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

// Смешать два цвета: amount = доля второго цвета (0..1)
function mixColors(a, b, amount) {
    const x = hexToRgb(a);
    const y = hexToRgb(b);
    return rgbToHex(x.map((v, i) => v + (y[i] - v) * amount));
}

function withAlpha(hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


// ---------- Применить цвета ----------

// Из 6 основных цветов получаем все оттенки интерфейса
function themeVariables(colors, panelOpacity = 1) {

    const c = { ...DEFAULT_THEME_COLORS, ...colors };
    const o = Math.max(0.35, Math.min(1, Number(panelOpacity) || 1));

    const surface2 = mixColors(c.panel, c.text, 0.025);
    const surface3 = mixColors(c.panel, c.text, 0.06);

    return {
        "--bg": c.bg,
        "--bg-deep": withAlpha(mixColors(c.panel, "#000000", 0.25), Math.min(1, o + 0.15)),
        "--surface": withAlpha(c.panel, o),
        "--surface-2": withAlpha(surface2, o),
        "--surface-3": withAlpha(surface3, Math.min(1, o + 0.1)),
        "--border": c.border,
        "--border-strong": mixColors(c.border, c.text, 0.07),
        "--accent": c.accent,
        "--accent-hover": mixColors(c.accent, "#000000", 0.15),
        "--accent-light": mixColors(c.accent, c.text, 0.3),
        "--accent-lighter": mixColors(c.accent, c.text, 0.55),
        "--accent-bg": withAlpha(mixColors(c.panel, c.accent, 0.18), Math.min(1, o + 0.1)),
        "--accent-bg-strong": mixColors(c.panel, c.accent, 0.3),
        "--accent-border": mixColors(c.panel, c.accent, 0.4),
        "--text": c.text,
        "--text-2": mixColors(c.text, c.panel, 0.28),
        "--text-muted": c.muted,
        "--text-faint": mixColors(c.muted, c.panel, 0.3),
        "--panel-blur": o < 1 ? "6px" : "0px"
    };
}

function applyThemeColors(appearance) {

    const root = document.documentElement;
    const a = appearance || {};
    const custom = a.colors && Object.keys(a.colors).length ? a.colors : null;
    const opacity = a.panelOpacity ?? 1;

    // Стандартная тема и непрозрачные панели — просто используем style.css
    if (!custom && opacity >= 1) {
        Object.keys(themeVariables({})).forEach(name => root.style.removeProperty(name));
        return;
    }

    Object.entries(themeVariables(custom || {}, opacity)).forEach(([name, value]) => {
        root.style.setProperty(name, value);
    });
}

// Сразу при загрузке — из сохранённой копии
try {
    applyThemeColors(JSON.parse(localStorage.getItem("appearance") || "null"));
} catch (error) { }
