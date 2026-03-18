import { gmail_v1 } from "googleapis";

/**
 * Send an email via Gmail API.
 * Returns { id, threadId } of the sent message.
 */
export async function sendGmailMessage(
  gmail: gmail_v1.Gmail,
  params: {
    to: string;
    subject: string;
    body: string;
    cc?: string[];
    bcc?: string[];
    threadId?: string | null;
    inReplyTo?: string | null;
  }
): Promise<{ id: string; threadId: string }> {
  const boundary = "seqd_boundary_" + Date.now();

  // Build RFC 2822 message
  const headers = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
  ];

  if (params.cc && params.cc.length > 0) {
    headers.push(`Cc: ${params.cc.join(", ")}`);
  }
  if (params.bcc && params.bcc.length > 0) {
    headers.push(`Bcc: ${params.bcc.join(", ")}`);
  }
  if (params.inReplyTo) {
    headers.push(`In-Reply-To: ${params.inReplyTo}`);
    headers.push(`References: ${params.inReplyTo}`);
  }

  const rawMessage = headers.join("\r\n") + "\r\n\r\n" + params.body;
  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const requestBody: any = { raw: encodedMessage };
  if (params.threadId) {
    requestBody.threadId = params.threadId;
  }

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody,
  });

  return {
    id: response.data.id!,
    threadId: response.data.threadId!,
  };
}
