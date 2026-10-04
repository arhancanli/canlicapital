import { basename, relative } from 'node:path';

export function publishedArtifactKeys(file, dist) {
  const path = relative(dist, file).replaceAll('\\', '/');
  // Versioned publication sources must never replace a rolling artifact's
  // basename alias. A page can explicitly select their complete public path.
  if (path.startsWith('publication/')) return [path];
  const key = path.startsWith('glassbox/') ? path.slice('glassbox/'.length) : path;
  return [...new Set([key, basename(key)])];
}
