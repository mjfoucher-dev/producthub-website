// Vercel serverless function: receives Slack join requests from the website
// and posts them to a private Slack channel via an incoming webhook.
// Set SLACK_WEBHOOK_URL in Vercel → Project → Settings → Environment Variables.

const clip = (v, n) => String(v || "").trim().slice(0, n);
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// One-click approval: a mailto link that opens a ready-written invite email.
// SLACK_INVITE_LINK is Slack's shareable invite link (refresh it every 30 days).
function approveLine(name, email) {
  const invite = process.env.SLACK_INVITE_LINK;
  if (!invite) return `To approve: Slack → Invite people → ${esc(email)}`;
  const first = name.split(/\s+/)[0];
  const subject = "Your invite to the ProductHub Victoria Slack";
  const body = [
    `Hi ${first},`,
    "",
    "Thanks for asking to join. You're in! Use this link to join the ProductHub Victoria Slack:",
    invite,
    "",
    "Once you're in, introduce yourself and tell us what you're working on.",
    "",
    "See you there,",
    "ProductHub Victoria"
  ].join("\n");
  const href = `mailto:${email}?subject=${encodeURIComponent(subject)}&amp;body=${encodeURIComponent(body)}`;
  return `<${href}|✅ Approve: open invite email>   ·   To decline, just ignore this.`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  if (b.company) return res.status(200).json({ ok: true }); // honeypot: quietly drop bots

  const name = clip(b.name, 120), email = clip(b.email, 200), work = clip(b.work, 1000);
  const linkedin = clip(b.linkedin, 300), heard = clip(b.heard, 300);
  if (!name || !work || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Name, a valid email and what you work on are required." });
  }
  if (linkedin && !/^https?:\/\//i.test(linkedin)) return res.status(400).json({ error: "LinkedIn must be a link." });

  const hook = process.env.SLACK_WEBHOOK_URL;
  if (!hook) return res.status(500).json({ error: "Slack webhook is not configured." });

  const lines = [
    `*New Slack join request*`,
    `*Name:* ${esc(name)}`,
    `*Email:* ${esc(email)}`,
    `*Works on:* ${esc(work)}`,
    linkedin && `*LinkedIn:* ${esc(linkedin)}`,
    heard && `*Heard via:* ${esc(heard)}`,
    approveLine(name, email)
  ].filter(Boolean);

  const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) });
  if (!r.ok) return res.status(502).json({ error: "Could not reach Slack." });
  return res.status(200).json({ ok: true });
};
