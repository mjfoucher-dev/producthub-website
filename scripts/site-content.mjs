/* Loads the site text that lives in content files, so it can be changed in the web editor
   (/admin) without touching the layout. The rendering itself is in site-render.mjs.

   content/pages/home.yml      homepage words, links and founder photos
   content/pages/archives.yml  top of the Newsletter, Blog and Resources pages
   content/events/*.yml        one file per gathering

   See docs/CMS.md for how it all fits together. */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { fillIndex as fill } from "./site-render.mjs";

export const readYaml = file => matter("---\n" + fs.readFileSync(file, "utf8") + "\n---\n").data || {};

export function loadSiteContent(root) {
  const pages = path.join(root, "content", "pages");
  const eventsDir = path.join(root, "content", "events");
  const home = readYaml(path.join(pages, "home.yml"));
  const archives = readYaml(path.join(pages, "archives.yml"));
  const events = fs.existsSync(eventsDir)
    ? fs.readdirSync(eventsDir).filter(f => /\.ya?ml$/.test(f)).sort().map(f => {
        const e = readYaml(path.join(eventsDir, f));
        for (const k of ["title", "start", "venue", "luma"]) if (!e[k]) throw new Error(`content/events/${f}: add a ${k}`);
        return e;
      })
    : [];
  return { home, archives, events };
}

/* ---------- photos ---------- */

/* Width and height of a JPEG or PNG, for the img tag. */
export function imageSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch (e) { /* missing file: fall through */ }
  return { w: 400, h: 400 };
}


/* index.html with the words from the content files filled in. */
export function fillIndex(html, root, content) {
  return fill(html, content, {
    photoSize: p => imageSize(path.join(root, p.replace(/^\//, ""))),
    photoUrl: p => p.replace(/^\//, "")
  });
}
