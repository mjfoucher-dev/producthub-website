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
