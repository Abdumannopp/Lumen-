import { z } from "zod";

/**
 * Environment configuration.
 *
 * Env vars are parsed once, at module load, so a misconfigured deployment
 * fails immediately with a readable message instead of throwing deep inside a
 * request. Server and client schemas are separate: anything in `clientEnv` is
 * inlined into the browser bundle, so only NEXT_PUBLIC_* keys belong there.
 */

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /**
   * PostgreSQL connection string. Required — there is no sensible default for a
   * database that lives on someone else's server, and a wrong guess would fail
   * deep inside the first query rather than at boot.
   */
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required. See .env.example for where to get one.")
    .refine((value) => /^postgres(ql)?:\/\//.test(value), {
      message: 'DATABASE_URL must be a PostgreSQL URL beginning "postgresql://".',
    }),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  /** Public application origin. Non-local deployments must use HTTPS. */
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),

  /** Whether the deployment proxy supplies and sanitises client IP headers. */
  TRUST_PROXY_HEADERS: z.coerce.boolean().default(false),

  // --- Authentication ----------------------------------------------------
  /**
   * `local` is a test double. It hashes passwords and signs sessions properly
   * so the suites can drive real sign-ins, but it stores accounts in process
   * memory and authenticates nobody who is not already there. The refinement
   * below refuses to start with it in production, because an install that
   * accepts a made-up account is worse than one that will not boot.
   */
  AUTH_PROVIDER: z.enum(["local", "supabase"]).default("local"),

  /**
   * Which deployment this process is. The one thing production-safety checks
   * below may look at — and it must stay a plain server variable, never a
   * `NEXT_PUBLIC_*` one.
   *
   * Next.js statically replaces `process.env.NEXT_PUBLIC_*` with a literal at
   * *build* time, everywhere that reads it — including this file, even though
   * it only ever runs on the server. A build produced without
   * `NEXT_PUBLIC_APP_ENV=production` set bakes in "not production" forever;
   * setting the variable later, when the container actually starts, changes
   * nothing, because there is no `process.env` lookup left in the compiled
   * output to change. That gap is exactly what let AUTH_PROVIDER="local" keep
   * running, and `/api/dev/confirm-link` keep answering, in a deployment that
   * had set the variable correctly at every layer except the one that
   * mattered.
   *
   * `APP_ENV` has no `NEXT_PUBLIC_` prefix, so Next.js leaves every reference
   * to it as a genuine `process.env.APP_ENV` read, resolved by Node at actual
   * process start — the same way `AUTH_PROVIDER` and `DATABASE_URL` already
   * are. Set it in whatever mechanism sets environment variables for the
   * running container or process, not in a build-time secret.
   */
  APP_ENV: z.enum(["local", "preview", "production"]).default("local"),

  // Supabase's anon key is public by design — it is what the browser uses, and
  // row-level security is what protects the data behind it. It is NEXT_PUBLIC_
  // for that reason, and it is not a secret that leaks by being there.
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),

  // --- AI ---------------------------------------------------------------
  // Provider selection is server-side only. No AI key may ever be exposed
  // through a NEXT_PUBLIC_* variable, which is why none of these appear in the
  // client schema below.
  AI_PROVIDER: z.enum(["mock", "anthropic", "gemini", "groq", "openrouter"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  /**
   * From openrouter.ai/keys. One key reaches hundreds of models from dozens of
   * vendors — which model is `AI_MODEL`, not a separate setting per vendor.
   */
  OPENROUTER_API_KEY: z.string().optional(),
  /**
   * Optional. Each provider has its own sensible default, so this only needs
   * setting to pin a specific model — a single shared default would be wrong
   * for three of the four providers.
   */
  AI_MODEL: z.string().optional(),
  /** Per-attempt ceiling, not a total budget for the whole run. */
  AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(30_000),
  AI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(6).default(3),
  AI_RETRY_BASE_MS: z.coerce.number().int().min(1).max(10_000).default(400),
  AI_RETRY_MAX_MS: z.coerce.number().int().min(1).max(60_000).default(8_000),

  /**
   * Billing. Optional as a set: with none of it configured the product runs
   * everything except checkout, which is what local development and the test
   * suites need.
   *
   * The notification secret is the one that matters. It is what proves a
   * webhook came from Paddle, and `src/lib/billing/webhook.ts` refuses every
   * event when it is missing rather than accepting unverified ones "until
   * billing is set up".
   */
  PADDLE_NOTIFICATION_SECRET: z.string().optional(),
  PADDLE_PRICE_ID: z.string().optional(),
  /** Optional server-side API key used only for short-lived customer portal links. */
  PADDLE_API_KEY: z.string().optional(),
  /** Upper bound for a Paddle API read; portal links must never hang a request. */
  PADDLE_API_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(15_000).default(5_000),
  /** Public by design — it identifies the seller, it does not authorise. */
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().optional(),
  PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),

  /**
   * Email. `log` is the default and sends nothing — it records that a message
   * would have gone, which is what development and the suites need.
   */
  EMAIL_PROVIDER: z.enum(["log", "resend"]).default("log"),
  RESEND_API_KEY: z.string().optional(),
  /** The verified sending address, e.g. `Lumen <hello@yourdomain.com>`. */
  EMAIL_FROM: z.string().optional(),

  /**
   * Who may sign up without an invite, and who may issue them.
   *
   * Comma-separated addresses. Empty means nobody — which is correct for a
   * deployment nobody has configured yet, and refuses rather than opening.
   *
   * In the environment rather than in a column because the first founder has
   * to exist before there is any way to grant the role. See
   * `src/lib/beta/invites.ts`.
   */
  FOUNDER_EMAILS: z.string().default(""),

  /**
   * Where a beta user is told to write when something is wrong.
   *
   * Shown in the interface, so it is deliberately not a secret — but it is
   * configuration, because it changes per deployment and a hard-coded support
   * address is one that eventually points at nobody.
   */
  SUPPORT_EMAIL: z.string().default("support@lumen.local"),

  /**
   * Whether signup requires an invite at all.
   *
   * `invite` is the default: only `FOUNDER_EMAILS` and holders of an unused
   * invite may create an account. `open` skips `checkGate` entirely and lets
   * anyone sign up — the flip for a public launch, made in configuration
   * rather than by deleting the gate, so a deployment can go invite-only again
   * (or stay invite-only for a slow rollout) without a code change.
   *
   * Founders, `/admin`, and disable/enable still work identically in `open`
   * mode — this only changes who may create an account, not who may run the
   * beta.
   */
  BETA_SIGNUP: z.enum(["invite", "open"]).default("invite"),
}).superRefine((value, ctx) => {
  // Fail at boot rather than at the first agent call. A missing key is a
  // configuration mistake, and finding it on startup is far cheaper than
  // finding it when someone presses "generate strategy".
  const required: Record<string, keyof typeof value> = {
    anthropic: "ANTHROPIC_API_KEY",
    gemini: "GOOGLE_API_KEY",
    groq: "GROQ_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };

  const key = required[value.AI_PROVIDER];

  if (key && !value[key]) {
    ctx.addIssue({
      code: "custom",
      path: [key],
      message: `${key} is required when AI_PROVIDER is "${value.AI_PROVIDER}".`,
    });
  }

  if (value.AUTH_PROVIDER === "supabase") {
    for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const) {
      if (!value[name]) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `${name} is required when AUTH_PROVIDER is "supabase".`,
        });
      }
    }
  }

  /**
   * Checkout needs both halves or neither.
   *
   * A price with no client token cannot open a checkout; a client token with no
   * price does not know what to sell. Half-configured billing fails at the
   * moment a customer presses Subscribe, which is the worst possible moment to
   * find out.
   */
  const checkout = [value.PADDLE_PRICE_ID, value.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN];

  if (checkout.some(Boolean) && !checkout.every(Boolean)) {
    ctx.addIssue({
      code: "custom",
      path: ["PADDLE_PRICE_ID"],
      message:
        "Checkout needs both PADDLE_PRICE_ID and NEXT_PUBLIC_PADDLE_CLIENT_TOKEN, or neither.",
    });
  }

  /**
   * Sending email needs a key and an address it may send from.
   *
   * Resend refuses anything from an unverified domain, so a deployment with a
   * key and no EMAIL_FROM would fail at the first send rather than at boot —
   * and the first send is a welcome email nobody is watching for.
   */
  if (value.EMAIL_PROVIDER === "resend") {
    for (const name of ["RESEND_API_KEY", "EMAIL_FROM"] as const) {
      if (!value[name]) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `${name} is required when EMAIL_PROVIDER is "resend".`,
        });
      }
    }
  }

  /**
   * The one refusal that is not about a missing value.
   *
   * `local` accepts any account it was told about in this process and nothing
   * else. In production that is not a weaker login, it is no login: anyone who
   * can reach signup can reach every workspace. Refusing to boot is the only
   * safe response, and it happens here rather than at the first request so a
   * misconfigured deploy fails on the way up.
   *
   * Reads `value.APP_ENV`, resolved above from a real (non-`NEXT_PUBLIC_`)
   * server variable — see the comment on `APP_ENV` for why that distinction is
   * the whole fix. This is also why the check has to live inside `superRefine`
   * rather than being hoisted to module scope: it must run when `getServerEnv`
   * actually parses `process.env`, at process start, not whenever this module
   * happens to be evaluated by the bundler.
   */
  const supabaseValues = [value.NEXT_PUBLIC_SUPABASE_URL, value.NEXT_PUBLIC_SUPABASE_ANON_KEY];
  if (supabaseValues.some(Boolean) && !supabaseValues.every(Boolean)) {
    ctx.addIssue({
      code: "custom",
      path: ["NEXT_PUBLIC_SUPABASE_URL"],
      message: "Supabase authentication needs both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or neither.",
    });
  }

  if (value.APP_ENV !== "local") {
    if (new URL(value.NEXT_PUBLIC_APP_URL).protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_APP_URL"],
        message: "NEXT_PUBLIC_APP_URL must use https:// outside local development.",
      });
    }

    if (!value.TRUST_PROXY_HEADERS) {
      ctx.addIssue({
        code: "custom",
        path: ["TRUST_PROXY_HEADERS"],
        message:
          "TRUST_PROXY_HEADERS must be true outside local development, and the reverse proxy must strip client-supplied forwarding headers.",
      });
    }
  }

  const paddleConfigured = Boolean(value.PADDLE_PRICE_ID && value.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN);
  if (paddleConfigured && !value.PADDLE_NOTIFICATION_SECRET) {
    ctx.addIssue({
      code: "custom",
      path: ["PADDLE_NOTIFICATION_SECRET"],
      message: "Paddle checkout is enabled, so PADDLE_NOTIFICATION_SECRET is also required for entitlement webhooks.",
    });
  }

  if (value.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) {
    const expectedPrefix = value.PADDLE_ENVIRONMENT === "production" ? "live_" : "test_";
    if (!value.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN.startsWith(expectedPrefix)) {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_PADDLE_CLIENT_TOKEN"],
        message: `Paddle client token must start with ${expectedPrefix} for PADDLE_ENVIRONMENT=${value.PADDLE_ENVIRONMENT}.`,
      });
    }
  }


  if (value.PADDLE_API_KEY) {
    const expectedPrefix = value.PADDLE_ENVIRONMENT === "production" ? "pdl_live_apikey_" : "pdl_sdbx_apikey_";
    if (!value.PADDLE_API_KEY.startsWith(expectedPrefix)) {
      ctx.addIssue({
        code: "custom",
        path: ["PADDLE_API_KEY"],
        message: `PADDLE_API_KEY must start with ${expectedPrefix} for PADDLE_ENVIRONMENT=${value.PADDLE_ENVIRONMENT}.`,
      });
    }
  }

  if (value.PADDLE_ENVIRONMENT !== value.NEXT_PUBLIC_PADDLE_ENVIRONMENT && paddleConfigured) {
    ctx.addIssue({
      code: "custom",
      path: ["NEXT_PUBLIC_PADDLE_ENVIRONMENT"],
      message: "Paddle browser and server environments must match when checkout is enabled.",
    });
  }

  if (value.APP_ENV === "production") {
    if (value.AI_PROVIDER === "mock") {
      ctx.addIssue({ code: "custom", path: ["AI_PROVIDER"], message: "AI_PROVIDER=mock is local-test only and must not run in production." });
    }
    if (value.EMAIL_PROVIDER === "log") {
      ctx.addIssue({ code: "custom", path: ["EMAIL_PROVIDER"], message: "EMAIL_PROVIDER=log is local-test only and must not run in production." });
    }
    if (paddleConfigured && value.PADDLE_ENVIRONMENT !== "production") {
      ctx.addIssue({ code: "custom", path: ["PADDLE_ENVIRONMENT"], message: "Production checkout must use PADDLE_ENVIRONMENT=production." });
    }
  }

  const googleValues = [value.GOOGLE_CLIENT_ID, value.GOOGLE_CLIENT_SECRET, value.INTEGRATION_ENCRYPTION_KEY];
  if (googleValues.some(Boolean) && !googleValues.every(Boolean)) {
    ctx.addIssue({
      code: "custom",
      path: ["GOOGLE_CLIENT_ID"],
      message: "Google integrations need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and INTEGRATION_ENCRYPTION_KEY, or none of them.",
    });
  }

  if (value.AUTH_PROVIDER === "local" && value.APP_ENV !== "local") {
    ctx.addIssue({
      code: "custom",
      path: ["AUTH_PROVIDER"],
      message:
        'AUTH_PROVIDER="local" is a development double and must never run outside local development. ' +
        'Set AUTH_PROVIDER="supabase" and supply its keys.',
    });
  }
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  /**
   * Paddle's client-side token. Reaches the browser on purpose — it names the
   * seller so the checkout overlay knows whose it is, and grants nothing. The
   * API key and the notification secret are server-only and appear nowhere in
   * this schema.
   */
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().optional(),
  NEXT_PUBLIC_PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

