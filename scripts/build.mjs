/* Builds the newsletter archive and blog from content/posts/*.md into dist/,
   alongside a copy of the static site (index.html, assets, favicons).

   Each post is a Markdown file with a short header ("front matter"):
     title, type (newsletter | blog), date, description, optional slug, issue,
     image, imageAlt, author, tags, updated, draft.
   draft: true posts only appear on Vercel preview links and `npm run preview`.

   Output: /newsletter, /blog, one page per post, /events and one page per event, /resources and one
   page per resource, /about, RSS feeds, sitemap.xml, llms.txt and llms-full.txt.

   Search and AI tools: every page gets a canonical link, Open Graph tags and schema.org JSON-LD
   (Organization, WebSite, Event, BlogPosting, DigitalDocument, FAQPage, BreadcrumbList). The homepage's
   event cards are written into the HTML at build time, so crawlers that don't run JavaScript see them.

   Resources (handouts and briefs from our sessions) live in content/resources/*.md,
   front matter: title, kind, date, session, description, file, thumb, related, relatedLabel, and an
   optional Markdown body (the summary on the resource's own page at /resources/<name>).
   The files themselves go in /resources. They are listed at /resources, newest first.
   The homepage gets a "Latest" section where index.html has <!--LATEST-POSTS-->. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import { loadSiteContent, fillIndex } from "./site-content.mjs";
import { listHero, resourcesList, eventForPage } from "./site-render.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist");
const POSTS_DIR = path.join(ROOT, "content", "posts");
const RESOURCES_DIR = path.join(ROOT, "content", "resources");
const SITE = "https://producthub.info";
const SITE_NAME = "ProductHub Victoria";
const SHOW_DRAFTS = process.argv.includes("--drafts") || process.env.VERCEL_ENV === "preview";

/* Page text (headings, intros) comes from content/pages/*.yml, edited in the web editor. */
const CONTENT = loadSiteContent(ROOT);
const ARCHIVES = CONTENT.archives;
const pageText = (key, field) => {
  const v = ARCHIVES[key] && ARCHIVES[key][field];
  if (!v) throw new Error(`content/pages/archives.yml: add ${key}.${field}`);
  return String(v).trim();
};

const TYPES = {
  newsletter: {
    path: "newsletter",
    label: "Newsletter",
    title: pageText("newsletter", "title"),
    heading: pageText("newsletter", "heading"),
    intro: pageText("newsletter", "intro"),
    empty: pageText("newsletter", "empty")
  },
  blog: {
    path: "blog",
    label: "Blog",
    title: pageText("blog", "title"),
    heading: pageText("blog", "heading"),
    intro: pageText("blog", "intro"),
    empty: pageText("blog", "empty")
  }
};

/* Files and folders that are source, not part of the published site. */
const SKIP = new Set(["node_modules", "dist", "content", "scripts", "api", ".git", ".github", ".vercel", ".gitignore",
  ".DS_Store", "package.json", "package-lock.json", "vercel.json", "README.md", ".pages.yml", "docs"]);

/* ---------- helpers ---------- */

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const abs = u => (!u ? "" : /^https?:/.test(u) ? u : SITE + (u.startsWith("/") ? u : "/" + u));
const toDate = d => (d instanceof Date ? d : new Date(String(d) + (String(d).length <= 10 ? "T12:00:00Z" : "")));
const fmtDate = (d, o = { year: "numeric", month: "long", day: "numeric" }) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", ...o }).format(d).replace(/\./g, "");
const isoDate = d => d.toISOString().slice(0, 10);
const write = (rel, content) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
function between(src, start, end, what) {
  const i = src.indexOf(start);
  const j = i < 0 ? -1 : src.indexOf(end, i + start.length);
  if (i < 0 || j < 0) throw new Error(`build: couldn't find ${what} in index.html (looked for "${start}" … "${end}"). Was that part renamed?`);
  return src.slice(i, j);
}
/* Absolute links for feeds, so images and links work in feed readers and email. */
const absolutize = html => html.replace(/(src|href)="\/(?!\/)/g, `$1="${SITE}/`);

/* ---------- Markdown ---------- */

marked.use({
  gfm: true,
  renderer: {
    /* ![alt](src "caption") becomes a figure with a caption. */
    image({ href, title, text }) {
      const img = `<img src="${esc(href)}" alt="${esc(text)}" loading="lazy">`;
      return title ? `<figure>${img}<figcaption>${esc(title)}</figcaption></figure>` : `<figure>${img}</figure>`;
    }
  }
});

function renderBody(md) {
  let html = marked.parse(md);
  html = html.replace(/<p>\s*(<figure>[\s\S]*?<\/figure>)\s*<\/p>/g, "$1");
  /* A last line starting with an em dash inside a quote is its attribution. The web editor writes it
     as a line break inside the quote's last paragraph, so split that line off first. */
  html = html.replace(/(?:\n|<br>\s*)((?:—|&mdash;)(?:(?!<\/?p>|\n)[\s\S])*)<\/p>\s*<\/blockquote>/g, "</p>\n<p>$1</p>\n</blockquote>");
  html = html.replace(/<p>(?:—|&mdash;)\s*([\s\S]*?)<\/p>\s*<\/blockquote>/g, '<p class="by">$1</p>\n</blockquote>');
  /* The first quote in a run is the featured (navy) one. */
  html = html.replace(/(^|<\/(?:p|ul|ol|h\d|figure)>\s*)<blockquote>/g, '$1<blockquote class="featured">');
  return html;
}

/* ---------- load posts ---------- */

function loadPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const posts = [];
  for (const file of fs.readdirSync(POSTS_DIR).filter(f => f.endsWith(".md")).sort()) {
    const { data, content } = matter(fs.readFileSync(path.join(POSTS_DIR, file), "utf8"));
    const where = `content/posts/${file}`;
    if (!data.title) throw new Error(`${where}: add a title`);
    if (!TYPES[data.type]) throw new Error(`${where}: type must be "newsletter" or "blog"`);
    if (!data.date) throw new Error(`${where}: add a date, like 2026-11-25`);
    if (data.draft && !SHOW_DRAFTS) continue;
    const type = TYPES[data.type];
    const slug = String(data.slug || file.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "")).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    const date = toDate(data.date);
    const html = renderBody(content);
    const words = content.replace(/<[^>]+>|[#>*_`\[\]()!-]/g, " ").split(/\s+/).filter(Boolean).length;
    posts.push({
      ...data, file: where, slug, date,
      updated: data.updated ? toDate(data.updated) : date,
      typeKey: data.type, typeInfo: type,
      url: `/${type.path}/${slug}`,
      html, source: content, minutes: Math.max(1, Math.round(words / 220)),
      authors: String(data.author || SITE_NAME).split(/\s*(?:&|,| and )\s*/).filter(Boolean),
      description: data.description || ""
    });
  }
  const seen = new Set();
  for (const p of posts) { if (seen.has(p.url)) throw new Error(`${p.file}: another post already uses ${p.url}; give one a different slug`); seen.add(p.url); }
  return posts.sort((a, b) => b.date - a.date || (b.issue || 0) - (a.issue || 0));
}

