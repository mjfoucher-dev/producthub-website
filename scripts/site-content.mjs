/* Site text that lives in content files, so it can be changed in the web editor (/admin)
   without touching the layout.

   content/pages/home.yml      homepage words, links and founder photos
   content/pages/archives.yml  top of the Newsletter, Blog and Resources pages
   content/events/*.yml        one file per gathering

   index.html keeps the layout and has placeholders where the words go:
     {{t:path}}      text; **bold**, *italic* and [links](https://…) work
     {{hl:path}}     like t, but *words* get the coral highlight (hero headline)
     {{a:path}}      plain text inside an attribute (meta tags, links)
     {{tl:path}}     like t, inside a JavaScript `template string`
     {{json:events}} the events, for the script that sorts them into upcoming and past
     {{block:name}}  a repeated block: values, founders, steps */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const readYaml = file => matter("---\n" + fs.readFileSync(file, "utf8") + "\n---\n").data || {};

export function loadSiteContent(root) {
  const pages = path.join(root, "content", "pages");
  const eventsDir = path.join(root, "content", "events");
  const home = readYaml(path.join(pages, "home.yml"));
  const archives = readYaml(path.join(pages, "archives.yml"));
  const events = fs.existsSync(eventsDir)
    ? fs.readdirSync(eventsDir).filter(f => /\.ya?ml$/.test(f)).sort().map(f => {
        const e = readYaml(path.join(eventsDir, f));
        for (const k of ["title", "start", "venue", "luma"]) if (!e[k]) throw new Error(`content/events/${f}: add a ${k}`);
        return e;
      })
    : [];
  return { home, archives, events };
}

/* ---------- text ---------- */

const escText = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = s => escText(s).replace(/"/g, "&quot;");

/* A few Markdown marks inside one line of text. */
export function inline(s, { highlight = false } = {}) {
  return escText(String(s ?? "").trim())
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => /^(https?:|mailto:|\/|#)/.test(u) ? `<a href="${u.replace(/"/g, "&quot;")}">${t}</a>` : t)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, highlight ? '<span class="hl">$1</span>' : "<em>$1</em>");
}

const get = (obj, keyPath) => keyPath.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

/* ---------- photos ---------- */

/* Width and height of a JPEG or PNG, for the img tag. */
function imageSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch (e) { /* missing file: fall through */ }
  return { w: 400, h: 400 };
}

/* ---------- repeated blocks ---------- */

function blocks(root, home) {
  return {
    values: (get(home, "whatWeDo.values") || []).map(v =>
      `<li><h3>${inline(v.title)}</h3><p>${inline(v.text)}</p>${v.notHere ? `<p class="not"><b>Not here</b> ${inline(v.notHere)}</p>` : ""}</li>`
    ).join("\n          "),

    steps: (get(home, "slack.steps") || []).map((s, i) =>
      `<li><b>${String(i + 1).padStart(2, "0")}</b><span>${inline(s)}</span></li>`
    ).join("\n          "),

    founders: (get(home, "founders.people") || []).map(f => {
      const src = String(f.photo || "");
      const { w, h } = imageSize(path.join(root, src.replace(/^\//, "")));
      const links = [
        f.linkedin && `<a href="${escAttr(f.linkedin)}" target="_blank" rel="noopener">LinkedIn ↗</a>`,
        f.email && `<a href="mailto:${escAttr(f.email)}">${escText(f.emailLabel || "Email")} ↗</a>`
      ].filter(Boolean).join("");
      return `<article class="founder">
          <div class="avatar"><img src="${escAttr(src.replace(/^\//, ""))}" alt="${escAttr(f.name)}" width="${w}" height="${h}" loading="lazy"></div>
          <div>
            <h3>${escText(f.name)}</h3>
            <p class="role">${escText(f.role)}</p>
            <p class="bio">${inline(f.bio)}</p>
            ${links ? `<p class="links">${links}</p>` : ""}
          </div>
        </article>`;
    }).join("\n        ")
  };
}

/* ---------- fill index.html ---------- */

export function fillIndex(html, root, { home, events }) {
  const blockHtml = blocks(root, home);
  const eventsJson = JSON.stringify(events.map(e => ({
    title: e.title,
    start: e.start instanceof Date ? e.start.toISOString() : String(e.start),
    end: e.end ? (e.end instanceof Date ? e.end.toISOString() : String(e.end)) : undefined,
    venue: e.venue,
    summary: e.summary || "",
    agenda: (e.agenda || []).length ? e.agenda.map(a => [String(a.time ?? ""), String(a.item ?? "")]) : undefined,
    luma: e.luma
  })), null, 2).replace(/<\//g, "<\\/");

  return html.replace(/\{\{(t|hl|a|tl|json|block):([\w.]+)\}\}/g, (m, kind, key) => {
    if (kind === "block") {
      if (!(key in blockHtml)) throw new Error(`index.html: unknown block ${m}`);
      return blockHtml[key];
    }
    if (kind === "json") return eventsJson;
    const value = get(home, key);
    if (value === undefined) throw new Error(`content/pages/home.yml is missing ${key} (used by ${m} in index.html)`);
    if (kind === "a") return escAttr(value);
    if (kind === "hl") return inline(value, { highlight: true });
    const out = inline(value);
    return kind === "tl" ? out.replace(/[`\\]/g, "\\$&").replace(/\$\{/g, "\\${") : out;
  });
}
