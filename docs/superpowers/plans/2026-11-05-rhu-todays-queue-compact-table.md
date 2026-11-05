# RHU Today's Queue compact table — implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align Today's Queue with Medicine & Supply compact table chrome and page layout.

**Tech:** React frontend only; existing `SegmentedFilter`, `SearchField`, `TablePagination`, `FixedTable`.

## Tasks

1. [x] Update `rhuQueueView` entry secondary copy (`Referred from…` / `Direct RHU check-in`) and status tones (Waiting→neutral, In Consultation→cyan/info distinct); fix unit tests.
2. [x] Lift Check-in + Search into `RhuPatientsWorkspace` queue chrome; pass search/source props or keep filters in table with page actions slot.
3. [x] Rewrite `RhuQueueTable` sheet: card header All|Referred|Walk-in; Medicine-style thead/rows; Patient Entry + Visit Progress as text+dot; shared TablePagination.
4. [x] Replace standalone search with `SearchFilterCluster` + Visit Progress `ListFilterPopover`; pill `SegmentedFilter`; `TablePagination alwaysShow`; fit table height to visible rows.
5. [x] Run `npm run test:rhu-queue` (32 pass).
