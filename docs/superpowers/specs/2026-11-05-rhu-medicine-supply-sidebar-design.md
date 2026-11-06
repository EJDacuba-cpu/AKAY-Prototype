# RHU Medicine and Supply sidebar split — Design

Status: approved for planning (GOAL / CONTEXT / OUTPUT from Eric, 2026-11-05).

## Intent

Reorganize RHU **Medicine and Supply** so **Inventory** and **To Dispense** are independent sidebar children under Operations, matching Patient Intake / Patients collapsible navigation. Remove the in-page Inventory / To dispense toggle. BHC Medicine and Supply stays a single flat page.

## Navigation

| Item | Path | Notes |
|------|------|-------|
| Parent (sidebar only) | `/rhu/medicine-and-supply` | Redirects to Inventory; synthetic group key like Patient Intake |
| Inventory | `/rhu/medicine-management` | Existing inventory URL (bookmarks / ledger / details stay valid) |
| To Dispense | `/rhu/to-dispense` | New SPA route; not the API path alone |

Parent `defaultPath`: `/rhu/medicine-management`. Children: Inventory, To Dispense.

Parent stays active on Inventory, medicine details (`/rhu/medicine-management/:id`), and To Dispense.

## Permissions

| Surface | Gate |
|---------|------|
| Inventory route + nav child | `inventory.view` (`module="inventory"`) |
| Inventory manage actions | `inventory.manage` (unchanged in-page) |
| To Dispense route | `items.dispense` (`module="dispensing"`) |
| Parent sidebar unlock | `inventory.view` **or** `items.dispense` |
| To Dispense sidebar child | Shown only when `items.dispense`; omit for others (do not list as locked) |

## Pages

- **Inventory:** Existing search/filter cluster, Add Medicine, stock table, actions, pagination. Heading **Inventory**; subtitle for RHU stock workspace. No desk toggle.
- **To Dispense:** Existing `RhuToDispenseTab` (list, search, review modal, FEFO allocation, confirm given). Wrap in `DashboardLayout` with heading **To Dispense** and a short subtitle matching Incoming Referrals / Walk-in typography (`text-[17px]` / `text-[13px]`).

## Out of scope

BHC medicine UI; medicine math; inventory transactions; FEFO; prescription APIs; DB; backend business logic.
