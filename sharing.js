// ========================================
// СПІЛЬНИЙ ДОСТУП ДО ЗАДАЧ
// ----------------------------------------
// shares.json — хто чиї задачі бачить:
//   { id, ownerId, viewerId, status: "pending" | "active",
//     permission: "view" | "mark", nickname, createdAt, acceptedAt }
//
// Як це працює:
//   1. Глядач надсилає запит на пошту власника     POST /api/shares/request
//   2. Власник підтверджує: тільки перегляд або
//      перегляд + мітки                            POST /api/shares/:id/accept
//   3. Глядач бачить задачі власника               GET  /api/shared/:ownerId/tasks
//   4. З правом «mark» — ставить мітки              POST /api/shared/:ownerId/tasks/:taskId/mark
//
// Мітки зберігаються прямо в задачі: task.marks = [{ userId, type, name, color, at }]
//   type "helping" — «в процесі допомоги»
//   type "done"    — «завершено» (задача стає виконаною, мітка лишається)
// ========================================

const path = require("path");
const crypto = require("crypto");

const sharesFile = path.join(__dirname, "shares.json");

// Ніжні неонові кольори — за замовчуванням для кожного користувача
const USER_COLORS = ["#ff7eb6", "#7df9ff", "#b69cff", "#7dffb0", "#ffd36e", "#ff9f7d", "#6eb8ff", "#f5a8ff"];

function defaultUserColor(userId) {
    const hash = crypto.createHash("md5").update(String(userId)).digest();
    return USER_COLORS[hash[0] % USER_COLORS.length];
}

function userColor(user) {
    return user.color || defaultUserColor(user.id);
}

const MARK_TYPES = ["helping", "done"];
const PERMISSIONS = ["view", "mark"];

