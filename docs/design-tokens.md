# AKAY Design Tokens

**Step 1 of the design revamp — tokens only.** This document is the single source
of truth for AKAY's color, type, radius, and elevation tokens. Components are
**not** restyled yet; that is Step 2. Preview everything live at
[`/design-tokens`](../frontend/src/pages/DesignTokens.jsx).

## Design direction

> **"Clinical minimalism"** — flat, dense, structured, professional
> (the *medical-ehr-minimalism* skill).

Cool-gray neutrals, one red (`#DC2626`) for primary actions / active states /
urgency, sharp corners (2px on badges only), no shadows except floating layers,
and bold sans headings. Geiza is the first font in the stack; Public Sans is the
shipped fallback.

## Where tokens live (Tailwind v4)

AKAY uses Tailwind v4's CSS-first config — there is no `tailwind.config.js`. All
tokens are defined in [`frontend/src/index.css`](../frontend/src/index.css).

| Block     | Purpose                                                                 |
| --------- | ----------------------------------------------------------------------- |
| `@theme`  | **Generating tokens.** Tailwind emits these as CSS vars *and* builds utilities from them (`bg-brand-600`, `text-neutral-600`, `rounded-card`, `font-sans`, `text-2xl`, `shadow-md`). |
| `:root`   | **Semantic role tokens.** Plain CSS vars that do *not* generate utilities. Components consume THESE in Step 2. |
| `:root` (aliases) | Legacy `--akay-*` variables, re-pointed at the new tokens so nothing breaks. |

Rule of thumb: **a value a component picks by name → `@theme`. A role that maps to
different values in different themes → `:root`.** Keeping roles separate from ramps
is what lets a dark theme drop in later by overriding roles only.

---

## Color

### Neutral — cool gray

| Shade | Hex       | Typical use              |
| ----- | --------- | ------------------------ |
| 50    | `#F9FAFB` | App background           |
| 100   | `#F3F4F6` | Subtle surface / hover   |
| 200   | `#E5E7EB` | Borders                  |
| 300   | `#D1D5DB` | Strong borders / dividers|
| 400   | `#9CA3AF` | Disabled text, icons     |
| 500   | `#6B7280` | Muted text               |
| 600   | `#4B5563` | Secondary text           |
| 700   | `#374151` | Body text (strong)       |
| 800   | `#1F2937` | Headings                 |
| 900   | `#111827` | Primary text             |

### Brand — red

| Shade | Hex       | Typical use                         |
| ----- | --------- | ----------------------------------- |
| 50    | `#FEF2F2` | Primary-soft tint (active nav bg)   |
| 100   | `#FEE2E2` | Soft fills, hovers                  |
| 200   | `#FECACA` | Soft borders                        |
| 300   | `#FCA5A5` | —                                   |
| 400   | `#F87171` | —                                   |
| 500   | `#EF4444` | Critical accents                    |
| 600   | `#DC2626` | **Primary** — buttons, links, active states |
| 700   | `#B91C1C` | Primary hover / on-tint text        |
| 800   | `#991B1B` | Primary pressed                     |
| 900   | `#7F1D1D` | —                                   |

### Alert — critical only

| Shade | Hex       | Typical use                    |
| ----- | --------- | ------------------------------ |
| 50    | `#FEF2F2` | Danger-soft tint (error bg)    |
| 100   | `#FEE2E2` | —                              |
| 200   | `#FECACA` | —                              |
| 300   | `#FCA5A5` | —                              |
| 400   | `#F87171` | —                              |
| 500   | `#EF4444` | **Danger** — destructive, urgent |
| 600   | `#DC2626` | Danger hover                   |
| 700   | `#B91C1C` | On-tint danger text            |

### Status

| Role    | 50        | 500       | 700       | Use                         |
| ------- | --------- | --------- | --------- | --------------------------- |
| Success | `#ECFDF5` | `#059669` | `#047857` | Completed, healthy, confirmed |
| Warning | `#FFFBEB` | `#F59E0B` | `#B45309` | Caution, pending review     |
| Info    | `#ECFEFF` | `#0891B2` | `#0E7490` | Neutral information         |

### 🔴 Brand red vs. Alert red — WHEN to use each

Brand and alert now resolve to the same red family (`#DC2626` / `#EF4444`), so
red is **reserved**: primary actions, active states and critical alerts only.
The two token families keep two different jobs:

| Use **Brand** (`brand-600`) for…            | Use **Alert** (`alert-500`) for…                   |
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
| `--font-sans` | `"Geiza", "Public Sans Variable", system-ui, sans-serif` | Body, UI, headings (default) |
| `--font-serif`| `"Source Serif 4 Variable", Georgia, serif`       | Not used for headings (kept for legacy use) |
| `--font-mono` | `"IBM Plex Mono", ui-monospace, monospace`        | IDs, codes, data        |

