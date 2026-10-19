// ========================================
// ОТПРАВКА ПИСЕМ
// ----------------------------------------
// Если есть файл mail.config.json и установлен nodemailer —
// письма уходят на настоящую почту.
// Иначе (режим разработки) код просто печатается в терминале.
// ========================================

const fs = require("fs");
const path = require("path");

const configFile = path.join(__dirname, "mail.config.json");

let transporter = null;
let fromAddress = "";

function initMailer() {

    if (!fs.existsSync(configFile)) {
        console.log("📭 mail.config.json не найден — коды будут печататься в этом терминале.");
        return;
    }

    let nodemailer;

    try {
        nodemailer = require("nodemailer");
    } catch (error) {
        console.log("📭 nodemailer не установлен (npm install nodemailer) — коды будут печататься в терминале.");
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

        console.log(`📬 Письма отправляются с ${config.user}`);

    } catch (error) {
        console.log("📭 Ошибка в mail.config.json — коды будут печататься в терминале.", error.message);
    }
}

// Красивое письмо с кодом в стиле приложения
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

    // Режим разработки — печатаем в терминал
    if (!transporter) {
        console.log("\n==========================================");
        console.log(`✉️  ${isReset ? "Сброс пароля" : "Подтверждение почты"} для ${user.email}`);
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
