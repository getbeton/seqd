/**
 * Inject a 1x1 transparent tracking pixel into HTML body.
 * Appended before </body> if present, otherwise at the end.
 */
export function injectTrackingPixel(
  html: string,
  emailSentId: string,
  baseUrl: string
): string {
  const pixelUrl = `${baseUrl}/o/${emailSentId}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none;border:0;" alt="" />`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${pixel}</body>`);
  }
  return html + pixel;
}

/**
 * Build an unsubscribe footer HTML snippet.
 */
export function buildUnsubscribeFooter(unsubscribeUrl: string): string {
  return `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e5e5;text-align:center;font-size:11px;color:#999;">
  <a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a>
</div>`;
}
