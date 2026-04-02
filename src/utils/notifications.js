const nodemailer = require("nodemailer");
const dns = require("dns").promises;
const crypto = require("crypto");

const DEFAULT_NOTIFICATION_CONFIG = {
  notifyOnNewOrder: true,
  notifyOnLowStock: true,
  orderEmails: [],
  lowStockEmails: []
};

let transporterInstance = null;

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const parseRecipients = (value) => {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
  }

  return [...new Set(
    String(value || "")
      .split(/[\n,;]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  )];
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const getStoreNotificationConfig = (store) => {
  const source = store?.notificationConfig || {};
  return {
    notifyOnNewOrder: source.notifyOnNewOrder !== undefined
      ? Boolean(source.notifyOnNewOrder)
      : DEFAULT_NOTIFICATION_CONFIG.notifyOnNewOrder,
    notifyOnLowStock: source.notifyOnLowStock !== undefined
      ? Boolean(source.notifyOnLowStock)
      : DEFAULT_NOTIFICATION_CONFIG.notifyOnLowStock,
    orderEmails: parseRecipients(source.orderEmails || []),
    lowStockEmails: parseRecipients(source.lowStockEmails || [])
  };
};

const isEmailNotificationsConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM);

const isResendConfigured = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);

const getEmailProvider = () => {
  const configuredProvider = String(process.env.EMAIL_PROVIDER || "auto").trim().toLowerCase();

  if (configuredProvider === "resend") {
    return isResendConfigured() ? "resend" : null;
  }

  if (configuredProvider === "smtp") {
    return isEmailNotificationsConfigured() ? "smtp" : null;
  }

  if (isResendConfigured()) {
    return "resend";
  }

  if (isEmailNotificationsConfigured()) {
    return "smtp";
  }

  return null;
};

const resolveSmtpHost = async () => {
  const originalHost = process.env.SMTP_HOST;
  const forceIpv4 = parseBoolean(process.env.SMTP_FORCE_IPV4, true);

  if (!originalHost || !forceIpv4) {
    return {
      host: originalHost,
      servername: originalHost
    };
  }

  try {
    const resolved = await dns.lookup(originalHost, { family: 4 });
    return {
      host: resolved.address,
      servername: originalHost
    };
  } catch (error) {
    console.warn(`No se pudo resolver ${originalHost} por IPv4. Se usara el host original.`, error.message);
    return {
      host: originalHost,
      servername: originalHost
    };
  }
};

const getTransporter = async () => {
  if (!isEmailNotificationsConfigured()) {
    return null;
  }

  if (!transporterInstance) {
    const smtpTarget = await resolveSmtpHost();
    transporterInstance = nodemailer.createTransport({
      host: smtpTarget.host,
      port: Number(process.env.SMTP_PORT),
      secure: parseBoolean(process.env.SMTP_SECURE, Number(process.env.SMTP_PORT) === 465),
      auth: process.env.SMTP_USER
        ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || ""
        }
        : undefined,
      tls: {
        servername: smtpTarget.servername
      }
    });
  }

  return transporterInstance;
};