/* ---------- load resources ---------- */

function loadResources() {
  if (!fs.existsSync(RESOURCES_DIR)) return [];
  const list = [];
  for (const file of fs.readdirSync(RESOURCES_DIR).filter(f => f.endsWith(".md")).sort()) {
    const { data, content } = matter(fs.readFileSync(path.join(RESOURCES_DIR, file), "utf8"));
    const where = `content/resources/${file}`;
    for (const k of ["title", "date", "file"]) if (!data[k]) throw new Error(`${where}: add a ${k}`);
    const local = path.join(ROOT, String(data.file).replace(/^\//, ""));
    if (!/^https?:/.test(data.file) && !fs.existsSync(local)) throw new Error(`${where}: file ${data.file} not found; put it in /resources`);
    if (data.draft && !SHOW_DRAFTS) continue;
    const id = file.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
    list.push({ ...data, date: toDate(data.date), id, url: `/resources/${id}`, body: content.trim(), html: content.trim() ? renderBody(content) : "" });
  }
  return list.sort((a, b) => b.date - a.date);
}

/* ---------- shared page pieces, taken from index.html so the look stays in sync ---------- */

const INDEX_TEMPLATE = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const indexHtml = fillIndex(INDEX_TEMPLATE, ROOT, CONTENT);
const BASE_CSS = between(indexHtml, "<style>", "</style>", "the <style> block").slice("<style>".length);
const NEWSLETTER_SECTION = between(indexHtml, '<section class="newsletter" id="newsletter"', "</main>", "the newsletter section").trim();
const SCRIPTS = [
  between(indexHtml, "/* NEWSLETTER:", "/* =====", "the NEWSLETTER and ANALYTICS settings"),
  between(indexHtml, "/* Mixpanel, on by default.", "const TZ", "the Mixpanel code"),
  between(indexHtml, "/* Theme toggle:", "/* Slack join request:", "the theme toggle"),
  between(indexHtml, "/* Newsletter form:", "/* Outbound clicks:", "the newsletter form code"),
  'document.getElementById("year").textContent = new Date().getFullYear();'
].join("\n");

/* ---------- structured data (schema.org JSON-LD) ---------- */

const TZ = "America/Vancouver";
const fmtLocal = (d, o) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, ...o }).format(d).replace(/\./g, "");
const localDay = d => fmtLocal(d, { year: "numeric", month: "2-digit", day: "2-digit" });
const plain = s => String(s ?? "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*?([^*]+)\*\*?/g, "$1").trim();
const ldScripts = jsonld => [].concat(jsonld || []).map(j =>
  `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>\n`).join("");

const ORG_ID = `${SITE}/#organization`;
const FOUNDERS = (CONTENT.home.founders && CONTENT.home.founders.people) || [];
const personLd = f => ({
  "@type": "Person", "@id": `${SITE}/#${String(f.name).toLowerCase().replace(/[^a-z]+/g, "-")}`, name: f.name,
  ...(f.role ? { jobTitle: f.role } : {}), ...(f.photo ? { image: abs(f.photo) } : {}),
  ...(f.linkedin ? { url: f.linkedin, sameAs: [f.linkedin] } : {}), worksFor: { "@id": ORG_ID }
});
/* "Michael" in a post's author line is the founder Michael J Foucher. */
const authorLd = name => {
  const f = FOUNDERS.find(f => f.name === name || String(f.name).split(" ")[0] === name);
  return f ? personLd(f) : { "@type": "Person", name };
};
const ORG_REF = { "@type": "Organization", "@id": ORG_ID, name: SITE_NAME, url: SITE + "/" };
const PLACE_VICTORIA = { "@type": "Place", name: "Victoria, British Columbia", address: { "@type": "PostalAddress", addressLocality: "Victoria", addressRegion: "BC", addressCountry: "CA" } };
function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    alternateName: "ProductHub",
    url: SITE + "/",
    logo: { "@type": "ImageObject", url: `${SITE}/android-chrome-512.png`, width: 512, height: 512 },
    image: `${SITE}/assets/og-image.png`,
    description: plain(CONTENT.home.seo && CONTENT.home.seo.description),
    email: "hello@producthub.info",
    foundingDate: "2026",
    foundingLocation: PLACE_VICTORIA,
    location: PLACE_VICTORIA,
    areaServed: [{ "@type": "City", name: "Victoria, BC" }, { "@type": "Place", name: "Vancouver Island, BC" }],
    knowsAbout: ["Product management", "Product design", "Software development", "Software testing", "Product discovery", "AI in software products"],
    founder: FOUNDERS.map(personLd),
    sameAs: [CONTENT.home.events && CONTENT.home.events.lumaCalendar, "https://newsletter.producthub.info"].filter(Boolean)
  };
}
const websiteLd = () => ({
  "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE}/#website`, name: SITE_NAME, url: SITE + "/",
  inLanguage: "en-CA", publisher: ORG_REF
});
function breadcrumbLd(items) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [["Home", "/"], ...items].map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(url) }))
  };
}
function eventLd(e, resources = []) {
  const start = new Date(e.start), end = new Date(e.end || e.start);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": abs(e.url) + "#event",
    name: e.title,
    description: e.summary || "",
    url: abs(e.url),
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    eventStatus: e.cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: e.venue, address: { "@type": "PostalAddress", streetAddress: e.venue, addressLocality: "Victoria", addressRegion: "BC", addressCountry: "CA" } },
    image: [abs(e.image || "/assets/og-image.png")],
    organizer: { "@type": "Organization", name: SITE_NAME, url: SITE + "/" },
    ...(e.free !== false ? { isAccessibleForFree: true, offers: { "@type": "Offer", url: e.luma, price: 0, priceCurrency: "CAD", availability: "https://schema.org/InStock" } } : { offers: { "@type": "Offer", url: e.luma } }),
    ...(resources.length ? { subjectOf: resources.map(r => ({ "@type": "DigitalDocument", name: r.title, url: abs(r.url) })) } : {})
  };
}

