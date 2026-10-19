// ========================================
// СПІЛЬНИЙ ДОСТУП: сторінка «Shared» + мітки на задачах
// ----------------------------------------
// Підключається перед app.js. Тут лише функції —
// глобальні змінні з app.js (api, escapeHtml, showToast, setView...)
// використовуються тільки під час роботи, а не при завантаженні.
// ========================================

let sharesData = { myColor: "", asOwner: [], asViewer: [] };
let sharedOwnerId = null;     // чиї задачі зараз відкриті
let sharedData = null;        // { owner, permission, categories, tasks }
let sharedFilter = "all";
let sharedPart = "tasks";     // "tasks" | "wishlist" — що дивимось у вибраної людини
let sharedWishes = null;      // { ownerId, wishes }
let sharesTimer = null;

// [перший рядок, початок другого рядка] — ім'я додається в кінці
const MARK_LABEL = {
    helping: ["в процесі допомоги", "by "],
    done: ["зроблено", "by "],
    helped: ["зроблено з допомогою", ""]
};


// ---------- Дані ----------

async function loadShares() {
    try {
        const response = await api("/api/shares");
        if (!response.ok) return;
        sharesData = await response.json();
    } catch (error) {
        console.error(error);
        return;
    }

    updateSharedBadge();

    if (typeof currentView !== "undefined" && currentView === "shared") renderSharedView();

    // Імена й кольори помічників могли змінитися — перемалюємо смужки на своїх задачах
    if (typeof renderTasks === "function" && Array.isArray(tasks) && tasks.some(t => (t.marks || []).length)) {
        renderTasks();
    }
}

function startSharesPolling() {
    loadShares();
    clearInterval(sharesTimer);
    sharesTimer = setInterval(() => {
        loadShares();
        if (typeof currentView !== "undefined" && currentView === "shared" && sharedOwnerId) {
            if (sharedPart === "wishlist") loadSharedWishlist(sharedOwnerId, true);
            else loadSharedTasks(sharedOwnerId, true);
        }
    }, 60000);
}

function pendingIncoming() {
    return sharesData.asOwner.filter(s => s.status === "pending");
}

function updateSharedBadge() {
    const badge = document.querySelector("#navShared");
    if (!badge) return;
    const count = pendingIncoming().length;
    badge.textContent = count;
    badge.hidden = count === 0;
}

// Як показувати помічника на МОЇХ задачах: моє прізвисько для нього + його колір
function helperInfo(mark) {
    const share = sharesData.asOwner.find(s => s.user.id === mark.userId);
    return {
        name: (share && (share.nickname || share.user.name)) || mark.name || "someone",
        color: (share && share.user.color) || mark.color || "#b69cff"
    };
}


// ---------- Смужки-мітки на картці задачі ----------

// mode: "owner" — мої задачі (можна прибрати мітку), "viewer" — чужі задачі
function marksStripHtml(task, mode = "owner") {

    const marks = task.marks || [];
    if (!marks.length) return "";

    return `<div class="mark-strips" style="--n:${marks.length}">${marks.map(mark => {

        let name, color;

        if (mode === "owner") {
            ({ name, color } = helperInfo(mark));
        } else {
            const isMe = typeof currentUser !== "undefined" && currentUser && mark.userId === currentUser.id;
            name = isMe ? "you" : (mark.name || "someone");
            color = isMe ? (sharesData.myColor || mark.color) : mark.color;
        }

        // Якщо задача виконана — мітка підсумовує, хто її зробив:
        //   «зроблено by X»          — X сам натиснув «Done»
        //   «зроблено з допомогою X» — X допомагав, а галочку поставила власниця
        const kind = task.status === "done"
            ? (mark.type === "done" ? "done" : "helped")
            : mark.type;
        const label = MARK_LABEL[kind][0];
        const byText = `${MARK_LABEL[kind][1]}${name}`;
        const when = mark.at ? new Date(mark.at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

        return `
            <div class="mark-strip ${kind}" style="--mark:${escapeHtml(color || "#b69cff")}"
                 data-tip-type="${escapeHtml(kind)}" data-tip-name="${escapeHtml(name)}" data-tip-when="${escapeHtml(when)}">
                <span class="mark-lines">
                    <span class="mark-line">${escapeHtml(label)}</span>
                    <span class="mark-line by">${escapeHtml(byText)}</span>
                </span>
                ${mode === "owner" ? `<button type="button" class="mark-remove" data-user="${escapeHtml(mark.userId)}" aria-label="Remove this mark">×</button>` : ""}
            </div>`;
    }).join("")}</div>`;
}

