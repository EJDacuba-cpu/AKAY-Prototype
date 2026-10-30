---
name: AKAY
description: A dense clinical ledger of white sheets on pale paper, with pill controls and a three-color core of navy ink, brand red, and white.
colors:
  ledger-paper: "#f8f9fb"
  ledger-sheet: "#ffffff"
  ledger-sheet-sunk: "#f1f3f6"
  rule-hairline: "#e4e7ec"
  rule-strong: "#d0d5dd"
  ink: "#101828"
  ink-navy: "#1b2638"
  ink-secondary: "#475467"
  ink-muted: "#667085"
  ink-disabled: "#98a2b3"
  register-red: "#dc2626"
  register-red-deep: "#b91c1c"
  register-red-pressed: "#991b1b"
  register-red-tint: "#fef2f2"
  register-red-wash: "#fee2e2"
  alert-red: "#d92d20"
  stamp-green: "#12b76a"
  stamp-green-ink: "#027a48"
  stamp-green-tint: "#ecfdf3"
  stamp-amber: "#f79009"
  stamp-amber-ink: "#b54708"
  stamp-amber-tint: "#fffaeb"
  stamp-cyan: "#2e90fa"
  stamp-cyan-ink: "#175cd3"
  stamp-cyan-tint: "#eff8ff"
typography:
  headline:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  nav:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.3
  label:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.05em"
  data:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  none: "0px"
  badge: "6px"
  input: "8px"
  card: "12px"
  modal: "16px"
  pill: "999px"
spacing:
  page-mobile: "12px"
  page-tablet: "16px"
  page-desktop: "20px"
  gap-sm: "8px"
  gap-md: "16px"
  gap-lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.register-red}"
    textColor: "{colors.ledger-sheet}"
    typography: "{typography.nav}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.register-red-deep}"
  button-secondary:
    backgroundColor: "{colors.ledger-sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "36px"
  button-ghost:
    backgroundColor: "{colors.ledger-sheet}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    height: "36px"
  tab-pill:
    backgroundColor: "{colors.ledger-sheet-sunk}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    height: "32px"
  input:
    backgroundColor: "{colors.ledger-sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: "8px 12px"
  nav-item:
    textColor: "{colors.ink-secondary}"
    typography: "{typography.nav}"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.register-red-tint}"
    textColor: "{colors.register-red-deep}"
  status-badge:
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  record-card:
    backgroundColor: "{colors.ledger-sheet}"
    rounded: "{rounded.card}"
    padding: "16px"
  filter-popover:
    backgroundColor: "{colors.ledger-sheet}"
    rounded: "{rounded.card}"
  filter-select:
    backgroundColor: "{colors.ledger-sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "32px"
  table-row:
    height: "56px"
  table-head:
    backgroundColor: "{colors.ledger-sheet-sunk}"
    height: "44px"
---

# Design System: AKAY

## Overview

**Creative North Star: "The Clinic Ledger, with modern SaaS controls"**

AKAY still reads as a well-kept logbook at a health center: white sheets ruled with hairlines on a pale gray desk. Data stays dense and scannable. What changed is the control language. Buttons, tabs, and filter triggers are pills, so daily actions feel like current clinical SaaS (Healthie, Elation, Canvas, Linear) rather than a boxy 2016 EHR. Sheets, tables, and popover panels stay rectangular. Red is still the single mark of attention: the one primary action, the active place, and, in its alert form, danger.

The three-color core is navy ink, brand red, and white. Ink carries text and chrome. White carries readable surfaces. Red is spent once per screen on the thing to do. Ordinary clinical state still uses green, amber, and cyan stamps.

Screens are built for repeated daily work on a desktop or laptop in a facility, sometimes over a weak connection. Loading and error states are first-class. The interface should feel competent and calm on a long shift, never promotional, and never like a diagnosis engine.