function parse<T extends z.ZodType>(schema: T, source: unknown, scope: string): z.infer<T> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid ${scope} environment variables:\n${details}`);
  }

  return result.data;
}

/**
 * Set SKIP_ENV_VALIDATION=1 for container image builds that compile the app
 * without runtime secrets present. Never set it on a running instance.
 */
const skip = process.env.SKIP_ENV_VALIDATION === "1";

// NEXT_PUBLIC_* keys are read as literal property accesses so the bundler can
// statically replace them at build time. Do not refactor to dynamic lookup.
const rawClientEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
  NEXT_PUBLIC_PADDLE_ENVIRONMENT: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT,
};

export const clientEnv: ClientEnv = skip
  ? (rawClientEnv as unknown as ClientEnv)
  : parse(clientSchema, rawClientEnv, "client");

let cachedServerEnv: ServerEnv | undefined;

/**
 * Server-only environment. Accessed through a function so importing a module
 * that touches config from a client component fails loudly instead of leaking
 * secrets into the browser bundle.
 */
export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() was called in the browser. Use clientEnv instead.");
  }

  if (!cachedServerEnv) {
    cachedServerEnv = skip
      ? (process.env as unknown as ServerEnv)
      : parse(serverSchema, process.env, "server");
  }

  return cachedServerEnv;
}

export const isProduction = process.env.NODE_ENV === "production";
export const isDevelopment = process.env.NODE_ENV === "development";
