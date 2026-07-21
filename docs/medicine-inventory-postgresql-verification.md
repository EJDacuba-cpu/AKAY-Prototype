# AKAY Medicine Inventory PostgreSQL Verification

Run this only in an isolated development PostgreSQL database after reviewing and applying the Phase 4A migrations. Execute privilege checks through the same connection configuration used by Laravel so `current_user` represents the runtime role. The default assumption is that the migration owner and Laravel runtime role are the same. If they differ, use the reviewed placeholder grants below; never grant these functions to browser-facing roles.

## Dispensing Scope

Medicine dispensing is intentionally BHC-only in the current AKAY product. Only BHW users see the health-record dispensing UI, the Laravel service rejects non-BHW actors, dispense snapshots are assigned to a BHC, and the stored batch function requires `p_facility_type = 'bhc'`. RHU staff may manage RHU inventory through restock and adjustment operations but cannot dispense RHU inventory through health records.

## Privileges

```sql
SELECT
    current_database() AS database_name,
    current_user AS current_database_user;

SELECT
    p.oid::regprocedure AS function_signature,
    pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS security_definer,
    p.proconfig AS function_settings,
    has_function_privilege(current_user, p.oid, 'EXECUTE') AS runtime_role_can_execute,
    EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
        WHERE acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
    ) AS public_can_execute
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'akay_inventory_%'
ORDER BY p.proname;

SELECT
    r.rolname,
    p.oid::regprocedure AS function_signature,
    has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can_execute
FROM pg_catalog.pg_roles AS r
CROSS JOIN pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE r.rolname IN ('anon', 'authenticated')
  AND n.nspname = 'public'
  AND p.proname LIKE 'akay_inventory_%'
ORDER BY r.rolname, p.proname;

SELECT
    current_user AS current_database_user,
    has_table_privilege(current_user, 'public.medicines', 'SELECT') AS medicines_select,
    has_table_privilege(current_user, 'public.medicines', 'UPDATE') AS medicines_update,
    has_table_privilege(current_user, 'public.medicine_inventory_transactions', 'SELECT') AS ledger_select,
    has_table_privilege(current_user, 'public.medicine_inventory_transactions', 'INSERT') AS ledger_insert,
    has_sequence_privilege(current_user, 'public.medicine_inventory_transactions_id_seq', 'USAGE') AS ledger_sequence_usage,
    has_table_privilege(current_user, 'public.users', 'SELECT') AS users_select,
    has_table_privilege(current_user, 'public.barangay_health_centers', 'SELECT') AS bhc_select,
    has_table_privilege(current_user, 'public.rural_health_units', 'SELECT') AS rhu_select,
    has_table_privilege(current_user, 'public.health_records', 'SELECT') AS health_records_select;
```

Confirm `security_definer` is false, `function_settings` contains the controlled search path, PUBLIC has no EXECUTE ACL, and any existing `anon` or `authenticated` role reports `can_execute = false`.

If the migration owner and runtime role differ, review and substitute a deployment-managed identifier for `runtime_role_placeholder`. Do not execute this automatically and do not substitute `anon` or `authenticated`.

```sql
BEGIN;

GRANT EXECUTE ON FUNCTION public.akay_inventory_actor_has_facility(bigint, text, bigint)
TO runtime_role_placeholder;
GRANT EXECUTE ON FUNCTION public.akay_inventory_opening_balance(bigint, bigint, text, bigint, integer, text)
TO runtime_role_placeholder;
GRANT EXECUTE ON FUNCTION public.akay_inventory_restock(bigint, bigint, text, bigint, integer, text, text)
TO runtime_role_placeholder;
GRANT EXECUTE ON FUNCTION public.akay_inventory_adjust(bigint, bigint, text, bigint, text, text, integer, text, text)
TO runtime_role_placeholder;
GRANT EXECUTE ON FUNCTION public.akay_inventory_dispense_batch(bigint, text, bigint, text, bigint, text, jsonb)
TO runtime_role_placeholder;

GRANT SELECT, UPDATE ON public.medicines TO runtime_role_placeholder;
GRANT SELECT, INSERT ON public.medicine_inventory_transactions TO runtime_role_placeholder;
GRANT USAGE ON SEQUENCE public.medicine_inventory_transactions_id_seq TO runtime_role_placeholder;
GRANT SELECT ON public.users, public.barangay_health_centers,
    public.rural_health_units, public.health_records TO runtime_role_placeholder;

ROLLBACK;
```