const FEEDS_HEAD = `<link rel="alternate" type="application/rss+xml" title="${SITE_NAME}: newsletter and blog" href="/feed.xml">`;

function head({ title, description, url, image, imageAlt, type = "website", jsonld, noindex, published, modified }) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`;
  const img = abs(image || "/assets/og-image.png");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(abs(url))}">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(abs(url))}">
<meta property="og:image" content="${esc(img)}">
${imageAlt ? `<meta property="og:image:alt" content="${esc(imageAlt)}">\n` : ""}${published ? `<meta property="article:published_time" content="${published}">\n<meta property="article:modified_time" content="${modified}">\n` : ""}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#06111F">
${FEEDS_HEAD}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Poppins:wght@400;500;600;700&display=swap">
<style>${BASE_CSS}</style>
<link rel="stylesheet" href="/assets/posts.css">
${ldScripts(jsonld)}</head>
<body>
<script>
(function () { try { var t = localStorage.getItem("ph-theme"); if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); } catch (e) {} })();
</script>`;
}

function header(active) {
  const link = (href, label, key) => `<a href="${href}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return `
<header class="site-header">
  <div class="wrap">
    <a class="logo" href="/" aria-label="${SITE_NAME} home"><img class="logo-on-dark" src="/assets/logo-horizontal-reverse.svg" alt="${SITE_NAME}" width="185" height="38"><img class="logo-on-light" src="/assets/logo-horizontal-gradient.svg" alt="${SITE_NAME}" width="185" height="38"></a>
    <nav class="nav" aria-label="Main">
      ${link("/#what-we-do", "What we do")}
      ${link("/#events", "Events")}
      ${link("/#slack", "Slack")}
      ${link("/newsletter", "Newsletter", "newsletter")}
      ${link("/blog", "Blog", "blog")}
      ${link("/resources", "Resources", "resources")}
      <div class="theme" role="group" aria-label="Colour theme">
        <button type="button" data-theme-choice="auto" aria-pressed="true">Auto</button>
        <button type="button" data-theme-choice="light" aria-pressed="false">Light</button>
        <button type="button" data-theme-choice="dark" aria-pressed="false">Dark</button>
      </div>
      <a class="btn btn-coral" href="/#events">Events</a>
    </nav>
  </div>
</header>`;
}

function footer() {
  return `
<footer class="site-footer">
  <div class="wrap">
    <div><img class="logo-on-dark" src="/assets/logo-horizontal-reverse.svg" alt="${SITE_NAME}" width="166" height="34"><img class="logo-on-light" src="/assets/logo-horizontal-gradient.svg" alt="${SITE_NAME}" width="166" height="34"></div>
    <nav aria-label="Footer">
      <a href="/#what-we-do">What we do</a>
      <a href="/#events">Events</a>
      <a href="/#founders">Founders</a>
      <a href="/#slack">Slack</a>
      <a href="/newsletter">Newsletter</a>
      <a href="/blog">Blog</a>
      <a href="/resources">Resources</a>
      <a href="/about">About</a>
      <a href="/feed.xml">RSS</a>
      <button type="button" class="linkish" id="analytics-settings">Analytics</button>
    </nav>
    <p>Made on Vancouver Island · © <span id="year">2026</span> ${SITE_NAME}</p>
  </div>
</footer>

<div class="consent" id="consent" role="region" aria-label="Analytics choice" hidden>
  <p>We use Mixpanel to count visits and see which parts of this site help people find us. It never receives your name or email. You can turn it off for this browser.</p>
  <div class="actions">
    <button type="button" class="btn btn-coral" data-consent="granted">Keep on</button>
    <button type="button" class="btn btn-ghost" data-consent="denied">Turn off</button>
  </div>
</div>

<script>
${SCRIPTS}
</script>
</body>
</html>
`;
}

/* ---------- page bodies ---------- */

const kicker = p => p.typeKey === "newsletter" && p.issue ? `Issue #${p.issue}` : p.typeInfo.label;

function postRow(p, { showType = false } = {}) {
  return `<a class="post-row" href="${p.url}">
      <div class="date" aria-hidden="true"><div class="m">${fmtDate(p.date, { month: "short" })}</div><div class="d">${fmtDate(p.date, { day: "numeric" })}</div><div class="y">${fmtDate(p.date, { year: "numeric" })}</div></div>
      <div class="body">
        <span class="kind">${esc(showType && p.typeKey === "newsletter" ? "Newsletter · " + kicker(p) : kicker(p))}${p.draft ? ' <b class="draft-tag">Draft</b>' : ""}</span>
        <h3>${esc(p.title)}</h3>
        ${p.description ? `<p class="summary">${esc(p.description)}</p>` : ""}
        <p class="meta">${fmtDate(p.date)} · ${p.minutes} min read</p>
      </div>
      <span class="go" aria-hidden="true">→</span>
    </a>`;
}

function postPage(p, all) {
  const others = all.filter(o => o !== p);
  const more = [...others.filter(o => o.typeKey === p.typeKey), ...others.filter(o => o.typeKey !== p.typeKey)].slice(0, 3);
  const pageUrl = abs(p.url);
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.description,
    datePublished: p.date.toISOString(),
    dateModified: p.updated.toISOString(),
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    image: abs(p.image || "/assets/og-image.png"),
    author: p.authors.map(authorLd),
    publisher: { "@type": "Organization", "@id": ORG_ID, name: SITE_NAME, url: SITE, logo: { "@type": "ImageObject", url: `${SITE}/android-chrome-512.png` } },
    isPartOf: { "@type": "Blog", name: `${SITE_NAME} ${p.typeInfo.label}`, url: abs("/" + p.typeInfo.path) },
    ...(p.tags ? { keywords: [].concat(p.tags).join(", ") } : {}),
    inLanguage: "en-CA"
  };
  const share = encodeURIComponent(pageUrl);
  return head({ title: p.title, description: p.description, url: p.url, image: p.image, imageAlt: p.imageAlt, type: "article",
      jsonld: [jsonld, breadcrumbLd([[p.typeInfo.label, "/" + p.typeInfo.path], [p.title, p.url]])],
      noindex: !!p.draft, published: p.date.toISOString(), modified: p.updated.toISOString() })
    + header(p.typeKey) + `
<main id="top">
  <article class="post">
    <header class="post-hero">
      <div class="wrap narrow">
        <a class="crumb" href="/${p.typeInfo.path}">← ${p.typeKey === "newsletter" ? "All issues" : "All articles"}</a>
        <span class="eyebrow">${esc(kicker(p))} · <time datetime="${isoDate(p.date)}">${fmtDate(p.date)}</time></span>
        <h1>${esc(p.title)}</h1>
        ${p.description ? `<p class="lede">${esc(p.description)}</p>` : ""}
        <p class="byline">By ${esc(p.authors.join(" & "))} · ${p.minutes} min read</p>
      </div>
    </header>
    ${p.draft ? `<div class="draft-banner"><div class="wrap narrow"><b>Draft preview.</b> Only visible on preview links. Remove <code>draft: true</code> from the post to publish it.</div></div>` : ""}
    <div class="wrap narrow">
      <div class="prose">
${p.html}
      </div>
      <div class="post-foot">
        <span>Share</span>
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn ↗</a>
        <a href="mailto:?subject=${encodeURIComponent(p.title)}&amp;body=${share}">Email ↗</a>
        <a href="/${p.typeInfo.path}">${p.typeKey === "newsletter" ? "All issues" : "All articles"} →</a>
      </div>
    </div>
  </article>
  ${more.length ? `
  <section class="band tint more" aria-labelledby="more-title">
    <div class="wrap narrow">
      <div class="section-head"><span class="eyebrow">Keep reading</span><h2 id="more-title">More from ${SITE_NAME}</h2></div>
      <div class="post-list">
    ${more.map(o => postRow(o, { showType: true })).join("\n    ")}
      </div>
    </div>
  </section>` : ""}

  ${NEWSLETTER_SECTION}
</main>` + footer();
}

