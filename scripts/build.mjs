/* Builds the newsletter archive and blog from content/posts/*.md into dist/,
   alongside a copy of the static site (index.html, assets, favicons).

   Each post is a Markdown file with a short header ("front matter"):
     title, type (newsletter | blog), date, description, optional slug, issue,
     image, imageAlt, author, tags, updated, draft.
   draft: true posts only appear on Vercel preview links and `npm run preview`.

   Output: /newsletter, /blog, one page per post, RSS feeds, sitemap.xml and llms.txt.

   Resources (handouts and briefs from our sessions) live in content/resources/*.md,
   front matter only: title, kind, date, session, description, file, thumb, related, relatedLabel.
   The files themselves go in /resources. They are listed at /resources, newest first.
   The homepage gets a "Latest" section where index.html has <!--LATEST-POSTS-->. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import { loadSiteContent, fillIndex } from "./site-content.mjs";

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
  ".DS_Store", "package.json", "package-lock.json", "vercel.json", "README.md", ".pages.yml"]);

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
      html, minutes: Math.max(1, Math.round(words / 220)),
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
    const { data } = matter(fs.readFileSync(path.join(RESOURCES_DIR, file), "utf8"));
    const where = `content/resources/${file}`;
    for (const k of ["title", "date", "file"]) if (!data[k]) throw new Error(`${where}: add a ${k}`);
    const local = path.join(ROOT, String(data.file).replace(/^\//, ""));
    if (!/^https?:/.test(data.file) && !fs.existsSync(local)) throw new Error(`${where}: file ${data.file} not found; put it in /resources`);
    if (data.draft && !SHOW_DRAFTS) continue;
    list.push({ ...data, date: toDate(data.date), id: file.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "") });
  }
  return list.sort((a, b) => b.date - a.date);
}

/* ---------- shared page pieces, taken from index.html so the look stays in sync ---------- */

const indexHtml = fillIndex(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), ROOT, CONTENT);
const BASE_CSS = between(indexHtml, "<style>", "</style>", "the <style> block").slice("<style>".length);
const NEWSLETTER_SECTION = between(indexHtml, '<section class="newsletter" id="newsletter"', "</main>", "the newsletter section").trim();
const SCRIPTS = [
  between(indexHtml, "/* NEWSLETTER:", "/* =====", "the NEWSLETTER and ANALYTICS settings"),
  between(indexHtml, "/* Mixpanel, on by default.", "const TZ", "the Mixpanel code"),
  between(indexHtml, "/* Theme toggle:", "/* Slack join request:", "the theme toggle"),
  between(indexHtml, "/* Newsletter form:", "/* Outbound clicks:", "the newsletter form code"),
  'document.getElementById("year").textContent = new Date().getFullYear();'
].join("\n");

const FEEDS_HEAD = `<link rel="alternate" type="application/rss+xml" title="${SITE_NAME}: newsletter and blog" href="/feed.xml">`;

