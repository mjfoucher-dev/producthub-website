# ProductHub Victoria website

A static site with a small build step for the newsletter archive and blog. `index.html` is the homepage; `npm run build` copies it and the assets into `dist/` and adds the posts. Vercel runs the build on every push.

## Newsletter and blog posts

The easiest way to write one is the web editor at **producthub.info/admin** (see [Web editor](#web-editor) below). Under the hood, every post is one Markdown file in `content/posts/`, named after its web address: `issue-2.md` becomes `/newsletter/issue-2`, `why-we-stay-small.md` becomes `/blog/why-we-stay-small`. (Older names with a `YYYY-MM-DD-` prefix still work; the prefix is dropped from the address.) The header at the top sets:

```yaml
---
title: Hello from ProductHub Victoria
type: newsletter        # or blog
issue: 1                # newsletters only
date: 2026-11-25
slug: issue-1           # optional; overrides the file name in the web address
description: One or two sentences for search results and link previews.
image: /assets/email/fall-event-2026.jpg   # optional; used for link previews
imageAlt: What the image shows
author: Michael & Danijel
tags: [events, community]
draft: true             # optional; drafts only show on preview links
---
```

Below the header, write normal Markdown. Two extras: `![alt](/path.jpg "Caption")` becomes a captioned photo, and a quote whose last line starts with `—` gets that line as its attribution (the first quote in a row is shown as the big navy card). Put images in `assets/posts/`.

The build makes `/newsletter`, `/blog`, a page per post, RSS feeds (`/feed.xml`, `/newsletter/feed.xml`, `/blog/feed.xml`), `sitemap.xml`, `llms.txt` (a summary for AI search tools) and a "From the newsletter and blog" list on the homepage where `index.html` has `<!--LATEST-POSTS-->`. Post pages reuse the homepage's styles, newsletter form, theme toggle and Mixpanel code, so change those in `index.html`.

To preview locally: `npm install`, then `npm run preview` and open http://localhost:4321. Every pull request also gets a Vercel preview link, which shows drafts too.

## Web editor

Michael and Danijel write and publish posts at **https://producthub.info/admin** without touching code. It's [Sveltia CMS](https://sveltiacms.app/docs), a free editor that runs in the browser and saves straight to this GitHub repo. There's no database.

- **Sign in with GitHub.** Anyone whose GitHub account has write access to `mjfoucher-dev/producthub-website` can sign in; nobody else can. To add someone: GitHub repo → Settings → Collaborators → Add people.
- **Nothing goes live until you press Publish.** Saving a post creates a pull request. Vercel builds a preview of the whole site with the post in it, and the editor shows a preview link once it's ready (about a minute). Move the post from Draft → In Review → Ready on the **Workflow** page, then press **Publish**, which merges the pull request. The live site updates about a minute later.
- **Pictures** you upload go into `assets/posts/`.
- **Quotes:** to credit a quote, press Shift+Enter at the end of it and start the new line with an em dash (—).
- **Sending the newsletter email** still happens in Kit; the editor only puts the issue on the website.

**How it's all wired up** (content files, preview pane, sign-in, and what to change when the design changes): see [docs/CMS.md](docs/CMS.md).

## Editing

Almost all the words on the site live in content files, so they can be changed in the web editor at /admin without touching the layout:

| File | What | In the editor |
|---|---|---|
| `content/pages/home.yml` | Homepage text, values, founders (bios, photos, links), Slack and newsletter sections, footer tagline, Google description | Pages → Homepage |
| `content/pages/archives.yml` | Headings and intros of /newsletter, /blog and /resources | Pages → Newsletter, Blog and Resources pages |
| `content/events/*.yml` | One file per gathering (title, start/end, venue, summary, agenda, Luma link). Events move from Upcoming to Past automatically once they end. | Events |
| `content/resources/*.md` | Briefs and take-homes at /resources; the files themselves go in `/resources` | Resources |
| `content/posts/*.md` | Newsletter issues and blog posts | Newsletter, Blog |

`index.html` keeps the layout, styles and scripts, with placeholders like `{{t:hero.title}}` where the words go. `scripts/site-render.mjs` fills them in at build time; its header lists the placeholder kinds. Full guide: [docs/CMS.md](docs/CMS.md). In text fields, `**bold**`, `*italic*` and `[links](https://…)` work, and in the homepage headline `*words*` get the coral highlight.

Still in code: navigation and button links, form labels, and the `NEWSLETTER` (Kit) and `ANALYTICS` (Mixpanel) settings at the top of the `<script>` block in `index.html`.

## Hosting on Vercel

1. Push this folder to a private GitHub repo.
2. On vercel.com, sign in with GitHub, choose **Add New → Project**, and import the repo. Leave Framework Preset as **Other**; `vercel.json` sets the build command (`npm run build`) and output folder (`dist`). Click **Deploy**.
3. Every push to `main` redeploys the site automatically. Other branches get their own preview URLs.

### Custom domain

1. In the Vercel project, open **Settings → Domains** and add your domain (for example `producthubvictoria.ca` and `www.producthubvictoria.ca`).
2. At your domain registrar, add the DNS records Vercel shows: usually an `A` record for the root domain pointing to `76.76.21.21`, and a `CNAME` for `www` pointing to `cname.vercel-dns.com`. Use exactly the values Vercel lists.
3. Vercel issues the HTTPS certificate on its own once DNS resolves, usually within minutes.

`vercel.json` adds clean URLs, a week of caching for `/assets`, and two basic security headers.

## Slack join requests

The "Join the Slack" form on the site lets people ask to join the ProductHub Victoria Slack (producthubvictoria.slack.com). Michael or Danijel approve or decline each request from Slack.

### How it works

1. The form (`#slack` section of `index.html`) posts to `api/join.js`.
2. `api/join.js` posts the request to the private **#join-requests** channel through the Slack app's incoming webhook, with **Approve & send invite** and **Decline** buttons.
3. A button click goes from Slack to `api/slack-action.mjs` (`https://producthub.info/api/slack-action`), which checks the click really came from Slack using the signing secret.
4. **Approve** emails the person the Slack invite link from `hello@producthub.info` via Resend, then replaces the buttons with "Approved by … · invite emailed to … · time". **Decline** only marks the request declined; no email is sent.

Slack's free plan has no API to invite by email, which is why approval emails a shareable invite link. New members join as regular members: they see public channels and are added to the workspace's default channels (Workspace settings → Default channels). Private channels stay hidden.

### Accounts and settings

| Where | What |
|---|---|
| Slack app **ProductHub Website** (api.slack.com/apps) | Incoming webhook for #join-requests. **Interactivity & Shortcuts** is On, Request URL `https://producthub.info/api/slack-action`. |
| Resend (resend.com) | Free account. Domain `producthub.info` verified (region us-east-1) through GoDaddy auto-configure. Records live only on `resend._domainkey`, `send` and `rsend`; receiving is off, so the root MX records (ImprovMX forwarding) are untouched. API key `producthub-website-vercel`, full access. |
| Vercel → producthub-website → Environment Variables (Production) | `SLACK_WEBHOOK_URL`, `SLACK_SIGNING_SECRET` (Slack app → Basic Information → App Credentials → **Signing Secret**, not the Client Secret), `SLACK_INVITE_LINK` (Slack → Invite people → Copy invite link, set to never expire), `RESEND_API_KEY`. Redeploy after changing any of them. |

### If the buttons stop working

- Open `https://producthub.info/api/slack-action` in a browser. It shows whether each setting is present (true/false, never the values), whether the signing secret looks right, and Resend's domain status (should be `verified`).
- Hover the warning triangle next to the buttons in Slack for the error:
  - "not configured to handle interactive responses": Interactivity is off or has no Request URL in the Slack app.
  - Status code 401: the signing secret in Vercel doesn't match the Slack app's Signing Secret. Copy it again and redeploy. (Stray spaces are ignored.)
  - 404 or a redirect: the Request URL is wrong; it must be exactly the address above.
- If Approve fails to send the email, Slack shows a private warning to whoever clicked, with Resend's error. The invite link may have been reset in Slack, or the Resend key revoked.
