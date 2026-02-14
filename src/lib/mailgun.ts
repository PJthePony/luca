import Mailgun from "mailgun.js";
import FormData from "form-data";
import crypto from "node:crypto";
import { env } from "../config.js";

const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  username: "api",
  key: env.MAILGUN_API_KEY,
});

export interface SendEmailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  from?: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
}

export async function sendEmail(options: SendEmailOptions): Promise<string> {
  if (!options.to || options.to.length === 0) {
    throw new Error(`sendEmail called with empty 'to' array. Subject: ${options.subject}`);
  }

  const messageData: Record<string, unknown> = {
    from: options.from ?? `Luca <luca@${env.MAILGUN_DOMAIN}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
  };

  if (options.cc?.length) messageData.cc = options.cc;
  if (options.bcc?.length) messageData.bcc = options.bcc;
  if (options.html) messageData.html = options.html;

  // Mailgun custom headers use the h: prefix
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      messageData[`h:${key}`] = value;
    }
  }

  console.log("Sending email via Mailgun:", JSON.stringify({
    to: messageData.to,
    bcc: messageData.bcc,
    subject: messageData.subject,
    domain: env.MAILGUN_DOMAIN,
  }));

  const result = await mg.messages.create(env.MAILGUN_DOMAIN, messageData as any);
  console.log("Mailgun send result:", JSON.stringify(result));
  return result.id ?? "";
}

export function verifyWebhookSignature(
  timestamp: string,
  token: string,
  signature: string,
): boolean {
  const hmac = crypto.createHmac("sha256", env.MAILGUN_WEBHOOK_SIGNING_KEY);
  hmac.update(timestamp + token);
  const digest = hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

/** Extract fields from a Mailgun inbound webhook (parsed format). */
export interface InboundEmail {
  from: string;
  fromName: string;
  to: string[];
  cc: string[];
  subject: string;
  strippedText: string;
  bodyPlain: string;
  bodyHtml: string;
  messageId: string;
  inReplyTo: string;
  references: string;
  messageHeaders: [string, string][];
}

export function parseInboundWebhook(body: Record<string, unknown>): InboundEmail {
  const headers: [string, string][] = typeof body["message-headers"] === "string"
    ? JSON.parse(body["message-headers"] as string)
    : (body["message-headers"] as [string, string][]) ?? [];

  const getHeader = (name: string): string => {
    const header = headers.find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    );
    return header?.[1] ?? "";
  };

  const parseAddressList = (raw: unknown): string[] => {
    if (!raw || typeof raw !== "string") return [];
    return raw
      .split(",")
      .map((addr) => addr.trim())
      .filter(Boolean);
  };

  // Extract sender name from "Name <email>" format
  const fromRaw = (body.from as string) ?? "";
  const nameMatch = fromRaw.match(/^(.+?)\s*<.+>$/);
  const fromName = nameMatch ? nameMatch[1].trim() : "";

  return {
    from: (body.sender as string) ?? "",
    fromName,
    to: parseAddressList(body.To),
    cc: parseAddressList(body.Cc),
    subject: (body.subject as string) ?? "",
    strippedText: (body["stripped-text"] as string) ?? "",
    bodyPlain: (body["body-plain"] as string) ?? "",
    bodyHtml: (body["body-html"] as string) ?? "",
    messageId: getHeader("Message-Id"),
    inReplyTo: getHeader("In-Reply-To"),
    references: getHeader("References"),
    messageHeaders: headers,
  };
}
