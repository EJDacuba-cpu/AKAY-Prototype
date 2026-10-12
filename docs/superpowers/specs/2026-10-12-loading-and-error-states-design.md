# Loading and Error States — Design

Date: 2026-10-12
Status: Draft for review
Related: `2026-10-12-account-details-access-design.md` (its Password & Invites error handling is revised here).

## Goal

One way to show "loading" and one way to show "it failed", across the whole app, so a person always knows what is happening
in plain words, and no state draws an extra background card.

## What was said and what is assumed

Said by the product owner:
- "Failed to fetch" means nothing to a user; error messages must be understandable.
- Server errors should be consistent with the rest of the system; the inline red banner style is not wanted.
- "Unable to Load Data" must not have a background card (done in commit `dec1009`); other page loads that still draw a
  background card should be found and fixed the same way.
- Loading skeletons should be made consistent at the same time.
- One spec, implemented in two phases: Phase 1 shared pieces and full pages; Phase 2 the small sections inside pages.

Assumptions (correct me if wrong):
- Form-heavy screens that already have their own save-failure handling (Add Patient, Consultation Workspace, RHU Add Health
  Records, Add User, QR Scanner) keep it; only their messages change (through `apiClient`).
- Validation errors stay next to their field. The sign-in and password pages keep their inline form errors.

## The rules

| Situation | Loading | Failure |
|---|---|---|
| First load of a page | A skeleton shaped like that page, chosen explicitly, drawn on the page background, never repeating a header or toolbar already on screen | `ConnectionErrorState` in place with Retry; no toast; no card |
| A section or panel inside a page (Phase 2) | `SectionSkeleton` (a few placeholder lines) instead of "Loading..." text | `ConnectionErrorState size="compact"` with Retry |
| Refresh while data is already on screen | Keep the data; the existing small "Updating..." indicator | Toast: the message; the data stays |
| A person's action (save, resend, approve, decline, reschedule) | Spinner in the button (exists) | Toast; clinical form saves keep their existing modal |
| A field is invalid | — | Inline next to the field |
| The device is offline | — | A persistent banner at the top of the app while offline; "Back online" when it returns |

A toast is never used for a failed first load, and a page never shows a toast and an in-place error for the same failure.

## Messages (`frontend/src/services/apiClient.js`)

| Cause | Today | New |
|---|---|---|
| Offline | "You are offline. Please reconnect and try again." | unchanged |
| Timeout | "The server took too long to respond. Please check the API connection and try again." | "The server is taking too long to respond. Please try again in a moment." |
| Server unreachable (browser `TypeError`, e.g. "Failed to fetch") | the browser's text | "We couldn't reach the server. Please check your connection and try again." |
| Server error with no message | "API request failed." | "Something went wrong. Please try again." |
| Server error with a message (e.g. "Email is already taken.") | the server's message | unchanged |

The network-error case keeps `error.isNetworkError` and `error.code = "NETWORK_ERROR"`; only `error.message` changes, so
`isConnectionError` and variant choices keep working.

## Shared components

- **`ConnectionErrorState`** — add `size: "page" | "compact"` (default `"page"`; `fullPage` keeps its meaning for height).
  Compact: smaller icon and type, `min-h-[160px]`, same Retry button, no "Your saved records are safe." line. No card in
  either size (already true).
- **`PageLoadingFallback`** — drop the wrapper's `rounded-xl bg-[#F8FAFC]`; the skeleton sits on the page background.
- **`SoftLoadingOverlay`** (used by `SoftLoadingArea`) — the area overlay uses the page background (`bg-gray-50`, the
  `DashboardLayout` colour) with no rounded corners, instead of a white `bg-white/88` panel, so it reads as the page itself.
  The viewport overlay is unchanged.
- **`PageSkeletonLoader` / `SoftLoadingArea` / `PageStateWrapper`** — take an explicit `skeleton` prop (one of the existing
  variants: `dashboard`, `table`, `details`, `form`, `module`, `follow-ups`, `medicine`, `reports`, `patient-details`,
  `health-records`, `facilities`) and a `bodyOnly` flag that leaves out the skeleton's own header and toolbar. Choosing a
  skeleton from the loading message text (`inferLoadingSkeletonVariant`) is removed; without a `skeleton` prop the
  fallback is `module`.
