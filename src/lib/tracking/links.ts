/**
 * Rewrite links in HTML body for click tracking.
 * Replaces href="..." with tracking redirect URLs.
 * Only rewrites http/https links. Skips mailto: and other protocols.
 */
export function rewriteLinksForTracking(
  html: string,
  emailSentId: string,
  baseUrl: string
): string {
  // Match href="..." in anchor tags, only http/https
  return html.replace(
    /(<a\s[^>]*href=["'])(https?:\/\/[^"']+)(["'][^>]*>)/gi,
    (match, prefix, url, suffix) => {
      // Don't rewrite unsubscribe links (they're already tracking links)
      if (url.includes("/unsub/")) return match;
      const trackingUrl = `${baseUrl}/c/${emailSentId}?url=${encodeURIComponent(url)}`;
      return `${prefix}${trackingUrl}${suffix}`;
    }
  );
}
