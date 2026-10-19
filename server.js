const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { initMailer, sendCode } = require("./mailer");
const worklog = require("./worklog");

const app = express();
const PORT = 3000;

const tasksFile = path.join(__dirname, "tasks.json");
const usersFile = path.join(__dirname, "users.json");
const sessionsFile = path.join(__dirname, "sessions.json");

// Сессия живёт 30 дней
const SESSION_DAYS = 30;

// Папка для фото профиля
const avatarsDir = path.join(__dirname, "uploads", "avatars");
fs.mkdirSync(avatarsDir, { recursive: true });

// Разрешаем JSON-запросы (до 5 МБ — для фото)
app.use(express.json({ limit: "5mb" }));

// Подключаем сайт и загруженные фото
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Настраиваем отправку писем
initMailer();


// ==============================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==============================

// Прочитать JSON-файл (если файла нет — вернуть пустой массив)
function readJson(file) {

    if (!fs.existsSync(file)) {
        return [];
    }

    const data = fs.readFileSync(file, "utf8");

    return data.trim() ? JSON.parse(data) : [];
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Проверка даты формата YYYY-MM-DD
function isValidDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Проверка почты
function isValidEmail(value) {
    return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Хеширование пароля (пароль НЕ хранится в открытом виде)
function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString("hex");
}

// Создать сессию и вернуть токен
function createSession(userId) {

    const sessions = readJson(sessionsFile)
        // заодно чистим просроченные
        .filter(s => s.expiresAt > Date.now());

    const token = crypto.randomBytes(32).toString("hex");

    sessions.push({
        token: token,
        userId: userId,
        expiresAt: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
    });

    writeJson(sessionsFile, sessions);

    return token;
}

// Данные пользователя без пароля и кодов
function publicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || "",
        emailVerified: user.emailVerified !== false,
        createdAt: user.createdAt,
        settings: {
            productivityEnabled: Boolean(user.settings && user.settings.productivityEnabled)
        }
    };
}


// ==============================
// ПРОВЕРКА АВТОРИЗАЦИИ (middleware)
// ==============================

function auth(req, res, next) {

    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    const session = readJson(sessionsFile)
        .find(s => s.token === token && s.expiresAt > Date.now());

    if (!session) {
        return res.status(401).json({
            error: "Нужно войти в аккаунт"
        });
    }

    const user = readJson(usersFile).find(u => u.id === session.userId);

    if (!user || user.emailVerified === false) {
        return res.status(401).json({
            error: "Пользователь не найден"
        });
    }

    req.user = user;
    req.token = token;

    next();
}


// ==============================
// КОДЫ ИЗ ПИСЕМ
// ==============================

const CODE_MINUTES = 15;      // код живёт 15 минут
const RESEND_SECONDS = 60;    // повторно отправить можно через минуту
const MAX_ATTEMPTS = 5;       // попыток ввода кода

function sha256(text) {
    return crypto.createHash("sha256").update(String(text)).digest("hex");
}

// Создаёт 6-значный код, сохраняет в пользователе ТОЛЬКО его хеш
function createCode(user, purpose) {

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");

    user[`${purpose}Code`] = {
        hash: sha256(code),
        expiresAt: Date.now() + CODE_MINUTES * 60 * 1000,
        sentAt: Date.now(),
        attempts: 0
    };

    return code;
}

// Проверка кода. Возвращает текст ошибки или null, если всё хорошо
function checkCode(user, purpose, code) {

    const saved = user[`${purpose}Code`];

    if (!saved) {
        return "Сначала запросите код";
    }

    if (saved.expiresAt < Date.now()) {
        return "Код устарел — отправьте новый";
    }

    if (saved.attempts >= MAX_ATTEMPTS) {
        return "Слишком много попыток — отправьте новый код";
    }

    if (sha256(String(code || "").trim()) !== saved.hash) {
        saved.attempts++;
        return `Неверный код (осталось попыток: ${MAX_ATTEMPTS - saved.attempts})`;
    }

    delete user[`${purpose}Code`];

    return null;
}

// Можно ли уже отправить код повторно
function secondsUntilResend(user, purpose) {
    const saved = user[`${purpose}Code`];
    if (!saved) return 0;
    const left = Math.ceil((saved.sentAt + RESEND_SECONDS * 1000 - Date.now()) / 1000);
    return Math.max(0, left);
}

