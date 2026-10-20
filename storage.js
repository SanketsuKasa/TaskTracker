// ========================================
// ЗБЕРІГАННЯ ДАНИХ У JSON-ФАЙЛАХ
// ----------------------------------------
// Одне місце для читання/запису, яким користуються server.js, worklog.js,
// sharing.js і wishlist.js.
//
// Запис «атомарний»: спершу пишемо в тимчасовий файл, потім одним кроком
// підміняємо ним старий. Якщо сервер зупинити (Ctrl+C) прямо під час запису,
// файл не залишиться обрізаним — буде або стара, або нова версія.
// ========================================

const fs = require("fs");

// Прочитати JSON-файл (якщо файлу немає або він порожній — порожній масив)
function readJson(file) {

    if (!fs.existsSync(file)) {
        return [];
    }

    const data = fs.readFileSync(file, "utf8");

    return data.trim() ? JSON.parse(data) : [];
}

function writeJson(file, data) {

    const text = JSON.stringify(data, null, 2);
    const temp = `${file}.tmp`;

    try {
        fs.writeFileSync(temp, text);
        fs.renameSync(temp, file);
    } catch (error) {
        // Буває, що Windows/OneDrive ненадовго блокує файл і не дає підмінити його —
        // тоді просто пишемо напряму, як раніше
        try { fs.unlinkSync(temp); } catch (ignore) { }
        fs.writeFileSync(file, text);
    }
}

module.exports = { readJson, writeJson };