// Підключити кнопки «×» на смужках моєї задачі
function bindMarkStrips(card, task) {
    card.querySelectorAll(".mark-remove").forEach(button => {
        button.addEventListener("click", async (event) => {
            event.stopPropagation();
            try {
                const response = await api(`/api/tasks/${task.id}/marks/${encodeURIComponent(button.dataset.user)}`, { method: "DELETE" });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                task.marks = result.marks;
                renderTasks();
            } catch (error) {
                showToast(`⚠️ ${error.message}`);
            }
        });
    });
}


// ---------- Сторінка «Shared» ----------

function personHtml(user, extra = "") {
    const initial = escapeHtml((user.name || "?").trim().charAt(0).toUpperCase() || "?");
    const avatar = user.avatar
        ? `<img src="${escapeHtml(user.avatar)}" alt="">`
        : initial;
    return `
        <div class="share-person">
            <span class="share-avatar" style="--mark:${escapeHtml(user.color)}">${avatar}</span>
            <span class="share-who">
                <strong>${escapeHtml(user.name)}</strong>
                <small>${escapeHtml(user.email)}${extra}</small>
            </span>
        </div>`;
}

// Що показувати: задачі / вішліст (можна обидва)
function scopeChecksHtml(scope) {
    const sc = scope || { tasks: true, wishlist: true };
    return `
        <span class="share-scope">
            <label><input type="checkbox" class="share-scope-tasks" ${sc.tasks ? "checked" : ""}> Tasks</label>
            <label><input type="checkbox" class="share-scope-wishlist" ${sc.wishlist ? "checked" : ""}> Wishlist</label>
        </span>`;
}

function readScope(row) {
    return {
        tasks: row.querySelector(".share-scope-tasks").checked,
        wishlist: row.querySelector(".share-scope-wishlist").checked
    };
}

function scopeText(scope) {
    if (scope.tasks && scope.wishlist) return "tasks + wishlist";
    return scope.tasks ? "tasks" : "wishlist";
}

function permissionSelectHtml(value) {
    return `
        <select class="share-permission">
            <option value="view" ${value === "view" ? "selected" : ""}>👁 Only view</option>
            <option value="mark" ${value === "mark" ? "selected" : ""}>🏷 View + marks</option>
        </select>`;
}

