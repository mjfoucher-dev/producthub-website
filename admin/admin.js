/* Starts the editor at /admin and sets up its preview pane. See docs/CMS.md.

   Newsletter and Blog posts: admin/preview.css styles the editor's own preview to look like a post.
   Homepage, Events, Resources and the list pages: custom previews that draw the real page with the
   same template (index.html), renderer (scripts/site-render.mjs) and stylesheet as the live site.
   The build writes those three into /admin as site-data.js, site-render.js and site.css, so a
   design change in index.html or posts.css shows up here automatically on the next deploy. */

import { TEMPLATE, HOME, EVENTS, ARCHIVES } from "./site-data.js";
import { fillIndex, eventForPage, listHero, resourcesList } from "./site-render.js";

const CMS = window.CMS;
const h = window.h;
const createClass = window.createClass;

/* ---------- helpers ---------- */

const data = props => (props.entry.get("data") ? props.entry.get("data").toJS() : {});

/* A picture that was just uploaded isn't on the website yet: ask the editor for its address. */
const assetUrl = (props, p) => {
  if (!p) return p;
  try { const a = props.getAsset(p); const u = a && (a.url || String(a)); if (u && u !== "[object Object]") return u; } catch (e) { /* use the path */ }
  return p;
};

/* The homepage from index.html, from the header down to the analytics bar (no scripts). */
function homeBody(html) {
  const start = html.indexOf('<header class="site-header">');
  const end = html.indexOf("<script>", html.indexOf('<div class="consent"'));
  return html.slice(start, end);
}

/* Runs the part of index.html's script that fills in the events and the "Next gathering" box,
   inside the preview frame. It's the same code the live homepage runs. */
function runEventScript(props, html, events) {
  const start = html.indexOf("const TZ =");
  const end = html.indexOf('document.getElementById("year")', start);
  if (start < 0 || end < 0 || !props.window) return;
  try { new props.window.Function("EVENTS", html.slice(start, end))(events); }
  catch (e) { console.warn("Event preview:", e); }
}

/* A preview that sets HTML, then runs an optional script once the HTML is in the frame. */
const htmlPreview = (render, after) => createClass({
  componentDidMount() { if (after) after(this.props, this.state_); },
  componentDidUpdate() { if (after) after(this.props, this.state_); },
  render() {
    this.state_ = render(this.props);
    return h("div", { dangerouslySetInnerHTML: { __html: this.state_.html } });
  }
});

/* ---------- previews ---------- */

/* Pages → Homepage: the whole homepage with the current events. */
const HomePreview = htmlPreview(props => {
  const html = fillIndex(TEMPLATE, { home: data(props), events: EVENTS }, { photoUrl: p => assetUrl(props, p).replace(/^\//, "") });
  return { html: homeBody(html), page: html };
}, (props, s) => runEventScript(props, s.page, EVENTS.map(eventForPage)));

/* Events: the homepage's events section with only this event in it. While the event is still
   to come, the top of the homepage is shown too, with its "Next gathering" box. */
const EventPreview = htmlPreview(props => {
  const html = fillIndex(TEMPLATE, { home: HOME, events: [] });
  const e = data(props);
  const ended = new Date(e.end || e.start) < new Date();
  const only = `<style>main > :not(${ended ? "" : ".hero, "}#events), .site-footer, .consent { display: none !important; }</style>`;
  return { html: only + homeBody(html), page: html };
}, (props, s) => {
  const e = data(props);
  runEventScript(props, s.page, e.title && e.start ? [eventForPage(e)] : []);
});

/* Resources: the top of /resources with this resource's card. */
const ResourcePreview = htmlPreview(props => {
  const r = data(props);
  const page = ARCHIVES.resources || {};
  const card = { ...r, id: "preview", thumbUrl: assetUrl(props, r.thumb), file: r.file || "#" };
  return { html: `<main id="top">\n${listHero({ label: "Resources", heading: page.heading, intro: page.intro })}\n${resourcesList(r.title ? [card] : [], page.empty)}\n</main>` };
});

/* Pages → Newsletter, Blog, Events and Resources pages: the page headings. */
const ArchivesPreview = htmlPreview(props => {
  const d = data(props);
  const part = (label, p) => listHero({ label, heading: (p || {}).heading, intro: (p || {}).intro });
  return { html: `<main id="top">\n${part("Newsletter", d.newsletter)}\n${part("Blog", d.blog)}\n${part("Events", d.events)}\n${part("Resources", d.resources)}\n</main>` };
});

/* ---------- start ---------- */

CMS.registerPreviewStyle("/admin/preview.css", { collection: "newsletter" });
CMS.registerPreviewStyle("/admin/preview.css", { collection: "blog" });
for (const collection of ["events", "resources", "pages"]) CMS.registerPreviewStyle("/admin/site.css", { collection });

CMS.registerPreviewTemplate("home", HomePreview);
CMS.registerPreviewTemplate("archives", ArchivesPreview);
CMS.registerPreviewTemplate("events", EventPreview);
CMS.registerPreviewTemplate("resources", ResourcePreview);

/* Sign in through this same site's /api/auth, so the GitHub popup and the editor share an origin. */
CMS.init({ config: { backend: { base_url: location.origin } } });