**Key Characteristics:**
- Three-color core: navy ink, brand red, white. Status color is extra, not a fourth brand color.
- Rectangular sheets and tables with `--radius-card` (12px) on cards and filter popovers; pill-shaped buttons, tabs, dropdowns, and status chips.
- One red. Primary actions and active place use it. Alert red is for danger only.
- Fixed-size tables: the same row height whether the page has three rows or ten.
- Cool-gray neutrals tinted toward blue, never warm.

## Colors

A cool-gray ledger with a single red stamp. Neutrals do almost all the work; color is spent only where a decision or a danger lives.

### Primary
- **Register Red / Brand 600** (`{colors.register-red}`): The action color. Fills for pill primary buttons (Add, Save, Submit, Apply Filters, Refer) and the brand mark. Token: `--color-brand` / `--color-brand-600`.
- **Register Red Deep / Brand 700** (`{colors.register-red-deep}`): Hover fill for primary pills, active nav text, links, and on-tint text. Token: `--color-brand-700`.
- **Register Red Pressed / Brand 800** (`{colors.register-red-pressed}`): Pressed state of primary fills.
- **Register Red Tint** (`{colors.register-red-tint}`) and **Wash** (`{colors.register-red-wash}`): Active nav background, selected filter pills, and tinted notices. Never a decorative wash.

### Secondary
- **Navy Ink** (`{colors.ink-navy}`, `--color-ink-700`): Text chrome, sidebar weight, and secondary solid actions when a screen must not spend red (for example an admin directory add that is not a clinical CTA). Most UI text uses `--color-text` / Ink (`{colors.ink}`).
- **Alert Red** (`{colors.alert-red}`, `--color-danger`): Emergency and triage flags, destructive confirms, validation errors, overdue and critical alerts. If it appears on nearly every screen it is the wrong red.

### Tertiary (status)
- **Stamp Green** (`{colors.stamp-green}`, ink `{colors.stamp-green-ink}`, tint `{colors.stamp-green-tint}`): Completed, healthy, in stock, confirmed. Tokens: `--color-success-*`.
- **Stamp Amber** (`{colors.stamp-amber}`, ink `{colors.stamp-amber-ink}`, tint `{colors.stamp-amber-tint}`): Caution, pending review, low stock, follow-up required. Tokens: `--color-warning-*`.
- **Info Blue** (`{colors.stamp-cyan}`, ink `{colors.stamp-cyan-ink}`, tint `{colors.stamp-cyan-tint}`): Neutral information, Pending, and Received. Tokens: `--color-info-*`.

### Neutral
- **Ledger Paper** (`{colors.ledger-paper}` / `--color-bg`): The page background, the desk the sheets sit on.
- **Ledger Sheet** (`{colors.ledger-sheet}` / `--color-surface`): Cards, tables, modals, the sidebar. Every readable surface.
- **Ledger Sheet Sunk** (`{colors.ledger-sheet-sunk}` / `--color-neutral-100`): Table headers, hover rows, inset panels, pill-tab tracks.
- **Rule Hairline** (`--color-border`): Every border and divider. **Rule Strong** (`--color-border-strong`) for emphasis and hover borders.
- **Ink** (`--color-text`): Primary text. **Ink Secondary** (`--color-text-secondary`): supporting text. **Ink Muted** (`--color-text-muted`): captions and metadata.

### Named Rules
**The Three-Color Core Rule.** Ink, red, and white are the brand. Green, amber, and cyan are stamps, not a second brand. A new module that introduces purple, slate, or rainbow category chips is drift.

**The One Stamp Rule.** Red marks the one thing to do or the one thing that is wrong. Brand red is for action and place; Alert Red is for danger. If a screen has red everywhere, none of it is read.

**The Status-Is-Not-Danger Rule.** Ordinary state (completed, pending, low stock) uses green, amber, or cyan. Alert Red is never spent on state that is merely noteworthy.

**The Tokens-First Rule.** Screens reference role tokens (`--color-text`, `--color-surface`, `--color-brand`, `--color-ink-*`, `--color-neutral-*`) or the ramps in `frontend/src/index.css`. Raw `slate-*` utilities and hardcoded hex such as `#0F172A`, `#F8FAFC`, or `#B91C1C` are migration targets, not part of the system.

