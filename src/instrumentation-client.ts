import { setNonce } from "get-nonce";
import { config } from "zod/v4/core";

/**
 * Runs in the browser before the app becomes interactive. Both settings exist
 * to keep the strict CSP in src/config/csp.ts working without exceptions.
 */

// Radix dialogs and menus lock page scroll through react-remove-scroll, which
// injects a <style> element. It stamps the nonce from `get-nonce` on it when
// one is set; without that, the browser refuses the style. Next.js put the
// request's nonce on its own script tags (readable through `.nonce` even after
// the browser hides the attribute), so it is taken from there.
const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
if (nonce) setNonce(nonce);

// Zod's JIT probes for eval support with `Function("")` on first parse. The
// CSP forbids eval, so the probe fails inside zod's own try/catch — harmless,
// but it reports a `script-src` violation on every page that parses a schema.
// Without the JIT, parsing works the same minus the generated code. The server
// is not under the CSP and keeps the JIT.
config({ jitless: true });