// Создать код, сохранить пользователей и отправить письмо
async function sendNewCode(users, user, purpose) {

    const code = createCode(user, purpose);

    writeJson(usersFile, users);

    const result = await sendCode(user, code, purpose);

    return result.delivered;
}

function findUserByEmail(users, email) {
    const clean = String(email || "").trim().toLowerCase();
    return users.find(u => u.email === clean);
}

// Удалить все сессии пользователя (кроме, при желании, одной)
function removeSessions(userId, keepToken = null) {
    const sessions = readJson(sessionsFile)
        .filter(s => s.userId !== userId || s.token === keepToken);
    writeJson(sessionsFile, sessions);
}

function loginResponse(user) {
    return {
        token: createSession(user.id),
        user: publicUser(user)
    };
}


// ==============================
// РЕГИСТРАЦИЯ
// ==============================

app.post("/api/register", async (req, res) => {

    try {

        const name = String(req.body.name || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        if (!name || name.length > 40) {
            return res.status(400).json({ error: "Введите имя (до 40 символов)" });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: "Некорректная почта" });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: "Пароль минимум 6 символов" });
        }

        const users = readJson(usersFile);

        let user = findUserByEmail(users, email);

        if (user && user.emailVerified !== false) {
            return res.status(409).json({ error: "Эта почта уже зарегистрирована" });
        }

        const salt = crypto.randomBytes(16).toString("hex");

        if (user) {

            // Почта зарегистрирована, но не подтверждена — обновляем данные
            if (secondsUntilResend(user, "verify") > 0) {
                return res.status(429).json({
                    error: `Подождите ${secondsUntilResend(user, "verify")} сек. перед повторной отправкой`
                });
            }

            user.name = name;
            user.salt = salt;
            user.passwordHash = hashPassword(password, salt);

        } else {

            user = {
                id: Date.now(),
                name: name,
                email: email,
                avatar: "",
                salt: salt,
                passwordHash: hashPassword(password, salt),
                emailVerified: false,
                createdAt: new Date().toISOString()
            };

            users.push(user);

            // Самый первый пользователь забирает старые задачи (без владельца)
            if (users.length === 1) {

                const tasks = readJson(tasksFile);

                tasks.forEach(task => {
                    if (!task.userId) {
                        task.userId = user.id;
                    }
                });

                writeJson(tasksFile, tasks);
            }
        }

        const delivered = await sendNewCode(users, user, "verify");

        res.status(201).json({
            needsVerification: true,
            email: user.email,
            delivered: delivered
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({ error: "Не удалось зарегистрироваться (проверьте настройки почты)" });

    }

});


// ==============================
// ПОДТВЕРЖДЕНИЕ ПОЧТЫ
// ==============================

app.post("/api/verify-email", (req, res) => {

    const users = readJson(usersFile);
    const user = findUserByEmail(users, req.body.email);

    if (!user) {
        return res.status(404).json({ error: "Пользователь не найден" });
    }

    if (user.emailVerified !== false) {
        return res.status(400).json({ error: "Почта уже подтверждена — просто войдите" });
    }

    const error = checkCode(user, "verify", req.body.code);

    if (error) {
        writeJson(usersFile, users); // сохраняем счётчик попыток
        return res.status(400).json({ error: error });
    }

    user.emailVerified = true;
    writeJson(usersFile, users);

    res.json(loginResponse(user));
});


// ==============================
// ОТПРАВИТЬ КОД ЕЩЁ РАЗ
// ==============================

app.post("/api/resend-code", async (req, res) => {

    try {

        const purpose = req.body.purpose === "reset" ? "reset" : "verify";

        const users = readJson(usersFile);
        const user = findUserByEmail(users, req.body.email);

        // Не рассказываем, есть ли такая почта
        if (!user || (purpose === "verify" && user.emailVerified !== false)) {
            return res.json({ message: "Если почта есть в системе — код отправлен" });
        }

        const wait = secondsUntilResend(user, purpose);

        if (wait > 0) {
            return res.status(429).json({ error: `Подождите ${wait} сек.` });
        }

        const delivered = await sendNewCode(users, user, purpose);

        res.json({ message: "Код отправлен", delivered: delivered });

    } catch (error) {

        console.error(error);

        res.status(500).json({ error: "Не удалось отправить письмо" });

    }

});


// ==============================
// ВХОД
// ==============================