## Typography

**Display / Body / UI Font:** Inter Variable (with Inter, system-ui, sans-serif). This is the shipped `--font-sans` in `frontend/src/index.css`. Public Sans and Geiza are retired from new work.
**Data Font:** The same Inter family, with tabular figures and a slashed zero (`.font-mono`). Do not introduce a second display face for "technical" costume.

**Character:** One grotesque, medium for controls, semibold for titles, regular for reading. Fonts are self-hosted so the interface renders the same on a weak connection.

### Hierarchy
- **Headline** (700, 24px, 1.25): Page titles.
- **Title** (700, 17px, 1.3): Section and card headings. Smaller cards use 14px bold.
- **Body** (400, 14px, 1.5): Default reading and form text. Cap prose at roughly 65 to 75 characters.
- **Nav** (500 inactive, 600 active, 13px): Sidebar items and pill buttons. Child links are 12px.
- **Label** (700, 10px, 0.05em tracking, uppercase): Form labels, section labels, badges, and column headers. Never for sentences.
- **Data** (400, 13px, tabular): Patient IDs, referral codes, quantities, item IDs.

### Named Rules
**The Dense-But-Legible Rule.** Body is 14px, not 16px, because rows and records are the product. Do not go below 10px, and only labels may be that small.

**The Mono-For-Identity Rule.** If a value is something a person might read aloud or copy (an ID, a code), it uses tabular figures, not a decorative monospace costume.

## Layout

A fixed application shell: a left sidebar rail (72px collapsed, 240px expanded), a 56 to 62px top bar carrying breadcrumbs, the working-facility selector, and notifications, and a scrolling content area on Ledger Paper. Content padding steps with the viewport: 12px, 16px at the small breakpoint, 20px at large. Below the desktop breakpoint the sidebar becomes a drawer.

Screens are made of bordered sheets on the paper background. Module toolbars are compact: title and primary pills on the first row, tabs and search on the second, the data table immediately below. Lists are fixed-size tables: 44px header and 56px rows, 10 rows per page, so a card never changes height with the data. Spacing follows a 4px base, with gaps of 8, 16, and 24px between and inside sheets.

Primary context is a desktop or laptop in a facility, including 1366×768. Tablet, phone, 1080p, and 4K must stay usable without a separate design: wrap toolbar rows, keep popovers at `min(100vw - 1.5rem, 370px)` when they are filter panels, and never let a dropdown cover the only path through the table.

### Named Rules
**The Fixed-Frame Rule.** A table or list card holds its size regardless of row count. Empty and error states fill the same frame instead of collapsing it.

**The Toolbar-Then-Table Rule.** Search, filters, and the primary action sit in a compact toolbar above the sheet. Do not insert a second page header, a third filter band, or extra chrome between the toolbar and the rows.

## Elevation & Depth

Flat by default. Depth is carried by 1px hairline borders and by the contrast of white sheets on pale gray paper. Top-level sheets carry a barely-there card shadow (`--shadow-card`). Only floating layers (menus, popovers, modals, toasts) get a visible shadow (`--shadow-lg`).

### Shadow Vocabulary
- **Card hairline** (`--shadow-card`): Top-level sheets only, never nested cards.
- **Floating layer** (`--shadow-lg`): Dropdowns, popovers, modals, toasts.
- **Focus ring** (`0 0 0 2px` of `--color-ink-400` at 50%, or `--color-ring`): Keyboard and input focus. Do not use a zero-offset colored halo as decoration.

### Named Rules
**The Flat-At-Rest Rule.** Sheets do not lift on hover. Hover changes a border to Rule Strong or a fill to Ledger Sheet Sunk; it never moves the element or adds a shadow.

## Shapes

Two families, never mixed on the same component:

