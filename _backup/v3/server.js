const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = 3000;

const tasksFile = path.join(__dirname, "tasks.json");
const usersFile = path.join(__dirname, "users.json");
const sessionsFile = path.join(__dirname, "sessions.json");

// Сессия живёт 30 дней
const SESSION_DAYS = 30;

// Разрешаем JSON-запросы
app.use(express.json());

// Подключаем сайт
app.use(express.static(path.join(__dirname, "public")));


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

// Данные пользователя без пароля
function publicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email
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

    if (!user) {
        return res.status(401).json({
            error: "Пользователь не найден"
        });
    }

    req.user = user;
    req.token = token;

    next();
}


// ==============================
// РЕГИСТРАЦИЯ
// ==============================

app.post("/api/register", (req, res) => {

    try {

        const name = String(req.body.name || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        if (!name) {
            return res.status(400).json({ error: "Введите имя" });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: "Некорректная почта" });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: "Пароль минимум 6 символов" });
        }

        const users = readJson(usersFile);

        if (users.some(u => u.email === email)) {
            return res.status(409).json({ error: "Эта почта уже зарегистрирована" });
        }

        const salt = crypto.randomBytes(16).toString("hex");

        const user = {
            id: Date.now(),
            name: name,
            email: email,
            salt: salt,
            passwordHash: hashPassword(password, salt),
            createdAt: new Date().toISOString()
        };

        users.push(user);
        writeJson(usersFile, users);

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

        const token = createSession(user.id);

        res.status(201).json({
            token: token,
            user: publicUser(user)
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({ error: "Не удалось зарегистрироваться" });

    }

});


// ==============================
// ВХОД
// ==============================

app.post("/api/login", (req, res) => {

    try {

        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        const user = readJson(usersFile).find(u => u.email === email);

        if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
            return res.status(401).json({ error: "Неверная почта или пароль" });
        }

        const token = createSession(user.id);

        res.json({
            token: token,
            user: publicUser(user)
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({ error: "Не удалось войти" });

    }

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


// Все запросы к задачам — только для вошедших
app.use("/api/tasks", auth);


// ==============================
// ПОЛУЧИТЬ ЗАДАЧИ ПОЛЬЗОВАТЕЛЯ
// ==============================

app.get("/api/tasks", (req, res) => {

    try {

        const tasks = readJson(tasksFile)
            .filter(task => task.userId === req.user.id);

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

        const tasks = readJson(tasksFile);

        const newTask = {
            id: Date.now(),
            userId: req.user.id,
            title: title,
            description: req.body.description || "",
            category: req.body.category || "Development",
            deadline: isValidDate(req.body.deadline) ? req.body.deadline : "",
            status: "todo"
        };

        tasks.push(newTask);

        writeJson(tasksFile, tasks);

        res.status(201).json(newTask);

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

            task.status = req.body.status;

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

        writeJson(tasksFile, tasks);

        res.json(task);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Не удалось изменить задачу"
        });

    }

});


// ==============================
// ЗАПУСК
// ==============================

app.listen(PORT, () => {

    console.log(
        `Task Tracker запущен: http://localhost:${PORT}`
    );

});
