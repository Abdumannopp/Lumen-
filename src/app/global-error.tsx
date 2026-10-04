"use client";

/**
 * Last-resort boundary. It replaces the root layout, so it must render its own
 * <html> and <body> and cannot rely on any shared component or stylesheet
 * loading successfully — the styles here are inline for that reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#07091a",
          color: "#e6e8f5",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 0.75rem" }}>
            The application failed to start
          </h1>
          <p style={{ color: "#8a90b4", lineHeight: 1.6, margin: "0 0 1.5rem", fontSize: "0.875rem" }}>
            Reloading will restart it. If this keeps happening, quote the reference below to support.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: 0,
              cursor: "pointer",
              borderRadius: "0.5rem",
              padding: "0.625rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#fff",
              background: "linear-gradient(100deg, #8b5cf6, #3b82f6)",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "#5c628a", fontFamily: "ui-monospace, monospace" }}>
              ref {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
