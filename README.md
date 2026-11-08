# ProductHub Victoria website

A plain static site: open `index.html` in a browser, or serve this folder from any static host.

## Editing

Everything you will change lives at the top of the `<script>` block in `index.html`:

- `EVENTS`: one entry per gathering (title, start/end with UTC offset, venue, summary, optional agenda, Luma URL). Events move from Upcoming to Past automatically once they end.
- `NEWSLETTER`: set `provider` to `buttondown`, `mailchimp` or `substack` and fill in that provider's one setting. Until then the form shows a "sign-up opens shortly" message.

Founder bios, photos and links are in the `#founders` section of the HTML (remove the `placeholder` class once real text is in).

Brand assets come from the ProductHub brand library (Poppins, navy/ocean/sea-glass/coral palette, gradient logo on white, reverse logo on navy).

## Hosting on Vercel

1. Push this folder to a private GitHub repo.
2. On vercel.com, sign in with GitHub, choose **Add New → Project**, and import the repo. Leave Framework Preset as **Other**, with no build command and the root directory as `./`. Click **Deploy**.
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
