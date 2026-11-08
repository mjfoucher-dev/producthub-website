// Vercel function: handles the Approve / Decline buttons on join requests.
// Slack app → Interactivity & Shortcuts → Request URL: https://producthub.info/api/slack-action
// Env: SLACK_SIGNING_SECRET (Slack app → Basic Information → Signing Secret)
//      SLACK_INVITE_LINK    (Slack shareable invite link; refresh every 30 days)
//      RESEND_API_KEY       (Resend, with producthub.info verified)
import crypto from "node:crypto";

const FROM = "ProductHub Victoria <hello@producthub.info>";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function verified(raw, headers) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  const ts = headers.get("x-slack-request-timestamp");
  const sig = headers.get("x-slack-signature") || "";
  if (!secret || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const mine = "v0=" + crypto.createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex");
  return mine.length === sig.length && crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(sig));
}

async function sendInvite(name, email) {
  const invite = process.env.SLACK_INVITE_LINK, key = process.env.RESEND_API_KEY;
  if (!invite) throw new Error("SLACK_INVITE_LINK is not set in Vercel.");
  if (!key) throw new Error("RESEND_API_KEY is not set in Vercel.");
  const first = name.split(/\s+/)[0];
  const text = [
    `Hi ${first},`, "",
    "Thanks for asking to join. You're in! Use this link to join the ProductHub Victoria Slack:", invite, "",
    "Once you're in, introduce yourself and tell us what you're working on.", "",
    "See you there,", "Michael and Danijel", "ProductHub Victoria", "https://producthub.info"
  ].join("\n");
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0b1b2e;max-width:520px">
<p>Hi ${esc(first)},</p>
<p>Thanks for asking to join. You're in!</p>
<p><a href="${esc(invite)}" style="display:inline-block;background:#ff7a59;color:#0b1b2e;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Join the ProductHub Victoria Slack</a></p>
<p>Once you're in, introduce yourself and tell us what you're working on.</p>
<p>See you there,<br>Michael and Danijel<br><a href="https://producthub.info" style="color:#0b1b2e">ProductHub Victoria</a></p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [email], reply_to: "hello@producthub.info",
      subject: "Your invite to the ProductHub Victoria Slack", text, html })
  });
  if (!r.ok) throw new Error(`Email service said ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

const respond = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Setup check: open https://producthub.info/api/slack-action in a browser.
// Shows only whether each setting is present (never the values) and whether
// Resend reports producthub.info as verified.
export async function GET() {
  const set = k => Boolean(process.env[k]);
  const status = {
    SLACK_SIGNING_SECRET: set("SLACK_SIGNING_SECRET"),
    SLACK_INVITE_LINK: set("SLACK_INVITE_LINK"),
    RESEND_API_KEY: set("RESEND_API_KEY"),
    resend_domain: "not checked"
  };
  if (status.RESEND_API_KEY) {
    try {
      const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
      if (!r.ok) status.resend_domain = `Resend said ${r.status} (key may be send-only or invalid)`;
      else {
        const d = ((await r.json()).data || []).find(x => x.name === "producthub.info");
        status.resend_domain = d ? d.status : "producthub.info not added in Resend";
      }
    } catch (e) { status.resend_domain = `could not reach Resend: ${e.message}`; }
  }
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  const raw = await request.text();
  if (!verified(raw, request.headers)) return new Response("Bad signature", { status: 401 });

  const payload = JSON.parse(new URLSearchParams(raw).get("payload") || "{}");
  const action = payload.actions && payload.actions[0];
  if (payload.type !== "block_actions" || !action) return new Response("", { status: 200 });

  const { name, email } = JSON.parse(action.value || "{}");
  const who = `<@${payload.user.id}>`;
  const when = `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|just now>`;
  const kept = (payload.message.blocks || []).filter(b => b.type !== "actions");

  let status;
  if (action.action_id === "approve") {
    try { await sendInvite(name, email); }
    catch (e) {
      await respond(payload.response_url, { response_type: "ephemeral", replace_original: false,
        text: `:warning: The invite email to ${email} wasn't sent. ${e.message}` });
      return new Response("", { status: 200 });
    }
    status = `:white_check_mark: *Approved* by ${who} · invite emailed to ${esc(email)} · ${when}`;
  } else if (action.action_id === "decline") {
    status = `:x: *Declined* by ${who} · ${when}`;
  } else {
    return new Response("", { status: 200 });
  }

  await respond(payload.response_url, { replace_original: true, text: `Join request from ${name}: ${action.action_id}d`,
    blocks: [...kept, { type: "context", elements: [{ type: "mrkdwn", text: status }] }] });
  return new Response("", { status: 200 });
}
