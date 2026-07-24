# AKAY Design Tokens

**Step 1 of the design revamp — tokens only.** This document is the single source
of truth for AKAY's color, type, radius, and elevation tokens. Components are
**not** restyled yet; that is Step 2. Preview everything live at
[`/design-tokens`](../frontend/src/pages/DesignTokens.jsx).

## Design direction

> **"Calm medical sanctuary"** — airy, precise, trustworthy, humane.
> Not startup, not aggressive, not heavily rounded.

Warm-neutral base, a clay brand red, a **separate** vivid alert red used
sparingly, restrained radius, and serif headings.

## Where tokens live (Tailwind v4)

AKAY uses Tailwind v4's CSS-first config — there is no `tailwind.config.js`. All
tokens are defined in [`frontend/src/index.css`](../frontend/src/index.css).

| Block     | Purpose                                                                 |
| --------- | ----------------------------------------------------------------------- |
| `@theme`  | **Generating tokens.** Tailwind emits these as CSS vars *and* builds utilities from them (`bg-brand-500`, `text-neutral-600`, `rounded-card`, `font-serif`, `text-2xl`, `shadow-md`). |
| `:root`   | **Semantic role tokens.** Plain CSS vars that do *not* generate utilities. Components consume THESE in Step 2. |
| `:root` (aliases) | Legacy `--akay-*` variables, re-pointed at the new tokens so nothing breaks. |

Rule of thumb: **a value a component picks by name → `@theme`. A role that maps to
different values in different themes → `:root`.** Keeping roles separate from ramps
is what lets a dark theme drop in later by overriding roles only.

---

## Color

### Neutral — warm greige (replaces slate)

| Shade | Hex       | Typical use              |
| ----- | --------- | ------------------------ |
| 50    | `#FAFAF9` | App background           |
| 100   | `#F5F4F2` | Subtle surface / hover   |
| 200   | `#E8E7E3` | Borders                  |
| 300   | `#D6D4CE` | Strong borders / dividers|
| 400   | `#B0ADA4` | Disabled text, icons     |
| 500   | `#8A867C` | Muted text               |
| 600   | `#6B6860` | Secondary text           |
| 700   | `#4E4B45` | Body text (strong)       |
| 800   | `#35332E` | Headings                 |
| 900   | `#21201C` | Primary text             |

### Brand — clay / brick

| Shade | Hex       | Typical use                         |
| ----- | --------- | ----------------------------------- |
| 50    | `#FBF1EF` | Primary-soft tint (active nav bg)   |
| 100   | `#F5DED9` | Soft fills, hovers                  |
| 200   | `#E4B3AA` | Soft borders                        |
| 300   | `#CE8578` | —                                   |
| 400   | `#B85A4B` | —                                   |
| 500   | `#A23F31` | **Primary** — buttons, links, logo  |
| 600   | `#853327` | Primary hover                       |
| 700   | `#67281F` | Primary pressed / on-tint text      |
| 800   | `#4A1E17` | —                                   |
| 900   | `#331512` | —                                   |

### Alert — vivid red

| Shade | Hex       | Typical use                    |
| ----- | --------- | ------------------------------ |
| 50    | `#FDECEC` | Danger-soft tint (error bg)    |
| 100   | `#FAD1D1` | —                              |
| 200   | `#F2A0A0` | —                              |
| 300   | `#E96A6A` | —                              |
| 400   | `#DE3F3F` | —                              |
| 500   | `#C81E1E` | **Danger** — destructive, urgent |
| 600   | `#A31616` | Danger hover                   |
| 700   | `#7D1010` | On-tint danger text            |

### Status — muted, calm

| Role    | 50        | 500       | 700       | Use                         |
| ------- | --------- | --------- | --------- | --------------------------- |
| Success | `#EAF2EC` | `#3F7A55` | `#2C5A3E` | Completed, healthy, confirmed |
| Warning | `#F7F0E1` | `#B07D2B` | `#855C18` | Caution, pending review     |
| Info    | `#EAF1F6` | `#3A6B94` | `#29506F` | Neutral information         |

