-- AKAY Phase 4A medicine inventory preflight and verification
--
-- This script is read-only and is safe to run both before and after the
-- Phase 4A migrations. It creates no temporary or permanent objects.
-- Counts labeled BLOCKER must be zero before migration execution.

-- ================================================================
-- PRE-MIGRATION CHECKS
-- ================================================================
-- These checks use only legacy tables that exist before Phase 4A.

-- BLOCKER: medicine quantities must never be negative.
SELECT COUNT(*) AS blocker_negative_medicine_quantities
FROM public.medicines
WHERE quantity < 0;

-- BLOCKER: a medicine cannot belong to both a BHC and an RHU.
SELECT COUNT(*) AS blocker_medicines_with_both_bhc_and_rhu
FROM public.medicines
WHERE barangay_health_center_id IS NOT NULL
  AND rural_health_unit_id IS NOT NULL;

-- BLOCKER: every medicine must belong to exactly one facility.
SELECT COUNT(*) AS blocker_medicines_with_neither_facility
FROM public.medicines
WHERE barangay_health_center_id IS NULL
  AND rural_health_unit_id IS NULL;

-- BLOCKER: every dispensed medicine reference must resolve to a medicine.
SELECT COUNT(*) AS blocker_orphaned_health_record_medicine_references
FROM public.health_record_medicines AS hrm
LEFT JOIN public.medicines AS m ON m.id = hrm.medicine_id
WHERE m.id IS NULL;

-- INFORMATIONAL ONLY: expired positive stock is not a migration blocker.
SELECT COUNT(*) AS informational_expired_positive_stock
FROM public.medicines
WHERE quantity > 0
  AND expiration_date IS NOT NULL
  AND expiration_date < CURRENT_DATE;

-- INFORMATIONAL ONLY: repeated medicine rows on one legacy health record.
SELECT COUNT(*) AS informational_repeated_health_record_medicine_pairs
FROM (
    SELECT health_record_id, medicine_id
    FROM public.health_record_medicines
    GROUP BY health_record_id, medicine_id
    HAVING COUNT(*) > 1
) AS repeated_pairs;

-- ================================================================
-- POST-MIGRATION VERIFICATION
-- ================================================================
-- Missing Phase 4A objects are reported as SKIPPED instead of raising
-- undefined-table or undefined-function errors.

-- Phase 4A ledger availability. All ledger data checks below are gated by
-- this to_regclass lookup before any ledger SELECT is parsed or executed.
SELECT
    to_regclass('public.medicine_inventory_transactions') AS ledger_relation,
    CASE
        WHEN to_regclass('public.medicine_inventory_transactions') IS NULL
            THEN 'SKIPPED: Phase 4A migrations pending; ledger table is absent.'
        ELSE 'AVAILABLE: Phase 4A ledger table exists.'
    END AS ledger_check_status;

-- Verify official ledger rows have operation keys and composite keys are
-- unique. Dynamic SELECT is required because a static reference to a missing
-- table raises 42P01 during parsing even when enclosed in a CASE expression.
DO $ledger_data_checks$
DECLARE
    ledger_relation regclass := to_regclass('public.medicine_inventory_transactions');
    null_operation_key_count bigint;
    duplicate_operation_key_count bigint;
BEGIN
    IF ledger_relation IS NULL THEN
        RAISE NOTICE 'SKIPPED: Phase 4A migrations pending; ledger data checks were not run.';
        RETURN;
    END IF;

    EXECUTE 'SELECT COUNT(*) FROM public.medicine_inventory_transactions WHERE operation_key IS NULL'
        INTO null_operation_key_count;
    RAISE NOTICE 'POST-MIGRATION CHECK: null operation keys = % (expected 0)',
        null_operation_key_count;

    EXECUTE 'SELECT COUNT(*) FROM (SELECT operation_key, medicine_id FROM public.medicine_inventory_transactions GROUP BY operation_key, medicine_id HAVING COUNT(*) > 1) AS duplicate_keys'
        INTO duplicate_operation_key_count;
    RAISE NOTICE 'POST-MIGRATION CHECK: duplicate (operation_key, medicine_id) pairs = % (expected 0)',
        duplicate_operation_key_count;
END
$ledger_data_checks$;

-- Composite uniqueness must be enforced by the database.
WITH ledger AS (
    SELECT to_regclass('public.medicine_inventory_transactions') AS relation_oid
)
SELECT CASE
    WHEN ledger.relation_oid IS NULL
        THEN 'SKIPPED: Phase 4A migrations pending; composite unique constraint cannot be verified.'
    WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_definition
        WHERE constraint_definition.conrelid = ledger.relation_oid
          AND constraint_definition.contype = 'u'
          AND pg_get_constraintdef(constraint_definition.oid)
              = 'UNIQUE (operation_key, medicine_id)'
    ) THEN 'PASS: UNIQUE (operation_key, medicine_id) is enforced.'
    ELSE 'FAIL: UNIQUE (operation_key, medicine_id) is not enforced.'
