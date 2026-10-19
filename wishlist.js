// ========================================
// ВІШЛІСТ
// ----------------------------------------
// wishlist.json — бажання (окремо від задач, у задачі не потрапляють):
//   { id, userId, title, description, deadline, price, currency,
//     need: "whim" | "want" | "need" | "", hearts: 1..5 | null,
//     received: false, createdAt, receivedAt }
//
// Бачити чужий вішліст можна, якщо власник дав доступ «Вішліст» (див. sharing.js)
// ========================================

const path = require("path");
const crypto = require("crypto");

const wishlistFile = path.join(__dirname, "wishlist.json");

const NEEDS = ["whim", "want", "need"];
const CURRENCIES = ["₴", "$", "€"];

module.exports = function registerWishlist(app, ctx) {

    const { readJson, writeJson, usersFile, auth, isValidDate, sharing } = ctx;

    const readWishes = () => readJson(wishlistFile);
    const saveWishes = list => writeJson(wishlistFile, list);

    // Перевіряє тільки передані поля. Повертає об'єкт змін або кидає помилку
    function parseWish(body, isNew) {

        const wish = {};

        if (isNew || body.title !== undefined) {
            const title = String(body.title || "").trim().slice(0, 200);
            if (!title) throw new Error("Введите название");
            wish.title = title;
        }

        if (body.description !== undefined) {
            wish.description = String(body.description || "").trim().slice(0, 5000);
        }

        if (body.deadline !== undefined) {
            if (body.deadline !== "" && body.deadline !== null && !isValidDate(body.deadline)) {
                throw new Error("Недопустимая дата");
            }
            wish.deadline = body.deadline || "";
        }

        if (body.price !== undefined) {
            if (body.price === "" || body.price === null) {
                wish.price = null;
            } else {
                const price = Number(body.price);
                if (!Number.isFinite(price) || price < 0 || price > 1e9) throw new Error("Недопустимая цена");
                wish.price = Math.round(price * 100) / 100;
            }
        }

        if (body.currency !== undefined) {
            wish.currency = CURRENCIES.includes(body.currency) ? body.currency : "₴";
        }

        if (body.need !== undefined) {
            if (body.need && !NEEDS.includes(body.need)) throw new Error("Недопустимый уровень необходимости");
            wish.need = body.need || "";
        }

        if (body.hearts !== undefined) {
            if (body.hearts === null || body.hearts === "" || body.hearts === 0) {
                wish.hearts = null;
            } else {
                const hearts = Number(body.hearts);
                if (!Number.isInteger(hearts) || hearts < 1 || hearts > 5) throw new Error("Сердечек — от 1 до 5");
                wish.hearts = hearts;
            }
        }

        if (body.received !== undefined) {
            wish.received = Boolean(body.received);
        }

        return wish;
    }


    // ---------- Мій вішліст ----------

    app.get("/api/wishlist", auth, (req, res) => {
        res.json(readWishes().filter(w => w.userId === req.user.id));
    });

    app.post("/api/wishlist", auth, (req, res) => {

        let data;
        try { data = parseWish(req.body, true); }
        catch (error) { return res.status(400).json({ error: error.message }); }

        const wishes = readWishes();

        const wish = {
            id: `wsh_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`,
            userId: req.user.id,
            title: "",
            description: "",
            deadline: "",
            price: null,
            currency: "₴",
            need: "",
            hearts: null,
            received: false,
            createdAt: new Date().toISOString(),
            receivedAt: null,
            ...data
        };

        if (wish.received) wish.receivedAt = wish.createdAt;

        wishes.push(wish);
        saveWishes(wishes);

        res.status(201).json(wish);
    });

    app.patch("/api/wishlist/:id", auth, (req, res) => {

        const wishes = readWishes();
        const wish = wishes.find(w => w.id === req.params.id && w.userId === req.user.id);

        if (!wish) {
            return res.status(404).json({ error: "Желание не найдено" });
        }

        let data;
        try { data = parseWish(req.body, false); }
        catch (error) { return res.status(400).json({ error: error.message }); }

        if (data.received !== undefined && data.received !== wish.received) {
            wish.receivedAt = data.received ? new Date().toISOString() : null;
        }

        Object.assign(wish, data);
        saveWishes(wishes);

        res.json(wish);
    });

    app.delete("/api/wishlist/:id", auth, (req, res) => {

        const wishes = readWishes();
        const index = wishes.findIndex(w => w.id === req.params.id && w.userId === req.user.id);

        if (index === -1) {
            return res.status(404).json({ error: "Желание не найдено" });
        }

        wishes.splice(index, 1);
        saveWishes(wishes);

        res.json({ ok: true });
    });


    // ---------- Чужий вішліст (якщо поділилися) ----------

    app.get("/api/shared/:ownerId/wishlist", auth, (req, res) => {

        const share = sharing.canView(req.params.ownerId, req.user.id, "wishlist");

        if (!share) {
            return res.status(403).json({ error: "Нет доступа к этому вишлисту" });
        }

        const owner = readJson(usersFile).find(u => u.id === share.ownerId);

        res.json({
            owner: sharing.person(owner),
            wishes: readWishes()
                .filter(w => w.userId === share.ownerId)
                .map(({ userId, ...wish }) => wish)
        });
    });
};
