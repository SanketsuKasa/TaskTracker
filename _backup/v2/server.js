const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

const tasksFile = path.join(__dirname, "tasks.json");

// Разрешаем JSON-запросы
app.use(express.json());

// Подключаем сайт
app.use(express.static(path.join(__dirname, "public")));


// Проверка даты формата YYYY-MM-DD
function isValidDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}


// ==============================
// ПОЛУЧИТЬ ВСЕ ЗАДАЧИ
// ==============================

app.get("/api/tasks", (req, res) => {

    try {

        const data = fs.readFileSync(tasksFile, "utf8");
        const tasks = JSON.parse(data);

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

        const data = fs.readFileSync(tasksFile, "utf8");
        const tasks = JSON.parse(data);

        const newTask = {
            id: Date.now(),
            title: req.body.title,
            description: req.body.description || "",
            category: req.body.category || "Development",
            deadline: isValidDate(req.body.deadline) ? req.body.deadline : "",
            status: "todo"
        };

        tasks.push(newTask);

        fs.writeFileSync(
            tasksFile,
            JSON.stringify(tasks, null, 2)
        );

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

        const data = fs.readFileSync(tasksFile, "utf8");
        let tasks = JSON.parse(data);

        const id = Number(req.params.id);

        tasks = tasks.filter(task => task.id !== id);

        fs.writeFileSync(
            tasksFile,
            JSON.stringify(tasks, null, 2)
        );

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
// ИЗМЕНИТЬ СТАТУС
// ==============================

app.patch("/api/tasks/:id", (req, res) => {

    try {

        const data = fs.readFileSync(tasksFile, "utf8");
        const tasks = JSON.parse(data);

        const id = Number(req.params.id);

        const task = tasks.find(task => task.id === id);

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

        fs.writeFileSync(
            tasksFile,
            JSON.stringify(tasks, null, 2)
        );

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