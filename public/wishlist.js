// ========================================
// ВІШЛІСТ (сторінка «Вішліст» + вікно додавання)
// ----------------------------------------
// Підключається перед app.js: тут тільки функції та обробники власних елементів.
// Глобальні речі з app.js (api, escapeHtml, showToast, formatShort, daysUntil...)
// використовуються лише під час роботи.
// ========================================

let wishes = [];
let wishFilter = "all";
let editingWish = null;

const NEED_INFO = {
    whim: { label: "✨ Забаганка", rank: 1 },
    want: { label: "💜 Потрібно / хочу", rank: 2 },
    need: { label: "❗ Необхідно", rank: 3 }
};


// ---------- Дані ----------

async function loadWishlist() {
    try {
        const response = await api("/api/wishlist");
        if (!response.ok) return;
        wishes = await response.json();
        renderWishlist();
    } catch (error) {
        console.error(error);
    }
}


// ---------- Спільні для мого і чужого вішліста ----------

function formatPrice(wish) {
    if (wish.price === null || wish.price === undefined) return "";
    const value = Number(wish.price).toLocaleString("uk-UA", { maximumFractionDigits: 2 });
    return wish.currency === "₴" ? `${value} ₴` : `${wish.currency}${value}`;
}

function wishDeadlineHtml(wish) {
    if (!wish.deadline) return "";
    const days = daysUntil(wish.deadline);
    let extra = "";
    let text = `📅 ${formatShort(wish.deadline)}`;
    if (!wish.received) {
        if (days < 0) { extra = "overdue"; text += " · overdue"; }
        else if (days <= 3) { extra = "soon"; text += days === 0 ? " · today" : ` · ${days}d`; }
    }
    return `<span class="deadline ${extra}">${text}</span>`;
}

function heartsHtml(count) {
    if (!count) return "";
    return `<span class="wish-hearts" title="${count} / 5">${"♥".repeat(count)}<i>${"♥".repeat(5 - count)}</i></span>`;
}

