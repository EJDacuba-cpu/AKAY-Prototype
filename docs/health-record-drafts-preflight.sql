-- AKAY Phase 4C/4C.1 health-record draft migration preflight
-- Read-only. Safe before and after the pending migration.

SELECT current_database() AS database_name, current_user AS database_user;

SELECT
    to_regclass('public.health_record_drafts') AS draft_table,
    CASE
        WHEN to_regclass('public.health_record_drafts') IS NULL
            THEN 'PENDING: draft migration has not been applied.'
        ELSE 'PRESENT: run the catalog verification queries below.'
    END AS migration_state;

SELECT COUNT(*) AS invalid_active_bhw_assignments
FROM public.users AS u
LEFT JOIN public.barangay_health_centers AS b
    ON b.id = u.barangay_health_center_id
WHERE u.role = 'bhw'
  AND u.status = 'active'
  AND (
      u.barangay_health_center_id IS NULL
      OR u.rural_health_unit_id IS NOT NULL
      OR b.id IS NULL
      OR b.status <> 'active'
  );

SELECT COUNT(*) AS patients_with_mixed_facility_assignment
FROM public.patients
WHERE barangay_health_center_id IS NOT NULL
  AND rural_health_unit_id IS NOT NULL;

SELECT
    a.attname AS column_name,
    format_type(a.atttypid, a.atttypmod) AS data_type,
    a.attnotnull AS is_not_null,
    pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_catalog.pg_attribute AS a
LEFT JOIN pg_catalog.pg_attrdef AS d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
WHERE a.attrelid = to_regclass('public.health_record_drafts')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;

SELECT
    c.conname AS constraint_name,
    c.contype AS constraint_type,
    pg_get_constraintdef(c.oid) AS definition
FROM pg_catalog.pg_constraint AS c
WHERE c.conrelid = to_regclass('public.health_record_drafts')
ORDER BY c.conname;

SELECT indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'health_record_drafts'
ORDER BY indexname;

