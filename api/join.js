// Vercel serverless function: receives Slack join requests from the website
// and posts them to a private Slack channel via an incoming webhook.
// Set SLACK_WEBHOOK_URL in Vercel → Project → Settings → Environment Variables.

const clip = (v, n) => String(v || "").trim().slice(0, n);
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
    `To approve: Slack → Invite people → ${esc(email)}`
  ].filter(Boolean);

  const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) });
  if (!r.ok) return res.status(502).json({ error: "Could not reach Slack." });
  return res.status(200).json({ ok: true });
};
