/**
 * Avisos automáticos a TI, al DPD y a la persona solicitante.
 *
 * Canales (configurables, se pueden usar los dos):
 *  - Correo electrónico por SMTP (SMTP_HOST…), con la ficha adjunta.
 *  - Webhook (DERIVATION_WEBHOOK_URL) para crear la incidencia en la
 *    herramienta de tickets de TI (GLPI, Redmine, Jira, OTRS…).
 * Si no hay ninguno configurado, en desarrollo se simulan en el registro.
 */
import nodemailer from "nodemailer";
import type { Recipient } from "../shared/derivation";

export interface NotificationLog {
  date: string;
  channel: "correo" | "webhook" | "simulado";
  to: string;
  ok: boolean;
  detail?: string;
}

const env = process.env;
const APP_URL = (env.APP_URL && env.APP_URL !== "MY_APP_URL" ? env.APP_URL : `http://localhost:${env.PORT || 3000}`).replace(/\/$/, "");
const RECIPIENT_EMAIL: Record<Recipient, string | undefined> = { ti: env.TI_EMAIL, dpd: env.DPD_EMAIL };

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === "true",
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").slice(0, 200);

export interface Message {
  subject: string;
  text: string;
  attachments?: { filename: string; content: string; contentType: string }[];
}

export const link = (path: string) => `${APP_URL}${path}`;

async function sendMail(to: string, m: Message): Promise<NotificationLog> {
  const date = new Date().toISOString();
  if (!transport) {
    if (env.NODE_ENV === "production") return { date, channel: "correo", to, ok: false, detail: "SMTP no configurado" };
    console.log(JSON.stringify({ ts: date, evento: "correo_simulado", para: to, asunto: m.subject }));
    return { date, channel: "simulado", to, ok: true, detail: "Correo simulado (SMTP no configurado)" };
  }
  try {
    await transport.sendMail({
      from: env.MAIL_FROM || "Taller de Apps IA <no-responder@localhost>",
      to,
      subject: oneLine(m.subject),
      text: m.text,
      attachments: m.attachments,
    });
    return { date, channel: "correo", to, ok: true };
  } catch (error) {
    console.error("Error enviando correo:", error);
    return { date, channel: "correo", to, ok: false, detail: (error as Error).message.slice(0, 200) };
  }
}

async function sendWebhook(payload: unknown): Promise<NotificationLog | null> {
  const url = env.DERIVATION_WEBHOOK_URL;
  if (!url) return null;
  const date = new Date().toISOString();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.DERIVATION_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.DERIVATION_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    return { date, channel: "webhook", to: new URL(url).host, ok: r.ok, detail: r.ok ? undefined : `HTTP ${r.status}` };
  } catch (error) {
    return { date, channel: "webhook", to: "webhook", ok: false, detail: (error as Error).message.slice(0, 200) };
  }
}

/** Envía a TI y/o DPD (correo a cada destinatario + webhook una vez). */
export async function notifyStaff(recipients: Recipient[], m: Message, webhookPayload: unknown): Promise<NotificationLog[]> {
  const logs: NotificationLog[] = [];
  for (const r of recipients) {
    const to = RECIPIENT_EMAIL[r];
    if (to) logs.push(await sendMail(to, m));
    else logs.push({ date: new Date().toISOString(), channel: "correo", to: r.toUpperCase(), ok: false, detail: `Falta ${r === "ti" ? "TI_EMAIL" : "DPD_EMAIL"}` });
  }
  const hook = await sendWebhook(webhookPayload);
  if (hook) logs.push(hook);
  return logs;
}

/** Aviso a la persona solicitante (si se conoce su correo). */
export async function notifyRequester(email: string | undefined, m: Message): Promise<NotificationLog[]> {
  return email ? [await sendMail(email, m)] : [];
}