### 🔴 Brand red vs. Alert red — WHEN to use each

The old system used one red (`#B91C1C`) for both brand and danger, so **nothing
read as urgent.** These are now two different reds with two different jobs:

| Use **Brand** (`brand-500`, clay) for…      | Use **Alert** (`alert-500`, vivid) for…            |
| ------------------------------------------- | -------------------------------------------------- |
| Logo, wordmark                              | Emergency / triage-urgent flags                    |
| Active navigation item                      | "No Show" status                                   |
| Primary buttons (Save, Submit, Refer)       | Destructive confirms (Delete, Discard, Revoke)     |
| Links and link hovers                       | Form validation errors                             |
| Focus rings (`--color-ring`)                | Critical / overdue alerts                          |
| Selected states, brand accents             | Anything that means **stop / danger / act now**    |

**Litmus test:** if it appears on nearly every screen, it's **brand**. If it
should make someone's eyes snap to it because something is wrong or irreversible,
it's **alert**. Alert red must stay rare to stay loud. Muted status colors
(success/warning/info) carry ordinary state so alert red is never spent on it.

---

## Typography

| Token         | Family                                            | Role                    |
| ------------- | ------------------------------------------------- | ----------------------- |
| `--font-sans` | `"Public Sans Variable", system-ui, sans-serif`   | Body, UI (default)      |
| `--font-serif`| `"Source Serif 4 Variable", Georgia, serif`       | Headings (h1–h4 default)|
| `--font-mono` | `"IBM Plex Mono", ui-monospace, monospace`        | IDs, codes, data        |

Fonts are **self-hosted** via `@fontsource` (no CDN — poor-connectivity context),
imported in [`main.jsx`](../frontend/src/main.jsx). Weights: Public Sans
400/500/600/700, Source Serif 4 500/600, IBM Plex Mono 400/500.

**Type scale (15px base):**

| Utility     | Token         | Size      | px   |
| ----------- | ------------- | --------- | ---- |
| `text-xs`   | `--text-xs`   | .75rem    | 12px |
| `text-sm`   | `--text-sm`   | .8125rem  | 13px |
| `text-base` | `--text-base` | .9375rem  | 15px |
| `text-lg`   | `--text-lg`   | 1.0625rem | 17px |
| `text-xl`   | `--text-xl`   | 1.25rem   | 20px |
| `text-2xl`  | `--text-2xl`  | 1.5rem    | 24px |
| `text-3xl`  | `--text-3xl`  | 1.875rem  | 30px |

`body` defaults to Public Sans at 15px; `h1`–`h4` default to Source Serif 4 at
weight 600. Utility classes (`font-sans`, `font-bold`, …) still win by
specificity, so a component can always opt out.

---

## Radius (restrained — do **not** round heavily)

| Utility           | Token               | Value | Use                                          |
| ----------------- | ------------------- | ----- | --------------------------------------------- |
| `rounded-row`     | `--radius-row`      | 4px   | Table rows, list items                        |
| `rounded-input`   | `--radius-input`    | 8px   | Inputs, buttons                               |
| `rounded-card`    | `--radius-card`     | 12px  | Cards, stat tiles, patient header             |
| `rounded-card-sm` | `--radius-card-sm`  | 10px  | Nested/small cards inside a section (task/medication cards) |
| `rounded-lg`      | `--radius-lg`       | 14px  | Larger panels, sidebars                       |
| `rounded-modal`   | `--radius-modal`    | 16px  | Modals, dialogs                               |
| `rounded-pill`    | `--radius-pill`     | 999px | Pills, badges, avatars                        |

## Elevation / shadow

`shadow-sm` / `shadow-md` / `shadow-lg` stay **reserved for overlays** (menus,
modals, toasts). `shadow-card` is the exception: it pairs **with** a border on
elevated/primary surfaces — the intent is gentle layering, not drama.

- **Elevated cards** (patient/record header, top-level accordion sections,
  stat tiles): `border border-neutral-200` **+** `shadow-card`, `rounded-card`.
- **Nested/small cards** living inside an elevated card (medicine rows, task
  cards): `border` only, **no shadow**, `rounded-card-sm`. The absence of
  shadow is what marks them as content inside a surface rather than a surface
  of their own.