Geiza is first in the stack but its files are **not shipped**; the browser falls
back to Public Sans. Shipped fonts are **self-hosted** via `@fontsource` (no CDN —
poor-connectivity context), imported in [`main.jsx`](../frontend/src/main.jsx). Weights: Public Sans
400/500/600/700, Source Serif 4 500/600, IBM Plex Mono 400/500.

**Type scale (unchanged; `body` is 14px):**

| Utility     | Token         | Size      | px   |
| ----------- | ------------- | --------- | ---- |
| `text-xs`   | `--text-xs`   | .75rem    | 12px |
| `text-sm`   | `--text-sm`   | .8125rem  | 13px |
| `text-base` | `--text-base` | .9375rem  | 15px |
| `text-lg`   | `--text-lg`   | 1.0625rem | 17px |
| `text-xl`   | `--text-xl`   | 1.25rem   | 20px |
| `text-2xl`  | `--text-2xl`  | 1.5rem    | 24px |
| `text-3xl`  | `--text-3xl`  | 1.875rem  | 30px |

`body` defaults to the sans stack at 14px; `h1`–`h4` default to bold (700) sans.
The `--text-*` scale is unchanged, so only inherited, un-classed text gets denser. Utility classes (`font-sans`, `font-bold`, …) still win by
specificity, so a component can always opt out.

---

## Radius (sharp — only badges get 2px)

| Utility           | Token               | Value | Use                                          |
| ----------------- | ------------------- | ----- | --------------------------------------------- |
| `rounded-row`     | `--radius-row`      | 0     | Table rows, list items                        |
| `rounded-input`   | `--radius-input`    | 0     | Inputs, buttons                               |
| `rounded-card`    | `--radius-card`     | 0     | Cards, stat tiles, patient header             |
| `rounded-card-sm` | `--radius-card-sm`  | 0     | Nested/small cards inside a section           |
| `rounded-modal`   | `--radius-modal`    | 0     | Modals, dialogs                               |
| `rounded-badge`   | `--radius-badge`    | 2px   | Badges, status tags                           |
| `rounded-pill`    | `--radius-pill`     | 999px | Dots, avatars, spinners only                  |

Tailwind's own scale is overridden so hard-coded classes go square too:
`rounded-xs/md/lg/xl/2xl/3xl/4xl` = `0`, `rounded-sm` = `2px`.

## Elevation / shadow

Flat by default. `shadow-2xs/xs/sm/md` and `shadow-card` are `0 0 #0000` (no
shadow); structure comes from 1px borders. Only floating layers (menus,
popovers, modals, toasts) keep one subtle shadow via `shadow-lg/xl/2xl`.

| Utility        | Token            | Value                                |
| -------------- | ---------------- | ------------------------------------ |
| `shadow-2xs/xs/sm/md` | `--shadow-2xs/xs/sm/md` | `0 0 #0000` (flat)      |
| `shadow-card`  | `--shadow-card`  | `0 0 #0000` (flat)                   |
| `shadow-lg/xl/2xl` | `--shadow-lg/xl/2xl` | `0 4px 12px rgba(17,24,39,.08)` |

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
| `--color-primary`        | `brand-600`        |
| `--color-primary-hover`  | `brand-700`        |
| `--color-primary-soft`   | `brand-50`         |
| `--color-danger`         | `alert-500`        |
| `--color-danger-hover`   | `alert-600`        |
| `--color-danger-soft`    | `alert-50`         |
| `--color-ring`           | `brand-600 @ 30%`  |

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
   <button className="bg-brand-600 hover:bg-brand-700 text-white rounded-input">
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
- Cards: `border border-neutral-200`, square, no shadow. Keep `shadow-lg` for
  floating layers only.
- Use bold sans for headings, mono for IDs/codes.
- Reach for semantic roles (`--color-text`, `--color-surface`) over raw shades
  when the value could differ under a future dark theme.

**Don't**

- Hardcode hex (`#DC2626`, `#0f172a`) or `slate-*` utilities — those are the
  Step 2 migration targets.
- Add shadows or rounded corners to cards; use `rounded-sm` on badges only.
- Spend `alert-*` on ordinary status — that's what muted success/warning/info
  are for.

### Dark mode (structured, not built)

Not implemented in Step 1. When added, override **only the semantic roles** under
a `:root[data-theme="dark"]` selector (e.g. `--color-bg`, `--color-surface`,
`--color-text`) and remap a few ramp roles. The `@theme` ramps and every utility
built from them stay unchanged, so components that consume roles adapt for free.
