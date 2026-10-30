# EHR Minimalism UI Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the navbar, topbar, patient module, patient profile and new-consultation screens to the medical-ehr-minimalism skill, with a fixed 2-column patient grid + permanent preview panel and a reference-style left identity panel on the profile.

**Architecture:** Change the design tokens once in `frontend/src/index.css` (Tailwind v4 `@theme`), then convert the five areas' hard-coded `slate-*` / `#B91C1C` / `rounded-*` / `shadow-*` classes with a small committed-then-removed codemod, and hand-write only the two real layout changes (patient directory + preview panel; profile left panel). Pure selection logic is extracted to a util and tested with `node --test`; layout is verified by build output, greps and a visual pass.

**Tech Stack:** React 19, Vite 8, Tailwind CSS 4 (CSS-first `@theme`, no `tailwind.config.js`), react-router 7, lucide-react, `node --test` for utils tests.

**Spec:** `docs/superpowers/specs/2026-09-27-ehr-minimalism-ui-rework-design.md` (Task 1 amends it where the code reading showed the spec was off; see "Spec amendments").

## Global Constraints

- Palette (from the skill): neutrals `#F9FAFB #F3F4F6 #E5E7EB #D1D5DB #9CA3AF #6B7280 #4B5563 #374151 #1F2937 #111827`; primary red `#DC2626`, hover `#B91C1C`, pressed/dark `#991B1B`, light `#FEE2E2`; success `#059669`, info `#0891B2`, warning `#F59E0B`, critical `#EF4444`.
- Radius `0` everywhere; `2px` (`rounded-sm`) for badges/status tags only. No shadows, except a single subtle shadow kept for floating layers (dropdowns, popovers, modals).
- Font stack starts with `"Geiza"` and falls back to `"Public Sans Variable"`; Geiza files are NOT shipped. Headings are bold sans (serif headings removed).
- Only the five areas are restyled. Other screens change only through the global token/`@theme` change.
- No behavior, data, route, permission or API change. Health records stay immutable after save; no new edit feature.
- Red (`red-600`) is for primary actions, active states and critical alerts only.
- Patient preview: permanent panel from `1280px` up, empty placeholder "Select a patient to preview" until a card is clicked, existing `Drawer` below `1280px`. Cards: 2 columns when the results area is at least `560px` wide, else 1.
- `git status` contains unrelated modified files under `.claude/data/`. **Never** `git add -A` / `git add .`; add only the paths a task names.
- Commit message trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- All commands run from `D:\Projects\AKAY-Prototype\frontend` unless stated (Git Bash syntax).

## Review Focus

Failure modes the spec implies that no requirement spells out, most likely first:

1. **Selected patient disappears from the list** (search/filter narrows it out, or the list refetches) while its preview is open → selection clears and the panel returns to the placeholder, never shows a stale patient. Pinned by tests in Task 3; wired in Task 4.
2. **Same card clicked twice / another card clicked** → second click on the same card clears the preview; clicking another switches it. A patient with no `id`/`patientId` must not select the string `"undefined"`. Pinned by tests in Task 3.
3. **Viewport crosses 1280px with a patient selected** → the selection survives; the UI swaps drawer ↔ inline panel without resetting or double-fetching. Manual check in Task 4.
4. **User without the `clinical.history` permission** → the profile's left panel still shows identity and the consultation controls, but no alerts, programs, care status or vitals (same gating as today). Manual check in Task 5.
5. **Extreme data** — very long patient name/address/allergy text, "NKDA" allergies, no allergies, no vitals, no consultation, no follow-ups, empty patient list — wraps or falls back to "Not recorded" without breaking the 288px profile panel, the 380px preview panel or the 2-column grid. Manual check in Tasks 4 and 5.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `frontend/src/index.css` | Tokens, base type, `.akay-card` | Modify |
| `docs/design-tokens.md`, `frontend/src/pages/DesignTokens.jsx` | Describe/preview the new direction | Modify |
| `docs/superpowers/specs/2026-09-27-ehr-minimalism-ui-rework-design.md` | Amend where code reading changed a detail | Modify |
| `frontend/scripts/ehr-restyle.mjs` | One-off class codemod (removed in Task 7) | Create → delete |
| `frontend/src/components/layout/DashboardLayout.jsx`, `WorkingFacility.jsx` | Topbar/shell legacy classes | Modify |
| `frontend/src/utils/directorySelection.js` (+ `.test.js`) | Pure selection rules for the patient directory | Create |
| `frontend/src/hooks/useMediaQuery.js` | `matchMedia` subscription hook | Create |
| `frontend/src/pages/bhc/PatientsModule.jsx` | Directory layout + inline preview | Modify |
| `frontend/src/components/features/patients/clinical-directory.css` | Grid, layout, preview panel styles | Modify |
| `frontend/src/components/features/patients/PatientSummaryPanel.jsx` | Short summary in the reference's profile-panel structure (`showTitle` prop) | Partial rewrite |
| `frontend/src/components/features/patients/PatientAlertChips.jsx` | Shared allergy/condition chips (`Chip`, `PatientAlertChips`) | Create |
| `frontend/src/components/features/patients/PatientDirectoryCard.jsx`, `SummarySection.jsx` | Restyle | Modify |
| `frontend/src/components/features/patients/profile/PatientProfileHeader.jsx` | Becomes the left identity panel | Rewrite |
| `frontend/src/pages/bhc/PatientDetails.jsx` | Profile grid (panel + sections) | Modify |
| `frontend/src/components/features/patients/profile/*.jsx`, `PatientBackgroundTab.jsx` | Restyle | Modify |
| `frontend/src/pages/bhc/ConsultationWorkspace.jsx`, `wizard/*.jsx`, `consultation-ehr.css` | Cleanup only | Modify |

---

### Task 1: Tokens, docs and spec amendments

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `docs/design-tokens.md`, `frontend/src/pages/DesignTokens.jsx`
- Modify: `docs/superpowers/specs/2026-09-27-ehr-minimalism-ui-rework-design.md`

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind theme where `bg-brand-600` = `#DC2626`, `bg-neutral-*` = cool grays, `rounded-md/lg/xl/2xl/3xl/4xl` = `0`, `rounded-sm` = `2px`, flat `shadow-xs/sm/md`, `font-sans` = Geiza-first; `:root` roles `--color-primary` → `brand-600`.

- [ ] **Step 1: Record the baseline**

```bash
npm run lint 2>&1 | tail -15
npm run build 2>&1 | tail -8
node --test src/utils/*.test.js src/services/*.test.js config/environment.test.js 2>&1 | tail -12
```
Expected: note the exit status/counts. Pre-existing failures are not this plan's to fix; later tasks must not add new ones.

- [ ] **Step 2: Amend the spec (details the code reading corrected)**

In `docs/superpowers/specs/2026-09-27-ehr-minimalism-ui-rework-design.md`:

1. In 4.1, replace the `- **Type**: …` bullet with:
```markdown
- **Type**: `--font-sans` → Geiza first; `h1–h4` use sans; `body` text 14px. The `--text-*` scale is unchanged (only inherited, un-classed text gets denser).
```
2. In 4.1, replace the `- **Shadow**: …` bullet with:
```markdown
- **Shadow**: `--shadow-2xs/xs/sm/md/card` → flat (`0 0 #0000`); `--shadow-lg/xl/2xl` keep one subtle value (`0 4px 12px rgba(17,24,39,0.08)`) for floating layers.
```
3. In 4.2, replace `- Active nav item: red left indicator / \`text-red-600\` on \`bg-gray-50\`.` with:
```markdown
- Active nav item is already skill-compliant (`border-l-red-600`, `bg-red-50`, `text-red-700` in `sidebarStyles.js`); unchanged. The sidebar files need no edits.
```
4. In 4.3, replace the two bullets beginning `- Layout at \`lg+\`` and `- Card grid: \`grid-cols-2\`` with:
```markdown
- Layout at `xl+` (1280px): results (left) and a 380px sticky preview panel (right, own scroll). Below `xl` there is not enough width for both, so the preview keeps the existing `Drawer`.
- Card grid: 1 column, switching to 2 columns when the *results area* (a named CSS container) is at least 560px wide — so it is 2 columns beside the panel at `xl+` and on tablets, 1 on phones. Cards: 1px gray border, no shadow, no hover lift, square; selected card gets a red left border. Content per card unchanged.
```
5. In 4.4, replace `- Below \`lg\`: the panel stacks above the sections.` with:
```markdown
- Below `lg`: the panel stacks above the sections. The right area is one column until `xl`, where it becomes the existing 5fr/7fr two-column split.
```

- [ ] **Step 3: Replace the color ramps in `index.css`**

In `frontend/src/index.css`, inside `@theme`, replace the five color blocks (the blocks under the comments `/* Neutral — warm greige (replaces slate) */`, `/* Brand — clay / brick … */`, `/* Alert — vivid red … */`, and the `/* Status — muted, calm */` lines) with:

