/*
 * AKAY Design Tokens — preview & QA page (Step 1 of the design revamp).
 *
 * Self-contained: renders every color ramp, the type scale, radius samples,
 * shadow samples, and status badges straight from the CSS custom properties
 * defined in index.css. Serves as QA and as ISO Interaction-Capability
 * evidence. Not linked in navigation; reachable at /design-tokens.
 *
 * Swatches read tokens via `var(--…)` inline styles so they always reflect the
 * true token values. A dedicated "Utilities smoke test" block uses LITERAL
 * Tailwind class names so the build proves that generated utilities work.
 */

const RAMPS = [
  {
    name: "Neutral",
    note: "Warm greige base — surfaces, text, borders.",
    prefix: "neutral",
    shades: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    name: "Brand",
    note: "Clay / brick — logo, nav, primary actions.",
    prefix: "brand",
    shades: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    name: "Alert",
    note: "Vivid red — Emergency / No Show / destructive ONLY.",
    prefix: "alert",
    shades: [50, 100, 200, 300, 400, 500, 600, 700],
  },
  {
    name: "Success",
    note: "Muted green — completed, healthy, confirmed.",
    prefix: "success",
    shades: [50, 500, 700],
  },
  {
    name: "Warning",
    note: "Muted amber — caution, pending review.",
    prefix: "warning",
    shades: [50, 500, 700],
  },
  {
    name: "Info",
    note: "Muted blue — neutral information.",
    prefix: "info",
    shades: [50, 500, 700],
  },
];

const TYPE_SCALE = [
  { token: "--text-3xl", label: "text-3xl", px: "30px" },
  { token: "--text-2xl", label: "text-2xl", px: "24px" },
  { token: "--text-xl", label: "text-xl", px: "20px" },
  { token: "--text-lg", label: "text-lg", px: "17px" },
  { token: "--text-base", label: "text-base", px: "15px" },
  { token: "--text-sm", label: "text-sm", px: "13px" },
  { token: "--text-xs", label: "text-xs", px: "12px" },
];

const RADII = [
  { token: "--radius-row", label: "row", px: "4px" },
  { token: "--radius-input", label: "input", px: "8px" },
  { token: "--radius-card", label: "card", px: "12px" },
  { token: "--radius-card-sm", label: "card-sm", px: "10px" },
  { token: "--radius-lg", label: "lg", px: "14px" },
  { token: "--radius-modal", label: "modal", px: "16px" },
  { token: "--radius-pill", label: "pill", px: "999px" },
];

const SHADOWS = [
  { token: "--shadow-sm", label: "shadow-sm" },
  { token: "--shadow-md", label: "shadow-md" },
  { token: "--shadow-lg", label: "shadow-lg" },
  { token: "--shadow-card", label: "shadow-card" },
];

const STATUS_BADGES = [
  { label: "Completed", fg: "--color-success-700", bg: "--color-success-50" },
  { label: "Pending Review", fg: "--color-warning-700", bg: "--color-warning-50" },
  { label: "Information", fg: "--color-info-700", bg: "--color-info-50" },
  { label: "Active", fg: "--color-brand-600", bg: "--color-brand-50" },
  { label: "Emergency", fg: "--color-alert-700", bg: "--color-alert-50" },
];

function isLightShade(shade) {
  return shade <= 300;
}

