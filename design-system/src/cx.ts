/** Joins class names, dropping falsy values. Never invents a class: callers only ever pass
 * classes that already exist in the site's own stylesheets, plus an optional passthrough. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
