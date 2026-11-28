/* Shared by the build (scripts/build.mjs) and the editor previews (admin/admin.js), so the
   preview pane draws the homepage, event cards and resource cards with the exact same code as
   the live site. Keep this file free of Node-only imports: the build copies it to
   /admin/site-render.mjs for the browser.

   index.html keeps the layout and has placeholders where the words go:
     {{t:path}}      text; **bold**, *italic* and [links](https://…) work
     {{hl:path}}     like t, but *words* get the coral highlight (hero headline)
     {{a:path}}      plain text inside an attribute (meta tags, links)
     {{tl:path}}     like t, inside a JavaScript `template string`
     {{json:events}} the events, for the script that sorts them into upcoming and past
     {{block:name}}  a repeated block: values, founders, steps
   path is a field in content/pages/home.yml, like hero.title. */

/* ---------- text ---------- */

export const escText = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escAttr = s => escText(s).replace(/"/g, "&quot;");

/* A few Markdown marks inside one line of text. */
export function inline(s, { highlight = false } = {}) {
  return escText(String(s ?? "").trim())
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => /^(https?:|mailto:|\/|#)/.test(u) ? `<a href="${u.replace(/"/g, "&quot;")}">${t}</a>` : t)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, highlight ? '<span class="hl">$1</span>' : "<em>$1</em>");
}

export const get = (obj, keyPath) => keyPath.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

/* Same escaping and date helpers the build uses for posts and resources. */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const toDate = d => (d instanceof Date ? d : new Date(String(d) + (String(d).length <= 10 ? "T12:00:00Z" : "")));
export const fmtDate = (d, o = { year: "numeric", month: "long", day: "numeric" }) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", ...o }).format(d).replace(/\./g, "");

/* ---------- repeated blocks ---------- */

function blocks(home, photoSize, photoUrl) {
  return {
    values: (get(home, "whatWeDo.values") || []).map(v =>
      `<li><h3>${inline(v.title)}</h3><p>${inline(v.text)}</p>${v.notHere ? `<p class="not"><b>Not here</b> ${inline(v.notHere)}</p>` : ""}</li>`
    ).join("\n          "),

    steps: (get(home, "slack.steps") || []).map((s, i) =>
      `<li><b>${String(i + 1).padStart(2, "0")}</b><span>${inline(s)}</span></li>`
    ).join("\n          "),

    founders: (get(home, "founders.people") || []).map(f => {
      const src = photoUrl(String(f.photo || ""));
      const { w, h } = photoSize(String(f.photo || ""));
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

/* An event from content/events/*.yml in the shape index.html's script expects. */
export const eventForPage = e => ({
  title: e.title,
  start: e.start instanceof Date ? e.start.toISOString() : String(e.start ?? ""),
  end: e.end ? (e.end instanceof Date ? e.end.toISOString() : String(e.end)) : undefined,
  venue: e.venue,
  summary: e.summary || "",
  agenda: (e.agenda || []).length ? e.agenda.map(a => [String(a.time ?? ""), String(a.item ?? "")]) : undefined,
  luma: e.luma
});

/* photoSize(path) -> { w, h } for the founder img tags; photoUrl(path) -> the src to use
   (the editor swaps in photos that are uploaded but not saved yet). */
export function fillIndex(html, { home, events }, { photoSize = () => ({ w: 400, h: 400 }), photoUrl = p => p } = {}) {
  const blockHtml = blocks(home, photoSize, photoUrl);
  const eventsJson = JSON.stringify(events.map(eventForPage), null, 2).replace(/<\//g, "<\\/");

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

/* ---------- list pages (/newsletter, /blog, /resources) ---------- */

/* The heading block at the top of a list page. actions is extra HTML (buttons) or "". */
export function listHero({ label, heading, intro, actions = "" }) {
  return `  <header class="post-hero list-hero">
    <div class="wrap narrow">
      <span class="eyebrow">${label}</span>
      <h1>${esc(heading)}</h1>
      <p class="lede">${esc(intro)}</p>${actions}
    </div>
  </header>`;
}

/* The list of resource cards on /resources. */
export function resourcesList(list, emptyText) {
  return `  <section class="band list-band" aria-label="Resources">
    <div class="wrap narrow">
      <div class="res-list">
    ${list.length ? list.map(resourceCard).join("\n    ") : `<div class="empty">${esc(emptyText)}</div>`}
      </div>
    </div>
  </section>`;
}

/* ---------- resources ---------- */

/* One card on /resources. r.id is the anchor; r.date a Date or "YYYY-MM-DD". */
export function resourceCard(r) {
  const date = toDate(r.date);
  const ext = (String(r.file).split(".").pop() || "").toUpperCase();
  return `<article class="res-card" id="${esc(r.id)}">
      ${r.thumb ? `<a class="res-thumb" href="${esc(r.file)}" target="_blank" rel="noopener" aria-hidden="true" tabindex="-1"><img src="${esc(r.thumbUrl || r.thumb)}" alt="" loading="lazy"></a>` : ""}
      <div class="res-body">
        <span class="kind">${esc(r.kind || "Resource")}${r.draft ? ' <b class="draft-tag">Draft</b>' : ""}</span>
        <h3>${esc(r.title)}</h3>
        <p class="meta">${r.session ? esc(r.session) + " · " : ""}${isNaN(date) ? "" : fmtDate(date)}</p>
        ${r.description ? `<p class="summary">${esc(r.description)}</p>` : ""}
        <div class="res-actions">
          <a class="btn btn-coral" href="${esc(r.file)}" target="_blank" rel="noopener">Download${ext ? " " + esc(ext) : ""}</a>
          ${r.related ? `<a class="res-related" href="${esc(r.related)}">${esc(r.relatedLabel || "Read more")} →</a>` : ""}
        </div>
      </div>
    </article>`;
}