function head({ title, description, url, image, imageAlt, type = "website", jsonld, noindex, published, modified }) {
  const fullTitle = title === SITE_NAME ? title : `${title} · ${SITE_NAME}`;
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
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>\n` : ""}</head>
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
    author: p.authors.map(name => ({ "@type": "Person", name })),
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE, logo: { "@type": "ImageObject", url: `${SITE}/android-chrome-512.png` } },
    isPartOf: { "@type": "Blog", name: `${SITE_NAME} ${p.typeInfo.label}`, url: abs("/" + p.typeInfo.path) },
    ...(p.tags ? { keywords: [].concat(p.tags).join(", ") } : {}),
    inLanguage: "en-CA"
  };
  const share = encodeURIComponent(pageUrl);
  return head({ title: p.title, description: p.description, url: p.url, image: p.image, imageAlt: p.imageAlt, type: "article", jsonld,
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
  return head({ title: t.title, description: t.intro, url, jsonld })
    + header(typeKey) + `
<main id="top">
  <header class="post-hero list-hero">
    <div class="wrap narrow">
      <span class="eyebrow">${t.label}</span>
      <h1>${esc(t.heading)}</h1>
      <p class="lede">${esc(t.intro)}</p>
      <div class="actions">
        <a class="btn btn-coral" href="#newsletter">${typeKey === "newsletter" ? "Subscribe" : "Get new posts by email"}</a>
        <a class="btn btn-ghost" href="/${t.path}/feed.xml">RSS feed</a>
      </div>
    </div>
  </header>
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

function resourceCard(r) {
  const ext = (String(r.file).split(".").pop() || "").toUpperCase();
  return `<article class="res-card" id="${esc(r.id)}">
      ${r.thumb ? `<a class="res-thumb" href="${esc(r.file)}" target="_blank" rel="noopener" aria-hidden="true" tabindex="-1"><img src="${esc(r.thumb)}" alt="" loading="lazy"></a>` : ""}
      <div class="res-body">
        <span class="kind">${esc(r.kind || "Resource")}${r.draft ? ' <b class="draft-tag">Draft</b>' : ""}</span>
        <h3>${esc(r.title)}</h3>
        <p class="meta">${r.session ? esc(r.session) + " · " : ""}${fmtDate(r.date)}</p>
        ${r.description ? `<p class="summary">${esc(r.description)}</p>` : ""}
        <div class="res-actions">
          <a class="btn btn-coral" href="${esc(r.file)}" target="_blank" rel="noopener">Download${ext ? " " + esc(ext) : ""}</a>
          ${r.related ? `<a class="res-related" href="${esc(r.related)}">${esc(r.relatedLabel || "Read more")} →</a>` : ""}
        </div>
      </div>
    </article>`;
}

function resourcesPage(list) {
  const jsonld = {
    "@context": "https://schema.org", "@type": "CollectionPage", name: `${SITE_NAME} resources`, description: RESOURCES_INTRO, url: abs("/resources"),
    hasPart: list.filter(r => !r.draft).map(r => ({ "@type": "DigitalDocument", name: r.title, url: abs(r.file), datePublished: r.date.toISOString() }))
  };
  return head({ title: "Resources", description: RESOURCES_INTRO, url: "/resources", jsonld })
    + header("resources") + `
<main id="top">
  <header class="post-hero list-hero">
    <div class="wrap narrow">
      <span class="eyebrow">Resources</span>
      <h1>${esc(pageText("resources", "heading"))}</h1>
      <p class="lede">${esc(RESOURCES_INTRO)}</p>
    </div>
  </header>
  <section class="band list-band" aria-label="Resources">
    <div class="wrap narrow">
      <div class="res-list">
    ${list.length ? list.map(resourceCard).join("\n    ") : `<div class="empty">${esc(pageText("resources", "empty"))}</div>`}
      </div>
    </div>
  </section>

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

function sitemap(posts) {
  const urls = [
    { loc: SITE + "/", lastmod: posts[0] && isoDate(posts[0].updated) },
    { loc: abs("/resources") },
    ...Object.values(TYPES).map(t => ({ loc: abs("/" + t.path), lastmod: (posts.find(p => p.typeInfo === t) || {}).updated })),
    ...posts.map(p => ({ loc: abs(p.url), lastmod: p.updated }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${typeof u.lastmod === "string" ? u.lastmod : isoDate(u.lastmod)}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}

function llms(posts) {
  const section = t => posts.filter(p => p.typeInfo === t).map(p => `- [${p.title}](${abs(p.url)}): ${p.description}`).join("\n") || "- Nothing published yet.";
  return `# ${SITE_NAME}

> A small community for the people who make software products on Vancouver Island: product managers, designers, engineers, testers and everyone else in the room when something ships. Small gatherings where peers show how they really build, test and ship.

- [Home](${SITE}/): what we do, upcoming events, founders, Slack and newsletter sign-up
- [Newsletter archive](${SITE}/newsletter)
- [Blog](${SITE}/blog)
- [Resources](${SITE}/resources): briefs and take-homes from our sessions

## Newsletter

${section(TYPES.newsletter)}

## Blog

${section(TYPES.blog)}
`;
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
write("resources/index.html", resourcesPage(resources));
write("feed.xml", rss({ title: SITE_NAME, description: "The ProductHub Victoria newsletter and blog.", url: "/", feedUrl: "/feed.xml", posts: live }));
write("sitemap.xml", sitemap(live));
write("llms.txt", llms(live));

/* Homepage: add the latest posts, the stylesheet they need, and the feed link. */
let home = indexHtml.replace("<!--LATEST-POSTS-->", latestSection(posts))
  .replace("</head>", `<link rel="stylesheet" href="/assets/posts.css">\n${FEEDS_HEAD}\n</head>`);
write("index.html", home);

console.log(`Built ${resources.length} resource(s) at /resources`);
console.log(`Built ${posts.length} post(s)${SHOW_DRAFTS ? " (drafts included)" : ""}: ${posts.map(p => p.url + (p.draft ? " [draft]" : "")).join(", ") || "none"}`);