function listPage(typeKey, posts) {
  const t = TYPES[typeKey];
  const url = "/" + t.path;
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${SITE_NAME} ${t.label}`,
    description: t.intro,
    url: abs(url),
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE },
    blogPost: posts.filter(p => !p.draft).map(p => ({ "@type": "BlogPosting", headline: p.title, url: abs(p.url), datePublished: p.date.toISOString() }))
  };
  return head({ title: t.title, description: t.intro, url, jsonld: [jsonld, breadcrumbLd([[t.label, url]])] })
    + header(typeKey) + `
<main id="top">
${listHero({ label: t.label, heading: t.heading, intro: t.intro, actions: `
      <div class="actions">
        <a class="btn btn-coral" href="#newsletter">${typeKey === "newsletter" ? "Subscribe" : "Get new posts by email"}</a>
        <a class="btn btn-ghost" href="/${t.path}/feed.xml">RSS feed</a>
      </div>` })}
  <section class="band list-band" aria-label="${t.label} posts">
    <div class="wrap narrow">
      <div class="post-list">
    ${posts.length ? posts.map(p => postRow(p)).join("\n    ") : `<div class="empty">${esc(t.empty)}</div>`}
      </div>
    </div>
  </section>

  ${NEWSLETTER_SECTION}
</main>` + footer();
}

const RESOURCES_INTRO = pageText("resources", "intro");


function resourcesPage(list) {
  const jsonld = {
    "@context": "https://schema.org", "@type": "CollectionPage", name: `${SITE_NAME} resources`, description: RESOURCES_INTRO, url: abs("/resources"),
    publisher: ORG_REF,
    hasPart: list.filter(r => !r.draft).map(r => ({ "@type": "DigitalDocument", name: r.title, url: abs(r.url), datePublished: r.date.toISOString() }))
  };
  return head({ title: "Resources", description: RESOURCES_INTRO, url: "/resources", jsonld: [jsonld, breadcrumbLd([["Resources", "/resources"]])] })
    + header("resources") + `
<main id="top">
${listHero({ label: "Resources", heading: pageText("resources", "heading"), intro: RESOURCES_INTRO })}
${resourcesList(list, pageText("resources", "empty"))}

  ${NEWSLETTER_SECTION}
</main>` + footer();
}

function latestSection(posts) {
  if (!posts.length) return "";
  return `<section class="band latest" id="latest" aria-labelledby="latest-title">
    <div class="wrap">
      <div class="subhead"><h2 id="latest-title" class="section-title">${esc(CONTENT.home.latest && CONTENT.home.latest.heading || "From the newsletter and blog")}</h2><span><a href="/newsletter">All issues →</a> &nbsp; <a href="/blog">Blog →</a></span></div>
      <div class="post-list">
    ${posts.slice(0, 3).map(p => postRow(p, { showType: true })).join("\n    ")}
      </div>
    </div>
  </section>`;
}

/* ---------- feeds, sitemap, llms.txt ---------- */

function rss({ title, description, url, feedUrl, posts }) {
  const items = posts.map(p => `
    <item>
      <title>${esc(p.title)}</title>
      <link>${abs(p.url)}</link>
      <guid isPermaLink="true">${abs(p.url)}</guid>
      <pubDate>${p.date.toUTCString()}</pubDate>
      <category>${esc(p.typeInfo.label)}</category>
      <description>${esc(p.description)}</description>
      <content:encoded><![CDATA[${absolutize(p.html).replace(/]]>/g, "]]]]><![CDATA[>")}]]></content:encoded>
    </item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(title)}</title>
    <link>${abs(url)}</link>
    <atom:link href="${abs(feedUrl)}" rel="self" type="application/rss+xml"/>
    <description>${esc(description)}</description>
    <language>en-ca</language>${posts[0] ? `\n    <lastBuildDate>${posts[0].updated.toUTCString()}</lastBuildDate>` : ""}${items}
  </channel>
