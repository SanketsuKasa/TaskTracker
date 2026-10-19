const addButton = document.querySelector(".add-button");
const taskList = document.querySelector(".task-list");
const searchInput = document.querySelector(".search input");

const taskModal = document.querySelector("#taskModal");
const closeModal = document.querySelector("#closeModal");
const cancelModal = document.querySelector("#cancelModal");
const taskForm = document.querySelector("#taskForm");

const taskTitle = document.querySelector("#taskTitle");
const taskDescription = document.querySelector("#taskDescription");
const taskCategory = document.querySelector("#taskCategory");

const totalTasks = document.querySelector("#totalTasks");
const inProgressTasks = document.querySelector("#inProgressTasks");
const completedTasks = document.querySelector("#completedTasks");


// ========================================
// ЗАГРУЗКА ЗАДАЧ
// ========================================

async function loadTasks() {

    try {

        const response = await fetch("/api/tasks");

        if (!response.ok) {
            throw new Error("Ошибка загрузки задач");
        }

        const tasks = await response.json();

        taskList.innerHTML = "";

        tasks.forEach(task => {
            renderTask(task);
        });

        updateStatistics();

    } catch (error) {

        console.error("Ошибка загрузки:", error);

    }

}


// ========================================
// СТАТИСТИКА
// ========================================

function updateStatistics() {

    const tasks =
        document.querySelectorAll(".task-card");

    let total = tasks.length;
    let completed = 0;
    let inProgress = 0;

    tasks.forEach(task => {

        const status =
            task.querySelector(".task-status");

        if (status.classList.contains("done")) {

            completed++;

        }

        if (status.classList.contains("progress")) {

            inProgress++;

        }

    });

    totalTasks.textContent = total;
    completedTasks.textContent = completed;
    inProgressTasks.textContent = inProgress;

}


// ========================================
// ОТКРЫТИЕ МОДАЛЬНОГО ОКНА
// ========================================

addButton.addEventListener("click", () => {

    taskModal.classList.add("active");

    taskTitle.focus();

});


// ========================================
// ЗАКРЫТИЕ МОДАЛЬНОГО ОКНА
// ========================================

function closeTaskModal() {

    taskModal.classList.remove("active");

    taskForm.reset();

}

closeModal.addEventListener(
    "click",
    closeTaskModal
);

cancelModal.addEventListener(
    "click",
    closeTaskModal
);

taskModal.addEventListener("click", (event) => {

    if (event.target === taskModal) {

        closeTaskModal();

    }

});


// ========================================
// СОЗДАНИЕ ЗАДАЧИ
// ========================================

taskForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const title =
        taskTitle.value.trim();

    const description =
        taskDescription.value.trim();

    const category =
        taskCategory.value;

    if (!title) {
        return;
    }

    try {

        const response = await fetch(
            "/api/tasks",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    title: title,
                    description: description,
                    category: category
                })
            }
        );

        if (!response.ok) {

            throw new Error(
                "Ошибка создания задачи"
            );

        }

        const task =
            await response.json();

        renderTask(task);

        updateStatistics();

        closeTaskModal();

    } catch (error) {

        console.error("Ошибка:", error);

        alert(
            "Не удалось создать задачу"
        );

    }

});


// ========================================
// ОТОБРАЖЕНИЕ ЗАДАЧИ
// ========================================