Replace `ROLLBACK` with a separately approved deployment action only after the privilege output has been reviewed.

## Functional Checks

Create disposable BHC test data through the authenticated Laravel API. Record the resulting `actor_user_id`, `facility_id`, medicine IDs, and health-record ID. Use unique operation keys for every direct development check.

```sql
BEGIN;

SELECT * FROM public.akay_inventory_opening_balance(
    :medicine_id, :actor_user_id, 'bhc', :facility_id, 10, :opening_operation_key
);

SELECT * FROM public.akay_inventory_restock(
    :medicine_id, :actor_user_id, 'bhc', :facility_id, 5,
    'Phase 4A development verification', :restock_operation_key
);

SELECT * FROM public.akay_inventory_adjust(
    :medicine_id, :actor_user_id, 'bhc', :facility_id,
    'adjustment_out', NULL, 3,
    'Phase 4A development verification', :adjust_operation_key
);

SELECT * FROM public.akay_inventory_dispense_batch(
    :actor_user_id,
    'bhc',
    :facility_id,
    'health_record',
    :health_record_id,
    :dispense_operation_key,
    jsonb_build_array(
        jsonb_build_object('medicine_id', :medicine_a_id, 'quantity', 2),
        jsonb_build_object('medicine_id', :medicine_b_id, 'quantity', 3)
    )
);

SELECT medicine_id, transaction_type, quantity_delta, quantity_before,
       quantity_after, source_type, source_id, operation_key, created_at
FROM public.medicine_inventory_transactions
WHERE medicine_id IN (:medicine_a_id, :medicine_b_id)
ORDER BY id;

ROLLBACK;
```

Verify opening `0 -> 10`, restock `10 -> 15`, adjustment `15 -> 12`, and one dispense ledger row per medicine. Repeat a batch where one item exceeds stock and confirm both medicine quantities and ledger counts remain unchanged. Test an expired medicine: dispensing must fail while `expired_disposal` with a reason succeeds.

## Concurrency

### Duplicate Restock Key

1. Set a disposable medicine to stock 5 and choose one operation key.
2. Open two PostgreSQL sessions using the Laravel runtime role.
3. Begin both transactions and call `akay_inventory_restock` for the same medicine, quantity, and operation key.
4. Let session A commit after its function returns; session B waits on the medicine row lock.
5. Session B must receive `INVENTORY_OPERATION_ALREADY_APPLIED` after acquiring the lock.
6. Confirm stock increased once and exactly one ledger row exists for that key and medicine.

Repeat the same two-session procedure with `akay_inventory_adjust`. Confirm one adjustment, one ledger row, and the same safe loser code.

### Duplicate Batch Key

1. Prepare two BHC medicines and one BHC health record.
2. In session A, call `akay_inventory_dispense_batch` using both medicine IDs and one operation key, then commit.
3. In session B, call the same batch with the same key.
4. Confirm session B receives `INVENTORY_OPERATION_ALREADY_APPLIED`, neither medicine is deducted twice, and the ledger contains exactly two rows sharing the key, one per medicine.

### Stock Competition

1. Set a disposable medicine to stock 5.
2. In two sessions, request quantity 4 using different health-record IDs and operation keys.
3. Let session A commit while session B waits on the row lock.
4. Session B must return `INSUFFICIENT_STOCK`.
5. Confirm final stock is 1 and exactly one successful ledger set exists.

Finally, replay the official Laravel health-record request with the same idempotency key and payload. Confirm the replay creates no second stock change, ledger row, or `health_record_medicines` row. Repeat with changed medicine payload and confirm `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`.
