# Health Records Current Next Actions

Approved scope: replace Outcome labeling with Next Action in the existing patient Health Records table and matching filter. Current active task/referral state controls the display; historical status, dates, outcomeText, and completed/cancelled rows do not create actions. Preserve condition outcomes and visit classifications.

Architecture: update the existing pure patientRecordRows reader and shared table/filter components. Reuse full patient referral/task query results, existing formatting, and existing filter keys. No API, saving, task-transition, referral-transition, or database changes. Omitted source collections remain unknown rather than silently becoming empty authoritative lists.

- [x] Update helper tests for active/mixed/terminal/unknown actions and retained filters/classifications; verify failures.
- [x] Add desktop/mobile table and filter render assertions; verify failures.
- [x] Implement status-aware display and conservative neutral fallback in existing reader; update labels.
- [x] Run relevant tests, targeted lint, build, and focused regression review.

Review focus: Referred is historical disposition, multiple actions must survive precedence, superseded rescheduled tasks are inactive, unknown status blocks No Further Action, and partial/missing data must remain unknown. Browser visual verification depends on an available connection.

Verification: 14 focused reader/UI tests and 78 combined regression tests passed. Targeted ESLint, production build, and git diff --check passed. Independent review found no important correctness/regression issues. Build retains its large-chunk warning. Desktop/mobile markup was verified by SSR; live browser visual inspection was unavailable in this session.
