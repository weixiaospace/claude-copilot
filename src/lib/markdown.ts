import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ async: false, gfm: true });

/**
 * Render markdown to **sanitized** HTML. Resource markdown can be third-party
 * (plugin-shipped), so the output is always passed through DOMPurify — never
 * injected raw. See `CLAUDE.md` → Security.
 */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md) as string;
  return DOMPurify.sanitize(html);
}
