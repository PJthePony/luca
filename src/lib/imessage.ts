import { env } from "../config.js";

export async function sendIMessage(
  recipient: string,
  message: string,
): Promise<boolean> {
  if (!env.IMESSAGE_GATEWAY_URL) {
    console.warn("iMessage gateway not configured, skipping notification");
    return false;
  }

  try {
    const response = await fetch(`${env.IMESSAGE_GATEWAY_URL}/send-imessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient, message }),
    });

    if (!response.ok) {
      console.error(
        `iMessage gateway returned ${response.status}: ${await response.text()}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("iMessage gateway unreachable:", error);
    return false;
  }
}