```css
  /* Neutral — cool gray (medical-ehr-minimalism) */
  --color-neutral-50: #f9fafb;
  --color-neutral-100: #f3f4f6;
  --color-neutral-200: #e5e7eb;
  --color-neutral-300: #d1d5db;
  --color-neutral-400: #9ca3af;
  --color-neutral-500: #6b7280;
  --color-neutral-600: #4b5563;
  --color-neutral-700: #374151;
  --color-neutral-800: #1f2937;
  --color-neutral-900: #111827;

  /* Brand — red (primary actions, active states) */
  --color-brand-50: #fef2f2;
  --color-brand-100: #fee2e2;
  --color-brand-200: #fecaca;
  --color-brand-300: #fca5a5;
  --color-brand-400: #f87171;
  --color-brand-500: #ef4444;
  --color-brand-600: #dc2626;
  --color-brand-700: #b91c1c;
  --color-brand-800: #991b1b;
  --color-brand-900: #7f1d1d;

  /* Alert — critical only */
  --color-alert-50: #fef2f2;
  --color-alert-100: #fee2e2;
  --color-alert-200: #fecaca;
  --color-alert-300: #fca5a5;
  --color-alert-400: #f87171;
  --color-alert-500: #ef4444;
  --color-alert-600: #dc2626;
  --color-alert-700: #b91c1c;

  /* Status */
  --color-success-50: #ecfdf5;
  --color-success-500: #059669;
  --color-success-700: #047857;
  --color-warning-50: #fffbeb;
  --color-warning-500: #f59e0b;
  --color-warning-700: #b45309;
  --color-info-50: #ecfeff;
  --color-info-500: #0891b2;
  --color-info-700: #0e7490;
```

- [ ] **Step 4: Replace fonts, radius and shadow in `index.css`**

In the same `@theme`:

1. Replace `--font-sans: "Public Sans Variable", system-ui, sans-serif;` with:
```css
  --font-sans: "Geiza", "Public Sans Variable", system-ui, sans-serif;
```
2. Replace the whole `/* ── Radius … */` block (`--radius-row` … `--radius-pill`) with:
```css
  /* ── Radius: sharp. Only badges get 2px. ─────────────────────────────── */
  --radius-row: 0;
  --radius-input: 0;
  --radius-card: 0;
  --radius-card-sm: 0;
  --radius-modal: 0;
  --radius-pill: 999px; /* dots, avatars, spinners only */
  --radius-badge: 2px;
  /* Tailwind's own scale, so hard-coded rounded-* classes go square too. */
  --radius-xs: 0;
  --radius-sm: 2px;
  --radius-md: 0;
  --radius-lg: 0;
  --radius-xl: 0;
  --radius-2xl: 0;
  --radius-3xl: 0;
  --radius-4xl: 0;
```
3. Replace the whole `/* ── Shadow … */` block with:
```css
  /* ── Shadow: flat. Only floating layers keep one subtle shadow. ──────── */
  --shadow-2xs: 0 0 #0000;
  --shadow-xs: 0 0 #0000;
  --shadow-sm: 0 0 #0000;
  --shadow-md: 0 0 #0000;
  --shadow-lg: 0 4px 12px rgba(17, 24, 39, 0.08);
  --shadow-xl: 0 4px 12px rgba(17, 24, 39, 0.08);
  --shadow-2xl: 0 4px 12px rgba(17, 24, 39, 0.08);
  --shadow-card: 0 0 #0000;
```

- [ ] **Step 5: Re-point roles, body and headings**

In `:root`, replace the four role lines that referenced `brand-500`/`brand-600`:
```css
  --color-primary: var(--color-brand-600);
  --color-primary-hover: var(--color-brand-700);
  --color-primary-soft: var(--color-brand-50);
```
and
```css
  --color-ring: color-mix(in srgb, var(--color-brand-600) 30%, transparent);
```
(leave `--color-danger*` as is). In `body`, change `font-size: 15px;` to `font-size: 14px;`. Replace the heading rule and its comment:

```css
/* Serif headings by default; utility classes (font-sans, font-bold, …) still
   win by specificity, so components keep full control where they opt in. */
h1,
h2,
h3,
h4 {
  font-family: var(--font-serif);
  font-weight: 600;
}
```
with:
```css
/* Bold sans headings (medical-ehr-minimalism). Utility classes still win. */
h1,
h2,
h3,
h4 {
  font-family: var(--font-sans);
  font-weight: 700;
}
```
Replace the two `.akay-card-hover` rules (the `transition:` block and the `:hover` block with `transform`/`box-shadow`) with flat versions:
```css
.akay-card-hover {
  transition: border-color 0.18s ease;
}

.akay-card-hover:hover {
  border-color: var(--color-border-strong);
}
```
Also change the `.akay-scrollbar::-webkit-scrollbar-thumb` `border-radius: 999px;` to `border-radius: 0;`.

- [ ] **Step 6: Verify the build emits the new radius and shadow values**

```bash
npm run build 2>&1 | tail -5
grep -ohE "\.rounded-(md|lg|xl|2xl|sm)\{[^}]*\}" dist/assets/*.css | sort -u
grep -ohE "\.rounded\{[^}]*\}" dist/assets/*.css | sort -u
grep -ohE "\.bg-brand-600\{[^}]*\}" dist/assets/*.css | sort -u
```
Expected: build succeeds; `rounded-md/lg/xl/2xl` resolve to `var(--radius-…)` whose value is `0` (check with `grep -oE "\-\-radius-(md|lg|xl|2xl|sm):[^;]*" dist/assets/*.css | sort -u` → `0`/`0px` and `2px` for `sm`); `bg-brand-600` uses `#dc2626` (or `--color-brand-600`). If bare `.rounded{…}` still shows `.25rem`, that is expected: the codemod in later tasks converts bare `rounded` in the five areas; other screens keep it.

- [ ] **Step 7: Update `docs/design-tokens.md`**

Replace lines 10–14 (the "Design direction" quote and the sentence under it) with:
```markdown
> **"Clinical minimalism"** — flat, dense, structured, professional
> (the *medical-ehr-minimalism* skill).

Cool-gray neutrals, one red (`#DC2626`) for primary actions / active states /
urgency, sharp corners (2px on badges only), no shadows except floating layers,
and bold sans headings. Geiza is the first font in the stack; Public Sans is the
shipped fallback.
```
Change the heading `### Neutral — warm greige (replaces slate)` to `### Neutral — cool gray`, and `### Brand — clay / brick` to `### Brand — red`. In the table row on line 91 change `Use **Brand** (\`brand-500\`, clay) for…` to `Use **Brand** (\`brand-600\`) for…`. Change the `--font-sans` row to `"Geiza", "Public Sans Variable", system-ui, sans-serif`, and the `--font-serif` row's last cell to `Not used for headings (kept for legacy use)`. Change line 226 to `- Use bold sans for headings, mono for IDs/codes.` Then run:
```bash
grep -nE "greige|clay|sanctuary|serif" ../docs/design-tokens.md
```
and rewrite any remaining hit that still describes the old direction (hex values in the ramp tables must match Step 3).

- [ ] **Step 8: Update `frontend/src/pages/DesignTokens.jsx`**

Change the note on line 17 to `note: "Cool gray — surfaces, text, borders.",` and update the Brand and Alert notes in `RAMPS` to `"Red — primary actions, active states."` and `"Critical alerts only."`. Read lines ~300–315 and ~438–448, and replace the "Calm medical sanctuary … serif headings" paragraph with: `Clinical minimalism — flat, dense, structured. Cool-gray neutrals, one red for actions and urgency, sharp corners, no shadows except floating layers, bold sans headings.` and the "pairs cleanly with the serif" sentence with a neutral description of the font. Then:
```bash
grep -nE "greige|clay|sanctuary|serif" src/pages/DesignTokens.jsx
```
Remaining `fontFamily: "var(--font-serif)"` inline samples may stay (they demonstrate the retained token); reword only prose.

- [ ] **Step 9: Verify and commit**

```bash
npm run build 2>&1 | tail -3
npm run lint 2>&1 | tail -5
cd .. && git add frontend/src/index.css frontend/src/pages/DesignTokens.jsx docs/design-tokens.md docs/superpowers/specs/2026-09-27-ehr-minimalism-ui-rework-design.md
git commit -m "$(cat <<'EOF'
feat(ui): switch design tokens to medical-ehr-minimalism

Cool-gray neutrals, red primary, square corners, flat shadows, Geiza-first
sans stack and bold sans headings. Docs and the spec are updated to match.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
Expected: build passes; lint no worse than the Step 1 baseline.

---

### Task 2: Class codemod, navbar and topbar

**Files:**
- Create: `frontend/scripts/ehr-restyle.mjs`
- Modify: `frontend/src/components/layout/DashboardLayout.jsx`, `frontend/src/components/layout/WorkingFacility.jsx`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: `node scripts/ehr-restyle.mjs <file...>` — idempotent; rewrites legacy classes in the named files and prints per-file counts. Later tasks call it with their own file lists.

- [ ] **Step 1: Create the codemod**

```js
// frontend/scripts/ehr-restyle.mjs
// One-off: rewrite legacy slate / hex / rounded / shadow classes to the
// medical-ehr-minimalism equivalents. Idempotent. Removed in the last task.
import fs from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/ehr-restyle.mjs <file...>");
  process.exit(1);
}

