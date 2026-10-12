/**
 * Markdown-lite for messages (SPEC F7): **bold**, *italic* / _italic_,
 * [label](https://…), bare http(s) URLs and line breaks. Parsed into a tiny
 * node tree that React renders as elements — raw HTML is never produced, so
 * there is nothing to sanitise. Only http(s) and mailto links are kept.
 */
export type MdNode =
  | { t: "text"; v: string }
  | { t: "br" }
  | { t: "strong"; c: MdNode[] }
  | { t: "em"; c: MdNode[] }
  | { t: "link"; href: string; c: MdNode[] };

export function safeHref(raw: string): string | null {
  const v = raw.trim();
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(v)) return v;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const URL_RE = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"\]]/y;

function inline(src: string, depth = 0): MdNode[] {
  const out: MdNode[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === "\n") {
      flush();
      out.push({ t: "br" });
      i++;
      continue;
    }
    if (depth < 3 && src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "strong", c: inline(src.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }
    if (depth < 3 && (ch === "*" || ch === "_") && src[i + 1] && src[i + 1] !== " " && (i === 0 || /[\s(]/.test(src[i - 1]!))) {
      const end = src.indexOf(ch, i + 1);
      if (end > i + 1 && src[end - 1] !== " " && (end + 1 >= src.length || /[\s.,;:!?)]/.test(src[end + 1]!))) {
        flush();
        out.push({ t: "em", c: inline(src.slice(i + 1, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const close = src.indexOf("](", i + 1);
      const paren = close > -1 ? src.indexOf(")", close + 2) : -1;
      if (close > i + 1 && paren > close + 2 && !src.slice(i, paren).includes("\n")) {
        const href = safeHref(src.slice(close + 2, paren));
        flush();
        const label = inline(src.slice(i + 1, close), depth + 1);
        if (href) out.push({ t: "link", href, c: label });
        else out.push(...label);
        i = paren + 1;
        continue;
      }
    }
    if ((ch === "h" || ch === "H") && (i === 0 || /[\s(]/.test(src[i - 1]!))) {
      URL_RE.lastIndex = i;
      const m = URL_RE.exec(src);
      if (m) {
        const href = safeHref(m[0]);
        if (href) {
          flush();
          out.push({ t: "link", href, c: [{ t: "text", v: m[0] }] });
          i += m[0].length;
          continue;
        }
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

export function parseMarkdownLite(text: string): MdNode[] {
  return inline(text.replace(/\r\n?/g, "\n").slice(0, 10_000));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Escaped HTML string (emails, tests). */
export function renderMarkdownLite(text: string): string {
  const r = (ns: MdNode[]): string =>
    ns
      .map((n) => {
        if (n.t === "text") return esc(n.v);
        if (n.t === "br") return "<br>";
        if (n.t === "strong") return `<strong>${r(n.c)}</strong>`;
        if (n.t === "em") return `<em>${r(n.c)}</em>`;
        return `<a href="${esc(n.href)}" rel="noopener noreferrer nofollow" target="_blank">${r(n.c)}</a>`;
      })
      .join("");
  return r(parseMarkdownLite(text));
}