app.post("/api/login", async (req, res) => {

    try {

        const password = String(req.body.password || "");

        const users = readJson(usersFile);
        const user = findUserByEmail(users, req.body.email);

        if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
            return res.status(401).json({ error: "Неверная почта или пароль" });
        }

        // Почта не подтверждена — отправляем новый код
        if (user.emailVerified === false) {

            let delivered = false;

            if (secondsUntilResend(user, "verify") === 0) {
                delivered = await sendNewCode(users, user, "verify");
            }

            return res.status(403).json({
                needsVerification: true,
                email: user.email,
                delivered: delivered,
                error: "Подтвердите почту — мы отправили код"
            });
        }

        res.json(loginResponse(user));

    } catch (error) {

        console.error(error);

        res.status(500).json({ error: "Не удалось войти" });

    }

});


// ==============================
// ЗАБЫЛИ ПАРОЛЬ
// ==============================

app.post("/api/forgot-password", async (req, res) => {

    try {

        const users = readJson(usersFile);
        const user = findUserByEmail(users, req.body.email);

        let delivered = false;

        if (user && secondsUntilResend(user, "reset") === 0) {
            delivered = await sendNewCode(users, user, "reset");
        }

        // Всегда одинаковый ответ — чтобы нельзя было проверить, чья почта зарегистрирована
        res.json({
            message: "Если почта есть в системе — мы отправили код",
            delivered: delivered
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({ error: "Не удалось отправить письмо" });

    }

});

app.post("/api/reset-password", (req, res) => {

    const password = String(req.body.password || "");

    if (password.length < 6) {
        return res.status(400).json({ error: "Пароль минимум 6 символов" });
    }

    const users = readJson(usersFile);
    const user = findUserByEmail(users, req.body.email);

    if (!user) {
        return res.status(400).json({ error: "Неверный код" });
    }

    const error = checkCode(user, "reset", req.body.code);

    if (error) {
        writeJson(usersFile, users);
        return res.status(400).json({ error: error });
    }

    user.salt = crypto.randomBytes(16).toString("hex");
    user.passwordHash = hashPassword(password, user.salt);

    // Код пришёл на почту — значит почта точно настоящая
    user.emailVerified = true;

    writeJson(usersFile, users);

    // Выкидываем все старые сессии
    removeSessions(user.id);

    res.json(loginResponse(user));
});


// ==============================
// ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ / ВЫХОД
// ==============================

app.get("/api/me", auth, (req, res) => {
    res.json(publicUser(req.user));
});

app.post("/api/logout", auth, (req, res) => {

    const sessions = readJson(sessionsFile)
        .filter(s => s.token !== req.token);

    writeJson(sessionsFile, sessions);

    res.json({ message: "Вы вышли" });
});


// ==============================
// ПРОФИЛЬ
// ==============================

// Изменить имя
app.patch("/api/profile", auth, (req, res) => {

    const name = String(req.body.name || "").trim();

    if (!name || name.length > 40) {
        return res.status(400).json({ error: "Имя от 1 до 40 символов" });
    }

    const users = readJson(usersFile);
    const user = users.find(u => u.id === req.user.id);

    user.name = name;
    writeJson(usersFile, users);

    res.json(publicUser(user));
});

// Удалить старый файл аватарки
function removeAvatarFile(user) {

    if (!user.avatar) return;

    const file = path.join(avatarsDir, path.basename(user.avatar));

    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
    }
}

// Загрузить фото (приходит как data:image/...;base64,...)
app.put("/api/profile/avatar", auth, (req, res) => {

    try {

        const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/
            .exec(String(req.body.image || ""));

        if (!match) {
            return res.status(400).json({ error: "Нужна картинка JPG, PNG или WEBP" });
        }

        const buffer = Buffer.from(match[2], "base64");

        if (buffer.length > 2 * 1024 * 1024) {
            return res.status(400).json({ error: "Картинка больше 2 МБ" });
        }

        const users = readJson(usersFile);
        const user = users.find(u => u.id === req.user.id);

        removeAvatarFile(user);

        const extension = match[1] === "jpeg" ? "jpg" : match[1];
        const fileName = `${user.id}-${Date.now()}.${extension}`;

        fs.writeFileSync(path.join(avatarsDir, fileName), buffer);

        user.avatar = `/uploads/avatars/${fileName}`;
        writeJson(usersFile, users);

        res.json(publicUser(user));

    } catch (error) {

        console.error(error);

        res.status(500).json({ error: "Не удалось сохранить фото" });

    }

});

// Удалить фото
app.delete("/api/profile/avatar", auth, (req, res) => {

    const users = readJson(usersFile);
    const user = users.find(u => u.id === req.user.id);

    removeAvatarFile(user);

    user.avatar = "";
    writeJson(usersFile, users);

    res.json(publicUser(user));
});

// Сменить пароль
app.post("/api/profile/password", auth, (req, res) => {

    const current = String(req.body.currentPassword || "");
    const next = String(req.body.newPassword || "");

    const users = readJson(usersFile);
    const user = users.find(u => u.id === req.user.id);

    if (hashPassword(current, user.salt) !== user.passwordHash) {
        return res.status(400).json({ error: "Текущий пароль неверный" });
    }

    if (next.length < 6) {
        return res.status(400).json({ error: "Новый пароль минимум 6 символов" });
    }

    user.salt = crypto.randomBytes(16).toString("hex");
    user.passwordHash = hashPassword(next, user.salt);
    writeJson(usersFile, users);

    // Выходим на всех остальных устройствах
    removeSessions(user.id, req.token);

    res.json({ message: "Пароль изменён" });
});


// ==============================
// НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ
// ==============================

app.patch("/api/settings", auth, (req, res) => {

    const users = readJson(usersFile);
    const user = users.find(u => u.id === req.user.id);

    user.settings = user.settings || {};

    if (req.body.productivityEnabled !== undefined) {
        user.settings.productivityEnabled = Boolean(req.body.productivityEnabled);
    }

    writeJson(usersFile, users);

    res.json(publicUser(user));
});


// ==============================
// КАТЕГОРИИ (у каждого пользователя свои)
// ==============================

const DEFAULT_CATEGORIES = [
    { name: "Development", subs: [] },
    { name: "Design", subs: [] },
    { name: "Study", subs: ["Aviation Security Labs", "English"] },
    { name: "Personal", subs: [] }
];

// Базовые категории есть у всех и не удаляются
const BASE_CATEGORY_NAMES = DEFAULT_CATEGORIES.map(c => c.name);

function isBaseCategory(name) {
    return BASE_CATEGORY_NAMES.includes(name);
}

// Базовые категории всегда в начале списка (с подкатегориями пользователя),
// за ними — свои категории пользователя
function withBaseCategories(list) {

    const saved = Array.isArray(list) ? list : DEFAULT_CATEGORIES;

    const base = DEFAULT_CATEGORIES.map(def => {
        const own = saved.find(c => c.name === def.name);
        return { name: def.name, subs: own ? own.subs : def.subs, base: true };
    });

    const custom = saved
        .filter(c => !isBaseCategory(c.name))
        .map(c => ({ name: c.name, subs: c.subs, base: false }));

    return [...base, ...custom];
}

function getCategories(user) {
    return withBaseCategories(user.categories);
}

// Проверяем и чистим список категорий, который прислал браузер
function cleanCategories(input) {

    if (!Array.isArray(input) || input.length > 50) {
        throw new Error("Слишком много категорий (максимум 50)");
    }

    const seen = new Set();

    return input.map(item => {

        const name = String(item && item.name || "").trim();

        if (!name || name.length > 30) {
            throw new Error("Название категории — от 1 до 30 символов");
        }

        if (seen.has(name.toLowerCase())) {
            throw new Error(`Категория «${name}» уже есть`);
        }
        seen.add(name.toLowerCase());

        const subsSeen = new Set();
        const subs = (Array.isArray(item.subs) ? item.subs : []).map(sub => {

            const subName = String(sub || "").trim();

            if (!subName || subName.length > 40) {
                throw new Error("Название подкатегории — от 1 до 40 символов");
            }

            if (subsSeen.has(subName.toLowerCase())) {
                throw new Error(`Подкатегория «${subName}» уже есть`);
            }
            subsSeen.add(subName.toLowerCase());

            return subName;
        });

        if (subs.length > 30) {
            throw new Error("Максимум 30 подкатегорий в одной категории");
        }

        return { name, subs };
    });
}

app.get("/api/categories", auth, (req, res) => {
    res.json(getCategories(req.user));
});

app.put("/api/categories", auth, (req, res) => {

    try {

        // Базовые категории вернутся, даже если их убрали из списка
        const categories = withBaseCategories(cleanCategories(req.body.categories))
            .map(({ name, subs }) => ({ name, subs }));

        const users = readJson(usersFile);
        const user = users.find(u => u.id === req.user.id);

        user.categories = categories;
        writeJson(usersFile, users);

        res.json(getCategories(user));

    } catch (error) {

        res.status(400).json({ error: error.message });

    }
});

// Переименовать категорию или подкатегорию (вместе с задачами)
// { category, newName }            — категорию
// { category, sub, newName }       — подкатегорию
app.post("/api/categories/rename", auth, (req, res) => {

    try {

        const categoryName = String(req.body.category || "").trim();
        const subName = req.body.sub !== undefined ? String(req.body.sub).trim() : null;
        const newName = String(req.body.newName || "").trim();

        const users = readJson(usersFile);
        const user = users.find(u => u.id === req.user.id);

        const list = getCategories(user).map(({ name, subs }) => ({ name, subs: [...subs] }));
        const category = list.find(c => c.name === categoryName);

        if (!category) {
            return res.status(404).json({ error: "Категория не найдена" });
        }

        const tasks = readJson(tasksFile);
        const ownTasks = tasks.filter(t => t.userId === user.id && (t.category || "Development") === categoryName);

        if (subName === null) {

            if (isBaseCategory(categoryName)) {
                return res.status(400).json({ error: "Базовые категории нельзя переименовать" });
            }

            category.name = newName;
            ownTasks.forEach(t => { t.category = newName; });

        } else {

            const index = category.subs.indexOf(subName);

            if (index === -1) {
                return res.status(404).json({ error: "Подкатегория не найдена" });
            }

            category.subs[index] = newName;
            ownTasks.filter(t => t.subcategory === subName).forEach(t => { t.subcategory = newName; });
        }

        // Проверяем новый список (пустые и повторяющиеся названия не пройдут)
        user.categories = cleanCategories(list);

        writeJson(usersFile, users);
        writeJson(tasksFile, tasks);

        res.json({
            categories: getCategories(user),
            tasks: tasks.filter(t => t.userId === user.id)
        });

    } catch (error) {

        res.status(400).json({ error: error.message });

    }
});

// Короткая проверка текстовых полей задачи
function cleanText(value, max) {
    return String(value || "").trim().slice(0, max);
}


// Все запросы к задачам — только для вошедших
app.use("/api/tasks", auth);


// ==============================
// ПОЛУЧИТЬ ЗАДАЧИ ПОЛЬЗОВАТЕЛЯ
// ==============================

app.get("/api/tasks", (req, res) => {

    try {

        const sessions = worklog.readSessions();

        const tasks = readJson(tasksFile)
            .filter(task => task.userId === req.user.id)
            .map(task => worklog.withWork(task, sessions));

        // Время сервера — чтобы таймер в браузере не зависел от неточных часов
        res.set("X-Server-Time", new Date().toISOString());

        res.json(tasks);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Не удалось загрузить задачи"
        });

    }

});


