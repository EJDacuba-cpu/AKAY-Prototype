# BHC Referrals sidebar navigation — implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Nested BHC Referrals sidebar (Sent / Waiting) with commodities-style filters and a Waiting table.

**Tech:** React frontend only; existing queries; `?view=` with `?tab=` compat.

## Tasks

1. Workspace helpers: `VIEW_SENT` / `VIEW_WAITING`, `normalizeReferralView`, keep `TAB_*` aliases.
2. Sidebar + `isSidebarPathActive` for referrals query children.
3. `ReferralListFilters` (commodities popover) + rewrite `Referrals.jsx`.
4. Retarget `?tab=waiting` links; update `Referrals.test.js` and run tests.
