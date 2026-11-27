// Vercel function: GitHub sign-in for the web editor at /admin (Sveltia CMS).
//
// 1. The editor opens a popup at /api/auth?provider=github&scope=repo.
//    We send the browser to GitHub's "Authorize ProductHub Victoria editor" page.
// 2. GitHub sends the browser back to /api/auth?code=...&state=...
//    We swap the code for an access token and hand it to the editor window, using the
//    postMessage handshake that Sveltia/Decap CMS expect.
//
// The token only lets someone edit the site if their GitHub account already has write access
// to mjfoucher-dev/producthub-website. Nothing is stored on our side.
//
// Env (Vercel → Settings → Environment Variables, Production):
//   GITHUB_OAUTH_CLIENT_ID      Client ID of the GitHub OAuth app
//   GITHUB_OAUTH_CLIENT_SECRET  A client secret of that app
// The OAuth app's "Authorization callback URL" must be https://producthub.info/api/auth
//
// Open https://producthub.info/api/auth?check in a browser to see whether both are set.

const COOKIE = "ph_cms_state";
const SCOPES = new Set(["repo", "public_repo"]);

const html = (body, status = 200, headers = {}) =>
  new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>ProductHub Victoria editor sign-in</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#06111F;color:#EEF3F8;display:grid;place-items:center;min-height:90vh;margin:0;padding:24px;text-align:center}a{color:#5FD1C6}</style>
</head><body>${body}</body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });

const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return "";
}

/* The page shown in the popup after GitHub: passes the result to the editor window, then closes.
   The result only goes to this same site (the editor at /admin runs on the same origin as this
   function), never to another website. */
function resultPage(origin, status, content) {
  const message = `authorization:github:${status}:${JSON.stringify(content)}`;
  const note = status === "success"
    ? "<p>Signed in. You can close this window.</p>"
    : `<p>Sign-in didn't work: ${escHtml(content.error)}</p><p><a href="/admin">Back to the editor</a></p>`;
  const script = `
(function () {
  var message = ${JSON.stringify(message)};
  var origin = ${JSON.stringify(origin)};
  if (!window.opener) return;
  window.addEventListener("message", function (e) {
    if (e.origin !== origin || e.source !== window.opener || e.data !== "authorizing:github") return;
    window.opener.postMessage(message, origin);
  });
  window.opener.postMessage("authorizing:github", origin);
})();`;
  return html(`<div>${note}</div><script>${script}</script>`, 200, {
    "Set-Cookie": `${COOKIE}=; Path=/api/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const redirectUri = `${origin}/api/auth`;
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

  if (url.searchParams.has("check")) {
    return Response.json({
      GITHUB_OAUTH_CLIENT_ID: !!clientId,
      GITHUB_OAUTH_CLIENT_SECRET: !!clientSecret,
      callback_url_to_use_in_github: redirectUri
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (!clientId || !clientSecret) {
    return resultPage(origin, "error", { error: "The GitHub sign-in isn't set up yet (GITHUB_OAUTH_CLIENT_ID or GITHUB_OAUTH_CLIENT_SECRET is missing in Vercel)." });
  }

  /* Step 2: GitHub sent the browser back. */
  if (url.searchParams.has("code") || url.searchParams.has("error")) {
    if (url.searchParams.has("error")) {
      return resultPage(origin, "error", { error: url.searchParams.get("error_description") || url.searchParams.get("error") });
    }
    const state = url.searchParams.get("state") || "";
    const expected = readCookie(request, COOKIE);
    if (!state || !expected || state !== expected) {
      return resultPage(origin, "error", { error: "The sign-in took too long or was started in another window. Please try again." });
    }
    let data;
    try {
      const r = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: url.searchParams.get("code"), redirect_uri: redirectUri })
      });
      data = await r.json();
    } catch (e) {
      return resultPage(origin, "error", { error: "Couldn't reach GitHub. Please try again." });
    }
    if (!data.access_token) {
      return resultPage(origin, "error", { error: data.error_description || data.error || "GitHub didn't return a token." });
    }
    return resultPage(origin, "success", { token: data.access_token, provider: "github" });
  }

  /* Step 1: send the browser to GitHub. */
  if ((url.searchParams.get("provider") || "github") !== "github") {
    return html("<p>Only GitHub sign-in is supported.</p>", 400);
  }
  const scope = SCOPES.has(url.searchParams.get("scope")) ? url.searchParams.get("scope") : "repo";
  const state = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");
  const github = new URL("https://github.com/login/oauth/authorize");
  github.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope, state, allow_signup: "false" }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: github.toString(),
      "Cache-Control": "no-store",
      "Set-Cookie": `${COOKIE}=${state}; Path=/api/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
    }
  });
}
