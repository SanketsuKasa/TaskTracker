// ========================================
// НАДСИЛАННЯ ЛИСТІВ
// ----------------------------------------
// Якщо є файл mail.config.json і встановлено nodemailer —
// листи йдуть на справжню пошту.
// Інакше (режим розробки) код просто друкується в терміналі.
// ========================================

const fs = require("fs");
const path = require("path");

const configFile = path.join(__dirname, "mail.config.json");

let transporter = null;
let fromAddress = "";

function initMailer() {

    if (!fs.existsSync(configFile)) {
        console.log("📭 mail.config.json не знайдено — коди друкуватимуться в цьому терміналі.");
        return;
    }

    let nodemailer;

    try {
        nodemailer = require("nodemailer");
    } catch (error) {
        console.log("📭 nodemailer не встановлено (npm install nodemailer) — коди друкуватимуться в терміналі.");
        return;
    }

    try {

        const config = JSON.parse(fs.readFileSync(configFile, "utf8"));

        transporter = nodemailer.createTransport({
            host: config.host || "smtp.gmail.com",
            port: config.port || 465,
            secure: (config.port || 465) === 465,
            auth: {
                user: config.user,
                pass: config.pass
            }
        });

        fromAddress = `"${config.fromName || "Task Tracker"}" <${config.user}>`;

        console.log(`📬 Листи надсилаються з ${config.user}`);

    } catch (error) {
        console.log("📭 Помилка в mail.config.json — коди друкуватимуться в терміналі.", error.message);
    }
}

// Гарний лист із кодом у стилі застосунку
function codeEmailHtml(name, code, text) {
    return `
<div style="background:#0d0f14;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:440px;margin:0 auto;background:#151820;border:1px solid #292e39;border-radius:16px;padding:32px;color:#ffffff">
    <div style="font-size:18px;font-weight:700;margin-bottom:24px">
      <span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;background:#7c5cff;border-radius:8px;margin-right:8px">✓</span>
      Task Tracker
    </div>
    <p style="color:#d5d8df;font-size:15px;margin:0 0 8px">Hi ${name},</p>
    <p style="color:#9aa0ae;font-size:14px;margin:0 0 24px">${text}</p>
    <div style="font-size:34px;font-weight:700;letter-spacing:10px;text-align:center;background:#211c3b;color:#c4b2ff;border-radius:12px;padding:18px 0">${code}</div>
    <p style="color:#606777;font-size:12px;margin:24px 0 0">The code is valid for 15 minutes. If you didn't request it, just ignore this email.</p>
  </div>
</div>`;
}

async function sendCode(user, code, purpose) {

    const isReset = purpose === "reset";

    const subject = isReset
        ? `${code} — reset your Task Tracker password`
        : `${code} — confirm your Task Tracker email`;

    const text = isReset
        ? "Use this code to set a new password:"
        : "Use this code to confirm your email address:";

    // Режим розробки — друкуємо в термінал
    if (!transporter) {
        console.log("\n==========================================");
        console.log(`✉️  ${isReset ? "Скидання пароля" : "Підтвердження пошти"} для ${user.email}`);
        console.log(`    КОД: ${code}`);
        console.log("==========================================\n");
        return { delivered: false };
    }

    await transporter.sendMail({
        from: fromAddress,
        to: user.email,
        subject: subject,
        text: `${text} ${code}\nThe code is valid for 15 minutes.`,
        html: codeEmailHtml(user.name, code, text)
    });

    return { delivered: true };
}

// Просте повідомлення (наприклад: «X хоче бачити ваші задачі»)
async function sendNotice(user, subject, text) {

    if (!transporter) {
        console.log("\n==========================================");
        console.log(`✉️  ${user.email}: ${subject}`);
        console.log(`    ${text}`);
        console.log("==========================================\n");
        return { delivered: false };
    }

    const safe = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    await transporter.sendMail({
        from: fromAddress,
        to: user.email,
        subject,
        text,
        html: `
<div style="background:#0d0f14;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:440px;margin:0 auto;background:#151820;border:1px solid #292e39;border-radius:16px;padding:32px;color:#ffffff">
    <div style="font-size:18px;font-weight:700;margin-bottom:24px">
      <span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;background:#7c5cff;border-radius:8px;margin-right:8px">✓</span>
      Task Tracker
    </div>
    <p style="color:#d5d8df;font-size:15px;margin:0 0 8px">Hi ${safe(user.name)},</p>
    <p style="color:#9aa0ae;font-size:14px;margin:0">${safe(text)}</p>
  </div>
</div>`
    });

    return { delivered: true };
}

module.exports = {
    initMailer,
    sendCode,
    sendNotice
};