module.exports = function registerSharing(app, ctx) {

    const { readJson, writeJson, usersFile, tasksFile, auth, worklog, isValidEmail, sendNotice } = ctx;

    const readShares = () => readJson(sharesFile);
    const saveShares = list => writeJson(sharesFile, list);

    // Коротка інформація про людину (без пароля, кодів і т.д.)
    function person(user) {
        if (!user) return { id: null, name: "Deleted user", email: "", avatar: "", color: "#6b7180" };
        return { id: user.id, name: user.name, email: user.email, avatar: user.avatar || "", color: userColor(user) };
    }

    function cleanNickname(value) {
        return String(value || "").trim().slice(0, 30);
    }

    // Активний доступ глядача до задач власника
    function activeShare(ownerId, viewerId) {
        return readShares().find(s =>
            String(s.ownerId) === String(ownerId) && String(s.viewerId) === String(viewerId) && s.status === "active");
    }


    // ---------- Мій колір ----------

    app.patch("/api/profile/color", auth, (req, res) => {

        const color = String(req.body.color || "").toLowerCase();

        if (!/^#[0-9a-f]{6}$/.test(color)) {
            return res.status(400).json({ error: "Недопустимый цвет" });
        }

        const users = readJson(usersFile);
        const user = users.find(u => u.id === req.user.id);
        user.color = color;
        writeJson(usersFile, users);

        res.json({ color });
    });


    // ---------- Список: хто бачить мене, кого бачу я ----------

    app.get("/api/shares", auth, (req, res) => {

        const users = readJson(usersFile);
        const byId = id => users.find(u => u.id === id);
        const shares = readShares();
        const me = req.user.id;

        res.json({
            myColor: userColor(req.user),
            // Люди, які хочуть бачити / бачать мої задачі
            asOwner: shares.filter(s => s.ownerId === me).map(s => ({
                id: s.id, status: s.status, permission: s.permission,
                nickname: s.nickname || "", createdAt: s.createdAt,
                user: person(byId(s.viewerId))
            })),
            // Чиї задачі хочу бачити / бачу я
            asViewer: shares.filter(s => s.viewerId === me).map(s => ({
                id: s.id, status: s.status, permission: s.permission, createdAt: s.createdAt,
                user: person(byId(s.ownerId))
            }))
        });
    });


    // ---------- 1. Запит доступу ----------

    app.post("/api/shares/request", auth, async (req, res) => {

        const email = String(req.body.email || "").trim().toLowerCase();

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: "Введите корректную почту" });
        }

        const users = readJson(usersFile);
        const owner = users.find(u => u.email === email && u.emailVerified !== false);

        if (!owner) {
            return res.status(404).json({ error: "Пользователь с такой почтой не найден" });
        }

        if (owner.id === req.user.id) {
            return res.status(400).json({ error: "Это ваша собственная почта 🙂" });
        }

        const shares = readShares();

        const existing = shares.find(s => s.ownerId === owner.id && s.viewerId === req.user.id);

        if (existing) {
            return res.status(409).json({
                error: existing.status === "active" ? "У вас уже есть доступ" : "Запрос уже отправлен — ждём подтверждения"
            });
        }

        if (shares.filter(s => s.viewerId === req.user.id && s.status === "pending").length >= 20) {
            return res.status(429).json({ error: "Слишком много запросов в ожидании" });
        }

        shares.push({
            id: `shr_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`,
            ownerId: owner.id,
            viewerId: req.user.id,
            status: "pending",
            permission: "view",
            nickname: "",
            createdAt: new Date().toISOString(),
            acceptedAt: null
        });

        saveShares(shares);

        // Лист власнику (або повідомлення в терміналі, якщо пошта не налаштована)
        try {
            await sendNotice(owner,
                `${req.user.name} wants to see your tasks`,
                `${req.user.name} (${req.user.email}) asked for access to your Task Tracker tasks. Open Task Tracker → Shared to allow or decline.`);
        } catch (error) {
            console.error("Не удалось отправить письмо о запросе доступа:", error.message);
        }

        res.json({ ok: true });
    });


    // ---------- 2. Власник: підтвердити / змінити / прибрати ----------

    function ownShare(req, res) {
        const shares = readShares();
        const share = shares.find(s => s.id === req.params.id && s.ownerId === req.user.id);
        if (!share) {
            res.status(404).json({ error: "Запрос не найден" });
            return {};
        }
        return { shares, share };
    }

    function applySettings(share, body) {
        if (body.permission !== undefined) {
            if (!PERMISSIONS.includes(body.permission)) throw new Error("Недопустимый уровень доступа");
            share.permission = body.permission;
        }
        if (body.nickname !== undefined) share.nickname = cleanNickname(body.nickname);
    }

    app.post("/api/shares/:id/accept", auth, (req, res) => {

        const { shares, share } = ownShare(req, res);
        if (!share) return;

        try { applySettings(share, req.body); }
        catch (error) { return res.status(400).json({ error: error.message }); }

        share.status = "active";
        share.acceptedAt = new Date().toISOString();
        saveShares(shares);

        res.json({ ok: true });
    });

    app.patch("/api/shares/:id", auth, (req, res) => {

        const { shares, share } = ownShare(req, res);
        if (!share) return;

        try { applySettings(share, req.body); }
        catch (error) { return res.status(400).json({ error: error.message }); }

        saveShares(shares);
        res.json({ ok: true });
    });

    // Видалити може будь-хто з двох: власник (відкликати/відхилити) або глядач (відписатися)
    app.delete("/api/shares/:id", auth, (req, res) => {

        const shares = readShares();
        const index = shares.findIndex(s => s.id === req.params.id &&
            (s.ownerId === req.user.id || s.viewerId === req.user.id));

        if (index === -1) {
            return res.status(404).json({ error: "Доступ не найден" });
        }

        shares.splice(index, 1);
        saveShares(shares);
        res.json({ ok: true });
    });


    // ---------- 3. Глядач: задачі власника ----------

    app.get("/api/shared/:ownerId/tasks", auth, (req, res) => {

        const share = activeShare(req.params.ownerId, req.user.id);

        if (!share) {
            return res.status(403).json({ error: "Нет доступа к этим задачам" });
        }

        const owner = readJson(usersFile).find(u => u.id === share.ownerId);
        const sessions = worklog.readSessions();

        const tasks = readJson(tasksFile)
            .filter(t => t.userId === share.ownerId)
            .map(t => {
                const w = worklog.withWork(t, sessions);
                // Глядачу — тільки те, що потрібно для перегляду
                return {
                    id: w.id, title: w.title, description: w.description,
                    category: w.category, subcategory: w.subcategory,
                    status: w.status, deadline: w.deadline, createdAt: w.createdAt,
                    completedAt: w.completedAt || null, marks: w.marks || []
                };
            });

        res.json({
            owner: person(owner),
            permission: share.permission,
            categories: (owner && owner.categories) || [],
            tasks
        });
    });


    // ---------- 4. Мітки ----------

    app.post("/api/shared/:ownerId/tasks/:taskId/mark", auth, (req, res) => {

        const share = activeShare(req.params.ownerId, req.user.id);

        if (!share || share.permission !== "mark") {
            return res.status(403).json({ error: "Нет права ставить метки" });
        }

        const type = req.body.type;

        if (type !== null && !MARK_TYPES.includes(type)) {
            return res.status(400).json({ error: "Недопустимая метка" });
        }

        const tasks = readJson(tasksFile);
        const task = tasks.find(t => t.id === Number(req.params.taskId) && t.userId === share.ownerId);

        if (!task) {
            return res.status(404).json({ error: "Задача не найдена" });
        }

        // В кожного помічника одна мітка на задачу: «допомагаю» → «завершено»
        task.marks = (task.marks || []).filter(m => m.userId !== req.user.id);

        const sessions = worklog.readSessions();
        let events = [];

        if (type) {
            task.marks.push({
                userId: req.user.id,
                type,
                name: req.user.name,
                color: userColor(req.user),
                at: new Date().toISOString()
            });
        }

        // «Завершено» — задача стає виконаною (мітка помічника лишається на ній)
        if (type === "done" && task.status !== "done") {
            events = worklog.onStatusChange(task, sessions, "done");
            task.status = "done";
            events.forEach(e => { e.data = { ...(e.data || {}), by: req.user.id }; });
        }

        writeJson(tasksFile, tasks);
        worklog.saveSessions(sessions);
        worklog.logEvents(share.ownerId, task.id, [
            ...events,
            { type: type ? `mark_${type}` : "mark_removed", data: { by: req.user.id } }
        ]);

        res.json({ ok: true, status: task.status, marks: task.marks });
    });

    // Власник може прибрати чужу мітку зі своєї задачі
    app.delete("/api/tasks/:id/marks/:userId", auth, (req, res) => {

        const tasks = readJson(tasksFile);
        const task = tasks.find(t => t.id === Number(req.params.id) && t.userId === req.user.id);

        if (!task) {
            return res.status(404).json({ error: "Задача не найдена" });
        }

        task.marks = (task.marks || []).filter(m => String(m.userId) !== String(req.params.userId));
        writeJson(tasksFile, tasks);

        res.json({ ok: true, marks: task.marks });
    });

    return { userColor };
};
