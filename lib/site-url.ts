/** Resolve the public storefront origin without baking a deployment hostname into emails or metadata. */
export function getPublicSiteUrl(requestOrigin?: string): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    requestOrigin,
    process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL.trim() : undefined,
    process.env.DEPLOY_PRIME_URL,
    process.env.URL,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' || url.hostname === 'localhost') return url.origin;
    } catch {
      if (candidate === process.env.NEXT_PUBLIC_SITE_URL) {
        console.error('NEXT_PUBLIC_SITE_URL must be a valid absolute URL.');
      }
    }
  }

  return 'http://localhost:3000';
}