const sendEmailWithResend = async ({ to, subject, text, html }) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID()
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to,
      subject,
      text,
      html
    }),
    signal: AbortSignal.timeout(Number(process.env.EMAIL_REQUEST_TIMEOUT_MS) || 15000)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend API error: ${response.status} ${errorBody}`);
  }

  return true;
};

const sendEmail = async ({ to, subject, text, html }) => {
  const provider = getEmailProvider();

  if (!provider || !to || to.length === 0) {
    if (!provider) {
      throw new Error("No hay un proveedor de correo configurado correctamente.");
    }
    return false;
  }

  if (provider === "resend") {
    return sendEmailWithResend({ to, subject, text, html });
  }

  const transporter = await getTransporter();

  if (!transporter) {
    return false;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: to.join(", "),
    subject,
    text,
    html
  });

  return true;
};

const sendTestNotification = async (store, recipients = []) => {
  if (!getEmailProvider() || recipients.length === 0) {
    return false;
  }

  const subject = `[${store.name}] Prueba de notificaciones`;
  const text = [
    `Esta es una prueba del sistema de notificaciones de ${store.name}.`,
    "",
    "Si recibiste este correo, la configuracion SMTP del proyecto funciona correctamente."
  ].join("\n");

  const html = `
    <h2>Prueba de notificaciones</h2>
    <p>Esta es una prueba del sistema de notificaciones de <strong>${store.name}</strong>.</p>
    <p>Si recibiste este correo, la configuracion SMTP del proyecto funciona correctamente.</p>
  `;

  return sendEmail({
    to: recipients,
    subject,
    text,
    html
  });
};

const notifyNewOrder = async (store, order) => {
  const config = getStoreNotificationConfig(store);

  if (!getEmailProvider() || !config.notifyOnNewOrder || config.orderEmails.length === 0) {
    return false;
  }

  const subject = `[${store.name}] Nuevo pedido #${order.id}`;
  const text = [
    `Se registro un nuevo pedido en ${store.name}.`,
    ``,
    `Pedido: #${order.id}`,
    `Cliente: ${order.name}`,
    `Documento: ${order.document}`,
    `Correo: ${order.email || "No registrado"}`,
    `Telefono: ${order.phone}`,
    `Ciudad: ${order.city}`,
    `Pago: ${order.paymentMethod}`,
    `Total: $${Number(order.total || 0).toLocaleString("es-CO")}`
  ].join("\n");

  const html = `
    <h2>Nuevo pedido en ${store.name}</h2>
    <p>Se registro un nuevo pedido en la tienda.</p>
    <ul>
      <li><strong>Pedido:</strong> #${order.id}</li>
      <li><strong>Cliente:</strong> ${order.name}</li>
      <li><strong>Documento:</strong> ${order.document}</li>
      <li><strong>Correo:</strong> ${order.email || "No registrado"}</li>
      <li><strong>Telefono:</strong> ${order.phone}</li>
      <li><strong>Ciudad:</strong> ${order.city}</li>
      <li><strong>Pago:</strong> ${order.paymentMethod}</li>
      <li><strong>Total:</strong> $${Number(order.total || 0).toLocaleString("es-CO")}</li>
    </ul>
  `;

  return sendEmail({
    to: config.orderEmails,
    subject,
    text,
    html
  });
};

const notifyLowStock = async (store, items = [], contextLabel = "inventario") => {
  const config = getStoreNotificationConfig(store);

  if (!getEmailProvider() || !config.notifyOnLowStock || config.lowStockEmails.length === 0 || items.length === 0) {
    return false;
  }

  const normalizedItems = items.map((item) => ({
    productName: item.productName,
    variantName: item.variantName || "",
    available: Number(item.available) || 0,
    threshold: Number(item.threshold) || 0
  }));

  const subject = `[${store.name}] Alerta de bajo stock`;
  const text = [
    `Se detecto inventario bajo en ${store.name} (${contextLabel}).`,
    ``,
    ...normalizedItems.map((item) =>
      `- ${item.productName}${item.variantName ? ` / ${item.variantName}` : ""}: disponibles ${item.available}, umbral ${item.threshold}`
    )
  ].join("\n");

  const html = `
    <h2>Alerta de bajo stock en ${store.name}</h2>
    <p>Se detecto inventario bajo (${contextLabel}).</p>
    <ul>
      ${normalizedItems.map((item) => `
        <li>
          <strong>${item.productName}${item.variantName ? ` / ${item.variantName}` : ""}</strong>:
          disponibles ${item.available}, umbral ${item.threshold}
        </li>
      `).join("")}
    </ul>
  `;

  return sendEmail({
    to: config.lowStockEmails,
    subject,
    text,
    html
  });
};

module.exports = {
  DEFAULT_NOTIFICATION_CONFIG,
  parseRecipients,
  isValidEmail,
  getStoreNotificationConfig,
  isEmailNotificationsConfigured,
  getEmailProvider,
  sendTestNotification,
  notifyNewOrder,
  notifyLowStock
};