</rss>
`;
}

function sitemap(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${abs(u.loc)}</loc>${u.lastmod ? `<lastmod>${isoDate(u.lastmod)}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}

const ABOUT_INTRO = "A small community for the people who make software products on Vancouver Island: product managers, designers, engineers, testers and everyone else in the room when something ships. Small gatherings where peers show how they really build, test and ship.";

function llms({ posts, events, resources }) {
  const list = (items, line) => items.map(line).join("\n") || "- Nothing published yet.";
  const about = CONTENT.about;
  return `# ${SITE_NAME}

> ${ABOUT_INTRO}

ProductHub Victoria is based in Victoria, British Columbia, Canada, and serves Vancouver Island. It was founded in 2026 by ${FOUNDERS.map(f => f.name).join(" and ")}. Gatherings are small, free and in person; there is also a members' Slack and an email newsletter. Contact: hello@producthub.info.

- [Home](${SITE}/): what we do, upcoming events, founders, Slack and newsletter sign-up
- [About and FAQ](${SITE}/about)
- [Events](${SITE}/events)
- [Newsletter archive](${SITE}/newsletter)
- [Blog](${SITE}/blog)
- [Resources](${SITE}/resources): briefs and take-homes from our sessions
- [Full text of this site](${SITE}/llms-full.txt)
${about && about.faq ? `
## Questions and answers

${about.faq.map(f => `- **${plain(f.q)}** ${plain(f.a)}`).join("\n")}
` : ""}
## Events

${list(events, e => `- [${e.title}](${abs(e.url)}): ${fmtLocal(new Date(e.start), { year: "numeric", month: "long", day: "numeric" })}, ${e.venue}, Victoria, BC. ${e.summary || ""}`.trim())}

## Resources

${list(resources, r => `- [${r.title}](${abs(r.url)}): ${r.description || ""}`)}

## Newsletter

${list(posts.filter(p => p.typeInfo === TYPES.newsletter), p => `- [${p.title}](${abs(p.url)}): ${p.description}`)}

## Blog

${list(posts.filter(p => p.typeInfo === TYPES.blog), p => `- [${p.title}](${abs(p.url)}): ${p.description}`)}
`;
}