- **`SectionSkeleton`** (new, Phase 2) — 3 placeholder lines by default (`lines` prop), no card, for panels and modals.
- **`ConnectionStatusBanner`** — today it renders nothing while offline. It shows a full-width amber bar under the header
  while offline: "You're offline. Changes can't be saved until the connection returns." The "Back online" pill stays.

## Phase 1: full pages

Each page passes its skeleton explicitly; `bodyOnly` where its header or toolbar is already on screen while loading (the plan
checks each page).

| Page | Skeleton | Other change |
|---|---|---|
| Admin Dashboard, BHC Dashboard, RHU Dashboard | `dashboard` | — |
| Users (Account Directory), RHU Patients, Incoming Referrals, BHC Patients, BHC Referrals, Audit Logs | `table` | Audit Logs: its in-table error becomes `ConnectionErrorState` |
| Facilities | `facilities` | — |
| BHC Reports | `reports` | — |
| Admin Reports, RHU Reports | `reports` | Gain the page loading state, and a failed load shows `ConnectionErrorState` instead of a toast over zero figures |
| Medicine Availability, Medicine Management | `medicine` | — |
| BHC Health Records, RHU Health Records | `health-records` | — |
| BHC Follow-ups | `follow-ups` | — |
| Follow-up Details, BHC Health Record Details, RHU Record Details, BHC/RHU Referral Details, Program Details | `details` | Follow-up Details: its two red error cards become `ConnectionErrorState size="compact"`; RHU Referral Details keeps its own not-found / restricted page, and only its load failure uses `ConnectionErrorState` |
| Create Referral (both loads), Feedback / Return Slip | `form` | — |
| BHC Patient Details, RHU Patient Details | `patient-details` | RHU Patient Details: `TabErrorState` becomes `ConnectionErrorState size="compact"` |
| Programs | `module` | — |
| Family Planning report | `reports` | — |
| Staff Assignments | `table` | Gains the page loading and failure states |
| Notifications | its own inbox skeleton (already explicit and shaped like the inbox; kept) | Its own error block becomes `ConnectionErrorState` |
| Password & Invites | `table`, `bodyOnly` | No toast when the first load fails (only `ConnectionErrorState`); a failed reload while rows are on screen toasts |

## Phase 2: sections inside pages

Replace "Loading..." text with `SectionSkeleton`, and small "Unable to load ..." notes with `ConnectionErrorState
size="compact"` (with Retry where the section can refetch):

- Patient profile: `ClinicalOverviewColumn`, `FollowUpsAndReferrals`, `RecordsTimeline`, `PatientSummaryPanel`,
  `PatientBackgroundTab`, `PatientFactsSections`, `MedicalConditionsGroups`, `AnatomyFindingsPanel`,
  `CommunityProgramsSection`.
- Programs: `ParticipantsTab`, `AddParticipantModal`, `EnrollProgramModal`.
- Consultation and referral fields: `ConsultationBackgroundCard`, `ReferralDestinationPicker`, `ReferralFacilityField`,
  `DispensedMedicinesSection`, `MedicineInventoryHistoryModal`, `StartConsultationModal`.
- `NotificationDropdown`, `AccountDetailsModal` loading line, RHU Patient Details tab loads.

## Testing

- `frontend/src/services/apiErrorMessages.test.js` (node test runner): the message for each cause in the table above (the
  mapping lives in a small pure helper, `apiErrorMessages.js`, that `apiClient` calls).
- `accountAccess` / `useAccessRows` behavior is covered by the browser check below (no React test runner in the project).
- Browser walk-through at desktop width: each Phase 1 page while loading (skeleton shape, no background card, no duplicate
  toolbar) and with its list request blocked (in-place error, Retry recovers, no toast); Password & Invites reload failure
  with rows on screen (toast, rows stay); offline banner via the browser's offline mode; Add Medicine Item and Follow-up
  reschedule failures still toast.

## Out of scope

- Redesigning the skeleton shapes themselves (only how they are chosen, placed and backed).
- The form-heavy screens' own save-failure modals.
- Backend error wording.
- A React component test setup.