END AS composite_operation_key_uniqueness
FROM ledger;

-- The ledger must reject UPDATE and DELETE through its append-only trigger.
WITH ledger AS (
    SELECT to_regclass('public.medicine_inventory_transactions') AS relation_oid
)
SELECT CASE
    WHEN ledger.relation_oid IS NULL
        THEN 'SKIPPED: Phase 4A migrations pending; append-only trigger cannot be verified.'
    WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_trigger AS trigger_definition
        WHERE trigger_definition.tgrelid = ledger.relation_oid
          AND trigger_definition.tgname = 'medicine_inventory_transactions_append_only'
          AND NOT trigger_definition.tgisinternal
          AND trigger_definition.tgenabled <> 'D'
    ) THEN 'PASS: append-only trigger is enabled.'
    ELSE 'FAIL: append-only trigger is absent or disabled.'
END AS append_only_trigger_status
FROM ledger;

-- Resolve each expected function before inspecting security or privileges.
-- SECURITY INVOKER is represented by prosecdef = false.
WITH expected_functions(function_name, function_signature) AS (
    VALUES
        ('akay_inventory_actor_has_facility', 'public.akay_inventory_actor_has_facility(bigint,text,bigint)'),
        ('akay_inventory_opening_balance', 'public.akay_inventory_opening_balance(bigint,bigint,text,bigint,integer,text)'),
        ('akay_inventory_restock', 'public.akay_inventory_restock(bigint,bigint,text,bigint,integer,text,text)'),
        ('akay_inventory_adjust', 'public.akay_inventory_adjust(bigint,bigint,text,bigint,text,text,integer,text,text)'),
        ('akay_inventory_dispense_batch', 'public.akay_inventory_dispense_batch(bigint,text,bigint,text,bigint,text,jsonb)'),
        ('akay_inventory_ledger_append_only', 'public.akay_inventory_ledger_append_only()')
), resolved_functions AS (
    SELECT
        function_name,
        function_signature,
        to_regprocedure(function_signature) AS function_oid
    FROM expected_functions
)
SELECT
    resolved_functions.function_name,
    resolved_functions.function_signature,
    CASE
        WHEN resolved_functions.function_oid IS NULL
            THEN 'SKIPPED: Phase 4A migrations pending; function is absent.'
        WHEN function_definition.prosecdef
            THEN 'FAIL: function is SECURITY DEFINER.'
        ELSE 'PASS: function is SECURITY INVOKER.'
    END AS function_security_mode,
    CASE
        WHEN resolved_functions.function_oid IS NULL THEN NULL
        ELSE pg_get_userbyid(function_definition.proowner)
    END AS function_owner,
    CASE
        WHEN resolved_functions.function_oid IS NULL THEN NULL
        ELSE has_function_privilege(current_user, resolved_functions.function_oid, 'EXECUTE')
    END AS runtime_role_can_execute,
    CASE
        WHEN resolved_functions.function_oid IS NULL THEN NULL
        ELSE NOT EXISTS (
            SELECT 1
            FROM aclexplode(
                COALESCE(
                    function_definition.proacl,
                    acldefault('f', function_definition.proowner)
                )
            ) AS function_acl
            WHERE function_acl.grantee = 0
              AND function_acl.privilege_type = 'EXECUTE'
        )
    END AS public_execute_is_revoked
FROM resolved_functions
LEFT JOIN pg_catalog.pg_proc AS function_definition
    ON function_definition.oid = resolved_functions.function_oid
ORDER BY resolved_functions.function_name;