// ==============================
// ДОБАВИТЬ ЗАДАЧУ
// ==============================

app.post("/api/tasks", (req, res) => {

    try {

        const title = String(req.body.title || "").trim();

        if (!title) {
            return res.status(400).json({ error: "Введите название" });
        }

        let plan;

        try {
            plan = worklog.parsePlanFields(req.body);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        const tasks = readJson(tasksFile);

        const newTask = {
            id: Date.now(),
            userId: req.user.id,
            title: title,
            description: cleanText(req.body.description, 5000),
            category: cleanText(req.body.category, 30) || "Development",
            subcategory: cleanText(req.body.subcategory, 40),
            deadline: isValidDate(req.body.deadline) ? req.body.deadline : "",
            status: "todo",
            workState: null,
            createdAt: new Date().toISOString(),
            ...plan
        };

        // Первоначальный план сохраняем отдельно — он не перезаписывается
        newTask.initialPlan = worklog.initialPlan(newTask);

        tasks.push(newTask);

        writeJson(tasksFile, tasks);

        const events = [{ type: "created", data: newTask.initialPlan }];
        if (newTask.plannedStartAt) {
            events.push({ type: "planned_start_set", data: { to: newTask.plannedStartAt } });
        }
        worklog.logEvents(req.user.id, newTask.id, events);

        res.status(201).json(worklog.withWork(newTask, worklog.readSessions()));

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Не удалось создать задачу"
        });

    }

});