function renderSharedView() {

    const section = document.querySelector("#shared");
    if (!section) return;

    // Мій колір
    const colorInput = document.querySelector("#myShareColor");
    if (colorInput && sharesData.myColor && document.activeElement !== colorInput) {
        colorInput.value = sharesData.myColor;
        document.querySelector("#myShareColorDot").style.setProperty("--mark", sharesData.myColor);
    }

    // 1. Запити до мене
    const pending = pendingIncoming();
    const requestsCard = document.querySelector("#shareRequestsCard");
    requestsCard.hidden = pending.length === 0;
    document.querySelector("#shareRequests").innerHTML = pending.map(s => `
        <div class="share-row" data-id="${escapeHtml(s.id)}">
            ${personHtml(s.user, " · wants to see your tasks / wishlist")}
            <div class="share-controls">
                ${scopeChecksHtml({ tasks: true, wishlist: true })}
                ${permissionSelectHtml("view")}
                <input type="text" class="share-nickname" maxlength="30" placeholder="Nickname on marks (optional)">
                <button type="button" class="share-accept">Allow</button>
                <button type="button" class="share-remove ghost">Decline</button>
            </div>
        </div>`).join("");

    // 2. Хто бачить мої задачі
    const viewers = sharesData.asOwner.filter(s => s.status === "active");
    document.querySelector("#shareViewers").innerHTML = viewers.length ? viewers.map(s => `
        <div class="share-row" data-id="${escapeHtml(s.id)}">
            ${personHtml(s.user)}
            <div class="share-controls">
                ${scopeChecksHtml(s.scope)}
                ${permissionSelectHtml(s.permission)}
                <input type="text" class="share-nickname" maxlength="30" value="${escapeHtml(s.nickname)}" placeholder="Nickname on marks">
                <button type="button" class="share-remove ghost">Remove access</button>
            </div>
        </div>`).join("") : `<p class="share-empty">Nobody sees your tasks yet.</p>`;

    // 3. Чиї задачі бачу я
    const owners = sharesData.asViewer;
    const ownersBox = document.querySelector("#sharedOwners");

    if (!owners.length) {
        ownersBox.innerHTML = `<p class="share-empty">No one has shared their tasks with you yet. Ask for access below 👇</p>`;
        document.querySelector("#sharedTasks").innerHTML = "";
        document.querySelector("#sharedToolbar").hidden = true;
        return;
    }

    const active = owners.filter(s => s.status === "active");
    if (!active.some(s => String(s.user.id) === String(sharedOwnerId))) {
        sharedOwnerId = active[0] ? String(active[0].user.id) : null;
        sharedData = null;
        sharedWishes = null;
    }

    // Що дозволено бачити в цієї людини
    const current = active.find(s => String(s.user.id) === String(sharedOwnerId));
    const scope = current ? current.scope : { tasks: false, wishlist: false };
    if (!scope[sharedPart]) sharedPart = scope.tasks ? "tasks" : "wishlist";

    ownersBox.innerHTML = owners.map(s => `
        <button type="button" class="owner-chip ${String(s.user.id) === String(sharedOwnerId) ? "active" : ""} ${s.status}"
                data-owner="${escapeHtml(s.user.id)}" data-id="${escapeHtml(s.id)}" ${s.status !== "active" ? "disabled" : ""}
                style="--mark:${escapeHtml(s.user.color)}">
            <span class="owner-dot"></span>
            ${escapeHtml(s.user.name)}
            <small>${s.status === "active" ? `${scopeText(s.scope)}${s.scope.tasks && s.permission === "mark" ? " · marks" : ""}` : "waiting for approval…"}</small>
        </button>`).join("");

    // Вкладки «Tasks / Вішліст»
    const parts = document.querySelector("#sharedParts");
    parts.hidden = !sharedOwnerId || !(scope.tasks && scope.wishlist);
    parts.querySelectorAll("button").forEach(b => {
        b.hidden = !scope[b.dataset.part];
        b.classList.toggle("on", b.dataset.part === sharedPart);
    });

    document.querySelector("#sharedToolbar").hidden = !sharedOwnerId;
    document.querySelector("#sharedFilters").hidden = sharedPart !== "tasks";

    if (!sharedOwnerId) return;

    if (sharedPart === "wishlist") {
        if (!sharedWishes || sharedWishes.ownerId !== sharedOwnerId) loadSharedWishlist(sharedOwnerId);
        else renderSharedWishlist();
    } else if (!sharedData || String(sharedData.owner.id) !== String(sharedOwnerId)) {
        loadSharedTasks(sharedOwnerId);
    } else {
        renderSharedTasks();
    }
}

