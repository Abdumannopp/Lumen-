import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checks = [];
const fail = (name, detail) => checks.push({ ok: false, name, detail });
const pass = (name, detail) => checks.push({ ok: true, name, detail });

for (const file of [
  "src/app/globals.css",
  "src/app/layout.tsx",
  "src/app/(marketing)/page.tsx",
  "src/app/(app)/overview/page.tsx",
  "src/components/layout/app-shell.tsx",
  "src/components/layout/app-nav.tsx",
  "src/components/brand/logo.tsx",
  "src/components/ui/button.tsx",
  "src/components/ui/card.tsx",
  "src/components/ui/select.tsx",
  "next.config.ts",
  "package-lock.json",
]) {
  (existsSync(join(root, file)) ? pass : fail)("file", file);
}

for (const asset of [
  "public/brand/lumen-logo-light.png",
  "public/brand/lumen-logo-dark.png",
  "public/brand/lumen-mark-light.png",
  "public/brand/lumen-mark.png",
  "public/brand/lumen-ui-showcase.png",
]) {
  (existsSync(join(root, asset)) ? pass : fail)("brand asset", asset);
}

const shell = readFileSync(join(root, "src/components/layout/app-shell.tsx"), "utf8");
if (/if\s*\([^\n]+\)\s*\{\s*set[A-Z]/.test(shell)) {
  fail("react state", "AppShell contains render-time setState");
} else {
  pass("react state", "no render-time AppShell state update");
}
if (!shell.includes('id="main"')) fail("accessibility", 'AppShell is missing the main landmark id="main"');
if (!shell.includes('aria-controls="lumen-mobile-nav"')) fail("accessibility", "mobile navigation trigger is missing aria-controls");

const appLayout = readFileSync(join(root, "src/app/(app)/layout.tsx"), "utf8");
if (appLayout.includes('<div id="main">')) fail("accessibility", "App layout wraps AppShell content in a duplicate main landmark");
else pass("accessibility", "App layout does not duplicate the main landmark");

const select = readFileSync(join(root, "src/components/ui/select.tsx"), "utf8");
if (select.includes("#0e1128")) fail("theme", "native select option styling contains a hard-coded dark surface");
else pass("theme", "native select options use semantic theme tokens");

const config = readFileSync(join(root, "next.config.ts"), "utf8");
for (const token of [
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Content-Security-Policy',
  'Strict-Transport-Security',
]) {
  if (!config.includes(token)) fail("security headers", `${token} missing from next.config.ts`);
}
if (checks.every((c) => c.ok || c.name !== "security headers")) pass("security headers", "baseline hardening headers are present");

const routes = new Set(["/"]);
const appRoot = join(root, "src/app");
// Route inventory is intentionally lightweight and ignores route groups/dynamic segments.
const walk = (dir, parts = []) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) {
      const part = /^\(.+\)$/.test(name.name) || /^\[.+\]$/.test(name.name) ? null : name.name;
      walk(full, part ? [...parts, part] : parts);
    } else if (name.name === "page.tsx") {
      routes.add("/" + parts.join("/"));
    }
  }
};
walk(appRoot);

let broken = 0;
for (const dir of [join(root, "src/components"), join(root, "src/app")]) {
  // Source scan is intentionally conservative: only literal hrefs can be checked here.
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".tsx")) {
        const s = readFileSync(full, "utf8");
        for (const match of s.matchAll(/href=["'](\/[A-Za-z0-9_./-]+)["']/g)) {
          const href = match[1].replace(/\/$/, "") || "/";
          if (!routes.has(href) && ![...routes].some((route) => route.startsWith(href + "/"))) broken++;
        }
      }
    }
  }
}
if (broken) fail("navigation", `${broken} literal internal href(s) do not map to an app route`);
else pass("navigation", "literal internal hrefs map to known routes");

const failed = checks.filter((c) => !c.ok);
console.log(`LUMEN PRODUCTION AUDIT: ${failed.length ? "FAIL" : "PASS"}`);
for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`);
process.exitCode = failed.length ? 1 : 0;
