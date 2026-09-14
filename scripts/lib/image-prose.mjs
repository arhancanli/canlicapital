// Image dimensions and URLs are delivery metadata; alt text is reader-facing.
export function imageProse(html) {
  return html.replace(/<img\b[^>]*>/gi, tag => /\balt\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] || ' ');
}