function renderTask(task) {

    const card =
        document.createElement("div");

    card.className = "task-card";


    // Проверяем текущий статус

    const isDone =
        task.status === "done";

    const isProgress =
        task.status === "progress";


    // Если задача выполнена

    if (isDone) {

        card.classList.add(
            "completed-task"
        );

    }


    // HTML задачи

    card.innerHTML = `

        <div class="task-check ${isDone ? "checked" : ""}">
            ✓
        </div>

        <div class="task-info">

            <h3>
                ${escapeHtml(task.title)}
            </h3>

            <p>
                ${escapeHtml(
                    task.description ||
                    "Без описания"
                )}
            </p>

            <div class="task-meta">

                <span class="tag purple-tag">

                    ${escapeHtml(
                        task.category ||
                        "Development"
                    )}

                </span>

                <span>
                    Today
                </span>

            </div>

        </div>


        <div class="task-status ${
            isDone
                ? "done"
                : isProgress
                    ? "progress"
                    : "todo"
        }">

            ${
                isDone
                    ? "Done"
                    : isProgress
                        ? "In Progress"
                        : "Todo"
            }

        </div>


        <button class="more">
            ⋮
        </button>

    `;


    taskList.prepend(card);


    // ========================================
    // ПЕРЕКЛЮЧЕНИЕ СТАТУСА
    // ========================================

    const check =
        card.querySelector(".task-check");


    check.addEventListener(
        "click",
        async () => {

            let newStatus;


            // Todo → In Progress

            if (task.status === "todo") {

                newStatus = "progress";

            }


            // In Progress → Done

            else if (
                task.status === "progress"
            ) {

                newStatus = "done";

            }


            // Done → Todo

            else {

                newStatus = "todo";

            }


            try {

                const response =
                    await fetch(
                        `/api/tasks/${task.id}`,
                        {
                            method: "PATCH",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                status:
                                    newStatus
                            })
                        }
                    );


                if (!response.ok) {

                    throw new Error(
                        "Ошибка изменения статуса"
                    );

                }


                const updatedTask =
                    await response.json();


                task.status =
                    updatedTask.status;


                // Получаем элементы

                const statusElement =
                    card.querySelector(
                        ".task-status"
                    );


                // ========================================
                // TODO
                // ========================================

                if (
                    task.status === "todo"
                ) {

                    check.classList.remove(
                        "checked"
                    );

                    card.classList.remove(
                        "completed-task"
                    );

                    statusElement.textContent =
                        "Todo";

                    statusElement.className =
                        "task-status todo";

                }


                // ========================================
                // IN PROGRESS
                // ========================================

                else if (
                    task.status === "progress"
                ) {

                    check.classList.remove(
                        "checked"
                    );

                    card.classList.remove(
                        "completed-task"
                    );

                    statusElement.textContent =
                        "In Progress";

                    statusElement.className =
                        "task-status progress";

                }


                // ========================================
                // DONE
                // ========================================

                else if (
                    task.status === "done"
                ) {

                    check.classList.add(
                        "checked"
                    );

                    card.classList.add(
                        "completed-task"
                    );

                    statusElement.textContent =
                        "Done";

                    statusElement.className =
                        "task-status done";

                }


                // Обновляем статистику

                updateStatistics();


            } catch (error) {

                console.error(error);

            }

        }
    );


    // ========================================
    // УДАЛЕНИЕ
    // ========================================

    const more =
        card.querySelector(".more");


    more.addEventListener(
        "click",
        async () => {

            const confirmDelete =
                confirm(
                    "Удалить эту задачу?"
                );


            if (!confirmDelete) {

                return;

            }


            try {

                const response =
                    await fetch(
                        `/api/tasks/${task.id}`,
                        {
                            method: "DELETE"
                        }
                    );


                if (!response.ok) {

                    throw new Error(
                        "Ошибка удаления"
                    );

                }


                card.remove();


                updateStatistics();


            } catch (error) {

                console.error(error);

            }

        }
    );

}


// ========================================
// ПОИСК
// ========================================

searchInput.addEventListener(
    "input",
    () => {

        const search =
            searchInput.value
                .toLowerCase();


        const tasks =
            document.querySelectorAll(
                ".task-card"
            );


        tasks.forEach(task => {

            const title =
                task.querySelector("h3")
                    .textContent
                    .toLowerCase();


            if (
                title.includes(search)
            ) {

                task.style.display =
                    "flex";

            } else {

                task.style.display =
                    "none";

            }

        });

    }
);


// ========================================
// ЗАЩИТА ОТ HTML
// ========================================

function escapeHtml(text) {

    const div =
        document.createElement("div");

    div.textContent = text;

    return div.innerHTML;

}


// ========================================
// ЗАПУСК
// ========================================

loadTasks();