// ==============================
// УДАЛИТЬ ЗАДАЧУ
// ==============================

app.delete("/api/tasks/:id", (req, res) => {

    try {

        const id = Number(req.params.id);

        const tasks = readJson(tasksFile);

        const task = tasks.find(t => t.id === id && t.userId === req.user.id);

        if (!task) {
            return res.status(404).json({ error: "Задача не найдена" });
        }

        writeJson(tasksFile, tasks.filter(t => t !== task));

        res.json({
            message: "Задача удалена"
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Не удалось удалить задачу"
        });

    }

});


// ==============================
// ИЗМЕНИТЬ СТАТУС / ДЕДЛАЙН
// ==============================

app.patch("/api/tasks/:id", (req, res) => {

    try {

        const tasks = readJson(tasksFile);

        const id = Number(req.params.id);

        const task = tasks.find(t => t.id === id && t.userId === req.user.id);

        if (!task) {

            return res.status(404).json({
                error: "Задача не найдена"
            });

        }

        // Поля плана (сложность, оценка, сроки) — проверяем до любых изменений
        let plan;

        try {
            plan = worklog.parsePlanFields(req.body);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        const sessions = worklog.readSessions();
        const before = { ...task };
        let statusEvents = [];

        // Разрешенные статусы
        const allowedStatuses = [
            "todo",
            "progress",
            "done"
        ];

        // Меняем статус (если передан)
        if (req.body.status !== undefined) {

            if (!allowedStatuses.includes(req.body.status)) {

                return res.status(400).json({
                    error: "Недопустимый статус"
                });

            }

            statusEvents = worklog.onStatusChange(task, sessions, req.body.status);
            task.status = req.body.status;

        }

        // Меняем текстовые поля (если переданы) — для редактирования задачи
        if (req.body.title !== undefined) {

            const title = cleanText(req.body.title, 200);

            if (!title) {
                return res.status(400).json({ error: "Введите название" });
            }

            task.title = title;
        }

        if (req.body.description !== undefined) {
            task.description = cleanText(req.body.description, 5000);
        }

        if (req.body.category !== undefined) {
            task.category = cleanText(req.body.category, 30) || "Development";
        }

        if (req.body.subcategory !== undefined) {
            task.subcategory = cleanText(req.body.subcategory, 40);
        }

        // Меняем дедлайн (если передан). "" = убрать дедлайн
        if (req.body.deadline !== undefined) {

            if (req.body.deadline !== "" && !isValidDate(req.body.deadline)) {

                return res.status(400).json({
                    error: "Недопустимая дата"
                });

            }

            task.deadline = req.body.deadline;

        }

        Object.assign(task, plan);

        writeJson(tasksFile, tasks);
        worklog.saveSessions(sessions);

        // Журнал: что изменилось в плане (старые значения остаются в событиях)
        worklog.logEvents(req.user.id, task.id, [
            ...statusEvents,
            ...worklog.planChangeEvents(before, { ...plan, deadline: req.body.deadline })
        ]);

        res.json(worklog.withWork(task, sessions));

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Не удалось изменить задачу"
        });

    }

});


