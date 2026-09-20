const resourceTags = html => [...html.matchAll(/<script\b[^>]*\btype="module"[^>]*>[\s\S]*?<\/script>|<link\b[^>]*\brel="(?:stylesheet|modulepreload)"[^>]*>/g)].map(match => match[0]);
export function buildCompanyAssets(source, compiled) {
  const sourceTags = resourceTags(source);
  const builtTags = resourceTags(compiled);
  if (!sourceTags.length || !builtTags.length || builtTags.some(tag => !/\b(?:src|href)="\/assets\/[A-Za-z0-9_.-]+"/.test(tag))) throw new Error('Company assets must resolve to bundled local assets');
  return { schema: 'canli.company-page-assets.v1', source_tags: [...new Set(sourceTags)], built_tags: [...new Set(builtTags)] };
}
export function applyCompanyAssets(html, manifest) {
  if (manifest?.schema !== 'canli.company-page-assets.v1') throw new Error('Invalid company asset manifest');
  const tags = [...new Set(resourceTags(html))];
  if (tags.length !== manifest.source_tags.length || tags.some(tag => !manifest.source_tags.includes(tag))) throw new Error('Renderer resource contract changed; rebuild asset manifest');
  for (const tag of tags) html = html.replaceAll(tag, '');
  return html.replace('</head>', manifest.built_tags.join('\n') + '\n</head>');
}
