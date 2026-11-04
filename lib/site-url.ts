/** Resolve the public storefront origin without baking a deployment hostname into emails or metadata. */
export function getPublicSiteUrl(requestOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || url.hostname === 'localhost') return url.origin;
    } catch {
      console.error('NEXT_PUBLIC_SITE_URL must be a valid absolute URL.');
    }
  }

  if (requestOrigin) {
    try {
      const url = new URL(requestOrigin);
      if (url.protocol === 'https:' || url.hostname === 'localhost') return url.origin;
    } catch {
      // Fall through to the local development origin.
    }
  }

  return 'http://localhost:3000';
}