/* Everything on the site as one plain Markdown file, for AI tools that read a whole site at once. */
function llmsFull({ posts, events, resources }) {
  const about = CONTENT.about;
  const parts = [`# ${SITE_NAME}: full text\n\n> ${ABOUT_INTRO}\n\nSource: ${SITE}/. Generated from the site's content files on every deploy.`];
  if (about) {
    parts.push(`## About\n\nURL: ${SITE}/about\n\n${plain(about.intro)}\n\n${(about.sections || []).map(x => `### ${x.heading}\n\n${plain(x.text)}`).join("\n\n")}`);
    if (about.faq) parts.push(`## Questions and answers\n\n${about.faq.map(f => `### ${plain(f.q)}\n\n${plain(f.a)}`).join("\n\n")}`);
  }
  parts.push(`## Founders\n\n${FOUNDERS.map(f => `### ${f.name}, ${f.role}\n\n${plain(f.bio)}${f.linkedin ? `\n\nLinkedIn: ${f.linkedin}` : ""}`).join("\n\n")}`);
  parts.push(`## Events\n\n${events.map(e => {
    const s = new Date(e.start);
    return `### ${e.title}\n\nURL: ${abs(e.url)}\nWhen: ${fmtLocal(s, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}, ${fmtLocal(s, { hour: "numeric", minute: "2-digit" })} (Pacific time)\nWhere: ${e.venue}, Victoria, BC\nRSVP: ${e.luma}\n\n${e.summary || ""}${(e.agenda || []).length ? `\n\nAgenda:\n${e.agenda.map(a => `- ${a.time}: ${a.item}`).join("\n")}` : ""}${e.recap ? `\n\n${e.recap.trim()}` : ""}`;
  }).join("\n\n") || "No events yet."}`);
  parts.push(`## Resources\n\n${resources.map(r => `### ${r.title}\n\nURL: ${abs(r.url)}\nDownload: ${abs(r.file)}\n${r.session ? `From: ${r.session}\n` : ""}\n${r.description || ""}${r.body ? `\n\n${r.body.replace(/^## /gm, "#### ")}` : ""}`).join("\n\n") || "No resources yet."}`);
  parts.push(`## Newsletter and blog\n\n${posts.map(p => `### ${p.title}\n\nURL: ${abs(p.url)}\nPublished: ${isoDate(p.date)} · ${p.typeInfo.label}${p.authors ? ` · By ${p.authors.join(" & ")}` : ""}\n\n${(p.source || "").replace(/^## /gm, "#### ").replace(/<[^>]+>/g, "").trim()}`).join("\n\n") || "No posts yet."}`);
  return parts.join("\n\n") + "\n";
}

/* ---------- events ---------- */

const EVENTS_TEXT = key => pageText("events", key);
const whenLong = d => fmtLocal(d, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const timeOf = d => fmtLocal(d, { hour: "numeric", minute: "2-digit" });

function eventRow(e) {
  const s = new Date(e.start), ended = new Date(e.end || e.start) < new Date();
  return `<a class="post-row" href="${e.url}">
      <div class="date" aria-hidden="true"><div class="m">${fmtLocal(s, { month: "short" })}</div><div class="d">${fmtLocal(s, { day: "numeric" })}</div><div class="y">${fmtLocal(s, { year: "numeric" })}</div></div>
      <div class="body">
        <span class="kind">${ended ? "Past gathering" : "Upcoming gathering"}</span>
        <h3>${esc(e.title)}</h3>
        ${e.summary ? `<p class="summary">${esc(e.summary)}</p>` : ""}
        <p class="meta">${esc(whenLong(s))} · ${esc(e.venue)}, Victoria</p>
      </div>
      <span class="go" aria-hidden="true">→</span>
    </a>`;
}

function eventsPage(events) {
  const sorted = [...events].sort((a, b) => new Date(b.start) - new Date(a.start));
  const jsonld = {
    "@context": "https://schema.org", "@type": "CollectionPage", name: `${SITE_NAME} events`, description: EVENTS_TEXT("intro"), url: abs("/events"),
    publisher: ORG_REF,
    mainEntity: { "@type": "ItemList", itemListElement: sorted.map((e, i) => ({ "@type": "ListItem", position: i + 1, url: abs(e.url), name: e.title })) }
  };
  return head({ title: EVENTS_TEXT("title"), description: EVENTS_TEXT("intro"), url: "/events", jsonld: [jsonld, breadcrumbLd([["Events", "/events"]])] })
    + header("events") + `
<main id="top">
${listHero({ label: "Events", heading: EVENTS_TEXT("heading"), intro: EVENTS_TEXT("intro"), actions: `
      <div class="actions">
        <a class="btn btn-coral" href="${esc(CONTENT.home.events.lumaCalendar)}" target="_blank" rel="noopener">Follow on Luma ↗</a>
        <a class="btn btn-ghost" href="#newsletter">Hear about the next one</a>
      </div>` })}
  <section class="band list-band" aria-label="Events">
    <div class="wrap narrow">
      <div class="post-list">
    ${sorted.length ? sorted.map(eventRow).join("\n    ") : `<div class="empty">${esc(EVENTS_TEXT("empty"))}</div>`}
      </div>
    </div>
  </section>

  ${NEWSLETTER_SECTION}
</main>` + footer();
}

function eventPage(e, resources) {
  const s = new Date(e.start), end = new Date(e.end || e.start);
  const ended = end < new Date();
  const takeHomes = resources.filter(r => isoDate(r.date) === localDay(s) || (r.event && r.event === e.slug));
  const recapHtml = e.recap ? renderBody(String(e.recap)) : "";
  const share = encodeURIComponent(abs(e.url));
  return head({ title: e.title, description: e.summary || `${e.title}, a ProductHub Victoria gathering in Victoria, BC.`, url: e.url, image: e.image, imageAlt: e.imageAlt,
      jsonld: [eventLd(e, takeHomes), breadcrumbLd([["Events", "/events"], [e.title, e.url]])] })
    + header("events") + `
<main id="top">
  <article class="post event-page">
    <header class="post-hero">
      <div class="wrap narrow">
        <a class="crumb" href="/events">← All events</a>
        <span class="eyebrow"><span data-ended-text="Past gathering" data-ends="${end.toISOString()}">${ended ? "Past gathering" : "Upcoming gathering"}</span> · <time datetime="${s.toISOString()}">${esc(fmtLocal(s, { month: "long", day: "numeric", year: "numeric" }))}</time></span>
        <h1>${esc(e.title)}</h1>
        ${e.summary ? `<p class="lede">${esc(e.summary)}</p>` : ""}
        <p class="byline">${esc(whenLong(s))} · ${esc(timeOf(s))}${e.end ? "–" + esc(timeOf(end)) : ""} · ${esc(e.venue)}, Victoria, BC</p>
        <div class="actions">
          <a class="btn btn-coral" href="${esc(e.luma)}" target="_blank" rel="noopener"><span data-ended-text="See it on Luma" data-ends="${end.toISOString()}">${ended ? "See it on Luma" : "RSVP on Luma"}</span> <span class="arrow" aria-hidden="true">↗</span></a>
          ${e.related ? `<a class="btn btn-ghost" href="${esc(e.related)}">${esc(e.relatedLabel || "Read the recap")} →</a>` : ""}
        </div>
      </div>
    </header>
    <div class="wrap narrow">
      <div class="prose">
        ${e.image ? `<figure><img src="${esc(e.image)}" alt="${esc(e.imageAlt || "")}" loading="lazy"></figure>` : ""}
        <h2>Details</h2>
        <ul class="event-facts">
          <li><b>When</b> ${esc(whenLong(s))}, ${esc(timeOf(s))}${e.end ? " to " + esc(timeOf(end)) : ""} (Pacific time)</li>
          <li><b>Where</b> ${esc(e.venue)}, Victoria, BC</li>
          ${e.free !== false ? `<li><b>Cost</b> Free.${ended ? "" : " RSVP on Luma so we can plan food and seats."}</li>` : ""}
          <li><b>Hosts</b> ${esc(FOUNDERS.map(f => f.name).join(" and ") || SITE_NAME)}</li>
        </ul>
        ${(e.agenda || []).length ? `<h2>Agenda</h2>
        <ul class="event-agenda">
          ${e.agenda.map(a => `<li><time>${esc(a.time)}</time> <span>${esc(a.item)}</span></li>`).join("\n          ")}
        </ul>` : ""}
        ${recapHtml ? `<h2>Recap</h2>\n${recapHtml}` : ""}
        ${takeHomes.length ? `<h2>Take-homes from this session</h2>
        <ul>
          ${takeHomes.map(r => `<li><a href="${esc(r.url)}">${esc(r.title)}</a>${r.description ? `: ${esc(r.description)}` : ""}</li>`).join("\n          ")}
        </ul>` : ""}
      </div>
      <div class="post-foot">
        <span>Share</span>
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn ↗</a>
        <a href="mailto:?subject=${encodeURIComponent(e.title)}&amp;body=${share}">Email ↗</a>
        <a href="/events">All events →</a>
      </div>
    </div>
  </article>

  ${NEWSLETTER_SECTION}
</main>
<script>
document.querySelectorAll("[data-ends]").forEach(function (el) { if (new Date(el.dataset.ends) < new Date()) el.textContent = el.dataset.endedText; });
</script>` + footer();
}

/* ---------- resource pages ---------- */

function resourcePage(r, events) {
  const ext = (String(r.file).split(".").pop() || "").toUpperCase();
  const fromEvent = events.find(e => localDay(new Date(e.start)) === isoDate(r.date) || r.event === e.slug);
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "DigitalDocument",
    name: r.title,
    headline: r.title,
    description: r.description || "",
    url: abs(r.url),
    datePublished: r.date.toISOString(),
    inLanguage: "en-CA",
    author: ORG_REF,
    publisher: ORG_REF,
    ...(r.thumb ? { image: abs(r.thumb), thumbnailUrl: abs(r.thumb) } : {}),
    encoding: { "@type": "MediaObject", contentUrl: abs(r.file), encodingFormat: ext === "PDF" ? "application/pdf" : undefined },
    ...(fromEvent ? { about: { "@type": "Event", name: fromEvent.title, url: abs(fromEvent.url) } } : {})
  };
  return head({ title: r.title, description: r.description || r.title, url: r.url, image: r.thumb, imageAlt: r.thumb ? `First page of ${r.title}` : "", type: "article",
      jsonld: [jsonld, breadcrumbLd([["Resources", "/resources"], [r.title, r.url]])], noindex: !!r.draft })
    + header("resources") + `
<main id="top">
  <article class="post resource-page">
    <header class="post-hero">
      <div class="wrap narrow">
        <a class="crumb" href="/resources">← All resources</a>
        <span class="eyebrow">${esc(r.kind || "Resource")}${r.session ? " · " + esc(r.session) : ""} · <time datetime="${isoDate(r.date)}">${fmtDate(r.date)}</time></span>
        <h1>${esc(r.title)}</h1>
        ${r.description ? `<p class="lede">${esc(r.description)}</p>` : ""}
        <div class="actions">
          <a class="btn btn-coral" href="${esc(r.file)}" target="_blank" rel="noopener">Download${ext ? " " + esc(ext) : ""}</a>
          ${r.related ? `<a class="btn btn-ghost" href="${esc(r.related)}">${esc(r.relatedLabel || "Read more")} →</a>` : ""}
        </div>
      </div>
    </header>
    <div class="wrap narrow">
      <div class="prose">
        ${r.thumb ? `<figure class="res-figure"><a href="${esc(r.file)}" target="_blank" rel="noopener"><img src="${esc(r.thumb)}" alt="First page of ${esc(r.title)}" loading="lazy"></a></figure>` : ""}
${r.html || ""}
        ${fromEvent ? `<p>This came out of <a href="${esc(fromEvent.url)}">${esc(fromEvent.title)}</a>, a ProductHub Victoria gathering on ${esc(fmtLocal(new Date(fromEvent.start), { month: "long", day: "numeric", year: "numeric" }))}.</p>` : ""}
      </div>
      <div class="post-foot">
        <span>Share</span>
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(abs(r.url))}" target="_blank" rel="noopener">LinkedIn ↗</a>
        <a href="${esc(r.file)}" target="_blank" rel="noopener">Download${ext ? " " + esc(ext) : ""} ↗</a>
        <a href="/resources">All resources →</a>
      </div>
    </div>
  </article>

  ${NEWSLETTER_SECTION}
</main>` + footer();
}

/* ---------- about ---------- */

function aboutPage(a) {
  const md = t => marked.parse(String(t ?? ""));
  const faq = a.faq || [];
  const jsonld = [
    { "@context": "https://schema.org", "@type": "AboutPage", name: a.title, description: a.description, url: abs("/about"), mainEntity: ORG_REF, inLanguage: "en-CA" },
    ...(faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(f => ({ "@type": "Question", name: plain(f.q), acceptedAnswer: { "@type": "Answer", text: plain(f.a) } })) }] : []),
    breadcrumbLd([["About", "/about"]])
  ];
  return head({ title: a.title, description: a.description || a.intro, url: "/about", jsonld })
    + header("about") + `
<main id="top">
${listHero({ label: "About", heading: a.heading, intro: a.intro })}
  <section class="band list-band" aria-label="About ProductHub Victoria">
    <div class="wrap narrow">
      <div class="prose">
${(a.sections || []).map(x => `        <h2>${esc(x.heading)}</h2>\n${md(x.text)}`).join("\n")}
${faq.length ? `        <h2 id="faq">Questions and answers</h2>
        <div class="faq">
${faq.map(f => `          <h3>${esc(f.q)}</h3>\n${md(f.a)}`).join("\n")}
        </div>` : ""}
      </div>
    </div>
  </section>

  ${NEWSLETTER_SECTION}
</main>` + footer();
}

