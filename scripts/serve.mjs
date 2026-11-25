/* Serves dist/ at http://localhost:4321 with clean URLs, like Vercel does. Run with `npm run preview`. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const PORT = Number(process.env.PORT) || 4321;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".ttf": "font/ttf", ".webmanifest": "application/manifest+json" };

http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/+$/, "") || "/";
  const tries = [p, p + ".html", path.join(p, "index.html")].map(t => path.join(DIST, t));
  const file = tries.find(f => f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile());
  if (!file) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Preview at http://localhost:${PORT}  (newsletter: /newsletter, blog: /blog)`));
