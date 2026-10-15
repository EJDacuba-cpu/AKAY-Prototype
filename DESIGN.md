---
name: AKAY
description: A flat, bordered, dense clinical ledger for BHC and RHU staff, where red marks action and urgency and nothing else.
colors:
  ledger-paper: "#f9fafb"
  ledger-sheet: "#ffffff"
  ledger-sheet-sunk: "#f3f4f6"
  rule-hairline: "#e5e7eb"
  rule-strong: "#d1d5db"
  ink: "#111827"
  ink-secondary: "#4b5563"
  ink-muted: "#6b7280"
  ink-disabled: "#9ca3af"
  register-red: "#dc2626"
  register-red-deep: "#b91c1c"
  register-red-pressed: "#991b1b"
  register-red-tint: "#fef2f2"
  register-red-wash: "#fee2e2"
  alert-red: "#ef4444"
  stamp-green: "#059669"
  stamp-green-ink: "#047857"
  stamp-green-tint: "#ecfdf5"
  stamp-amber: "#f59e0b"
  stamp-amber-ink: "#b45309"
  stamp-amber-tint: "#fffbeb"
  stamp-cyan: "#0891b2"
  stamp-cyan-ink: "#0e7490"
  stamp-cyan-tint: "#ecfeff"
typography:
  headline:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  nav:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.3
  label:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.05em"
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  none: "0px"
  badge: "2px"
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
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.register-red-deep}"
  button-ghost:
    backgroundColor: "{colors.ledger-sheet}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.none}"
    height: "36px"
  input:
    backgroundColor: "{colors.ledger-sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
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
    rounded: "{rounded.none}"
    padding: "16px"
  table-row:
    height: "56px"
  table-head:
    backgroundColor: "{colors.ledger-sheet-sunk}"
    height: "44px"
---

# Design System: AKAY

## Overview

**Creative North Star: "The Clinic Ledger"**

AKAY looks like a well-kept logbook at a health center: white sheets ruled with hairlines on a pale gray desk. Nothing floats, nothing is rounded for charm, and nothing is decorated. Structure comes from 1px borders and consistent row heights, so a midwife scanning forty rows at the end of a clinic day lands on the same column in the same place every time. Red is the single mark of attention. It appears on the one primary action, on the active place in navigation, and, in its alert form, when something is wrong or irreversible.

The register is dense but not cramped. Body text is 14px, headings are bold sans, and IDs and codes sit in monospace. Screens are built for repeated daily work on a desktop or laptop in a facility, sometimes over a weak connection, so loading and error states are first-class parts of the system rather than afterthoughts. The interface should feel competent and calm to someone on a long shift, and never promotional.

The system does not suggest, diagnose, or decorate. Clinical fields look like fields a trained person fills in. Saved records look permanent. Locked modules are visible and honest about being locked.

**Key Characteristics:**
- Flat sheets separated by 1px hairlines; a visible shadow only on floating layers.
- Square corners everywhere. A 2px radius on small tags is the only softening, and the pill shape is reserved for dots, avatars, and status chips.
- One red. Primary actions and active states use it, and urgency uses its alert form. Ordinary state uses green, amber, and cyan.
- Fixed-size tables: the same row height whether the page has three rows or ten.
- Cool-gray neutrals tinted toward blue, never warm.

## Colors

A cool-gray ledger with a single red stamp. Neutrals do almost all the work; color is spent only where a decision or a danger lives.