- **Sheets** (pages, table cards, filter popovers, modals): rectangular. Use `--radius-card` (12px) on the outer sheet, including filter popovers so they match inventory cards. Ordinary fields use `--radius-input` (8px).
- **Controls** (primary/secondary/ghost buttons, module tabs, filter triggers, filter dropdowns, status chips, avatars, spinners): pills (`rounded-full` / `--radius-pill`).

Do not put a pill radius on a data table or a filter popover sheet. Do not put square corners on Add, Filter, Apply, Reset, in-page tabs, or filter dropdowns. Borders are 1px. The only thick stroke is the 4px left bar marking the active sidebar item.

### Named Rules
**The Control-Is-A-Pill Rule.** If the user can press it to change the view or commit an action, it is a pill. If it holds records, it is a rectangle.

## Components

### Buttons
- **Implementation:** `Button` in `frontend/src/components/ui/button.jsx`. Use `variant="brand"` for clinical primary pills, `variant="secondary"` for Reset/Cancel pills, and `variant="filter"` for the Filter trigger (`aria-pressed` when filters are applied). `variant="default"` is navy-ink chrome, not a clinical CTA. `variant="destructive"` is Alert Red, never Brand 600. Compact popover actions use `size="compact"` (32px).
- **Shape:** Pill (`rounded-full`), 36px tall (h-9) in toolbars, 32px (h-8) inside compact popovers. Icon-only buttons may stay 36px circular. `default`, `ghost`, and `link` keep the incumbent rounded-lg chrome so existing family and login screens do not change.
- **Primary:** Brand 600 fill, white 13px medium text, 8px by 16px padding. Label may include a leading `+` in the text; do not wrap the plus in its own circle. Hover moves to Brand 700.
- **Secondary:** White fill, 1px Rule Hairline, Ink text. Used for Filter, Reset, and Cancel. An optional circular icon well (sliders, etc.) may sit inside the pill; the pill itself stays one control.
- **Ghost:** Transparent with Ink Secondary text; hover fills Ledger Sheet Sunk.
- **Destructive:** Alert Red fill (`--color-danger`). Confirm dialogs that already use `ModalButton` / `ConfirmationModal` stay on that path.
- **Focus / Disabled:** Ink ring at 50% opacity; disabled drops to 50% opacity and ignores pointer events.

### Chips and Status Badges
- **Style:** Pill with a 1px border, a 6px leading dot, and 10px bold uppercase label. Each status pairs a tint background, an ink text color, and a border from the same family.
- **State:** Active, Completed, and In Stock use green; Pending, Received, and Referred use blue; Follow-up Required, Under Observation, Low Stock, and Expiring use amber; Needs Referral uses orange; Cancelled, Inactive, Unavailable, and Expired use red; Not recorded uses gray.

### Cards / Containers
- **Corner Style:** `--radius-card` (12px) on the outer sheet, including filter popovers. Nested tables stay rectangular.
- **Background:** Ledger Sheet on Ledger Paper.
- **Shadow Strategy:** Card hairline on top-level sheets, none on nested cards. See Elevation & Depth.
- **Border:** 1px Rule Hairline; Rule Strong on hover for interactive cards.
- **Internal Padding:** 16px, 20px for large panels. Toolbars use 8 to 12px gaps, not a second padded card.

### Inputs / Fields
- **Style:** 1px Rule Hairline border, `--radius-input` (8px) on ordinary fields, 8px by 12px padding, 13 to 14px text, with a 10px bold uppercase label above. Filter popover dropdowns are pills (`rounded-full`), 32px tall, with a trailing chevron.
- **Focus:** Border shifts toward Ink 400 and an ink ring appears. Do not restyle the native open `<select>` menu; keep the closed field compact enough for a 370px filter popover.
- **Error / Disabled:** Error uses an Alert Red border with a 12px message beneath; disabled uses Ledger Sheet Sunk with muted text.

### Navigation
- **Style:** A left rail of 36px items with 13px text and a 4px left bar. The active item has a Register Red bar, Register Red Tint fill, and Register Red Deep semibold text; inactive items are Ink Secondary and gain a faint gray fill on hover. Section labels are 10px uppercase.
- **Locked items:** Stay in place with muted text, a lock icon, and a not-allowed cursor, so navigation looks the same for everyone. They open a "No access" state and never reveal blurred data.
- **Mobile:** The rail becomes a drawer; the top bar shrinks to 56px.