// «Спершу важливе»: не отримані → необхідність → емоції → дедлайн
function sortWishes(list, mode) {

    const byDeadline = (a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999");
    const price = w => (w.price === null || w.price === undefined ? null : Number(w.price));

    return [...list].sort((a, b) => {

        if (a.received !== b.received) return a.received ? 1 : -1;

        switch (mode) {
            case "hearts": return (b.hearts || 0) - (a.hearts || 0) || byDeadline(a, b);
            case "deadline": return byDeadline(a, b);
            case "priceAsc": return (price(a) ?? Infinity) - (price(b) ?? Infinity);
            case "priceDesc": return (price(b) ?? -1) - (price(a) ?? -1);
            case "new": return (b.createdAt || "").localeCompare(a.createdAt || "");
            default:
                return ((NEED_INFO[b.need] || {}).rank || 0) - ((NEED_INFO[a.need] || {}).rank || 0)
                    || (b.hearts || 0) - (a.hearts || 0)
                    || byDeadline(a, b);
        }
    });
}

// editable = мій вішліст (кнопки), false = чужий (тільки перегляд)
function wishCardHtml(wish, editable) {

    const need = NEED_INFO[wish.need];
    const price = formatPrice(wish);

    return `
        <article class="wish-card ${wish.received ? "received" : ""} ${wish.need ? `need-${wish.need}` : ""}" data-id="${escapeHtml(wish.id)}">

            <div class="wish-top">
                ${editable
                    ? `<button type="button" class="wish-check ${wish.received ? "checked" : ""}" title="${wish.received ? "Received — click to undo" : "Mark as received"}">🎁</button>`
                    : (wish.received ? `<span class="wish-check checked" title="Received">🎁</span>` : "")}
                <h3>${escapeHtml(wish.title)}</h3>
                ${editable ? `
                    <button type="button" class="more wish-edit" title="Edit" aria-label="Edit wish">
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                    <button type="button" class="more wish-delete" title="Delete" aria-label="Delete wish">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
                    </button>` : ""}
            </div>

            ${wish.description ? `<p class="wish-description">${escapeHtml(wish.description)}</p>` : ""}

            <div class="wish-meta">
                ${need ? `<span class="need-tag need-${wish.need}">${need.label}</span>` : ""}
                ${heartsHtml(wish.hearts)}
            </div>

            ${(price || wish.deadline || wish.received) ? `
                <div class="wish-bottom">
                    ${price ? `<span class="wish-price">${escapeHtml(price)}</span>` : ""}
                    ${wishDeadlineHtml(wish)}
                    ${wish.received ? `<span class="wish-received">отримано ✨</span>` : ""}
                </div>` : ""}

        </article>`;
}


// ---------- Моя сторінка «Вішліст» ----------

function renderWishlist() {

    const count = document.querySelector("#navWishlist");
    if (count) count.textContent = wishes.filter(w => !w.received).length;

    const grid = document.querySelector("#wishGrid");
    if (!grid) return;

    const visible = wishes.filter(w => {
        if (wishFilter === "all") return true;
        if (wishFilter === "received") return w.received;
        return w.need === wishFilter && !w.received;
    });

    const sorted = sortWishes(visible, document.querySelector("#wishSort").value);

    grid.innerHTML = sorted.map(w => wishCardHtml(w, true)).join("");
    document.querySelector("#wishEmpty").hidden = sorted.length > 0;

    document.querySelectorAll("#wishFilters .sfilter")
        .forEach(b => b.classList.toggle("active", b.dataset.filter === wishFilter));

    // Підсумок: скільки бажань і орієнтовна сума (окремо по кожній валюті)
    const open = wishes.filter(w => !w.received);
    const totals = {};
    open.forEach(w => {
        if (w.price !== null && w.price !== undefined) totals[w.currency] = (totals[w.currency] || 0) + Number(w.price);
    });
    const sum = Object.entries(totals)
        .map(([currency, value]) => formatPrice({ price: value, currency }))
        .join(" + ");

    document.querySelector("#wishSummary").innerHTML = wishes.length ? `
        <span><strong>${open.length}</strong> бажань чекають</span>
        ${sum ? `<span>≈ <strong>${escapeHtml(sum)}</strong> разом</span>` : ""}
        <span><strong>${wishes.length - open.length}</strong> уже отримано 🎁</span>` : "";
}


// ---------- Вікно: додати / змінити ----------

const wishModal = document.querySelector("#wishModal");
const wishForm = document.querySelector("#wishForm");
let wishNeedValue = "";
let wishHeartsValue = null;

function paintWishNeed() {
    document.querySelectorAll("#wishNeed button")
        .forEach(b => b.classList.toggle("on", b.dataset.value === wishNeedValue));
}

function paintWishHearts(hover = 0) {
    document.querySelectorAll("#wishHearts button").forEach(b => {
        const v = Number(b.dataset.value);
        b.classList.toggle("on", v <= (wishHeartsValue || 0));
        b.classList.toggle("hover", hover > 0 && v <= hover);
    });
}

function openWishModal(wish = null) {

    editingWish = wish;

    document.querySelector("#wishModalTitle").textContent = wish ? "Edit wish" : "New wish";
    document.querySelector("#wishSubmit").textContent = wish ? "Save" : "Add wish";

    document.querySelector("#wishTitle").value = wish ? wish.title : "";
    document.querySelector("#wishDescription").value = wish ? wish.description : "";
    document.querySelector("#wishDeadline").value = wish ? wish.deadline : "";
    document.querySelector("#wishPrice").value = wish && wish.price !== null ? wish.price : "";
    document.querySelector("#wishCurrency").value = wish ? wish.currency : "₴";

    wishNeedValue = wish ? wish.need : "";
    wishHeartsValue = wish ? wish.hearts : null;
    paintWishNeed();
    paintWishHearts();

    wishModal.classList.add("active");
    setTimeout(() => document.querySelector("#wishTitle").focus(), 50);
}

function closeWishModal() {
    wishModal.classList.remove("active");
    editingWish = null;
}

document.querySelectorAll("#wishNeed button").forEach(button => {
    button.addEventListener("click", () => {
        // Повторний клік — зняти вибір (поле необов'язкове)
        wishNeedValue = wishNeedValue === button.dataset.value ? "" : button.dataset.value;
        paintWishNeed();
    });
});

document.querySelectorAll("#wishHearts button").forEach(button => {
    const value = Number(button.dataset.value);
    button.addEventListener("click", () => {
        wishHeartsValue = wishHeartsValue === value ? null : value;
        paintWishHearts();
    });
    button.addEventListener("mouseenter", () => paintWishHearts(value));
});

document.querySelector("#wishHearts").addEventListener("mouseleave", () => paintWishHearts());

document.querySelector("#wishClose").addEventListener("click", closeWishModal);
document.querySelector("#wishCancel").addEventListener("click", closeWishModal);
wishModal.addEventListener("click", (event) => {
    if (event.target === wishModal) closeWishModal();
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && wishModal.classList.contains("active")) closeWishModal();
});

wishForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const body = {
        title: document.querySelector("#wishTitle").value.trim(),
        description: document.querySelector("#wishDescription").value.trim(),
        deadline: document.querySelector("#wishDeadline").value,
        price: document.querySelector("#wishPrice").value,
        currency: document.querySelector("#wishCurrency").value,
        need: wishNeedValue,
        hearts: wishHeartsValue
    };

    if (!body.title) return;

    try {
        const response = await api(editingWish ? `/api/wishlist/${editingWish.id}` : "/api/wishlist", {
            method: editingWish ? "PATCH" : "POST",
            body: JSON.stringify(body)
        });
        const saved = await response.json();
        if (!response.ok) throw new Error(saved.error);

        if (editingWish) {
            wishes = wishes.map(w => w.id === saved.id ? saved : w);
        } else {
            wishes.push(saved);
            showToast("♡ Added to your wishlist");
        }

        closeWishModal();
        renderWishlist();
    } catch (error) {
        showToast(`⚠️ ${error.message}`);
    }
});


// ---------- Дії на картках ----------

document.querySelector("#wishGrid").addEventListener("click", async (event) => {

    const card = event.target.closest(".wish-card");
    if (!card) return;
    const wish = wishes.find(w => w.id === card.dataset.id);
    if (!wish) return;

    if (event.target.closest(".wish-edit")) {
        openWishModal(wish);
        return;
    }

    if (event.target.closest(".wish-check")) {
        try {
            const response = await api(`/api/wishlist/${wish.id}`, {
                method: "PATCH",
                body: JSON.stringify({ received: !wish.received })
            });
            const saved = await response.json();
            if (!response.ok) throw new Error(saved.error);
            Object.assign(wish, saved);
            renderWishlist();
            if (saved.received) showToast("🎁 Yay! Marked as received");
        } catch (error) {
            showToast(`⚠️ ${error.message}`);
        }
        return;
    }

    if (event.target.closest(".wish-delete")) {
        if (!(await askDeleteWish(wish))) return;
        try {
            const response = await api(`/api/wishlist/${wish.id}`, { method: "DELETE" });
            if (!response.ok) throw new Error((await response.json()).error);
            wishes = wishes.filter(w => w.id !== wish.id);
            renderWishlist();
        } catch (error) {
            showToast(`⚠️ ${error.message}`);
        }
    }
});

document.querySelector("#wishGrid").addEventListener("dblclick", (event) => {
    const title = event.target.closest(".wish-card h3");
    if (!title) return;
    const wish = wishes.find(w => w.id === title.closest(".wish-card").dataset.id);
    if (wish) openWishModal(wish);
});

document.querySelector("#wishFilters").addEventListener("click", (event) => {
    const button = event.target.closest(".sfilter");
    if (!button) return;
    wishFilter = button.dataset.filter;
    renderWishlist();
});

document.querySelector("#wishSort").addEventListener("change", renderWishlist);

// Те саме гарне вікно видалення, що й для задач — з іншими словами
async function askDeleteWish(wish) {

    const title = document.querySelector("#deleteTitle");
    const confirm = document.querySelector("#deleteConfirm");
    const oldTitle = title.textContent;
    const oldConfirm = confirm.textContent;

    title.textContent = "Delete this wish?";
    confirm.textContent = "Delete wish";
    document.querySelector("#deleteTaskTitle").textContent = wish.title;
    document.querySelector("#deleteTaskMeta").innerHTML = `
        ${wish.need ? `<span class="need-tag need-${wish.need}">${NEED_INFO[wish.need].label}</span>` : ""}
        ${heartsHtml(wish.hearts)}
        ${formatPrice(wish) ? `<span class="wish-price">${escapeHtml(formatPrice(wish))}</span>` : ""}`;

    deleteModal.classList.add("active");
    setTimeout(() => document.querySelector("#deleteCancel").focus(), 50);

    const answer = await new Promise(resolve => { resolveDelete = resolve; });

    title.textContent = oldTitle;
    confirm.textContent = oldConfirm;
    return answer;
}