function Section({ title, description, children }) {
  return (
    <section
      style={{
        marginBottom: "48px",
        borderTop: "1px solid var(--color-border)",
        paddingTop: "28px",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "var(--text-2xl)",
          fontWeight: 600,
          color: "var(--color-text)",
          margin: 0,
        }}
      >
        {title}
      </h2>
      {description ? (
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
            margin: "6px 0 22px",
            maxWidth: "60ch",
          }}
        >
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}

function Ramp({ ramp }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          marginBottom: "8px",
        }}
      >
        <span
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          {ramp.name}
        </span>
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--color-text-muted)",
          }}
        >
          {ramp.note}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(94px, 1fr))",
          gap: "8px",
        }}
      >
        {ramp.shades.map((shade) => {
          const varName = `--color-${ramp.prefix}-${shade}`;
          return (
            <div
              key={shade}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-card)",
                overflow: "hidden",
                background: "var(--color-surface)",
              }}
            >
              <div
                style={{
                  height: "56px",
                  background: `var(${varName})`,
                }}
              />
              <div style={{ padding: "6px 8px" }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-xs)",
                    fontWeight: 500,
                    color: "var(--color-text)",
                  }}
                >
                  {ramp.prefix}-{shade}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                  }}
                >
                  <ColorValue varName={varName} />
                </div>
              </div>
              {/* On-color legibility check for the darker end of each ramp */}
              {!isLightShade(shade) ? (
                <div
                  style={{
                    padding: "0 8px 8px",
                    marginTop: "-2px",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 6px",
                      borderRadius: "var(--radius-row)",
                      background: `var(${varName})`,
                      color: "#fff",
                      fontSize: "10px",
                      fontWeight: 600,
                    }}
                  >
                    Aa
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Resolves the computed hex of a CSS var for display, without hardcoding it.
function ColorValue({ varName }) {
  return (
    <span
      ref={(node) => {
        if (!node) return;
        const probe = document.createElement("span");
        probe.style.color = `var(${varName})`;
        document.body.appendChild(probe);
        const rgb = getComputedStyle(probe).color;
        document.body.removeChild(probe);
        node.textContent = rgbToHex(rgb) || rgb;
      }}
    />
  );
}

function rgbToHex(rgb) {
  const match = String(rgb).match(/rgba?\(([^)]+)\)/);
  if (!match) return "";
  const parts = match[1].split(",").map((n) => parseFloat(n.trim()));
  const [r, g, b] = parts;
  if ([r, g, b].some((n) => Number.isNaN(n))) return "";
  const toHex = (n) => Math.round(n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export default function DesignTokens() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        padding: "40px 24px 80px",
      }}
    >
      <div style={{ maxWidth: "980px", margin: "0 auto" }}>
        {/* Header */}
        <header style={{ marginBottom: "36px" }}>
          <span
            style={{
              display: "inline-block",
              padding: "3px 10px",
              borderRadius: "var(--radius-pill)",
              background: "var(--color-primary-soft)",
              color: "var(--color-primary-hover)",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Step 1 · Tokens
          </span>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "var(--text-3xl)",
              fontWeight: 600,
              margin: "14px 0 6px",
            }}
          >
            AKAY Design Token System
          </h1>
          <p
            style={{
              fontSize: "var(--text-base)",
              color: "var(--color-text-secondary)",
              margin: 0,
              maxWidth: "68ch",
            }}
          >
            &ldquo;Calm medical sanctuary&rdquo; — airy, precise, trustworthy,
            humane. Warm-neutral base, clay brand red, a separate vivid alert red
            used sparingly, restrained radius, and serif headings.
          </p>
        </header>

        {/* Brand vs Alert rule */}
        <div
          style={{
            display: "grid",
            gap: "12px",
            gridTemplateColumns: "1fr 1fr",
            marginBottom: "8px",
          }}
        >
          <div
            style={{
              border: "1px solid var(--color-border)",
              borderLeft: "3px solid var(--color-brand-500)",
              borderRadius: "var(--radius-card)",
              background: "var(--color-surface)",
              padding: "14px 16px",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
              Brand red — <code style={{ fontFamily: "var(--font-mono)" }}>brand-500</code>
            </div>
            <p
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--color-text-secondary)",
                margin: "6px 0 0",
              }}
            >
              Identity & primary actions: logo, active nav, primary buttons,
              links, focus rings. Calm and frequent.
            </p>
          </div>
          <div
            style={{
              border: "1px solid var(--color-border)",
              borderLeft: "3px solid var(--color-alert-500)",
              borderRadius: "var(--radius-card)",
              background: "var(--color-surface)",
              padding: "14px 16px",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
              Alert red — <code style={{ fontFamily: "var(--font-mono)" }}>alert-500</code>
            </div>
            <p
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--color-text-secondary)",
                margin: "6px 0 0",
              }}
            >
              Urgency & danger ONLY: Emergency triage, No-Show, destructive
              confirms, validation errors. Rare, so it reads as urgent.
            </p>
          </div>
        </div>

        {/* Color ramps */}
        <Section
          title="Color ramps"
          description="Generating tokens in @theme. Utilities such as bg-brand-500 and text-neutral-600 are produced from these."
        >
          {RAMPS.map((ramp) => (
            <Ramp key={ramp.name} ramp={ramp} />
          ))}
        </Section>

        {/* Type scale */}
        <Section
          title="Type scale"
          description="15px base. Body: Public Sans. Headings: Source Serif 4. Code: IBM Plex Mono."
        >
          <div style={{ display: "grid", gap: "10px" }}>
            {TYPE_SCALE.map((t) => (
              <div
                key={t.token}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "16px",
                  borderBottom: "1px solid var(--color-border)",
                  paddingBottom: "10px",
                }}
              >
                <code
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    width: "120px",
                    flexShrink: 0,
                  }}
                >
                  {t.label} · {t.px}
                </code>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: `var(${t.token})`,
                    color: "var(--color-text)",
                  }}
                >
                  The quick brown fox
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "24px", display: "grid", gap: "12px" }}>
            <h3
              style={{
                fontFamily: "var(--font-serif)",
                fontWeight: 600,
                fontSize: "var(--text-2xl)",
                margin: 0,
              }}
            >
              Source Serif 4 heading — humane and precise
            </h3>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-base)",
                color: "var(--color-text-secondary)",
                margin: 0,
                maxWidth: "64ch",
              }}
            >
              Public Sans body copy at 15px. Legible at small sizes over poor
              connections, and pairs cleanly with the serif for a trustworthy,
              clinical feel.
            </p>
            <code
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-sm)",
                color: "var(--color-text)",
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-input)",
                padding: "8px 10px",
                width: "fit-content",
              }}
            >
              IBM Plex Mono · patient_id = 0xA23F31
            </code>
          </div>
        </Section>

        {/* Radius */}
        <Section
          title="Radius"
          description="Restrained by design. Rows barely soften; cards and inputs stay crisp; only modals round more."
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "14px",
            }}
          >
            {RADII.map((r) => (
              <div key={r.token} style={{ textAlign: "center" }}>
                <div
                  style={{
                    height: "72px",
                    background: "var(--color-brand-50)",
                    border: "1px solid var(--color-brand-200)",
                    borderRadius: `var(${r.token})`,
                  }}
                />
                <div
                  style={{
                    marginTop: "8px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  rounded-{r.label} · {r.px}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Shadow */}
        <Section
          title="Shadow"
          description="One soft elevation system. shadow-sm/md/lg stay reserved for overlays (menus, modals, toasts). shadow-card pairs with a border on elevated surfaces (record headers, accordion sections, stat tiles); nested cards inside them stay border-only."
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "20px",
            }}
          >
            {SHADOWS.map((s) => (
              <div key={s.token} style={{ textAlign: "center" }}>
                <div
                  style={{
                    height: "84px",
                    background: "var(--color-surface)",
                    borderRadius: "var(--radius-card)",
                    boxShadow: `var(${s.token})`,
                  }}
                />
                <div
                  style={{
                    marginTop: "12px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Status badges */}
        <Section
          title="Status badges"
          description="Calm status treatment: muted tint background with a darker on-tone label. Alert red is held back for true urgency."
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {STATUS_BADGES.map((b) => (
              <span
                key={b.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 12px",
                  borderRadius: "var(--radius-pill)",
                  background: `var(${b.bg})`,
                  color: `var(${b.fg})`,
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                }}
              >
                {b.label}
              </span>
            ))}
          </div>
        </Section>

        {/* Utilities smoke test — LITERAL class names so the build must emit them */}
        <Section
          title="Utilities smoke test"
          description="These use literal Tailwind utility classes (not inline vars). If they render styled, the @theme utilities are generating correctly."
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-brand-500 text-neutral-50 rounded-card font-serif shadow-md px-4 py-3">
              bg-brand-500 · font-serif · rounded-card
            </div>
            <div className="bg-neutral-100 text-neutral-600 rounded-lg border border-neutral-200 px-4 py-3">
              text-neutral-600 · rounded-lg
            </div>
            <div className="bg-alert-500 text-neutral-50 rounded-pill px-4 py-2 text-sm font-semibold">
              bg-alert-500 · rounded-pill
            </div>
            <div className="bg-success-50 text-success-700 rounded-input px-4 py-2 text-xs font-semibold">
              bg-success-50 · text-success-700
            </div>
            <div className="font-mono text-xs text-info-700 bg-info-50 rounded-row px-3 py-2">
              font-mono · text-info-700
            </div>
          </div>
        </Section>

        <footer
          style={{
            borderTop: "1px solid var(--color-border)",
            paddingTop: "18px",
            fontSize: "var(--text-xs)",
            color: "var(--color-text-muted)",
          }}
        >
          AKAY design tokens · Step 1. Legacy <code style={{ fontFamily: "var(--font-mono)" }}>--akay-*</code>{" "}
          variables remain aliased to these tokens. Components are restyled in
          Step 2.
        </footer>
      </div>
    </div>
  );
}