### Tabs
- **Style:** Pill segmented control on a sunk track (`bg-neutral-100`, `rounded-full`, 4px padding). Active is a white pill with ink text; inactive is ink-secondary on the track. Height 32px, 12px medium label. Optional status counts and a View-only stamp sit inside the pill, not as a second tab row.
- **Do not** use underline tabs for in-page inventory or list switching. Underlines remain acceptable only in dense clinical record section switchers that already use them.

### Filter popovers
- **Style:** Rectangular floating sheet, about 370px wide (`min(100vw - 1.5rem, 370px)`), hairline border, `--radius-card` (12px) to match inventory cards, aligned to the Filter pill.
- **Content:** Compact pill dropdowns, not expanded chip clouds and not square fields. Two columns for short fields (Stock / Expiry), full width for long fields (Category).
- **Footer:** Right-aligned pill actions, Reset (secondary) then Apply Filters (primary red).
- **Behavior:** Edits land on a draft. Apply commits and closes. Reset restores the draft to defaults. Dismissing without Apply keeps the last committed filters. Search stays outside the popover and applies live. BHC and RHU keep independent committed filter state.

### Data Tables
- **Style:** Fixed-size (44px header, 56px rows), header on Ledger Sheet Sunk, single-line cells with ellipsis truncation, and a tooltip on truncated text. Row hover fills Ledger Sheet Sunk.

### Modals
- **Style:** Rectangular panel on Ledger Sheet with a floating shadow and a dimmed backdrop. A title, optional subtitle, and close control sit in the header; actions sit in the footer as pills, with the primary action first in focus order. Sizes run from `sm` (24rem) to `wide` (72rem). Focus is trapped and restored on close; Escape closes unless the action is mid-save.

### Loading, Error and Empty States
Skeleton blocks stand in for data and keep the layout stable, with a thin top loading bar for route changes. Connection loss shows a persistent banner and a retry only where retry is real. Empty states fill the same frame as a populated list.

## Do's and Don'ts

### Do:
- **Do** build surfaces from Ledger Sheet on Ledger Paper with 1px Rule Hairline borders, adding only the card hairline shadow on top-level sheets.
- **Do** use pill buttons, pill tabs, pill dropdowns, and pill status chips. Use rectangular sheets and tables. Filter popovers use `--radius-card` (12px), not a pill and not a square.
- **Do** use Brand 600 (`{colors.register-red}`) for the one primary pill on a screen, Ink for text and chrome, and white for surfaces.
- **Do** reserve Alert Red for danger, urgency, errors, and destructive confirms.
- **Do** use the green, amber, and cyan families for ordinary status.
- **Do** keep table rows at 56px and headers at 44px, and truncate long text with an ellipsis and a title.
- **Do** put IDs and codes in tabular Inter, not a costume mono.
- **Do** reference `--color-*` role tokens or the ink, brand, and neutral ramps instead of raw hex.
- **Do** respect `prefers-reduced-motion`, and keep motion to short fades and state transitions.
- **Do** show locked modules as visible, labeled placeholders.

### Don't:
- **Don't** make buttons, tabs, filter triggers, or filter dropdowns square. That is the retired EHR-minimalism look.
- **Don't** make data tables or filter popover sheets into pills. Card radius on the sheet is required; pill radius on the sheet is not.
- **Don't** lift, translate, or add a shadow to a card on hover.
- **Don't** introduce `slate-*` utilities, rainbow category palettes, or new hardcoded hex values; they are migration targets.
- **Don't** use red for anything that is not an action, an active place, or a danger.
- **Don't** blur real data to indicate a lock; render a placeholder.
- **Don't** make type larger or looser for decoration; density is intentional.
- **Don't** add features that read as clinical suggestions, such as auto-suggested diagnoses or recommended treatments.