### Primary
- **Register Red** (#dc2626): The action color. Fills for primary buttons (Save, Submit, Refer), the focus ring at 30% opacity, and the brand mark.
- **Register Red Deep** (#b91c1c): The text-weight red. Hover and pressed fill for primary buttons, active nav and tab text, links, and on-tint text. It is the most-used red in screens today.
- **Register Red Pressed** (#991b1b): Pressed state of primary fills.
- **Register Red Tint** (#fef2f2) and **Wash** (#fee2e2): Active nav background, soft selected states, and tinted notices. Never a decorative wash.

### Secondary
- **Alert Red** (#ef4444): Emergency and triage flags, "No Show", destructive confirms, validation errors, overdue and critical alerts. If it appears on nearly every screen it is the wrong red; Alert Red must stay rare to stay loud.

### Tertiary (status)
- **Stamp Green** (#059669, ink #047857, tint #ecfdf5): Completed, healthy, confirmed.
- **Stamp Amber** (#f59e0b, ink #b45309, tint #fffbeb): Caution, pending review, low stock, follow-up required.
- **Stamp Cyan** (#0891b2, ink #0e7490, tint #ecfeff): Neutral information. Pending and Received statuses also use a blue family in the status badge today.

### Neutral
- **Ledger Paper** (#f9fafb): The page background, the desk the sheets sit on.
- **Ledger Sheet** (#ffffff): Cards, tables, modals, the sidebar. Every readable surface.
- **Ledger Sheet Sunk** (#f3f4f6): Table headers, hover rows, inset panels.
- **Rule Hairline** (#e5e7eb): Every border and divider. **Rule Strong** (#d1d5db) for emphasis, hover borders, and scrollbar thumbs.
- **Ink** (#111827): Primary text. **Ink Secondary** (#4b5563): supporting text. **Ink Muted** (#6b7280): captions and metadata. **Ink Disabled** (#9ca3af): disabled text and icons.

### Named Rules
**The One Stamp Rule.** Red marks the one thing to do or the one thing that is wrong. Brand red is for action and place; Alert Red is for danger. If a screen has red everywhere, none of it is read.

**The Status-Is-Not-Danger Rule.** Ordinary state (completed, pending, low stock) uses green, amber, or cyan. Alert Red is never spent on state that is merely noteworthy.

**The Tokens-First Rule.** Screens reference role tokens (`--color-text`, `--color-surface`, `--color-primary`) or the neutral and brand ramps. Raw `slate-*` utilities and hardcoded hex such as `#0F172A`, `#F8FAFC`, or `#B91C1C` are drift from before the token rework and are migration targets, not part of the system.

## Typography

**Display Font:** Public Sans Variable (with system-ui, sans-serif). Geiza is first in the stack but its files are not shipped.
**Body Font:** Public Sans Variable (same family).
**Label/Mono Font:** IBM Plex Mono (400 and 500) for IDs, codes, and data values.

**Character:** One humanist grotesque, bold for headings and regular for reading, with mono reserved for identifiers. Fonts are self-hosted so the interface renders the same on a weak connection.

### Hierarchy
- **Headline** (700, 24px, 1.25): Page titles.
- **Title** (700, 17px, 1.3): Section and card headings. Smaller cards use 14px bold.
- **Body** (400, 14px, 1.5): Default reading and form text. Cap prose at roughly 65 to 75 characters.
- **Nav** (500 inactive, 600 active, 13px): Sidebar items. Child links are 12px.
- **Label** (700, 10px, 0.05em tracking, uppercase): Form labels, section labels, badges, and column headers. Never for sentences.
- **Data** (IBM Plex Mono, 400, 13px): Patient IDs, referral codes, quantities.

### Named Rules
**The Dense-But-Legible Rule.** Body is 14px, not 16px, because rows and records are the product. Do not go below 10px, and only labels may be that small.

**The Mono-For-Identity Rule.** If a value is something a person might read aloud or copy (an ID, a code), it is monospace.

## Layout

A fixed application shell: a left sidebar rail (72px collapsed, 240px expanded), a 62px top bar carrying breadcrumbs, the working-facility selector, and notifications, and a scrolling content area on Ledger Paper. Content padding steps with the viewport: 12px, 16px at the small breakpoint, 20px at large. Below the desktop breakpoint the sidebar becomes a drawer and the top bar drops to 56px.

Screens are made of bordered sheets on the paper background. Patient lists use a fixed two-column card grid with a permanent preview panel on the right; patient profiles use a left identity panel with chart sections and a timeline beside it. Lists are fixed-size tables: 44px header and 56px rows, 10 rows per page, so a card never changes height with the data. Spacing follows a 4px base, with gaps of 8, 16, and 24px between and inside sheets.

Responsive support exists, but the primary context is a desktop or laptop in a facility. Tablet and phone must stay usable without a separate design.

### Named Rules
**The Fixed-Frame Rule.** A table or list card holds its size regardless of row count. Empty and error states fill the same frame instead of collapsing it.

## Elevation & Depth

Flat by default. Depth is carried by 1px hairline borders and by the contrast of white sheets on pale gray paper. Shadow utilities `2xs` through `md` resolve to nothing. Top-level sheets (`.akay-card`: panels, record headers, accordion sections, stat tiles) carry a barely-there card shadow that reads as a hairline, not a lift. Only floating layers (menus, popovers, modals, toasts) get a visible shadow.

### Shadow Vocabulary
- **Card hairline** (`box-shadow: 0 1px 2px rgba(17, 24, 39, 0.04), 0 1px 3px rgba(17, 24, 39, 0.03)`): Top-level sheets only, never nested cards.
- **Floating layer** (`box-shadow: 0 4px 12px rgba(17, 24, 39, 0.08)`): Dropdowns, popovers, modals, toasts.
- **Focus ring** (`box-shadow: 0 0 0 3px` of Register Red at 30%): Keyboard and input focus.

### Named Rules
**The Flat-At-Rest Rule.** Sheets do not lift on hover. Hover changes a border to Rule Strong or a fill to Ledger Sheet Sunk; it never moves the element or adds a shadow. The existing `.card-hover` lift and the `SectionCard` hover translate and shadow are drift from this rule.

## Shapes

Square by default. Tailwind's radius scale is overridden so `rounded-md`, `rounded-lg`, `rounded-xl`, and larger all resolve to 0, and `rounded-sm` is 2px. Inputs, buttons, cards, rows, and modals are square. Small tags may take the 2px badge radius. The pill (999px) is reserved for status dots, avatars, spinners, and status chips. Borders are always 1px; the only thick stroke is the 4px left bar marking the active sidebar item.

## Components

### Buttons
- **Shape:** Square corners (0px), 44px tall by default, 36px small, 40px square for icon buttons.
- **Primary:** Register Red fill, white 13 to 14px medium text, 8px by 16px padding. Hover moves to Register Red Deep.
- **Ghost:** Transparent with Ink Secondary text; hover fills Ledger Sheet Sunk.
- **Link:** Register Red text with an underline on hover.
- **Focus / Disabled:** A 2px ring in Register Red at 30% with a 2px offset; disabled drops to 50% opacity and ignores pointer events.

### Chips and Status Badges
- **Style:** Pill with a 1px border, a 6px leading dot, and 10px bold uppercase label. Each status pairs a tint background, an ink text color, and a border from the same family.
- **State:** Active and Completed use green; Pending, Received, and Referred use blue; Follow-up Required, Under Observation, and Low Stock use amber; Needs Referral uses orange; Cancelled, Inactive, and Unavailable use red; Not recorded uses gray.

### Cards / Containers
- **Corner Style:** Square (0px).
- **Background:** Ledger Sheet on Ledger Paper.
- **Shadow Strategy:** Card hairline on top-level sheets, none on nested cards. See Elevation & Depth.
- **Border:** 1px Rule Hairline; Rule Strong on hover for interactive cards.
- **Internal Padding:** 16px, 20px for large panels.

### Inputs / Fields
- **Style:** 1px Rule Hairline border, square, 8px by 12px padding, 14px text, with a 10px bold uppercase label above.
- **Focus:** Border shifts toward Register Red and a 3px Register Red ring at 30% appears.
- **Error / Disabled:** Error uses an Alert Red border with a 12px message beneath; disabled uses Ledger Sheet Sunk with muted text.

### Navigation
- **Style:** A left rail of 36px items with 13px text and a 4px left bar. The active item has a Register Red bar, Register Red Tint fill, and Register Red Deep semibold text; inactive items are Ink Secondary and gain a faint gray fill on hover. Section labels are 10px uppercase.
- **Locked items:** Stay in place with muted text, a lock icon, and a not-allowed cursor, so navigation looks the same for everyone. They open a "No access" state and never reveal blurred data.
- **Mobile:** The rail becomes a drawer; the top bar shrinks to 56px.

### Tabs
- **Style:** A bottom-ruled strip of 12px semibold items with a 2px underline. Active is Register Red Deep with a red underline; inactive is gray and gains a gray underline on hover. Panels carry 20 to 24px padding.

### Data Tables
- **Style:** Fixed-size (44px header, 56px rows), header on Ledger Sheet Sunk, single-line cells with ellipsis truncation, and a tooltip on truncated text. Row hover fills Ledger Sheet Sunk.

### Modals
- **Style:** Square panel on Ledger Sheet with a floating shadow and a dimmed backdrop. A title, optional subtitle, and close control sit in the header; actions sit in the footer, with the primary action first in focus order. Sizes run from `sm` (24rem) to `wide` (72rem). Focus is trapped and restored on close; Escape closes unless the action is mid-save.

### Loading, Error and Empty States
Skeleton blocks stand in for data and keep the layout stable, with a thin top loading bar for route changes. Connection loss shows a persistent banner and a retry only where retry is real. Empty states fill the same frame as a populated list.

## Do's and Don'ts

### Do:
- **Do** build surfaces from Ledger Sheet on Ledger Paper with 1px Rule Hairline borders, adding only the card hairline shadow on top-level sheets.
- **Do** use Register Red (#dc2626) for fills and Register Red Deep (#b91c1c) for red text, active states, and hover.
- **Do** reserve Alert Red (#ef4444) for danger, urgency, errors, and destructive confirms.
- **Do** use the green, amber, and cyan families for ordinary status.
- **Do** keep table rows at 56px and headers at 44px, and truncate long text with an ellipsis and a title.
- **Do** put IDs and codes in IBM Plex Mono.
- **Do** reference `--color-*` role tokens or the neutral and brand ramps instead of raw hex.
- **Do** respect `prefers-reduced-motion`, and keep motion to short fades and state transitions.
- **Do** show locked modules as visible, labeled placeholders.

### Don't:
- **Don't** round corners, other than the 2px badge radius and the pill on dots, avatars, and status chips.
- **Don't** lift, translate, or add a shadow to a card on hover.
- **Don't** introduce `slate-*` utilities or new hardcoded hex values; they are migration targets.
- **Don't** use red for anything that is not an action, an active place, or a danger.
- **Don't** blur real data to indicate a lock; render a placeholder.
- **Don't** make type larger or looser for decoration; density is intentional.
- **Don't** add features that read as clinical suggestions, such as auto-suggested diagnoses or recommended treatments.
