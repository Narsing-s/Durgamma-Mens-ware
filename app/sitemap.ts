import type { MetadataRoute } from 'next';
import { getPublicSiteUrl } from '../lib/site-url';
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: getPublicSiteUrl(), lastModified: new Date(), changeFrequency: 'weekly', priority: 1 }];
}
