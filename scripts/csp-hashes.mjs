// Hashes for the inline <style> blocks third-party code injects at runtime.
//
// The CSP in src/config/csp.ts allows <style> elements only with the
// per-request nonce. Next.js stamps that nonce on its own styles, but a
// library that calls document.createElement("style") cannot know it, so its
// CSS is allowed by content hash instead. The hash is recomputed from
// node_modules on every build (see "build" in package.json), so upgrading a
// library cannot silently leave a stale hash behind — and a library that stops
// injecting CSS in the way this expects fails the build here instead of
// shipping unstyled UI.
//
//   node scripts/csp-hashes.mjs

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TARGET = "src/config/csp-hashes.json";

/** sonner injects its stylesheet with __insertCSS("<css>") at import time. */
function sonnerCss() {
  const file = require.resolve("sonner").replace(/index\.js$/, "index.mjs");
  const source = readFileSync(file, "utf8");
  const match = source.match(/__insertCSS\(("(?:[^"\\]|\\.)*")\)/);
  if (!match) throw new Error(`Could not find sonner's injected CSS in ${file}.`);
  return JSON.parse(match[1]);
}

const hash = (css) => `'sha256-${createHash("sha256").update(css, "utf8").digest("base64")}'`;

// sonner appends an empty <style> first and fills it a moment later. The
// browser checks the element in both states, so the empty one needs allowing
// too, or every page logs a violation. An empty stylesheet does nothing.
const hashes = { styleElem: [hash(""), hash(sonnerCss())] };

writeFileSync(TARGET, `${JSON.stringify(hashes, null, 2)}\n`);
console.log(`• ${TARGET} — ${hashes.styleElem.length} style hash(es).`);
