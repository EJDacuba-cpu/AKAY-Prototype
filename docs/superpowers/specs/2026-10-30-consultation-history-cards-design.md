# Consultation history cards

## Approved behavior

Eric requested the same history presentation in BHC and RHU. Empty Family, Past Medical, Personal & Social, and Obstetric & Menstrual sections open their existing inputs. A section with any saved clinical answer opens as its own readable card, retaining existing labels and grouping and showing “Not recorded” for blanks. Each section has a pencil edit control. Done returns to the summary; it does not save independently. Partial saved sections also start as summaries. Existing permissions and age/sex visibility apply.

## Approach and architecture

Extend the existing shared PatientHistoryPanel and HistorySectionSummary. This reuses the same field mapping and avoids separate BHC/RHU implementations. The alternative of separate role-specific cards would duplicate display and edit state. No clinical fields are moved. Similar Illness remains a per-visit question even while longitudinal Family History is summarized.

React owns presentation state. Defaults use saved background, so typing the first answer does not unexpectedly close the editor. Explicit pencil/Done state takes precedence; validation errors reopen the affected section. Done uses the existing background validation rules and keeps invalid inputs visible. Hidden profile/lifestyle fields cannot make a visible section appear recorded or block Done. Patient keys reset local edit state when switching patients.

Laravel finalization, background revisions, PostgreSQL logic, TanStack Query data fetching, and existing draft behavior retain ownership of persistence. No new API or database writes occur on Done.

## Verification

Test per-section empty/partial defaults, explicit none-known answers, pencil/Done overrides, error reopening, and hidden fields. Run existing history and consultation regressions, scoped ESLint, production build, and diff checks. Live browser appearance cannot be verified when the browser inventory is empty; disclose this limitation.
