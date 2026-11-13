# Unified Monitoring Requests Inbox Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or implement directly in-session). User approved Option A; no commits.

**Goal:** Single BHC Monitoring Requests list merging handoffs + TB endorsements; dual backends preserved.

**Architecture:** FE adapter merges two list APIs; detail routes stay separate.

## File map

| File | Responsibility |
|------|----------------|
| `frontend/src/utils/pendingHandoffInbox.js` | Normalize + merge inbox rows; detect TB review deep-link mode |
| `frontend/src/utils/pendingHandoffInbox.test.js` | Adapter regression tests |
| `frontend/src/services/tbCaseService.js` | Optional `per_page` for inbox fetch |
| `frontend/src/pages/bhc/PatientsModule.jsx` | Remove tabs; unified list; TB review when deep-linked |
| `frontend/src/pages/bhc/BhcTbEndorsements.jsx` | Redirect to unified list; embedded Back control |
| `frontend/src/utils/bhcConsultationSteps.test.js` | Expect unified inbox, not tabs |
| `frontend/src/utils/sidebarNavigation.test.js` | Keep legacy path active |

## Tasks

1. Adapter + tests (TDD)
2. Wire PatientsModule + redirect/back
3. Update contract tests; run FE tests