-- Browser-facing roles must not be able to execute inventory functions.
-- A missing role is reported separately and is not created by this script.
WITH expected_functions(function_name, function_signature) AS (
    VALUES
        ('akay_inventory_actor_has_facility', 'public.akay_inventory_actor_has_facility(bigint,text,bigint)'),
        ('akay_inventory_opening_balance', 'public.akay_inventory_opening_balance(bigint,bigint,text,bigint,integer,text)'),
        ('akay_inventory_restock', 'public.akay_inventory_restock(bigint,bigint,text,bigint,integer,text,text)'),
        ('akay_inventory_adjust', 'public.akay_inventory_adjust(bigint,bigint,text,bigint,text,text,integer,text,text)'),
        ('akay_inventory_dispense_batch', 'public.akay_inventory_dispense_batch(bigint,text,bigint,text,bigint,text,jsonb)'),
        ('akay_inventory_ledger_append_only', 'public.akay_inventory_ledger_append_only()')
), resolved_functions AS (
    SELECT
        function_name,
        to_regprocedure(function_signature) AS function_oid
    FROM expected_functions
), browser_roles(role_name) AS (
    VALUES ('anon'), ('authenticated')
)
SELECT
    browser_roles.role_name,
    resolved_functions.function_name,
    CASE
        WHEN database_role.oid IS NULL
            THEN 'SKIPPED: browser-facing database role does not exist.'
        WHEN resolved_functions.function_oid IS NULL
            THEN 'SKIPPED: Phase 4A migrations pending; function is absent.'
        WHEN has_function_privilege(
            database_role.oid,
            resolved_functions.function_oid,
            'EXECUTE'
        ) THEN 'FAIL: EXECUTE is available.'
        ELSE 'PASS: EXECUTE is revoked.'
    END AS browser_role_execute_status
FROM browser_roles
CROSS JOIN resolved_functions
LEFT JOIN pg_catalog.pg_roles AS database_role
    ON database_role.rolname = browser_roles.role_name
ORDER BY browser_roles.role_name, resolved_functions.function_name;

-- Runtime-role privilege verification. current_user is the runtime-role
-- assumption when migration and application connections use the same role.
-- If they differ, compare this output with the reviewed runtime_role_placeholder
-- GRANT statements in medicine-inventory-postgresql-verification.md.
WITH database_objects AS (
    SELECT
        to_regclass('public.medicines') AS medicines_oid,
        to_regclass('public.users') AS users_oid,
        to_regclass('public.barangay_health_centers') AS bhc_oid,
        to_regclass('public.rural_health_units') AS rhu_oid,
        to_regclass('public.health_records') AS health_records_oid,
        to_regclass('public.medicine_inventory_transactions') AS ledger_oid,
        to_regclass('public.medicine_inventory_transactions_id_seq') AS ledger_sequence_oid
)
SELECT
    current_user AS current_database_user,
    CASE
        WHEN medicines_oid IS NULL THEN 'SKIPPED: medicines table is absent.'
        WHEN has_table_privilege(current_user, medicines_oid, 'SELECT, UPDATE')
            THEN 'PASS: SELECT and UPDATE are available.'
        ELSE 'FAIL: SELECT or UPDATE is missing.'
    END AS runtime_medicines_privileges,
    CASE
        WHEN users_oid IS NULL THEN 'SKIPPED: users table is absent.'
        WHEN has_table_privilege(current_user, users_oid, 'SELECT')
            THEN 'PASS: SELECT is available.'
        ELSE 'FAIL: SELECT is missing.'
    END AS runtime_users_privileges,
    CASE
        WHEN bhc_oid IS NULL THEN 'SKIPPED: barangay_health_centers table is absent.'
        WHEN has_table_privilege(current_user, bhc_oid, 'SELECT')
            THEN 'PASS: SELECT is available.'
        ELSE 'FAIL: SELECT is missing.'
    END AS runtime_bhc_privileges,
    CASE
        WHEN rhu_oid IS NULL THEN 'SKIPPED: rural_health_units table is absent.'
        WHEN has_table_privilege(current_user, rhu_oid, 'SELECT')
            THEN 'PASS: SELECT is available.'
        ELSE 'FAIL: SELECT is missing.'
    END AS runtime_rhu_privileges,
    CASE
        WHEN health_records_oid IS NULL
            THEN 'SKIPPED: health_records table is absent.'
        WHEN has_table_privilege(current_user, health_records_oid, 'SELECT')
            THEN 'PASS: SELECT is available.'
        ELSE 'FAIL: SELECT is missing.'
    END AS runtime_health_records_privileges,
    CASE
        WHEN ledger_oid IS NULL
            THEN 'SKIPPED: Phase 4A migrations pending; ledger table is absent.'
        WHEN has_table_privilege(current_user, ledger_oid, 'SELECT, INSERT')
            THEN 'PASS: SELECT and INSERT are available.'
        ELSE 'FAIL: SELECT or INSERT is missing.'
    END AS runtime_ledger_privileges,
    CASE
        WHEN ledger_sequence_oid IS NULL
            THEN 'SKIPPED: Phase 4A migrations pending; ledger sequence is absent.'
        WHEN has_sequence_privilege(current_user, ledger_sequence_oid, 'USAGE')
            THEN 'PASS: sequence USAGE is available.'
        ELSE 'FAIL: sequence USAGE is missing.'
    END AS runtime_ledger_sequence_privileges
FROM database_objects;
