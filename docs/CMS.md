# The web editor (CMS): how it all fits together

This is the one place that explains how producthub.info's web editor is set up. Read it before you change the site's design, add a section, or touch sign-in. Nothing needs to be worked out again from scratch.

## In one paragraph

The site is static HTML built by `scripts/build.mjs` and hosted on Vercel. Everything people read on it lives in content files under `content/`. The editor at **producthub.info/admin** is [Sveltia CMS](https://sveltiacms.app/docs). It runs in the browser, loaded from unpkg, and edits those content files straight in the GitHub repo `mjfoucher-dev/producthub-website`. There's no database and no server apart from one small sign-in function. A save opens a pull request. Vercel builds a preview of that pull request, and **Publish** merges it to `main`, which Vercel deploys to producthub.info.

## For editors (Michael, Danijel)

1. Go to producthub.info/admin and click **Sign in with GitHub**.
2. Pick a section on the left: **Newsletter**, **Blog**, **Events**, **Resources** or **Pages**.
3. Edit. The pane on the right shows the page as it will look on the site.
4. Click **Save**. This makes a draft (a pull request). About a minute later, the editor shows a link to a Vercel preview of the whole site with your change.
5. Move the draft from Draft → In Review → Ready on the **Workflow** page, then click **Publish**. The live site updates about a minute later.

Nothing reaches producthub.info until someone clicks Publish.

Text tips: `**bold**`, `*italic*` and `[link text](https://…)` work in most text boxes. In the homepage headline, `*words*` turn coral. To credit a quote in a post, press Shift+Enter at the end of the quote and start the new line with an em dash (—).

Sending the newsletter email still happens in Kit. The editor only puts the issue on the website.

## Where each piece of the site lives

| On the site | Content file | Editor section | Drawn by |
|---|---|---|---|
| Homepage text: hero, What we do and values, events section text, founders, Slack, newsletter box, footer tagline, Google and link-preview descriptions | `content/pages/home.yml` | Pages → Homepage | `index.html` (layout, with placeholders) + `scripts/site-render.mjs` |
| Events on the homepage (cards, "Next gathering" box) | `content/events/*.yml`, one per event | Events | the events code in `index.html`'s `<script>`. The build runs the same code once so the cards are in the HTML for search engines, and the browser redraws them on load |
| One page per event at /events/&lt;name&gt;, and the /events list | `content/events/*.yml` (adds optional photo, recap, related link, free) | Events | `eventPage()` and `eventsPage()` in `scripts/build.mjs` |
| /about and its questions and answers | `content/pages/about.yml` | Pages → About page | `aboutPage()` in `scripts/build.mjs` |
| Headings and intros of /newsletter, /blog, /events, /resources | `content/pages/archives.yml` | Pages → Newsletter, Blog, Events and Resources pages | `scripts/build.mjs` + `listHero()` in `site-render.mjs` |
| Newsletter issues and blog posts | `content/posts/*.md` (file name = web address) | Newsletter, Blog | `scripts/build.mjs` + `scripts/posts.css` |
| Resource cards at /resources | `content/resources/*.md` front matter; files in `/resources` | Resources | `resourceCard()` in `site-render.mjs` |
| One page per resource at /resources/&lt;name&gt; | the same file; its body (Summary page) is the page text | Resources | `resourcePage()` in `scripts/build.mjs` |
| Pictures in posts | `assets/posts/` | uploaded in the editor | |
| Founder photos | `assets/founders/` | uploaded in Pages → Homepage | |

Still in code, not the editor: navigation and button links, form labels, the `/qr` page, and the `NEWSLETTER` (Kit) and `ANALYTICS` (Mixpanel) settings at the top of `index.html`'s `<script>`.

## How the homepage is built

`index.html` is a template. It holds all the layout, styles and scripts, with placeholders where the words go. Some examples:

```html
<h1 id="hero-title">{{hl:hero.title}}</h1>
<p class="lede">{{t:hero.lede}}</p>
<ul class="values">
  {{block:values}}
</ul>
const EVENTS = {{json:events}};
```

The part after the colon is a field in `content/pages/home.yml`; for example, `hero.title` is the `title` field under `hero`. The placeholder kinds are listed at the top of `scripts/site-render.mjs`:

- `{{t:…}}` for text
- `{{hl:…}}` for text with the coral highlight
- `{{a:…}}` for text inside an attribute
- `{{tl:…}}` for text inside a JavaScript template string
- `{{json:events}}` for the events
- `{{block:…}}` for repeated blocks: `values`, `founders` and `steps`

`scripts/build.mjs` calls `fillIndex()`, which replaces the placeholders with the text from the content files. The newsletter box, header, footer and styles of the post pages are taken from the filled-in `index.html`, so they stay in step automatically.

## The preview pane

The preview pane on the right of the editor works in two ways:

- **Newsletter and Blog** use the editor's built-in preview, styled by `admin/preview.css` to look like a post page. It's a separate stylesheet, so a change to how posts look (`scripts/posts.css`) needs the same change in `admin/preview.css` if you want the preview to match.
- **Homepage, Events, Resources and the list pages** use custom previews in `admin/admin.js`. They draw the real page with the same code as the live site:
  - The build writes three files into `/admin` on every deploy:
    - `site-data.js`: the raw `index.html` template plus the current text and events
    - `site-render.js`: a copy of `scripts/site-render.mjs`
    - `site.css`: `index.html`'s styles plus `scripts/posts.css`
  - The homepage and event previews also run the events part of `index.html`'s own script, from `const TZ =` up to `document.getElementById("year")`, inside the preview. That way the cards and the "Next gathering" box come out exactly as on the site.

So for these previews, **a design change in `index.html`, `posts.css` or `site-render.mjs` shows up in the preview automatically** after the next deploy. There's nothing to keep in sync by hand, with two exceptions:

- `admin.js` finds the events code by those two markers, and finds the page body between `<header class="site-header">` and the `<script>` after the analytics bar. If you rename or move those, update `runEventScript()` and `homeBody()` in `admin/admin.js`.
- The previews that only show part of a page (event = homepage hero + events section; resource = /resources heading + one card) choose those parts in `admin.js`.

## Changing the design: checklist

- **Change how something looks** (CSS, layout, markup) in `index.html` or `scripts/posts.css`. Text stays in the content files. Check with `npm run preview`.
- **Add a new piece of text to the homepage:**
  1. Add the field to `content/pages/home.yml`.
  2. Put a placeholder like `{{t:section.field}}` in `index.html`.
  3. Add the field to the Homepage entry in `admin/config.yml`, under the matching section with a label and hint. Otherwise the editor won't show it, and may drop it when saving.
- **Add a new repeated block** (like the values): add a renderer to `blocks()` in `scripts/site-render.mjs`, put `{{block:name}}` in `index.html`, and add a `list` field in `admin/config.yml`.
- **Rename or remove a field:** change it in all three places: the content file, the `index.html` placeholder and `admin/config.yml`. The build stops with a clear error if a placeholder has no matching field ("content/pages/home.yml is missing …").
- **Add a new page** (for example /about): add a content file in `content/pages/`, a function in `scripts/build.mjs` that writes the page (see `listPage()` and `resourcesPage()`), and a `files` entry under `pages` in `admin/config.yml`. For a site-styled preview, add a template in `admin/admin.js` with `CMS.registerPreviewTemplate("<file name>", …)`.
- **After any change,** run `npm run build`. It fails loudly if a content file and a placeholder disagree. Open `/admin` on the Vercel preview to check the editor and its preview pane.

## Sign-in (GitHub)

- Anyone whose GitHub account has write access to `mjfoucher-dev/producthub-website` can sign in. Nobody else can. To add someone, go to GitHub repo → Settings → Collaborators.
- `admin/index.html` loads Sveltia. `admin/admin.js` sets the backend's `base_url` to the site's own address, so sign-in goes to `api/auth.mjs` on the same site.
- `api/auth.mjs` is our own GitHub OAuth handler, a Vercel function:
  - It sends the browser to GitHub with a one-time state cookie.
  - It swaps GitHub's code for a token.
  - It passes the token to the editor window with the `authorizing:github` handshake that Sveltia/Decap expect, and only to the same site.
  - It stores nothing.
- Settings:

| Where | What |
|---|---|
| GitHub → Settings → Developer settings → OAuth Apps → **ProductHub Victoria editor** | Homepage URL `https://producthub.info`, Authorization callback URL `https://producthub.info/api/auth` |
| Vercel → producthub-website → Settings → Environment Variables (Production) | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`. Redeploy after changing them. |

- **Check:** open `https://producthub.info/api/auth?check`. It shows whether both settings are present (true/false, never the values).
- **Sign-in only works on producthub.info, not on Vercel preview links**, because GitHub only sends people back to the callback URL above. On a preview link the editor loads but can't sign in.
- **If sign-in breaks:** check `/api/auth?check`. Then check that the OAuth app's callback URL is exactly `https://producthub.info/api/auth`. If a client secret was regenerated, update `GITHUB_OAUTH_CLIENT_SECRET` and redeploy. As a fallback, the editor's **Sign In Using Access Token** button works with a GitHub personal access token that has `repo` scope.

## Publishing workflow settings

These live in `admin/config.yml`:

- `publish_mode: editorial_workflow` makes every save a pull request on its own branch (`cms/…`), with Draft / In Review / Ready stages. Publish merges it.
- Vercel builds every pull request, and `draft: true` posts show only on those previews. The editor finds the preview link through GitHub's deployment status.
- For a simpler flow with no review stages, change it to `publish_mode: preview`: saves still go to a pull request with a preview, without the stage board.

## Search engines and AI tools (SEO and AEO)

The build gives every page what search engines and AI answer tools look for. Nothing here needs editing by hand; it all comes from the content files.

- **Titles and descriptions:** the homepage's come from Pages → Homepage → Search and sharing (`seo.title`, `seo.description`). Other pages use their own title and summary.
- **Canonical link and Open Graph / X tags** on every page, with absolute image addresses so LinkedIn and Slack previews work.
- **Structured data (schema.org JSON-LD):** Organization and WebSite on the homepage (founders from Pages → Homepage → Founders, with their LinkedIn), Event on the homepage and each event page, BlogPosting on posts, DigitalDocument on resource pages, FAQPage on /about, and BreadcrumbList on inner pages.
- **Events in the HTML:** `prerenderEvents()` in `build.mjs` runs the events part of `index.html`'s script (from `const TZ =` to `document.getElementById("year")`, the same markers the editor preview uses) so the homepage cards are in the page for crawlers that don't run JavaScript.
- **Event web addresses:** the file name without its date plus the year, so `2026-11-05-fall-event.yml` is `/events/fall-event-2026`. Changing a file name changes the address.
- **Take-homes on event pages:** resources dated the same day as an event are listed on that event's page, and the resource page links back to the event.
- **`sitemap.xml`** lists every public page with a last-changed date. **`llms.txt`** is a short guide to the site for AI tools, with the FAQ, events and resources; **`llms-full.txt`** is the whole site as one Markdown file.
- To check: paste a page into Google's [Rich Results Test](https://search.google.com/test/rich-results) or the [Schema Markup Validator](https://validator.schema.org/).

## Keeping it out of search and analytics

`/admin` has a noindex tag and an `X-Robots-Tag` header (set in `vercel.json`). It's disallowed in `robots.txt` and not in `sitemap.xml`. It also has no Mixpanel code.

## Sveltia version

`admin/index.html` loads `@sveltia/cms@5` from unpkg, so it picks up 5.x bug fixes automatically. If an update ever breaks something, pin an exact version, for example `@sveltia/cms@5.0.3`. Sveltia's own docs are at https://sveltiacms.app/docs. The config options used here are listed in its type definitions (`src/lib/types/public.js` in the Sveltia repo).

## Files at a glance

```
admin/index.html        loads Sveltia and admin.js
admin/admin.js          preview templates + starts the editor
admin/config.yml        collections, fields, hints, workflow
admin/preview.css       post preview styling
api/auth.mjs            GitHub sign-in
content/pages/*.yml     page text (home, archives, about)
content/events/*.yml    events
content/posts/*.md      newsletter issues and blog posts
content/resources/*.md  resources
index.html              homepage layout, styles, scripts, with placeholders
scripts/build.mjs       builds dist/ (and the /admin preview files)
scripts/site-content.mjs  reads the content files (Node only)
scripts/site-render.mjs   fills placeholders, renders blocks and cards (shared with the editor)
scripts/posts.css       styles for posts and list pages
```