const HEX_TO_TOKEN = {
  b91c1c: "red-600",
  "991b1b": "red-700",
  "7f1d1d": "red-800",
  fef2f2: "red-50",
  fecaca: "red-200",
  "0f172a": "gray-900",
  f8fafc: "gray-50",
  "94a3b8": "gray-400",
  "475569": "gray-600",
  "64748b": "gray-500",
  e2e8f0: "gray-200",
  cbd5e1: "gray-300",
};

// Each rule: [pattern, replacer, label]. Applied to the whole file text.
const RULES = [
  [
    /-\[#([0-9a-fA-F]{6})\]/g,
    (match, hex) => {
      const token = HEX_TO_TOKEN[hex.toLowerCase()];
      return token ? `-${token}` : match;
    },
    "hex",
  ],
  [/\bslate-(\d{2,3})\b/g, "gray-$1", "slate"],
  [/\brounded-(t|b|l|r|tl|tr|bl|br)-(?:md|lg|xl|2xl|3xl)\b/g, "rounded-$1-none", "rounded-side"],
  [/\brounded-(?:md|lg|xl|2xl|3xl)\b/g, "rounded-none", "rounded"],
  [/(?<=[\s"'`])rounded(?=[\s"'`])/g, "rounded-none", "rounded-bare"],
  [/\bhover:-translate-y-0\.5\b/g, "", "lift"],
  [/\bbackdrop-blur(?:-[a-z0-9]+)?\b/g, "", "blur"],
  // Shadows: drop the flat-by-token ones (with any variant prefix). shadow-lg/xl
  // stay: they mark floating layers.
  [/(?:[\w-]+:)*shadow-(?:xs|sm|md)(?:\/\d+)?\b/g, "", "shadow"],
  [/\bshadow-black\/\[[^\]]+\]/g, "", "shadow-tint"],
];

for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const counts = {};
  const lines = before.split("\n").map((line) => {
    let next = line;
    for (const [pattern, replacer, label] of RULES) {
      const replaced = next.replace(pattern, replacer);
      if (replaced !== next) counts[label] = (counts[label] || 0) + 1;
      next = replaced;
    }
    // Only touch spacing on lines we changed, and never indentation.
    if (next !== line) next = next.replace(/(?<=\S) {2,}(?=\S)/g, " ");
    return next;
  });
  const after = lines.join("\n");
  if (after !== before) fs.writeFileSync(file, after);
  console.log(`${file}: ${JSON.stringify(counts)}`);
}
```

- [ ] **Step 2: Prove it is idempotent and safe on a scratch copy**

```bash
cp src/components/layout/WorkingFacility.jsx /tmp/wf.jsx
node scripts/ehr-restyle.mjs /tmp/wf.jsx
cp /tmp/wf.jsx /tmp/wf-once.jsx
node scripts/ehr-restyle.mjs /tmp/wf.jsx
diff /tmp/wf-once.jsx /tmp/wf.jsx && echo "idempotent"
diff <(cat src/components/layout/WorkingFacility.jsx) /tmp/wf.jsx | head -20
```
Expected: second run prints `{}`; `idempotent`; the diff shows `slate-*`→`gray-*`, `rounded-md/xl`→`rounded-none`, `shadow-sm` removed, and `shadow-xl` untouched.

- [ ] **Step 3: Apply to the layout files**

```bash
node scripts/ehr-restyle.mjs src/components/layout/DashboardLayout.jsx src/components/layout/WorkingFacility.jsx
git diff --stat
```
Then in `DashboardLayout.jsx` change the scrollbar thumb radius inside the `<style>` block: `border-radius: 999px;` → `border-radius: 0;`.

- [ ] **Step 4: Review the diff by eye**

```bash
git diff src/components/layout
```
Expected changes only: `bg-[#F8FAFC] text-[#0F172A]` → `bg-gray-50 text-gray-900`; scrim `bg-slate-950/25 backdrop-blur-sm` → `bg-gray-950/25` (no blur); `WorkingFacility` slate/rounded/shadow classes; the scrollbar radius. Confirm no empty `className` artifacts remain: `grep -nE 'className=" "|className=""' src/components/layout/*.jsx` → no output. The bare-`rounded` rule can also hit the plain word in prose, so check comments too: `git diff src/components/layout | grep -E "^\+\s*(//|\*|/\*)"` → no output; if a comment was rewritten (e.g. "rounded corners" → "rounded-none corners"), restore that comment by hand. Repeat this comment check after every later codemod run (Tasks 4, 5, 6).

- [ ] **Step 5: Verify the sidebar/breadcrumb files are already clean**

```bash
grep -rnE "\bslate-|#(B91C1C|991B1B|7F1D1D|0F172A|F8FAFC)|rounded-(md|lg|xl|2xl|3xl)|shadow-(xs|sm|md)|backdrop-blur" src/components/layout
```
Expected: no output. (Sidebar files needed no edits.)

- [ ] **Step 6: Build and commit**

```bash
npm run build 2>&1 | tail -3
cd .. && git add frontend/scripts/ehr-restyle.mjs frontend/src/components/layout/DashboardLayout.jsx frontend/src/components/layout/WorkingFacility.jsx
git commit -m "$(cat <<'EOF'
style(layout): move shell and facility selector onto EHR minimalism classes

Adds a one-off restyle codemod (removed at the end of this work).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Directory selection rules and media-query hook

**Files:**
- Create: `frontend/src/utils/directorySelection.js`
- Test: `frontend/src/utils/directorySelection.test.js`
- Create: `frontend/src/hooks/useMediaQuery.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `getPatientKey(patient: object): string` — `String(patient.id || patient.patientId)`, or `""` when neither exists.
  - `toggleSelection(current: string | null, patientKey: string): string | null` — same key clears, other key selects, empty key is ignored.
  - `reconcileSelection(selectedKey: string | null, patients: object[]): string | null` — the key if that patient is still listed, else `null`.
  - `useMediaQuery(query: string): boolean` (default export).

- [ ] **Step 1: Write the failing tests**

```js
// frontend/src/utils/directorySelection.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  getPatientKey,
  reconcileSelection,
  toggleSelection,
} from "./directorySelection.js";

test("getPatientKey prefers id, falls back to patientId, never yields 'undefined'", () => {
  assert.equal(getPatientKey({ id: 12, patientId: "P-9" }), "12");
  assert.equal(getPatientKey({ patientId: "P-9" }), "P-9");
  assert.equal(getPatientKey({}), "");
  assert.equal(getPatientKey(null), "");
});

test("toggleSelection selects, switches and clears", () => {
  assert.equal(toggleSelection(null, "12"), "12");
  assert.equal(toggleSelection("12", "13"), "13");
  assert.equal(toggleSelection("12", "12"), null);
});

test("toggleSelection ignores a card without a key", () => {
  assert.equal(toggleSelection(null, ""), null);
  assert.equal(toggleSelection("12", ""), "12");
});

test("reconcileSelection keeps a patient that is still listed", () => {
  const patients = [{ id: 12 }, { patientId: "P-9" }];
  assert.equal(reconcileSelection("12", patients), "12");
  assert.equal(reconcileSelection("P-9", patients), "P-9");
});

test("reconcileSelection clears when the patient was filtered out or the list is empty", () => {
  assert.equal(reconcileSelection("12", [{ id: 13 }]), null);
  assert.equal(reconcileSelection("12", []), null);
});

test("reconcileSelection with no selection stays null", () => {
  assert.equal(reconcileSelection(null, [{ id: 1 }]), null);
  assert.equal(reconcileSelection("", [{ id: 1 }]), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test src/utils/directorySelection.test.js`
Expected: FAIL — `Cannot find module './directorySelection.js'`.

- [ ] **Step 3: Implement**

```js
// frontend/src/utils/directorySelection.js
/** Stable string key for a directory patient: the route id, else the patient number. */
export function getPatientKey(patient) {
  const raw = patient?.id || patient?.patientId;
  return raw ? String(raw) : "";
}

/** Click on a card: same card clears the preview, another card switches it. */
export function toggleSelection(current, patientKey) {
  if (!patientKey) return current;
  return current === patientKey ? null : patientKey;
}

/** Keep the selection only while that patient is still in the visible list. */
export function reconcileSelection(selectedKey, patients) {
  if (!selectedKey) return null;
  return patients.some((patient) => getPatientKey(patient) === selectedKey)
    ? selectedKey
    : null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test src/utils/directorySelection.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the hook**

```js
// frontend/src/hooks/useMediaQuery.js
import { useEffect, useState } from "react";

const canMatch = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

/** True while the CSS media query matches; false where matchMedia is unavailable. */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (canMatch() ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (!canMatch()) return undefined;
    const list = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
```

- [ ] **Step 6: Lint and commit**

```bash
npx eslint src/hooks/useMediaQuery.js src/utils/directorySelection.js src/utils/directorySelection.test.js
cd .. && git add frontend/src/utils/directorySelection.js frontend/src/utils/directorySelection.test.js frontend/src/hooks/useMediaQuery.js
git commit -m "$(cat <<'EOF'
feat(patients): add directory selection rules and useMediaQuery hook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Patient module — 2-column grid and permanent preview panel

**Files:**
- Modify: `frontend/src/pages/bhc/PatientsModule.jsx`
- Modify: `frontend/src/components/features/patients/clinical-directory.css`
- Create: `frontend/src/components/features/patients/PatientAlertChips.jsx`
- Modify (partial rewrite): `frontend/src/components/features/patients/PatientSummaryPanel.jsx`
- Modify (codemod): `frontend/src/components/features/patients/*.jsx` (all files directly in that folder), `PatientsModule.jsx`

**Interfaces:**
- Consumes: `getPatientKey`, `toggleSelection`, `reconcileSelection` (Task 3); `useMediaQuery` (Task 3); `usePatientSummary(patientId)` → `{ patient, records, latest, isPending, error, refetch }` (existing); `SummarySection({ title, rows, variant })` (existing).
- Produces:
  - `PatientAlertChips({ background })` (default export) and `Chip({ tone, children, title })` (named export; tones `alert | neutral | program | muted`) from `PatientAlertChips.jsx` — reused by Task 5.
  - `PatientSummaryPanel({ patientId, basePath = "/bhc", showTitle = false })` — short summary; `showTitle` draws the "Patient Summary" title bar (used by the inline preview; the `Drawer` already draws its own title).
  - CSS classes `.clinical-directory__layout`, `.clinical-directory__layout--preview`, `.clinical-directory__preview`, `.clinical-directory__preview-empty*`.

**Product decision (from brainstorming):** the preview is a **short summary** in the reference's "Profile Staff" structure: title bar + status, centered identity, Alerts, Profile Details, Current Vital Signs, Latest Consultation, sticky View Full Profile. Hospitalizations, surgeries, family, social and maternal/prenatal are removed from the preview (they stay on the full profile). `PatientSummaryDrawer.jsx` in health-records is a different component and is not touched.

- [ ] **Step 1: Run the codemod on the patient module files**

```bash
node scripts/ehr-restyle.mjs src/pages/bhc/PatientsModule.jsx src/components/features/patients/*.jsx
git diff --stat
```
Expected: counts printed per file; only class strings change. Skim `git diff src/components/features/patients/PatientDirectoryCard.jsx` — the default (non-clinical) card loses `rounded-xl`, `shadow-sm`, hover lift and gets red-600/gray classes.

- [ ] **Step 2: Wire the selection helpers into `PatientsModule.jsx`**

Add imports:
```js
import useMediaQuery from "../../hooks/useMediaQuery";
import {
  getPatientKey,
  reconcileSelection,
  toggleSelection,
} from "../../utils/directorySelection";
```
Add above `PATIENTS_BATCH_SIZE`:
```js
// Wide enough for the results grid AND a permanent preview panel.
const PREVIEW_QUERY = "(min-width: 1280px)";
```
Inside the component, next to the other `useState` calls add:
```js
  const showInlinePreview = useMediaQuery(PREVIEW_QUERY);
```
Replace the `selectedStillListed` block (the comment `// Close the summary once its patient is filtered out…` through its `useEffect`) with:
```js
  // Close the preview once its patient is filtered out of the directory.
  const selectedStillListed =
    reconcileSelection(selectedPatientId, filteredPatients) === selectedPatientId;
  useEffect(() => {
    if (!selectedStillListed) setSelectedPatientId(null);
  }, [selectedStillListed]);
```
Replace `toggleSelectedPatient` with:
```js
  function toggleSelectedPatient(patientId) {
    setSelectedPatientId((current) => toggleSelection(current, patientId));
  }
```
In `PatientDirectory`, replace the `selected={ String(patient.id || patient.patientId) === selectedPatientId }` prop with `selected={getPatientKey(patient) === selectedPatientId}`.

- [ ] **Step 3: Replace the results/drawer JSX**

Replace the block from `<div className="clinical-directory__results relative min-w-0">` through the closing `</Drawer>` with:

```jsx
        <div
          className={`clinical-directory__layout${
            showInlinePreview && !showInitialLoading ? " clinical-directory__layout--preview" : ""
          }`}
        >
          <div className="clinical-directory__results relative min-w-0">
            {showRefreshOverlay && (
              <div className="pointer-events-none absolute right-0 top-0 z-10">
                <RefreshingIndicator label="Updating patients..." />
              </div>
            )}
            {!showInitialLoading && (
              <PatientDirectory
                patients={visiblePatients}
                hasAnyFilter={hasAnyFilter}
                hasMorePatients={hasMorePatients}
                loadingMore={loadingMore}
                loadMoreRef={loadMoreRef}
                selectedPatientId={selectedPatientId}
                onSelectPatient={toggleSelectedPatient}
              />
            )}
          </div>

          {showInlinePreview && !showInitialLoading && (
            <aside className="clinical-directory__preview" aria-label="Patient preview">
              {selectedPatientId ? (
                <PatientSummaryPanel key={selectedPatientId} patientId={selectedPatientId} showTitle />
              ) : (
                <div className="clinical-directory__preview-empty">
                  <p className="clinical-directory__preview-empty-title">Select a patient to preview</p>
                  <p className="clinical-directory__preview-empty-hint">
                    Click a patient card to see their summary here.
                  </p>
                </div>
              )}
            </aside>
          )}
        </div>
      </SoftLoadingArea>
      <Drawer
        open={!showInlinePreview && Boolean(selectedPatientId)}
        onClose={closeSummary}
        title="Patient Summary"
        widthClassName="w-full sm:w-[420px]"
      >
        {!showInlinePreview && selectedPatientId && (
          <PatientSummaryPanel key={selectedPatientId} patientId={selectedPatientId} />
        )}
      </Drawer>
```
Note: the shared `Drawer` keeps its children mounted even when closed, so the drawer child is gated on `!showInlinePreview && selectedPatientId` (not just `open`); that is what keeps only one `PatientSummaryPanel` mounted at a time, while the selection (parent state) survives a viewport change. (The first draft of this plan gated on `selectedPatientId` alone; that mounted two panels at >=1280px and was corrected during execution, ruling R6.) The inline panel passes `showTitle`; the drawer does not (it draws its own title bar and close button).

- [ ] **Step 3a: Create the shared alert chips**

```jsx
// frontend/src/components/features/patients/PatientAlertChips.jsx
const NO_ALLERGY_PATTERN = /^(none|n\/a|na|nka|nkda|no known.*|no allergies?|-+)$/i;
const MAX_DISEASE_CHIPS = 3;

const CHIP_BASE =
  "inline-flex max-w-full items-center break-words rounded-sm border px-2 py-0.5 text-left text-xs font-medium";

const TONES = {
  alert: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-gray-200 bg-white text-gray-700",
  program: "border-gray-200 bg-gray-50 text-gray-700",
  muted: "border-transparent px-0 font-normal text-gray-500",
};

export function Chip({ tone = "neutral", children, title }) {
  return (
    <span title={title} className={`${CHIP_BASE} ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/** Allergies (red when recorded) and up to three active conditions, as one chip row. */
export default function PatientAlertChips({ background = {} }) {
  const allergies = String(background?.allergies || "").trim();
  const activeDiseases = (Array.isArray(background?.currentDiseases) ? background.currentDiseases : [])
    .filter((disease) => disease?.name && String(disease.status || "Active").toLowerCase() === "active");
  const shownDiseases = activeDiseases.slice(0, MAX_DISEASE_CHIPS);
  const hiddenCount = activeDiseases.length - shownDiseases.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!allergies ? (
        <Chip tone="muted">Allergies not recorded</Chip>
      ) : NO_ALLERGY_PATTERN.test(allergies) ? (
        <Chip tone="muted">No known allergies</Chip>
      ) : (
        <Chip tone="alert" title={allergies}>Allergy: {allergies}</Chip>
      )}
      {shownDiseases.map((disease) => (
        <Chip key={disease.name} tone="neutral">{disease.name}</Chip>
      ))}
      {hiddenCount > 0 && <Chip tone="muted">+{hiddenCount} more</Chip>}
    </div>
  );
}
```
This is the logic the profile header had inline (same allergy pattern, same three-chip cap); it is now shared by the header (Task 5) and the preview.

- [ ] **Step 3b: Rewrite `PatientSummaryPanel.jsx` as the short summary**

In `PatientSummaryPanel.jsx` (already codemodded in Step 1):

1. In the imports, **delete** `import { BACKGROUND_SECTIONS } from "./PatientBackgroundTab";` and **add** `import PatientAlertChips from "./PatientAlertChips";` after the `SummarySection` import.
2. Keep `joinParts`, `STATUS_BADGE`, `StatusBadge` and `VitalsGrid` exactly as they are.
3. **Replace everything from the doc comment `/** Read-only Patient Summary opened from the BHC patient directory…` to the end of the file** with:

```jsx
/**
 * Read-only Patient Summary for the BHC patient directory. Short by design:
 * identity, alerts, profile details, current vitals and the latest consultation;
 * everything else lives on the full profile. It renders in the permanent preview
 * panel (`showTitle`) or inside the slide-in Drawer, which draws its own title bar.
 */
export default function PatientSummaryPanel({ patientId, basePath = "/bhc", showTitle = false }) {
  const canViewHistory = (getCurrentUser()?.permissions || []).includes("clinical.history");
  const { patient, records, latest, isPending, error, refetch } = usePatientSummary(patientId);

  if (isPending) {
    return (
      <div role="status" className="flex flex-col items-center justify-center gap-2 px-4 py-16">
        <DottedSpinner label="Loading patient summary" />
        <span className="text-[11px] font-medium text-gray-500">Loading patient summary...</span>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div role="alert" className="px-4 py-12 text-center">
        <p className="text-sm text-gray-700">Unable to load patient summary.</p>
        <button type="button" onClick={() => refetch()} className="mt-2 text-sm font-semibold text-red-700 hover:text-red-800">
          Retry
        </button>
      </div>
    );
  }

  const patientName = formatPatientName(patient, "Unnamed Patient");
  const ageSex = joinParts([patient.age !== "" && patient.age != null ? `${patient.age} yrs` : "", patient.sex], " / ");
  const philHealth = joinParts([patient.philHealthStatus, patient.philHealthNumber]);

  return (
    <div className="patient-summary flex min-h-full flex-col">
      {showTitle && (
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-bold text-gray-900 font-sans!">Patient Summary</h2>
          <StatusBadge status={patient.status} />
        </div>
      )}

      <header className="border-b border-gray-200 px-4 py-4 text-center">
        <p className="break-words text-lg font-bold leading-tight text-gray-900">{patientName}</p>
        <p className="mt-1 break-all font-mono text-xs text-gray-600">Patient ID #{patient.patientId || patientId}</p>
        {ageSex && <p className="mt-0.5 text-xs tabular-nums text-gray-600">{ageSex}</p>}
        {!showTitle && (
          <div className="mt-2 flex justify-center">
            <StatusBadge status={patient.status} />
          </div>
        )}
      </header>

      <div className="flex-1 px-4 pb-4">
        {canViewHistory && (
          <section aria-labelledby="summary-alerts-title" className="mt-4 border border-gray-200 bg-white">
            <h3 id="summary-alerts-title" className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-700">
              Alerts
            </h3>
            <div className="px-3 py-2">
              <PatientAlertChips background={patient.medicalBackground} />
            </div>
          </section>
        )}

        <SummarySection variant="clinical" title="Profile Details" rows={[
          ["Age / Sex", formatDisplayValue(ageSex)],
          ["Date of Birth", formatLongDate(patient.birthDate, "Not recorded")],
          ["Civil Status", formatDisplayValue(patient.civilStatus)],
          ["Occupation", formatDisplayValue(patient.occupation)],
          ["Contact", formatDisplayValue(patient.contactNumber)],
          ["Address", formatDisplayValue(formatPatientAddress(patient))],
          ["PhilHealth", formatDisplayValue(philHealth)],
        ]} />

        {canViewHistory ? (
          <>
            <VitalsGrid records={records} />
            <SummarySection variant="clinical" title="Latest Consultation" rows={latest ? [
              ["Date", formatLongDate(getRecordDateValue(latest))],
              ["Program", getServiceTypeLabel(latest)],
              ["Chief Complaint", latest.chiefComplaint],
              ["Initial Diagnosis", latest.diagnosis],
              ["Medicine / Treatment", latest.medication || latest.treatmentNotes],
              ["Outcome", latest.outcome],
            ] : [["Consultation", "No consultation recorded yet"]]} />
          </>
        ) : (
          <p className="mt-4 flex items-center gap-2 border border-gray-200 border-l-4 border-l-red-600 bg-gray-50 p-3 text-xs text-gray-700">
            <Lock size={14} className="shrink-0" aria-hidden="true" />
            Clinical history is restricted for your role.
          </p>
        )}
      </div>

      <footer className="patient-summary__footer">
        <Link
          to={`${basePath}/patients/${patientId}`}
          className="flex h-9 w-full items-center justify-center rounded-none bg-red-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800"
        >
          View Full Profile
        </Link>
      </footer>
    </div>
  );
}
```
4. Confirm nothing else referenced the removed pieces: `grep -n "maternalSummary\|BACKGROUND_SECTIONS\|familyHistory\|personalSocial" src/components/features/patients/PatientSummaryPanel.jsx` → no output. (`usePatientSummary` still returns `maternalSummary`; the panel simply no longer reads it.)

- [ ] **Step 4: Update `clinical-directory.css`**

Make these exact edits.

1. Token block: change `--clinical-red-dark: #7f1d1d;` → `#991b1b;`, `--clinical-red: #b91c1c;` → `#dc2626;`, `--clinical-red-pale: #fef2f2;` (keep), `--clinical-focus: 0 0 0 3px #b91c1c26;` → `0 0 0 3px #dc262626;`.
2. Delete the rule that recolours the topbar title (the comment `/* Only the application title above the BHC patient directory. */` and the following `main:has(> .akay-content-scroll .clinical-directory) > header h2 { color: #b91c1c; }`).
3. `.clinical-directory__title`: change `color: var(--clinical-red);` → `color: var(--clinical-ink);`.
4. `.clinical-patient__id`: change `color: var(--clinical-red);` → `color: var(--clinical-muted);`.
5. `.clinical-patient__open:active { background: #450a0a; }` → `background: #7f1d1d;`.
6. Replace the grid rule and its comment:
```css
/* Two wide cards per row, like the reference. */
.clinical-directory__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
  gap: var(--clinical-gap);
}
```
with:
```css
/* Results area is its own container so the grid reacts to the room left beside
   the preview panel, not to the viewport. */
.clinical-directory__results {
  container: directory-results / inline-size;
}
/* One column on phones, two cards per row once there is room (the reference). */
.clinical-directory__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--clinical-gap);
}
@container directory-results (min-width: 560px) {
  .clinical-directory__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Results + permanent preview panel (xl and up, decided in PatientsModule). */
.clinical-directory__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}
.clinical-directory__layout--preview {
  grid-template-columns: minmax(0, 1fr) 380px;
  align-items: start;
}
/* 62px topbar + 2 x 1.25rem content padding. */
.clinical-directory__preview {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 62px - 2.5rem);
  overflow-y: auto;
  border: 1px solid var(--clinical-border);
  background: var(--clinical-surface);
}
.clinical-directory__preview-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 64px 24px;
  text-align: center;
}
.clinical-directory__preview-empty-title {
  color: var(--clinical-ink);
  font-size: 14px;
  font-weight: 700;
}
.clinical-directory__preview-empty-hint {
  color: var(--clinical-muted);
  font-size: 12px;
}
```
7. Change the comment above `.patient-summary__footer` from `/* Footer of the sliding Patient Summary drawer. */` to `/* Sticky footer of the Patient Summary (drawer and inline preview). */`.

- [ ] **Step 5: Confirm no legacy values remain in this module**

```bash
grep -rniE "\bslate-|#(B91C1C|991B1B|7F1D1D|0F172A|F8FAFC|94A3B8|475569|64748B)|rounded-(md|lg|xl|2xl|3xl)|shadow-(xs|sm|md)|backdrop-blur" src/pages/bhc/PatientsModule.jsx src/components/features/patients/*.jsx src/components/features/patients/clinical-directory.css
grep -nE "rounded-full|className=\" \"" src/pages/bhc/PatientsModule.jsx src/components/features/patients/*.jsx
```
Expected first command: no output. For each `rounded-full` hit in the second: keep it only on round dots/avatars/spinners; on a text pill (has `px-`) change to `rounded-sm`.

- [ ] **Step 6: Run tests, lint and build**

```bash
node --test src/utils/directorySelection.test.js src/utils/patientUtils.test.js
npx eslint src/pages/bhc/PatientsModule.jsx src/components/features/patients
npm run build 2>&1 | tail -3
```
Expected: tests pass; no new lint errors versus baseline; build passes.

- [ ] **Step 7: Visual and behavior check**

Start the app (`/run`, or `npm run dev` here and the backend from `.claude/launch.json`), log in as a BHC user, open `/bhc/patients`, and verify:
1. At ≥1280px: cards in 2 columns, preview panel on the right showing "Select a patient to preview". Click a card → panel fills, card gets a red left rule; click it again → placeholder returns; press Esc → placeholder returns.
2. Type a search that excludes the selected patient → placeholder returns (Review Focus 1).
3. Resize below 1280px with a patient selected → panel disappears, drawer opens for the same patient; resize back → panel shows the same patient, no reset (Review Focus 3).
4. At 800px: still 2 columns (results ≥560px); at 400px: 1 column.
4a. With 12+ patients, scroll the list: the preview panel stays in view (sticky). If it scrolls away, `container-type: inline-size` on `.clinical-directory` is breaking sticky; remove that one line from the `.clinical-directory` rule (its only consumer is the toolbar `@container (max-width: 620px)` block — re-anchor those rules on `.clinical-directory .module-toolbar` with a `@media (max-width: 900px)` query instead) and re-check.
5. Clear all patients (search "zzzz") → empty state in the results, placeholder in the panel, no layout break (Review Focus 5). A patient with a very long name/address wraps inside the card and the 380px panel without horizontal scroll.
6. Panel content (selected patient, user with `clinical.history`): title bar "Patient Summary" with the status badge at the right; centered name, "Patient ID #…" and age / sex; **Alerts** box (allergy chip red when recorded, muted "Allergies not recorded" / "No known allergies", up to 3 active-condition chips, "+N more"); Profile Details rows; Current Vital Signs grid; Latest Consultation rows; "View Full Profile" pinned at the bottom while the panel scrolls, and it opens `/bhc/patients/<id>`. Hospitalizations, surgeries, family, social and maternal/prenatal no longer appear.
7. Below 1280px the drawer shows the same content with **one** title bar (the drawer's), and the status badge sits under the centered identity — no duplicated "Patient Summary" heading.
8. As a user **without** `clinical.history`: no Alerts box, no vitals, no latest consultation; Profile Details and the "Clinical history is restricted for your role." note remain.
9. Edge data: a patient whose allergies read `NKDA` shows "No known allergies"; one with a very long allergy text wraps inside the chip without widening the panel; a patient with no recorded consultation shows "No consultation recorded yet".
If the app cannot be run with data, say which items were not verified.

- [ ] **Step 8: Commit**

```bash
cd .. && git add frontend/src/pages/bhc/PatientsModule.jsx frontend/src/components/features/patients
git commit -m "$(cat <<'EOF'
feat(patients): 2-column directory grid with short permanent preview panel

The preview follows the reference's profile-panel structure (title bar,
centered identity, alerts, profile details, vitals, latest consultation) and
drops the long background sections. Below 1280px it keeps the slide-in drawer.
Directory cards and summary panel move to the EHR minimalism classes, and the
allergy/condition chips are shared with the profile panel.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Patient profile — left identity panel

**Files:**
- Rewrite: `frontend/src/components/features/patients/profile/PatientProfileHeader.jsx`
- Modify: `frontend/src/pages/bhc/PatientDetails.jsx`
- Modify (codemod): `frontend/src/components/features/patients/profile/{ProfileSection,RecordsTimeline,RegistrationSections,FollowUpsAndReferrals}.jsx`, `frontend/src/components/features/patients/PatientBackgroundTab.jsx`, `PatientDetails.jsx`

**Interfaces:**
- Consumes: `PatientProfileHeader` props are unchanged: `{ patient, patientId, backPath, updating, canViewHistory, records, recordsLoading, programLabels, followUps, activeFollowUps, openReferralCount }`; `SECTION_LABEL_CLASS`, `TextAction` from `ProfileSection.jsx`; `FollowUpStateBadge` from `FollowUpsAndReferrals.jsx`; `PatientAlertChips` (default) and `Chip` from `components/features/patients/PatientAlertChips.jsx` (created in Task 4).
- Produces: `PatientProfileHeader` renders a 288px-wide bordered panel (root element `<header>`), placed in an `<aside>` by `PatientDetails`.

- [ ] **Step 1: Codemod the sections that are only being restyled**

```bash
node scripts/ehr-restyle.mjs src/pages/bhc/PatientDetails.jsx src/components/features/patients/profile/ProfileSection.jsx src/components/features/patients/profile/RecordsTimeline.jsx src/components/features/patients/profile/RegistrationSections.jsx src/components/features/patients/profile/FollowUpsAndReferrals.jsx src/components/features/patients/PatientBackgroundTab.jsx
git diff --stat
```
(`PatientProfileHeader.jsx` is rewritten by hand in Step 3, so it is not in this list.)

- [ ] **Step 2: Skill-size the section label**

In `ProfileSection.jsx` change:
```js
export const SECTION_LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-gray-500 font-sans!";
```
to
```js
export const SECTION_LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-wide text-gray-600 font-sans!";
```
(after Step 1 the color part already reads `gray-500`; set exactly the value above.)

- [ ] **Step 3: Rewrite `PatientProfileHeader.jsx`**

Replace the file's contents with the following. Logic (`usePatientConsultation`, follow-up/vitals derivations, `ConfirmationModal` flow) is unchanged; only structure and classes change.

```jsx
import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Plus } from "lucide-react";

import { ConfirmationModal, RefreshingIndicator } from "../../../common";
import usePatientConsultation from "../../../../hooks/usePatientConsultation";
import { FollowUpStateBadge } from "./FollowUpsAndReferrals";
import { SECTION_LABEL_CLASS, TextAction } from "./ProfileSection";
import PatientAlertChips, { Chip } from "../PatientAlertChips";
import { formatPatientAddress } from "../PatientIdentityCard";
import { calculateBmi, formatBmi } from "../../../../utils/bmi";
import {
  getLatestVitalRecord,
  getVitalRecordDate,
  hasVitalValue,
  isVitalRecordToday,
} from "../../../../utils/currentPatientVitals";
import { formatDate, formatPatientName } from "../../../../utils/formatters";
import { getPatientAge } from "../../../../utils/patientProfile";

/** One labelled block of the panel, separated from the previous by a hairline. */
function PanelSection({ id, label, meta, children }) {
  return (
    <section aria-labelledby={`${id}-title`} className="border-t border-gray-200 px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id={`${id}-title`} className={SECTION_LABEL_CLASS}>{label}</h2>
        {meta ? <span className="text-xs tabular-nums text-gray-500">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function ConsultationButton({ consultation }) {
  const { isPending, isError, discarding, primaryLabel, startPath } = consultation;
  const disabled = isPending || isError || discarding;
  const className =
    "inline-flex h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-none bg-red-600 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40 focus-visible:ring-offset-2 disabled:bg-gray-300 disabled:text-gray-500";

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title={isError ? "Unable to check unfinished consultations. Retry from the notice below." : undefined}
        className={className}
      >
        {isPending ? "Checking consultation..." : primaryLabel}
      </button>
    );
  }

  return (
    <Link to={startPath} className={className}>
      <Plus size={15} aria-hidden="true" />
      {primaryLabel}
    </Link>
  );
}

/** Status block under the button: an unfinished draft, or a failed draft check. */
function ConsultationNotice({ consultation }) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const { draft, isError, discarding, retry, discard, startPath } = consultation;

  if (isError) {
    return (
      <p role="status" className="flex items-center gap-3 border-t border-gray-200 px-4 py-2 text-sm text-gray-600">
        Unable to check for an unfinished consultation.
        <TextAction onClick={retry}>Retry</TextAction>
      </p>
    );
  }

  if (!draft) return null;

  return (
    <>
      <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <p>
          <span className="font-semibold">Unfinished consultation</span>
          {draft.lastSavedAt ? (
            <span className="text-amber-800"> · saved {formatDate(draft.lastSavedAt, "")}</span>
          ) : null}
        </p>
        <div className="mt-1 flex items-center gap-4">
          <Link
            to={startPath}
            className="text-sm font-semibold text-red-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40"
          >
            Resume
          </Link>
          <button
            type="button"
            disabled={discarding}
            onClick={() => setConfirmingDiscard(true)}
            className="text-sm text-gray-600 transition-colors hover:text-red-700 hover:underline disabled:opacity-50"
          >
            {discarding ? "Discarding..." : "Discard"}
          </button>
        </div>
      </div>
      <ConfirmationModal
        open={confirmingDiscard}
        title="Discard unfinished consultation?"
        description="The saved draft for this patient will be deleted. This cannot be undone."
        confirmText="Discard Draft"
        loading={discarding}
        loadingText="Discarding..."
        onCancel={() => setConfirmingDiscard(false)}
        onConfirm={async () => {
          try {
            await discard();
          } catch {
            // The mutation's onError already toasted; keep the draft visible.
          } finally {
            setConfirmingDiscard(false);
          }
        }}
      />
    </>
  );
}

function VitalsGrid({ records, isLoading }) {
  const record = getLatestVitalRecord(records);
  const bmi = record ? calculateBmi(record.weight, record.height) : null;
  const recordedAt = record ? getVitalRecordDate(record) : null;
  const value = (raw) => (hasVitalValue(raw) ? raw : "—");
  const cells = record
    ? [
        ["BP", hasVitalValue(record.systolicBp) || hasVitalValue(record.diastolicBp) ? `${value(record.systolicBp)}/${value(record.diastolicBp)}` : "—", "mmHg"],
        ["Pulse", value(record.pulse), "bpm"],
        ["Temp", value(record.temperature), "°C"],
        ["Resp", value(record.respiratoryRate), "/min"],
        ["SpO₂", value(record.spo2), "%"],
        ["Weight", value(record.weight), "kg"],
        ["Height", value(record.height), "cm"],
        ["BMI", bmi !== null && Number.isFinite(bmi) ? formatBmi(bmi) : "—", "kg/m²"],
      ]
    : [];
  const when = recordedAt
    ? `${isVitalRecordToday(record) ? "Today, " : ""}${recordedAt.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        ...(isVitalRecordToday(record) ? {} : { month: "short", day: "numeric", year: "numeric" }),
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "";

  return (
    <PanelSection id="latest-vitals" label="Latest Vitals & BMI" meta={when}>
      <div aria-busy={isLoading}>
        {isLoading ? (
          <p role="status" className="text-sm text-gray-600">Loading vital signs...</p>
        ) : !record ? (
          <p className="text-sm text-gray-600">No vital signs recorded yet.</p>
        ) : (
          <dl className="grid grid-cols-2 border border-gray-200">
            {cells.map(([label, reading, unit], index) => (
              <div
                key={label}
                className={`min-w-0 px-2 py-1.5 ${index % 2 === 0 ? "border-r border-gray-200" : ""} ${index >= 2 ? "border-t border-gray-200" : ""}`}
              >
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{label}</dt>
                <dd className="m-0 truncate text-base font-bold tabular-nums text-gray-900">
                  {reading}
                  <span className="ml-1 text-[11px] font-normal text-gray-500">{unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </PanelSection>
  );
}

/**
 * Left identity panel of the patient profile: identity, the Start / Resume
 * Consultation controls, then alerts, programs, care status and latest vitals.
 * A flat bordered column (no shadow, square corners), like the reference's
 * profile panel. Sections that need clinical history stay gated by
 * `canViewHistory`, exactly as before.
 */
export default function PatientProfileHeader({
  patient,
  patientId,
  backPath,
  updating = false,
  canViewHistory = false,
  records = [],
  recordsLoading = false,
  programLabels = [],
  followUps = [],
  activeFollowUps = [],
  openReferralCount = 0,
}) {
  const consultation = usePatientConsultation(patient.id || patientId);
  const age = getPatientAge(patient);
  const ageText = age !== "" ? `${age} yrs` : "";
  const address = patient.barangay || formatPatientAddress(patient);
  const nextFollowUp = activeFollowUps[0] || null;
  const ageSex = [ageText, patient.sex].filter(Boolean).join(" / ");

  return (
    <header className="border border-gray-200 bg-white">
      <div className="flex items-start gap-3 px-4 py-3">
        <Link
          to={backPath}
          aria-label="Back"
          className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-none text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="break-words text-lg font-bold leading-tight text-gray-900 font-sans!">
            {formatPatientName(patient, "Unnamed Patient")}
          </h1>
          <p className="mt-1 break-all font-mono text-xs text-gray-600">
            Patient ID {patient.patientId || patientId}
          </p>
          {ageSex && <p className="mt-0.5 text-xs tabular-nums text-gray-600">{ageSex}</p>}
          {address && <p className="mt-0.5 break-words text-xs text-gray-600">{address}</p>}
        </div>
      </div>

      <div className="space-y-2 px-4 pb-3">
        {updating && <RefreshingIndicator label="Updating patient details..." />}
        <ConsultationButton consultation={consultation} />
      </div>

      <ConsultationNotice consultation={consultation} />

      {canViewHistory && (
        <>
          <PanelSection id="profile-alerts" label="Alerts">
            <PatientAlertChips background={patient.medicalBackground} />
          </PanelSection>
          {programLabels.length > 0 && (
            <PanelSection id="profile-programs" label="Programs">
              <div className="flex flex-wrap items-center gap-1.5">
                {programLabels.map((label) => (
                  <Chip key={label} tone="program">{label}</Chip>
                ))}
              </div>
            </PanelSection>
          )}
          <PanelSection id="profile-care" label="Care">
            <div className="flex flex-wrap items-center gap-1.5">
              {nextFollowUp && (
                <FollowUpStateBadge state={nextFollowUp.effectiveState} date={nextFollowUp.dueDate} />
              )}
              {activeFollowUps.length > 1 && <Chip tone="muted">+{activeFollowUps.length - 1} more follow-ups</Chip>}
              {openReferralCount > 0 && (
                <Chip tone="neutral">
                  {openReferralCount} open referral{openReferralCount === 1 ? "" : "s"}
                </Chip>
              )}
              {!nextFollowUp && openReferralCount === 0 && (
                <Chip tone="muted">{followUps.length ? "Nothing pending" : "No follow-ups"}</Chip>
              )}
            </div>
          </PanelSection>
          <VitalsGrid records={records} isLoading={recordsLoading} />
        </>
      )}
    </header>
  );
}
```

- [ ] **Step 4: Re-lay `PatientDetails.jsx`**

Replace the block from `<div className="bhc-patient-profile …">` through its matching closing `</div>` (just before `</ProfileShell>`) with:

```jsx
        <div className="bhc-patient-profile min-h-[520px] bg-white px-4 py-4 pb-8 font-sans sm:px-6 [&_h1]:font-sans! [&_h2]:font-sans! [&_h3]:font-sans! [&_h4]:font-sans!">
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-[288px_minmax(0,1fr)] lg:items-start">
            {/* 62px topbar + 2 x 1.25rem content padding. */}
            <aside
              aria-label="Patient summary"
              className="min-w-0 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-62px-2.5rem)] lg:overflow-y-auto"
            >
              <PatientProfileHeader
                patient={patient}
                patientId={patientId}
                backPath={backPath}
                updating={patientUpdating}
                canViewHistory={canViewHistory}
                records={records}
                recordsLoading={recordsLoading}
                programLabels={programLabels}
                followUps={patientFollowUps}
                activeFollowUps={activeFollowUps}
                openReferralCount={openReferralCount}
              />
            </aside>

            <div className="grid min-w-0 grid-cols-1 gap-x-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              {/* On narrow screens the records come first: recent visits matter
                  more at the bedside than registration details. */}
              <div className="@container order-2 min-w-0 max-xl:mt-2 max-xl:border-t max-xl:border-gray-200 max-xl:pt-5 xl:order-1">
                <RegistrationSections
                  patient={patient}
                  form={form}
                  editingSection={editingSection}
                  onEdit={handleEditSection}
                  onCancel={handleCancelEdit}
                  onSave={handleRequestSave}
                  onChange={handleChange}
                  fieldErrors={fieldErrors}
                  saving={saving}
                  motherSearch={motherSearch}
                  motherPatientOptions={motherPatientOptions}
                  onMotherSearchChange={setMotherSearch}
                  onMotherPatientChange={handleMotherPatientChange}
                />
                {canViewHistory &&
                  BACKGROUND_SECTION_KEYS.map((section) => (
                    <PatientBackgroundTab
                      key={section}
                      variant="flat"
                      section={section}
                      background={patient.medicalBackground}
                      saving={savingBackground}
                      onSave={handleBackgroundSave}
                    />
                  ))}
              </div>

              <div className="order-1 min-w-0 xl:order-2 xl:border-l xl:border-gray-200 xl:pl-8">
                {canViewHistory ? (
                  <>
                    <RecordsTimeline
                      records={records}
                      patient={patient}
                      conditionalAreas={conditionalProgramAreas}
                      isLoading={recordsLoading}
                      isFetching={recordsFetching}
                      isError={Boolean(recordsError)}
                      onView={(recordId) => navigate(`/bhc/health-records/${recordId}`)}
                    />
                    <FollowUpsSection
                      followUps={patientFollowUps}
                      onViewFollowUp={(taskId) => navigate(`/bhc/follow-ups/${taskId}`)}
                    />
                    <ReferralsSection
                      referrals={referrals}
                      isLoading={referralsLoading}
                      isFetching={referralsFetching}
                      isError={Boolean(referralsError)}
                      onView={(trackingId) => navigate(`/bhc/referrals/${trackingId}`)}
                    />
                  </>
                ) : (
                  <p className="flex items-center gap-2 py-2 text-sm text-gray-600">
                    <Lock size={14} className="shrink-0" aria-hidden="true" />
                    Clinical history is restricted for your role.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
```
Also update the doc comment above `export default function PatientDetails()`: replace "An identity bar and a header of alerts, programs, care status and vitals sit above two columns" with "A left identity panel (alerts, programs, care status and vitals) sits beside the chart".

- [ ] **Step 5: Gate check for the profile files**

```bash
grep -rnE "\bslate-|#(B91C1C|991B1B|7F1D1D|0F172A|F8FAFC|94A3B8|475569|64748B)|rounded-(md|lg|xl|2xl|3xl)|shadow-(xs|sm|md)|backdrop-blur" src/pages/bhc/PatientDetails.jsx src/components/features/patients/profile src/components/features/patients/PatientBackgroundTab.jsx
grep -nE "rounded-full|className=\" \"" src/pages/bhc/PatientDetails.jsx src/components/features/patients/profile/*.jsx src/components/features/patients/PatientBackgroundTab.jsx
```
Expected first: no output. Second: keep `rounded-full` only on round dots/avatars; change text pills (with `px-`) to `rounded-sm`.

- [ ] **Step 6: Lint, tests, build**

```bash
npx eslint src/pages/bhc/PatientDetails.jsx src/components/features/patients/profile src/components/features/patients/PatientBackgroundTab.jsx
node --test src/utils/patientProfile.test.js src/utils/currentPatientVitals.test.js src/utils/profileNavigation.test.js
npm run build 2>&1 | tail -3
```
Expected: pass, no new lint errors.

- [ ] **Step 7: Visual and behavior check**

Open a patient profile as a BHC user with `clinical.history` and verify: at ≥1024px a 288px panel sits left, sticky, scrolls independently if taller than the viewport; name/ID/age-sex/address, Start or Resume Consultation button, alerts, programs, care, vitals 2×4 grid; at ≥1280px the right area is two columns; below 1024px the panel stacks first. Start/Resume/Discard still work (Discard shows the confirmation modal). Then with a user **without** `clinical.history` (Review Focus 4): panel shows only identity + consultation controls and the "Clinical history is restricted" note shows on the right. Finally a patient with a very long name/address and no allergies/vitals/follow-ups (Review Focus 5): text wraps, "Allergies not recorded" / "No vital signs recorded yet." / "No follow-ups" appear, no horizontal scroll. Registration sections still edit inline and save as before. If not runnable with data, list what was not verified.

- [ ] **Step 8: Commit**

```bash
cd .. && git add frontend/src/pages/bhc/PatientDetails.jsx frontend/src/components/features/patients
git commit -m "$(cat <<'EOF'
feat(patients): reference-style left identity panel on the profile

Regroups the profile header into a flat 288px panel beside the chart and
moves the remaining profile components to EHR minimalism classes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: New consultation cleanup

**Files:**
- Modify (codemod): `frontend/src/pages/bhc/ConsultationWorkspace.jsx`, `frontend/src/components/features/health-records/wizard/*.jsx`
- Modify: `frontend/src/components/features/health-records/wizard/consultation-ehr.css`

**Interfaces:**
- Consumes: Task 1 tokens (global font, headings and radius now cover what `.ehr-consult` used to force).
- Produces: unchanged layout and behavior.

- [ ] **Step 1: Codemod**

```bash
node scripts/ehr-restyle.mjs src/pages/bhc/ConsultationWorkspace.jsx src/components/features/health-records/wizard/*.jsx
git diff --stat
```
Expected: `ConsultationWorkspace.jsx` changes a few dozen class strings; the wizard files are already clean (0 changes).

- [ ] **Step 2: Review the workspace diff**

```bash
git diff src/pages/bhc/ConsultationWorkspace.jsx | grep -E "^[+-]" | grep -vE "^(\+\+\+|---)" | head -120
```
Expected: only `slate-*`→`gray-*`, `[#B91C1C]`→`red-600`, hover hex → `red-700`, `rounded-*`→`rounded-none`, removed `shadow-*`. Anything else is a codemod bug: fix the script (Task 2 file), `git checkout -- src/pages/bhc/ConsultationWorkspace.jsx`, rerun.

- [ ] **Step 3: Trim the redundant `.ehr-consult` rules**

In `consultation-ehr.css` delete these three blocks entirely (the global tokens now provide them):

```css
/* Geiza is used when installed; Public Sans (the app font) is the fallback.
   To ship it, add an @font-face for "Geiza" - nothing else needs to change. */
.ehr-consult {
  font-family: "Geiza", var(--font-sans);
}

/* The app sets serif on every heading; the EHR system is sans throughout. */
.ehr-consult :is(h1, h2, h3, h4) {
  font-family: inherit;
}
```
and
```css
/* ── Shape: sharp, flat ─────────────────────────────────────────────────── */
.ehr-consult :is([class*="rounded-"], .rounded) {
  border-radius: 0;
}
```
Keep the pill rules (`rounded-full` with `px-` → 2px, without `px-` → round), the checkbox rule, the shadow/blur rules, the `#B91C1C` → `#DC2626` mappings (shared components still hard-code them), inputs, labels and modals. Update the header comment's "Palette/Shape" lines to add: `Geiza-first font, sans headings and the radius scale now come from the global tokens in index.css.`

- [ ] **Step 4: Gate check**

```bash
grep -rnE "\bslate-|#(B91C1C|991B1B|7F1D1D|0F172A|F8FAFC|94A3B8|475569|64748B)|rounded-(md|lg|xl|2xl|3xl)|shadow-(xs|sm|md)|backdrop-blur" src/pages/bhc/ConsultationWorkspace.jsx src/components/features/health-records/wizard --include=*.jsx
grep -nE "rounded-full|rounded\b" src/pages/bhc/ConsultationWorkspace.jsx | grep -v "rounded-none\|rounded-sm" | head
```
Expected first: no output. Second: text pills (with `px-`) → `rounded-sm`; keep round dots/avatars.

- [ ] **Step 5: Tests, lint, build**

```bash
node --test src/utils/consultationSteps.test.js src/utils/consultationPrograms.test.js src/utils/consultationIdentity.test.js src/utils/consultationRoute.test.js
npx eslint src/pages/bhc/ConsultationWorkspace.jsx src/components/features/health-records/wizard
npm run build 2>&1 | tail -3
```
Expected: pass; no new lint errors.

- [ ] **Step 6: Visual check**

Start a new consultation from a patient profile and step through every screen (Chief Complaint & HPI → Physical Exam → Program details → Assessment & Actions → Disposition → Review & Confirm). Confirm: same layout and behavior as before, square controls, one red on primary buttons, no serif headings, modals have a white header, the sticky action bar is unchanged, draft autosave and Save Draft still work. Compare a screenshot of one screen before/after if available (`git stash` is not needed: use the previous commit's build).

- [ ] **Step 7: Commit**

```bash
cd .. && git add frontend/src/pages/bhc/ConsultationWorkspace.jsx frontend/src/components/features/health-records/wizard
git commit -m "$(cat <<'EOF'
style(consultation): convert leftover legacy classes, trim redundant overrides

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Final verification and cleanup

**Files:**
- Delete: `frontend/scripts/ehr-restyle.mjs` (and `frontend/scripts/` if empty)

**Interfaces:**
- Consumes: everything above.
- Produces: a clean branch ready for review.

- [ ] **Step 1: Whole-area grep gate**

```bash
grep -rnE "\bslate-|#(B91C1C|991B1B|7F1D1D|0F172A|F8FAFC|94A3B8|475569|64748B)|rounded-(md|lg|xl|2xl|3xl)|shadow-(xs|sm|md)|backdrop-blur" \
  src/components/layout src/pages/bhc/PatientsModule.jsx src/pages/bhc/PatientDetails.jsx src/pages/bhc/ConsultationWorkspace.jsx \
  src/components/features/patients src/components/features/health-records/wizard --include=*.jsx --include=*.js
grep -niE "#(b91c1c|991b1b|7f1d1d)" src/components/features/patients/clinical-directory.css
```
Expected: no output from either. (`consultation-ehr.css` intentionally keeps `#B91C1C` selectors for shared components.)

- [ ] **Step 2: Full automated checks**

```bash
npm run lint 2>&1 | tail -8
npm run build 2>&1 | tail -5
node --test src/utils/*.test.js src/services/*.test.js config/environment.test.js 2>&1 | tail -12
```
Expected: no worse than the Task 1 baseline; all node tests pass, including the 6 new selection tests.

- [ ] **Step 3: Cross-screen visual pass**

Run the app and look at each of these at 400px, 800px and 1400px: `/bhc/patients`, a patient profile, a new consultation, and two screens **outside** the five areas (`/bhc/dashboard`, one RHU page). The five areas must match the skill and each other; the other screens must be flat/square with their old colors and no broken layout (Global Constraints: they change only through the token change). Report anything that looks broken outside the five areas rather than restyling it. State plainly which screens you could and could not run.

- [ ] **Step 4: Remove the codemod and commit**

```bash
git rm -r frontend/scripts/ehr-restyle.mjs
git commit -m "$(cat <<'EOF'
chore: remove one-off restyle codemod

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git status --short
git log --oneline -8
```
Expected: `git status` shows only the unrelated `.claude/data` files; the log lists the six task commits plus the spec/plan commits.

---

## Self-Review Notes

- **Spec coverage:** tokens (T1), navbar/topbar (T2; sidebar needs no edits, verified by grep), patient module grid + permanent preview + empty placeholder + drawer fallback + selection clearing (T3, T4), profile left panel + `xl` two-column right area + `canViewHistory` gating (T5), consultation cleanup + trimmed overrides (T6), docs/design-tokens page (T1), verification order and greps (T7). Amendments to the spec for details the code reading changed are made in T1 Step 2.
- **Type consistency:** `getPatientKey`, `toggleSelection`, `reconcileSelection`, `useMediaQuery(query)`, `PatientAlertChips`/`Chip` (created in Task 4, consumed in Task 5) and `PatientProfileHeader`'s prop list are named identically everywhere they are used; `PatientSummaryPanel`'s `showTitle` is set by the inline preview and omitted by the drawer.
- **Known limits, stated up front:** shared components (`PatientBackgroundTab`, `PatientDirectoryCard`, `PatientSummaryPanel`, profile sections) are also used by RHU screens and are restyled there too; there is no component-test harness, so layout is verified by build output, greps and the manual passes; Geiza is not shipped.