// ==============================
// РАБОТА НАД ЗАДАЧЕЙ: Почати / Призупинити / Продовжити / Завершити
// ==============================

app.post("/api/tasks/:id/work", (req, res) => {

    try {

        const tasks = readJson(tasksFile);
        const task = tasks.find(t => t.id === Number(req.params.id) && t.userId === req.user.id);

        if (!task) {
            return res.status(404).json({ error: "Задача не найдена" });
        }

        const sessions = worklog.readSessions();
        const result = worklog.applyWorkAction(task, sessions, String(req.body.action || ""), req.body);

        if (result.error) {
            return res.status(result.code).json({ error: result.error });
        }

        writeJson(tasksFile, tasks);
        worklog.saveSessions(sessions);
        worklog.logEvents(req.user.id, task.id, result.events);

        res.set("X-Server-Time", new Date().toISOString());
        res.json(worklog.withWork(task, sessions));

    } catch (error) {

        console.error(error);
        res.status(500).json({ error: "Не удалось изменить задачу" });

    }
});

// История задачи: все сессии и события
app.get("/api/tasks/:id/history", (req, res) => {

    const id = Number(req.params.id);
    const task = readJson(tasksFile).find(t => t.id === id && t.userId === req.user.id);

    if (!task) {
        return res.status(404).json({ error: "Задача не найдена" });
    }

    res.json({
        sessions: worklog.readSessions().filter(s => s.taskId === id),
        events: worklog.getEvents(req.user.id, id)
    });
});


// ==============================
// ЗАПУСК
// ==============================

app.listen(PORT, () => {

    console.log(
        `Task Tracker запущен: http://localhost:${PORT}`
    );

});
