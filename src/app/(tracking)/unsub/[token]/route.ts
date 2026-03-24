import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/tracking/tokens";
import { db } from "@/lib/db";
import { contacts, sequences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET: Render unsubscribe confirmation page
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const payload = verifyUnsubscribeToken(token);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe</title>
  <style>
    body { display: flex; min-height: 100vh; align-items: center; justify-content: center; font-family: system-ui, sans-serif; background: #fafafa; margin: 0; }
    .card { max-width: 400px; padding: 32px; text-align: center; background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px; }
    p { color: #666; font-size: 14px; margin: 0 0 20px; }
    button { padding: 10px 24px; background: #18181b; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .success { color: #16a34a; }
    .error-text { color: #dc2626; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="card">
    ${!payload ? `
      <h1>Error</h1>
      <p class="error-text">This unsubscribe link is invalid or has already been used.</p>
    ` : `
      <div id="confirm-view">
        <h1>Unsubscribe</h1>
        <p>Click the button below to unsubscribe from this email sequence.</p>
        <button id="btn" onclick="doUnsub()">Confirm Unsubscribe</button>
      </div>
      <div id="success-view" class="hidden">
        <h1>Unsubscribed</h1>
        <p class="success">You have been successfully unsubscribed.</p>
      </div>
      <div id="error-view" class="hidden">
        <h1>Error</h1>
        <p class="error-text">Something went wrong. Please try again.</p>
        <button onclick="doUnsub()">Retry</button>
      </div>
      <script>
        async function doUnsub() {
          var btn = document.getElementById('btn');
          if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
          document.getElementById('error-view').className = 'hidden';
          try {
            var res = await fetch(window.location.href, { method: 'POST' });
            if (res.ok) {
              document.getElementById('confirm-view').className = 'hidden';
              document.getElementById('success-view').className = '';
            } else {
              document.getElementById('confirm-view').className = 'hidden';
              document.getElementById('error-view').className = '';
            }
          } catch (e) {
            document.getElementById('confirm-view').className = 'hidden';
            document.getElementById('error-view').className = '';
          }
        }
      </script>
    `}
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// POST: RFC 8058 one-click unsubscribe
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const payload = verifyUnsubscribeToken(token);

  if (!payload) {
    return new NextResponse("Invalid or expired unsubscribe link", { status: 400 });
  }

  try {
    // Mark contact as unsubscribed
    await db
      .update(contacts)
      .set({
        status: "unsubscribed",
        unsubscribedAt: new Date(),
      })
      .where(eq(contacts.id, payload.contactId));

    // Finish the sequence (enrollmentId field in token holds sequenceId)
    await db
      .update(sequences)
      .set({
        status: "finished",
        finishedReason: "unsubscribed",
        finishedAt: new Date(),
      })
      .where(eq(sequences.id, payload.enrollmentId));

    return new NextResponse("Unsubscribed successfully", { status: 200 });
  } catch (error: any) {
    console.error("Unsubscribe error:", error.message);
    return new NextResponse("Failed to unsubscribe", { status: 500 });
  }
}