- Don't stack `shadow-md`/`shadow-lg` on top of `shadow-card` — those stay for
  genuine overlays and hover states.

| Utility        | Token            | Value                                                              |
| -------------- | ---------------- | ------------------------------------------------------------------- |
| `shadow-sm`    | `--shadow-sm`    | `0 1px 2px rgba(33,32,28,.05)`                                      |
| `shadow-md`    | `--shadow-md`    | `0 4px 12px rgba(33,32,28,.06)`                                     |
| `shadow-lg`    | `--shadow-lg`    | `0 12px 28px rgba(33,32,28,.08)`                                    |
| `shadow-card`  | `--shadow-card`  | `0 1px 2px rgba(33,32,28,.05), 0 2px 8px rgba(33,32,28,.05)`        |

---

## Semantic role tokens (`:root`)

These are what components should reference in Step 2 — not raw ramp shades.

| Token                    | Resolves to        |
| ------------------------ | ------------------ |
| `--color-bg`             | `neutral-50`       |
| `--color-surface`        | `#FFFFFF`          |
| `--color-surface-2`      | `neutral-100`      |
| `--color-border`         | `neutral-200`      |
| `--color-border-strong`  | `neutral-300`      |
| `--color-text`           | `neutral-900`      |
| `--color-text-secondary` | `neutral-600`      |
| `--color-text-muted`     | `neutral-500`      |
| `--color-primary`        | `brand-500`        |
| `--color-primary-hover`  | `brand-600`        |
| `--color-primary-soft`   | `brand-50`         |
| `--color-danger`         | `alert-500`        |
| `--color-danger-hover`   | `alert-600`        |
| `--color-danger-soft`    | `alert-50`         |
| `--color-ring`           | `brand-500 @ 30%`  |

### Legacy `--akay-*` aliases (still valid)

`--akay-primary`, `--akay-primary-dark`, `--akay-primary-soft`, `--akay-bg`,
`--akay-surface`, `--akay-text`, `--akay-muted`, `--akay-border` are re-pointed at
the new tokens. Existing references keep working; migrate them opportunistically
in Step 2.

---

## How to consume tokens (Step 2 guide)

Prefer, in order:

1. **Tailwind utilities from ramps** — everyday styling:
   ```jsx
   <button className="bg-brand-500 hover:bg-brand-600 text-neutral-50 rounded-input">
   <p className="text-neutral-600 text-sm">
   <div className="rounded-card border border-neutral-200 bg-white">
   ```
2. **Semantic role vars** — for themeable roles, focus rings, and one-off CSS:
   ```jsx
   <div style={{ background: "var(--color-surface)", color: "var(--color-text)" }}>
   <input style={{ boxShadow: "0 0 0 3px var(--color-ring)" }} />
   ```
   In a stylesheet: `color: var(--color-text-secondary);`

**Do**

- Use `brand-*` for identity/primary, `alert-*` only for danger/urgency.
- Elevated cards: `border border-neutral-200` + `shadow-card`. Nested cards
  inside them: `border` only, no shadow. Keep `shadow-sm/md/lg` for overlays.
- Use serif for headings, mono for IDs/codes, sans everywhere else.
- Reach for semantic roles (`--color-text`, `--color-surface`) over raw shades
  when the value could differ under a future dark theme.

**Don't**

- Hardcode hex (`#B91C1C`, `#0f172a`) or `slate-*` utilities — those are the
  Step 2 migration targets.
- Add `shadow-card` to a nested/small card, or stack `shadow-md`/`shadow-lg`
  on top of an already-elevated card.
- Spend `alert-*` on ordinary status — that's what muted success/warning/info
  are for.

### Dark mode (structured, not built)

Not implemented in Step 1. When added, override **only the semantic roles** under
a `:root[data-theme="dark"]` selector (e.g. `--color-bg`, `--color-surface`,
`--color-text`) and remap a few ramp roles. The `@theme` ramps and every utility
built from them stay unchanged, so components that consume roles adapt for free.
