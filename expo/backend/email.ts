let nodemailer: any = null;

async function getNodemailer() {
  if (nodemailer) return nodemailer;
  try {
    nodemailer = require("nodemailer");
    return nodemailer;
  } catch {
    console.error("[Email] nodemailer not available, trying dynamic import");
    try {
      nodemailer = await import("nodemailer");
      return nodemailer;
    } catch (e) {
      console.error("[Email] Failed to load nodemailer:", e);
      return null;
    }
  }
}

let transporter: any = null;

async function getTransporter() {
  if (transporter) return transporter;

  const nm = await getNodemailer();
  if (!nm) {
    console.error("[Email] Cannot create transporter - nodemailer not available");
    return null;
  }

  const createTransport = nm.createTransport || nm.default?.createTransport;
  if (!createTransport) {
    console.error("[Email] createTransport not found on nodemailer module");
    return null;
  }

  const host = process.env.SMTP_HOST || "";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASSWORD || "";
  const secure = process.env.SMTP_SECURE === "ssl" || process.env.SMTP_SECURE === "true";
  if (!host || !user || !pass) {
    console.warn("[Email] SMTP env is incomplete (SMTP_HOST/SMTP_USER/SMTP_PASSWORD). Email sending will be disabled.");
    return null;
  }

  console.log("[Email] Creating SMTP transporter:", host, port, "secure:", secure);

  transporter = createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporter;
}

export async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  try {
    const t = await getTransporter();
    if (!t) {
      console.error("[Email] No transporter available");
      return false;
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@musorka.su";

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #0E8B56; margin-bottom: 8px;">Musorka</h2>
        <p>Здравствуйте!</p>
        <p>Ваш код подтверждения для входа в сервис Musorka:</p>
        <div style="background: #f4f4f4; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0E8B56;">${code}</span>
        </div>
        <p>Код действует 5 минут.</p>
        <p style="color: #888; font-size: 13px;">Если вы не запрашивали этот код — просто проигнорируйте письмо.</p>
      </div>
    `;

    const info = await t.sendMail({
      from: `"Musorka" <${from}>`,
      to,
      subject: "Код подтверждения Musorka",
      text: `Здравствуйте!\n\nВаш код подтверждения для входа в сервис Musorka:\n\n${code}\n\nКод действует 5 минут.\n\nЕсли вы не запрашивали этот код — просто проигнорируйте письмо.`,
      html,
    });

    const at = to.indexOf("@");
    const toMask = at > 0 ? `${to[0]}***@${to.slice(at + 1)}` : "[recipient]";
    console.log("[Email] Verification email sent:", toMask, "messageId:", info?.messageId);
    return true;
  } catch (error: any) {
    console.error("[Email] Failed to send verification email:", error?.message, error);
    return false;
  }
}

export function generateVerificationCode(): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  return code;
}