/* ---------- homepage: events in the HTML, plus structured data ---------- */

/* Runs the events part of index.html's own script (the same code browsers and the editor preview
   run) against a stand-in document, so the cards and the "Next gathering" box are in the HTML
   that search engines and AI crawlers read. Browsers redraw them on load with the current time. */
function prerenderEvents(html, events) {
  const start = html.indexOf("const TZ =");
  const end = html.indexOf('document.getElementById("year")', start);
  if (start < 0 || end < 0) throw new Error('build: couldn\'t find the events code in index.html (from "const TZ =" to document.getElementById("year")).');
  const els = {};
  const document = { getElementById: id => els[id] || (els[id] = { innerHTML: "", classes: [], classList: { add: c => els[id].classes.push(c) } }) };
  new Function("EVENTS", "document", html.slice(start, end))(events.map(eventForPage), document);
  const fill = (tag, id) => {
    const el = els[id];
    if (!el || !html.includes(tag)) throw new Error(`build: couldn't find ${tag} in index.html`);
    const cut = tag.indexOf("></") + 1;
    let open = tag.slice(0, cut);
    if (el.classes.length) open = open.replace(/class="([^"]*)"/, (m, c) => `class="${c} ${el.classes.join(" ")}"`);
    html = html.replace(tag, open + el.innerHTML + tag.slice(cut));
  };
  fill('<aside class="next" id="next-event" aria-label="Next event"></aside>', "next-event");
  fill('<div class="events-grid" id="upcoming"></div>', "upcoming");
  fill('<div class="events-grid" id="past"></div>', "past");
  return html;
}

