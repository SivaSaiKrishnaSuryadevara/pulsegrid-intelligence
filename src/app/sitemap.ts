import type { MetadataRoute } from 'next';

import { SITE_URL, getAllDirectoryConfigs } from '@/lib/pseo/directory-config';
import { getVerifiedCreatorHandles } from '@/lib/pseo/queries';

// Regenerate the sitemap at most once an hour — cheap enough given the
// directory list is static and the handle list is one indexed query, and
// frequent enough that newly verified creators surface to crawlers quickly.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [directoryConfigs, verifiedHandles] = await Promise.all([
    getAllDirectoryConfigs(),
    getVerifiedCreatorHandles(),
  ]);

  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1 },
  ];

  const directoryRoutes: MetadataRoute.Sitemap = directoryConfigs.map((config) => ({
    url: `${SITE_URL}/directories/${config.slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.85,
  }));

  const creatorRoutes: MetadataRoute.Sitemap = verifiedHandles.map((record) => ({
    url: `${SITE_URL}/verified/${record.handle}`,
    lastModified: new Date(record.updatedAt),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticRoutes, ...directoryRoutes, ...creatorRoutes];
}
