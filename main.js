const readline = require("readline");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    blue: "\x1b[34m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
    bold: "\x1b[1m"
};

const WIDTH = 48;

function clearScreen() {
    console.clear();
}

function center(text) {
    const padding = WIDTH - text.length;
    const left = Math.floor(padding / 2);
    const right = padding - left;

    return "║" + " ".repeat(left) + text + " ".repeat(right) + "║";
}

function emptyLine() {
    return "║" + " ".repeat(WIDTH) + "║";
}

function showMenu() {
    clearScreen();

    console.log(colors.cyan + colors.bold);

    console.log("╔" + "═".repeat(WIDTH) + "╗");
    console.log(emptyLine());
    console.log(center("TASK TRACKER"));
    console.log(emptyLine());
    console.log("╠" + "═".repeat(WIDTH) + "╣");
    console.log(emptyLine());

    console.log("║   [1]  >  Додати задачу                         ║");
    console.log("║   [2]  #  Показати задачі                       ║");
    console.log("║   [3]  *  Змінити задачу                        ║");
    console.log("║   [4]  +  Завершити задачу                      ║");
    console.log("║   [5]  -  Видалити задачу                       ║");

    console.log(emptyLine());
    console.log("║   [0]  <  Вийти                                 ║");
    console.log(emptyLine());

    console.log("╚" + "═".repeat(WIDTH) + "╝");

    console.log(colors.reset);

    rl.question(
        colors.white + "  > " + colors.reset,
        handleChoice
    );
}

function handleChoice(choice) {
    switch (choice.trim()) {
        case "1":
            console.log("\n  Додавання задачі...");
            pause();
            break;

        case "2":
            console.log("\n  Список задач...");
            pause();
            break;

        case "3":
            console.log("\n  Зміна задачі...");
            pause();
            break;

        case "4":
            console.log("\n  Завершення задачі...");
            pause();
            break;

        case "5":
            console.log("\n  Видалення задачі...");
            pause();
            break;

        case "0":
            console.log("\n  До побачення!\n");
            rl.close();
            break;

        default:
            console.log(
                colors.red +
                "\n  Невірний вибір. Введіть число від 0 до 5." +
                colors.reset
            );
            pause();
    }
}

function pause() {
    rl.question(
        colors.gray + "\n  Натисніть Enter, щоб повернутися до меню..." + colors.reset,
        () => {
            showMenu();
        }
    );
}

showMenu();