/* ---------- build ---------- */

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const entry of fs.readdirSync(ROOT)) {
  if (SKIP.has(entry)) continue;
  fs.cpSync(path.join(ROOT, entry), path.join(OUT, entry), { recursive: true });
}

const posts = loadPosts();
const live = posts.filter(p => !p.draft);

write("assets/posts.css", fs.readFileSync(path.join(ROOT, "scripts", "posts.css"), "utf8"));
for (const p of posts) write(p.url.slice(1) + ".html", postPage(p, posts));
for (const key of Object.keys(TYPES)) {
  const list = posts.filter(p => p.typeKey === key);
  write(`${TYPES[key].path}/index.html`, listPage(key, list));
  write(`${TYPES[key].path}/feed.xml`, rss({ title: `${SITE_NAME} ${TYPES[key].label}`, description: TYPES[key].intro, url: "/" + TYPES[key].path, feedUrl: `/${TYPES[key].path}/feed.xml`, posts: list.filter(p => !p.draft) }));
}
const resources = loadResources();
const events = CONTENT.events.map(e => ({ ...e, url: `/events/${e.slug}` }));
write("resources/index.html", resourcesPage(resources));
for (const r of resources) write(`resources/${r.id}.html`, resourcePage(r, events));
write("events/index.html", eventsPage(events));
for (const e of events) write(`events/${e.slug}.html`, eventPage(e, resources));
if (CONTENT.about) write("about.html", aboutPage(CONTENT.about));
write("feed.xml", rss({ title: SITE_NAME, description: "The ProductHub Victoria newsletter and blog.", url: "/", feedUrl: "/feed.xml", posts: live }));

/* lastmod: the newest date among the things on each page, never later than today. */
const today = new Date();
const newest = (...dates) => { const d = dates.flat().filter(x => x && !isNaN(x) && x <= today).sort((a, b) => b - a)[0]; return d || today; };
const eventDate = e => new Date(e.updated || e.start);
const liveResources = resources.filter(r => !r.draft);
const homeLastmod = newest(live.map(p => p.updated), events.map(eventDate), liveResources.map(r => r.date));
write("sitemap.xml", sitemap([
  { loc: "/", lastmod: homeLastmod },
  { loc: "/about", lastmod: homeLastmod },
  { loc: "/events", lastmod: newest(events.map(eventDate)) },
  ...events.map(e => ({ loc: e.url, lastmod: newest(eventDate(e)) })),
  { loc: "/resources", lastmod: newest(liveResources.map(r => r.date)) },
  ...liveResources.map(r => ({ loc: r.url, lastmod: newest(r.updated ? toDate(r.updated) : r.date) })),
  ...Object.values(TYPES).map(t => ({ loc: "/" + t.path, lastmod: newest(live.filter(p => p.typeInfo === t).map(p => p.updated)) })),
  ...live.map(p => ({ loc: p.url, lastmod: p.updated }))
].filter(u => u.loc !== "/about" || CONTENT.about)));
write("llms.txt", llms({ posts: live, events, resources: liveResources }));
write("llms-full.txt", llmsFull({ posts: live, events, resources: liveResources }));

/* Editor previews (admin/admin.js): the same renderer, stylesheet and template the site uses,
   plus the current text and events, so the preview pane matches the live pages. */
write("admin/site-render.js", fs.readFileSync(path.join(ROOT, "scripts", "site-render.mjs"), "utf8"));
write("admin/site.css", `@import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Poppins:wght@400;500;600;700&display=swap");\n${BASE_CSS}\n${fs.readFileSync(path.join(ROOT, "scripts", "posts.css"), "utf8")}`);
write("admin/site-data.js", `/* Generated by scripts/build.mjs. Don't edit. */
export const TEMPLATE = ${JSON.stringify(INDEX_TEMPLATE).replace(/<\//g, "<\\/")};
export const HOME = ${JSON.stringify(CONTENT.home)};
export const EVENTS = ${JSON.stringify(CONTENT.events)};
export const ARCHIVES = ${JSON.stringify(ARCHIVES)};
`);

/* Homepage: add the latest posts, the stylesheet they need, and the feed link. */
let home = prerenderEvents(indexHtml, events).replace("<!--LATEST-POSTS-->", latestSection(posts))
  .replace("</head>", `<link rel="stylesheet" href="/assets/posts.css">\n${FEEDS_HEAD}\n${ldScripts([
    { ...organizationLd() }, websiteLd(), ...events.map(e => eventLd(e, liveResources.filter(r => isoDate(r.date) === localDay(new Date(e.start)))))
  ])}</head>`);
write("index.html", home);

console.log(`Built ${resources.length} resource(s) at /resources, ${events.length} event page(s) at /events${CONTENT.about ? ", /about" : ""}`);
console.log(`Built ${posts.length} post(s)${SHOW_DRAFTS ? " (drafts included)" : ""}: ${posts.map(p => p.url + (p.draft ? " [draft]" : "")).join(", ") || "none"}`);