async function loadSharedWishlist(ownerId, quiet = false) {

    if (!quiet) document.querySelector("#sharedTasks").innerHTML = `<p class="share-empty">Loading…</p>`;

    try {
        const response = await api(`/api/shared/${encodeURIComponent(ownerId)}/wishlist`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (ownerId !== sharedOwnerId) return;
        sharedWishes = { ownerId, wishes: result.wishes };
        renderSharedWishlist();
    } catch (error) {
        document.querySelector("#sharedTasks").innerHTML = `<p class="share-empty">⚠️ ${escapeHtml(error.message)}</p>`;
    }
}

function renderSharedWishlist() {
    if (sharedPart !== "wishlist" || !sharedWishes) return;
    const list = sortWishes(sharedWishes.wishes, "smart");
    document.querySelector("#sharedTasks").innerHTML = list.length
        ? `<div class="wish-grid">${list.map(w => wishCardHtml(w, false)).join("")}</div>`
        : `<p class="share-empty">The wishlist is empty for now.</p>`;
}

async function loadSharedTasks(ownerId, quiet = false) {

    if (!quiet) document.querySelector("#sharedTasks").innerHTML = `<p class="share-empty">Loading…</p>`;

    try {
        const response = await api(`/api/shared/${encodeURIComponent(ownerId)}/tasks`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (ownerId !== sharedOwnerId) return;
        sharedData = result;
        renderSharedTasks();
    } catch (error) {
        document.querySelector("#sharedTasks").innerHTML = `<p class="share-empty">⚠️ ${escapeHtml(error.message)}</p>`;
    }
}

function renderSharedTasks() {

    const box = document.querySelector("#sharedTasks");
    if (!sharedData || sharedPart !== "tasks") return;

    const canMark = sharedData.permission === "mark";
    const order = { progress: 0, todo: 1, done: 2 };

    const list = sharedData.tasks
        .filter(t => sharedFilter === "all" || t.status === sharedFilter)
        .sort((a, b) => order[a.status] - order[b.status] || (a.deadline || "9999").localeCompare(b.deadline || "9999"));

    document.querySelectorAll("#sharedFilters .sfilter").forEach(b => b.classList.toggle("active", b.dataset.filter === sharedFilter));

    if (!list.length) {
        box.innerHTML = `<p class="share-empty">No tasks here.</p>`;
        return;
    }

    const myId = currentUser && currentUser.id;

    box.innerHTML = list.map(task => {

        const mine = (task.marks || []).find(m => m.userId === myId);
        const isDone = task.status === "done";

        let actions = "";
        if (canMark) {
            const buttons = [];
            if (!mine && !isDone) buttons.push(`<button type="button" class="mark-btn helping" data-type="helping">🤝 Helping</button>`);
            if ((!mine || mine.type === "helping") && !isDone) buttons.push(`<button type="button" class="mark-btn done" data-type="done">✓ Done</button>`);
            if (mine) buttons.push(`<button type="button" class="mark-btn ghost" data-type="">Remove my mark</button>`);
            actions = `<div class="shared-actions">${buttons.join("")}</div>`;
        }

        const deadline = task.deadline ? `<span class="deadline">📅 ${escapeHtml(formatShort(task.deadline))}</span>` : `<span class="deadline">No deadline</span>`;
        const category = escapeHtml(task.subcategory ? `${task.category} · ${task.subcategory}` : (task.category || ""));

        return `
            <div class="task-card shared-task ${isDone ? "completed-task" : ""} ${(task.marks || []).length ? "has-marks" : ""}" data-id="${task.id}" style="--strips:${(task.marks || []).length}">
                ${marksStripHtml(task, "viewer")}
                <div class="task-check ${isDone ? "checked" : ""}" aria-hidden="true">✓</div>
                <div class="task-info">
                    <h3>${escapeHtml(task.title)}</h3>
                    <p>${escapeHtml(task.description || "Без описания")}</p>
                    <div class="task-meta">
                        ${category ? `<span class="tag shared-tag">${category}</span>` : ""}
                        ${deadline}
                    </div>
                    ${actions}
                </div>
                <div class="status-column">
                    <div class="task-status ${task.status}">${statusNames[task.status] || "Todo"}</div>
                </div>
            </div>`;
    }).join("");
}

async function setMark(taskId, type) {
    try {
        const response = await api(`/api/shared/${encodeURIComponent(sharedOwnerId)}/tasks/${taskId}/mark`, {
            method: "POST",
            body: JSON.stringify({ type: type || null })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);

        const task = sharedData.tasks.find(t => t.id === taskId);
        if (task) {
            task.marks = result.marks;
            task.status = result.status;
        }
        renderSharedTasks();

        if (type === "done") showToast("🎉 Marked as done — thank you for helping!");
    } catch (error) {
        showToast(`⚠️ ${error.message}`);
    }
}


// ---------- Дії на сторінці ----------

async function shareAction(url, method, body) {
    const response = await api(url, { method, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Error");
    return result;
}

function bindSharedPage() {

    const section = document.querySelector("#shared");
    if (!section || section.dataset.bound) return;
    section.dataset.bound = "1";

    // Запит доступу
    document.querySelector("#shareRequestForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = document.querySelector("#shareEmail");
        const email = input.value.trim();
        if (!email) return;
        try {
            await shareAction("/api/shares/request", "POST", { email });
            input.value = "";
            showToast("💌 Request sent — waiting for approval");
            loadShares();
        } catch (error) {
            showToast(`⚠️ ${error.message}`);
        }
    });

    // Мій колір
    const colorInput = document.querySelector("#myShareColor");
    colorInput.addEventListener("input", () => {
        document.querySelector("#myShareColorDot").style.setProperty("--mark", colorInput.value);
    });
    colorInput.addEventListener("change", async () => {
        try {
            const result = await shareAction("/api/profile/color", "PATCH", { color: colorInput.value });
            sharesData.myColor = result.color;
            showToast("🎨 Your color is saved");
            renderSharedTasks();
        } catch (error) {
            showToast(`⚠️ ${error.message}`);
        }
    });

    // Кнопки в рядках (запити, глядачі)
    section.addEventListener("click", async (event) => {

        const row = event.target.closest(".share-row");
        const chip = event.target.closest(".owner-chip");
        const markButton = event.target.closest(".mark-btn");
        const filter = event.target.closest("#sharedFilters .sfilter");

        try {
            if (row && event.target.closest(".share-accept")) {
                await shareAction(`/api/shares/${row.dataset.id}/accept`, "POST", {
                    scope: readScope(row),
                    permission: row.querySelector(".share-permission").value,
                    nickname: row.querySelector(".share-nickname").value
                });
                showToast("✅ Access allowed");
                loadShares();
            } else if (row && event.target.closest(".share-remove")) {
                await shareAction(`/api/shares/${row.dataset.id}`, "DELETE");
                showToast("Access removed");
                loadShares();
            } else if (chip && !chip.disabled) {
                sharedOwnerId = chip.dataset.owner;
                sharedData = null;
                sharedWishes = null;
                renderSharedView();
            } else if (event.target.closest("#sharedParts button")) {
                sharedPart = event.target.closest("#sharedParts button").dataset.part;
                renderSharedView();
            } else if (markButton) {
                const card = markButton.closest(".shared-task");
                setMark(Number(card.dataset.id), markButton.dataset.type);
            } else if (filter) {
                sharedFilter = filter.dataset.filter;
                renderSharedTasks();
            }
        } catch (error) {
            showToast(`⚠️ ${error.message}`);
        }
    });

    // Зміна рівня доступу / прізвиська для вже підтверджених
    section.addEventListener("change", async (event) => {
        const row = event.target.closest("#shareViewers .share-row");
        if (!row) return;
        const cls = event.target.classList;
        const body = cls.contains("share-permission")
            ? { permission: event.target.value }
            : cls.contains("share-nickname") ? { nickname: event.target.value }
            : (cls.contains("share-scope-tasks") || cls.contains("share-scope-wishlist")) ? { scope: readScope(row) } : null;
        if (!body) return;
        try {
            await shareAction(`/api/shares/${row.dataset.id}`, "PATCH", body);
            showToast("Saved");
            loadShares();
        } catch (error) {
            showToast(`⚠️ ${error.message}`);
            loadShares();
        }
    });

    // Скасувати свій запит / відписатися — правий клік не потрібен: кнопка в чипі
    document.querySelector("#sharedLeave").addEventListener("click", async () => {
        const share = sharesData.asViewer.find(s => String(s.user.id) === String(sharedOwnerId));
        if (!share) return;
        try {
            await shareAction(`/api/shares/${share.id}`, "DELETE");
            sharedOwnerId = null;
            sharedData = null;
            showToast("You no longer see these tasks");
            loadShares();
        } catch (error) {
            showToast(`⚠️ ${error.message}`);
        }
    });
}


// ---------- Підказка при наведенні на смужку ----------
// Звичайне горизонтальне віконечко біля курсора (картка обрізає все, що виходить за її межі,
// тому підказка живе окремо, поверх сторінки)

const MARK_TIP_TITLE = {
    helping: "🤝 В процесі допомоги",
    done: "✅ Зроблено",
    helped: "💞 Зроблено з допомогою"
};

function markTipElement() {
    let tip = document.querySelector("#markTip");
    if (!tip) {
        tip = document.createElement("div");
        tip.id = "markTip";
        tip.className = "mark-tip";
        document.body.append(tip);
    }
    return tip;
}

document.addEventListener("mouseover", (event) => {

    const strip = event.target.closest && event.target.closest(".mark-strip");
    const tip = markTipElement();

    if (!strip) {
        tip.classList.remove("visible");
        return;
    }

    const removeHover = event.target.closest(".mark-remove");
    tip.style.setProperty("--mark", strip.style.getPropertyValue("--mark"));
    tip.innerHTML = removeHover
        ? `<strong>Прибрати мітку</strong>`
        : `<strong>${MARK_TIP_TITLE[strip.dataset.tipType] || escapeHtml(strip.dataset.tipType)}</strong>
           <span>${strip.dataset.tipType === "helped" ? "" : "by "}${escapeHtml(strip.dataset.tipName)}</span>
           ${strip.dataset.tipWhen ? `<small>${escapeHtml(strip.dataset.tipWhen)}</small>` : ""}`;

    const box = strip.getBoundingClientRect();
    tip.classList.add("visible");
    const tipBox = tip.getBoundingClientRect();
    const top = Math.min(window.innerHeight - tipBox.height - 8, Math.max(8, box.top + box.height / 2 - tipBox.height / 2));
    let left = box.right + 10;
    if (left + tipBox.width > window.innerWidth - 8) left = box.left - tipBox.width - 10;
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
});

window.addEventListener("scroll", () => {
    const tip = document.querySelector("#markTip");
    if (tip) tip.classList.remove("visible");
}, true);
