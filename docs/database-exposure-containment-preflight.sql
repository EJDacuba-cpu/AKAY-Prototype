-- AKAY Phase 1 database exposure containment preflight and verification
--
-- This script is read-only. It creates no objects, reads no application rows,
-- and is safe to run both before and after the Phase 1 migration
-- (2026_07_25_000001_revoke_browser_role_database_access).
--
-- Run it as the Laravel/migration role against the target database.
-- Missing roles and missing objects are reported as SKIPPED rather than
-- raising undefined-object errors.

-- ================================================================
-- SECTION 0 - CONNECTION IDENTITY
-- ================================================================
-- Establishes which role the containment statements will run as, and whether
-- that role can reach the default-privilege entries owned by supabase_admin.
-- Nothing here prints credentials or connection strings.

SELECT
    current_user AS connected_role,
    current_database() AS connected_database,
    (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user)
        AS connected_role_is_superuser,
    (SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user)
        AS connected_role_bypasses_rls,
    CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin'
        ) THEN 'SKIPPED: supabase_admin does not exist.'
        WHEN pg_catalog.pg_has_role(current_user, 'supabase_admin', 'USAGE')
            THEN 'OK: supabase_admin default privileges can be altered.'
        ELSE 'WARNING: supabase_admin default privileges must be fixed manually.'
    END AS supabase_admin_default_privilege_reachability;

-- ================================================================
-- SECTION 1 - PRE-MIGRATION PRIVILEGE SNAPSHOT
-- ================================================================
-- Capture the output of the next three queries BEFORE running the migration
-- and store it with the deployment record. The Phase 1 migration has no
-- automatic down(); this snapshot is the only supported basis for a reviewed,
-- manual, partial rollback.

-- Snapshot: table and view privileges held by the browser-facing grantees.
SELECT
    grantee_name,
    format('%I.%I', ns.nspname, cls.relname) AS qualified_object,
    cls.relkind AS object_kind,
    acl.privilege_type,
    acl.is_grantable
FROM pg_catalog.pg_class AS cls
JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
CROSS JOIN LATERAL aclexplode(
    COALESCE(cls.relacl, acldefault('r', cls.relowner))
) AS acl
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(acl.grantee)
    END
) AS grantee(grantee_name)
WHERE ns.nspname = 'public'
  AND cls.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND grantee_name IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY grantee_name, qualified_object, acl.privilege_type;

-- Snapshot: sequence privileges held by the browser-facing grantees.
SELECT
    grantee_name,
    format('%I.%I', ns.nspname, cls.relname) AS qualified_sequence,
    acl.privilege_type
FROM pg_catalog.pg_class AS cls
JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
CROSS JOIN LATERAL aclexplode(
    COALESCE(cls.relacl, acldefault('s', cls.relowner))
) AS acl
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(acl.grantee)
    END
) AS grantee(grantee_name)
WHERE ns.nspname = 'public'
  AND cls.relkind = 'S'
  AND grantee_name IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY grantee_name, qualified_sequence, acl.privilege_type;

-- Snapshot: akay_* routine privileges held by the browser-facing grantees.
SELECT
    grantee_name,
    format(
        '%I.%I(%s)',
        ns.nspname,
        pro.proname,
        pg_catalog.pg_get_function_identity_arguments(pro.oid)
    ) AS qualified_signature,
    acl.privilege_type
FROM pg_catalog.pg_proc AS pro
JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
CROSS JOIN LATERAL aclexplode(
    COALESCE(pro.proacl, acldefault('f', pro.proowner))
) AS acl
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(acl.grantee)
    END
) AS grantee(grantee_name)
WHERE ns.nspname = 'public'
  AND pro.proname LIKE 'akay\_%'
  AND grantee_name IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY grantee_name, qualified_signature, acl.privilege_type;

-- Snapshot: default privilege entries that grant future objects away.
SELECT
    pg_catalog.pg_get_userbyid(def.defaclrole) AS owning_role,
    COALESCE(ns.nspname, '(all schemas)') AS schema_scope,
    def.defaclobjtype AS object_type,
    grantee_name,
    acl.privilege_type
FROM pg_catalog.pg_default_acl AS def
LEFT JOIN pg_catalog.pg_namespace AS ns ON ns.oid = def.defaclnamespace
CROSS JOIN LATERAL aclexplode(def.defaclacl) AS acl
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(acl.grantee)
    END
) AS grantee(grantee_name)
WHERE grantee_name IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY owning_role, schema_scope, def.defaclobjtype, grantee_name;

-- ================================================================
-- SECTION 2 - BLOCKERS (must be satisfied before migrating)
-- ================================================================

-- BLOCKER: the Laravel/migration role must own the public objects it is about
-- to revoke on. An owner's implicit privileges survive REVOKE, which is why
-- this migration cannot lock the application out. If this returns a non-zero
-- count, the migration may revoke privileges the application actually relies
-- on and must not be run until Phase 2 role separation is designed.
SELECT COUNT(*) AS blocker_public_objects_not_owned_by_current_role
FROM pg_catalog.pg_class AS cls
JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
WHERE ns.nspname = 'public'
  AND cls.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  AND cls.relpersistence <> 't'
  AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend AS dep
      WHERE dep.classid = 'pg_catalog.pg_class'::regclass
        AND dep.objid = cls.oid
        AND dep.deptype = 'e'
  )
  AND NOT pg_catalog.pg_has_role(current_user, cls.relowner, 'USAGE');

-- BLOCKER: every akay_* routine must likewise be owned by (a role granted to)
-- the connected role.
SELECT COUNT(*) AS blocker_akay_routines_not_owned_by_current_role
FROM pg_catalog.pg_proc AS pro
JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
WHERE ns.nspname = 'public'
  AND pro.proname LIKE 'akay\_%'
  AND NOT pg_catalog.pg_has_role(current_user, pro.proowner, 'USAGE');

-- BLOCKER: every role that owns an unsafe default-privilege entry must be one
-- the connected role can act as. Owners are enumerated from pg_default_acl, so
-- an unsafe entry owned by a third role is reported here too, not just the
-- postgres and supabase_admin entries Supabase installs.
-- This mirrors stage 1 of the migration: any row returned means the migration
-- will abort with AKAY_CONTAINMENT_PRECONDITION_FAILED before changing
-- anything.
SELECT DISTINCT
    pg_catalog.pg_get_userbyid(def.defaclrole) AS blocking_owner,
    COALESCE(ns.nspname, '(all schemas)') AS schema_scope,
    def.defaclobjtype AS object_type,
    'BLOCKER: unsafe default privileges owned by a role the connected role '
        'cannot act as.' AS blocker_default_privilege_owner
FROM pg_catalog.pg_default_acl AS def
LEFT JOIN pg_catalog.pg_namespace AS ns ON ns.oid = def.defaclnamespace
CROSS JOIN LATERAL aclexplode(def.defaclacl) AS acl
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(acl.grantee)
    END
) AS grantee(grantee_name)
WHERE (
        (grantee_name IN ('anon', 'authenticated')
            AND def.defaclobjtype IN ('r', 'S', 'f', 'n'))
        OR (grantee_name = 'PUBLIC' AND def.defaclobjtype IN ('r', 'S', 'f'))
    )
  AND NOT pg_catalog.pg_has_role(current_user, def.defaclrole, 'MEMBER')
ORDER BY blocking_owner, schema_scope, object_type;

-- BLOCKER: postgres and supabase_admin create objects in public, and the
-- built-in default grants EXECUTE on new functions to PUBLIC even when
-- pg_default_acl holds no row at all. If either role is relevant here and the
-- connected role cannot act as it, containment cannot be completed and the
-- migration will abort. See "Precondition failures" in the phase document for
-- the remediation.
SELECT
    rol.rolname AS blocking_owner,
    'BLOCKER: this role creates objects in public but the connected role is '
        'not a member of it.' AS blocker_required_default_privilege_role
FROM pg_catalog.pg_roles AS rol
WHERE rol.rolname IN ('postgres', 'supabase_admin')
  AND NOT pg_catalog.pg_has_role(current_user, rol.oid, 'MEMBER')
  AND (
      EXISTS (
          SELECT 1
          FROM pg_catalog.pg_class AS cls
          JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
          WHERE ns.nspname = 'public' AND cls.relowner = rol.oid
      )
      OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_proc AS pro
          JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
          WHERE ns.nspname = 'public' AND pro.proowner = rol.oid
      )
      OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_default_acl AS def
          CROSS JOIN LATERAL aclexplode(def.defaclacl) AS acl
          WHERE def.defaclrole = rol.oid
            AND (
                (pg_catalog.pg_get_userbyid(acl.grantee) IN ('anon', 'authenticated')
                    AND def.defaclobjtype IN ('r', 'S', 'f', 'n'))
                OR (acl.grantee = 0 AND def.defaclobjtype IN ('r', 'S', 'f'))
            )
      )
  )
ORDER BY blocking_owner;

-- INFORMATIONAL ONLY: how much exposure the migration will remove. A large
-- number here is expected on an untouched Supabase project.
SELECT
    (SELECT COUNT(*)
     FROM pg_catalog.pg_class AS cls
     JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
     WHERE ns.nspname = 'public'
       AND cls.relkind IN ('r', 'p', 'v', 'm', 'f')) AS public_tables_and_views,
    (SELECT COUNT(*)
     FROM pg_catalog.pg_class AS cls
     JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
     WHERE ns.nspname = 'public'
       AND cls.relkind = 'S') AS public_sequences,
    (SELECT COUNT(*)
     FROM pg_catalog.pg_proc AS pro
     JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
     WHERE ns.nspname = 'public'
       AND pro.proname LIKE 'akay\_%') AS akay_routines;

-- ================================================================
-- SECTION 3 - POST-MIGRATION VERIFICATION
-- ================================================================
-- Every check below must report PASS or SKIPPED. Any FAIL means containment
-- is incomplete and the deployment must not be treated as hardened.

-- No browser-facing grantee may hold any privilege on any public relation.
SELECT
    grantee_name,
    COUNT(*) AS remaining_table_privileges,
    CASE
        WHEN COUNT(*) = 0 THEN 'PASS: no table privileges remain.'
        ELSE 'FAIL: table privileges remain.'
    END AS table_privilege_status
FROM pg_catalog.pg_class AS cls
JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
CROSS JOIN LATERAL aclexplode(
    COALESCE(cls.relacl, acldefault('r', cls.relowner))
) AS acl
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(acl.grantee)
    END
) AS grantee(grantee_name)
WHERE ns.nspname = 'public'
  AND cls.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND grantee_name IN ('PUBLIC', 'anon', 'authenticated')
GROUP BY grantee_name
ORDER BY grantee_name;

-- Explicit read and write denial per role, expressed as the question an
-- attacker would actually ask: "can this role select from, or write to, the
-- clinical tables?". Missing roles and tables are reported as SKIPPED.
WITH browser_roles(role_name) AS (
    VALUES ('anon'), ('authenticated')
), protected_tables(table_name) AS (
    VALUES
        ('public.users'),
        ('public.patients'),
        ('public.health_records'),
        ('public.health_record_drafts'),
        ('public.health_record_medicines'),
        ('public.referrals'),
        ('public.referral_updates'),
        ('public.feedback'),
        ('public.follow_up_tasks'),
        ('public.notifications'),
        ('public.audit_logs'),
        ('public.medicines'),
        ('public.medicine_inventory_transactions'),
        ('public.password_reset_requests'),
        ('public.password_reset_tokens'),
        ('public.personal_access_tokens'),
        ('public.sessions'),
        ('public.barangay_health_centers'),
        ('public.rural_health_units'),
        ('public.rhu_patient_volumes')
), resolved AS (
    SELECT
        browser_roles.role_name,
        protected_tables.table_name,
        database_role.oid AS role_oid,
        to_regclass(protected_tables.table_name) AS table_oid
    FROM browser_roles
    CROSS JOIN protected_tables
    LEFT JOIN pg_catalog.pg_roles AS database_role
        ON database_role.rolname = browser_roles.role_name
)
SELECT
    role_name,
    table_name,
    CASE
        WHEN role_oid IS NULL THEN 'SKIPPED: role does not exist.'
        WHEN table_oid IS NULL THEN 'SKIPPED: table does not exist.'
        WHEN has_table_privilege(role_oid, table_oid, 'SELECT')
            THEN 'FAIL: role can read this table.'
        ELSE 'PASS: read is denied.'
    END AS read_status,
    CASE
        WHEN role_oid IS NULL THEN 'SKIPPED: role does not exist.'
        WHEN table_oid IS NULL THEN 'SKIPPED: table does not exist.'
        WHEN has_table_privilege(
            role_oid, table_oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
        ) THEN 'FAIL: role can modify this table or its structure.'
        ELSE 'PASS: write is denied.'
    END AS write_status
FROM resolved
ORDER BY role_name, table_name;

-- Column-level privileges live in pg_attribute.attacl, separately from the
-- table ACL. REVOKE ALL ON TABLE removes matching column grants, and this
-- proves it did. Any row returned is a FAIL.
SELECT
    grantee_name,
    format('%I.%I', ns.nspname, cls.relname) AS qualified_object,
    att.attname AS column_name,
    acl.privilege_type,
    'FAIL: a column-level privilege remains.' AS column_privilege_status
FROM pg_catalog.pg_attribute AS att
JOIN pg_catalog.pg_class AS cls ON cls.oid = att.attrelid
JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
CROSS JOIN LATERAL aclexplode(att.attacl) AS acl
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(acl.grantee)
    END
) AS grantee(grantee_name)
WHERE ns.nspname = 'public'
  AND att.attacl IS NOT NULL
  AND grantee_name IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY grantee_name, qualified_object, column_name, acl.privilege_type;

-- Effective privilege, including anything inherited through role membership.
-- has_any_column_privilege catches a role that can still read one column of a
-- table it has no table-level privilege on. A role that reaches a table only
-- by being a member of some third role is caught here and nowhere else: the
-- raw ACL queries above would report nothing.
WITH browser_roles(role_name) AS (
    VALUES ('anon'), ('authenticated')
)
SELECT
    browser_roles.role_name,
    format('%I.%I', ns.nspname, cls.relname) AS qualified_object,
    'FAIL: effective access remains, possibly inherited from another role.'
        AS effective_privilege_status,
    (
        SELECT string_agg(member_of.rolname, ', ' ORDER BY member_of.rolname)
        FROM pg_catalog.pg_auth_members AS am
        JOIN pg_catalog.pg_roles AS member_of ON member_of.oid = am.roleid
        WHERE am.member = database_role.oid
    ) AS role_is_member_of
FROM browser_roles
JOIN pg_catalog.pg_roles AS database_role
    ON database_role.rolname = browser_roles.role_name
CROSS JOIN pg_catalog.pg_class AS cls
JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
WHERE ns.nspname = 'public'
  AND cls.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND cls.relpersistence <> 't'
  AND (
      has_table_privilege(
          database_role.oid, cls.oid,
          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
      )
      OR has_any_column_privilege(
          database_role.oid, cls.oid, 'SELECT, INSERT, UPDATE, REFERENCES'
      )
  )
ORDER BY browser_roles.role_name, qualified_object;

-- No browser-facing grantee may execute any akay_* routine, legacy or current.
WITH browser_grantees(grantee_name) AS (
    VALUES ('PUBLIC'), ('anon'), ('authenticated')
), routines AS (
    SELECT
        pro.oid AS routine_oid,
        format(
            '%I.%I(%s)',
            ns.nspname,
            pro.proname,
            pg_catalog.pg_get_function_identity_arguments(pro.oid)
        ) AS qualified_signature
    FROM pg_catalog.pg_proc AS pro
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
    WHERE ns.nspname = 'public'
      AND pro.proname LIKE 'akay\_%'
)
SELECT
    browser_grantees.grantee_name,
    routines.qualified_signature,
    CASE
        WHEN browser_grantees.grantee_name <> 'PUBLIC'
             AND database_role.oid IS NULL
            THEN 'SKIPPED: role does not exist.'
        WHEN browser_grantees.grantee_name = 'PUBLIC' THEN
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_proc AS pro
                    CROSS JOIN LATERAL aclexplode(
                        COALESCE(pro.proacl, acldefault('f', pro.proowner))
                    ) AS acl
                    WHERE pro.oid = routines.routine_oid
                      AND acl.grantee = 0
                      AND acl.privilege_type = 'EXECUTE'
                ) THEN 'FAIL: EXECUTE is available.'
                ELSE 'PASS: EXECUTE is revoked.'
            END
        WHEN has_function_privilege(
            database_role.oid, routines.routine_oid, 'EXECUTE'
        ) THEN 'FAIL: EXECUTE is available.'
        ELSE 'PASS: EXECUTE is revoked.'
    END AS execute_status
FROM browser_grantees
CROSS JOIN routines
LEFT JOIN pg_catalog.pg_roles AS database_role
    ON database_role.rolname = browser_grantees.grantee_name
ORDER BY browser_grantees.grantee_name, routines.qualified_signature;

-- Future objects must not inherit access. Two checks are needed.
--
-- (a) Stored entries, at any scope, owned by anyone. Any row is a FAIL.
SELECT
    pg_catalog.pg_get_userbyid(def.defaclrole) AS owning_role,
    COALESCE(ns.nspname, '(all schemas)') AS schema_scope,
    def.defaclobjtype AS object_type,
    grantee_name,
    acl.privilege_type,
    'FAIL: future objects are granted to a browser-facing grantee.'
        AS stored_default_privilege_status
FROM pg_catalog.pg_default_acl AS def
LEFT JOIN pg_catalog.pg_namespace AS ns ON ns.oid = def.defaclnamespace
CROSS JOIN LATERAL aclexplode(def.defaclacl) AS acl
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(acl.grantee)
    END
) AS grantee(grantee_name)
WHERE (grantee_name IN ('anon', 'authenticated')
        AND def.defaclobjtype IN ('r', 'S', 'f', 'n'))
   OR (grantee_name = 'PUBLIC' AND def.defaclobjtype IN ('r', 'S', 'f'))
ORDER BY owning_role, schema_scope, def.defaclobjtype, grantee_name;

-- (b) Effective defaults for the roles that create objects in public.
-- pg_default_acl holds no row until a default is modified, so the built-in
-- default - which grants EXECUTE on new functions to PUBLIC - is invisible to
-- query (a). Resolving against acldefault() catches it. Any row is a FAIL.
WITH owners AS (
    SELECT rol.oid AS role_oid, rol.rolname, t.objtype
    FROM pg_catalog.pg_roles AS rol
    CROSS JOIN (VALUES ('r'), ('S'), ('f')) AS t(objtype)
    WHERE rol.rolname IN ('postgres', 'supabase_admin')
), resolved AS (
    SELECT
        owners.rolname,
        owners.objtype,
        COALESCE(
            (SELECT def.defaclacl
             FROM pg_catalog.pg_default_acl AS def
             JOIN pg_catalog.pg_namespace AS ns ON ns.oid = def.defaclnamespace
             WHERE def.defaclrole = owners.role_oid
               AND def.defaclobjtype = owners.objtype
               AND ns.nspname = 'public'),
            acldefault(owners.objtype, owners.role_oid)
        ) AS effective_acl
    FROM owners
)
SELECT
    resolved.rolname AS owning_role,
    resolved.objtype AS object_type,
    grantee_name,
    acl.privilege_type,
    'FAIL: the effective default still grants future objects away.'
        AS effective_default_privilege_status
FROM resolved
CROSS JOIN LATERAL aclexplode(resolved.effective_acl) AS acl
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(acl.grantee)
    END
) AS grantee(grantee_name)
WHERE (grantee_name IN ('anon', 'authenticated')
        AND resolved.objtype IN ('r', 'S', 'f'))
   OR (grantee_name = 'PUBLIC' AND resolved.objtype IN ('r', 'S', 'f'))
ORDER BY owning_role, object_type, grantee_name;

-- The Laravel connection must still be able to run the application. These are
-- the exact objects the API touches on a normal request path.
WITH runtime_objects(object_name, required_privileges) AS (
    VALUES
        ('public.users', 'SELECT, INSERT, UPDATE'),
        ('public.patients', 'SELECT, INSERT, UPDATE'),
        ('public.health_records', 'SELECT, INSERT, UPDATE'),
        ('public.referrals', 'SELECT, INSERT, UPDATE'),
        ('public.referral_updates', 'SELECT, INSERT'),
        ('public.notifications', 'SELECT, INSERT, UPDATE'),
        ('public.audit_logs', 'SELECT, INSERT'),
        ('public.medicines', 'SELECT, INSERT, UPDATE'),
        ('public.medicine_inventory_transactions', 'SELECT, INSERT'),
        ('public.personal_access_tokens', 'SELECT, INSERT, UPDATE, DELETE')
)
SELECT
    object_name,
    required_privileges,
    CASE
        WHEN to_regclass(object_name) IS NULL
            THEN 'SKIPPED: table does not exist.'
        WHEN has_table_privilege(current_user, to_regclass(object_name), required_privileges)
            THEN 'PASS: the connected role retains the required privileges.'
        ELSE 'FAIL: the connected role lost a required privilege.'
    END AS runtime_privilege_status
FROM runtime_objects
ORDER BY object_name;

-- The Laravel connection must still be able to execute the stored functions
-- the API actually calls.
WITH called_routines(routine_signature) AS (
    VALUES
        ('public.akay_patient_list(text,bigint,bigint,text,text,text,text,integer,integer)'),
        ('public.akay_patient_details(bigint,text,bigint,bigint)'),
        ('public.akay_health_record_list(text,bigint,bigint,bigint,text,integer,integer)'),
        ('public.akay_health_record_details(bigint,text,bigint,bigint)'),
        ('public.akay_referral_list(text,bigint,bigint,text,text,text,bigint,text,integer,integer)'),
        ('public.akay_referral_details(bigint,text,bigint,bigint)'),
        ('public.akay_referral_report(text,bigint,bigint)'),
        ('public.akay_inventory_opening_balance(bigint,bigint,text,bigint,integer,text)'),
        ('public.akay_inventory_restock(bigint,bigint,text,bigint,integer,text,text)'),
        ('public.akay_inventory_adjust(bigint,bigint,text,bigint,text,text,integer,text,text)'),
        ('public.akay_inventory_dispense_batch(bigint,text,bigint,text,bigint,text,jsonb)')
)
SELECT
    routine_signature,
    CASE
        WHEN to_regprocedure(routine_signature) IS NULL
            THEN 'SKIPPED: routine does not exist.'
        WHEN has_function_privilege(
            current_user, to_regprocedure(routine_signature), 'EXECUTE'
        ) THEN 'PASS: the connected role can still execute this routine.'
        ELSE 'FAIL: the connected role lost EXECUTE.'
    END AS runtime_execute_status
FROM called_routines
ORDER BY routine_signature;

-- ================================================================
-- SECTION 4 - RESIDUAL EXPOSURE (reported, not changed by Phase 1)
-- ================================================================
-- Phase 1 deliberately leaves these alone. They are recorded so the remaining
-- risk is explicit and can be decided on separately.

-- service_role retains its privileges. The Supabase service key is a
-- server-side secret that AKAY does not use; if it leaks, it still reaches
-- every table. Revoking it is a separate, approved change.
SELECT
    COUNT(*) AS service_role_table_privileges_remaining,
    CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role'
        ) THEN 'SKIPPED: service_role does not exist.'
        WHEN COUNT(*) = 0 THEN 'INFORMATIONAL: service_role holds no table privileges.'
        ELSE 'INFORMATIONAL: service_role still reaches these tables by design in Phase 1.'
    END AS service_role_status
FROM pg_catalog.pg_class AS cls
JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
CROSS JOIN LATERAL aclexplode(
    COALESCE(cls.relacl, acldefault('r', cls.relowner))
) AS acl
WHERE ns.nspname = 'public'
  AND cls.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND acl.grantee <> 0
  AND pg_catalog.pg_get_userbyid(acl.grantee) = 'service_role';

-- The Phase 4A inventory hardening must be untouched by Phase 1: every
-- inventory function stays SECURITY INVOKER with a pinned search_path, and the
-- append-only ledger trigger stays enabled.
SELECT
    pro.proname AS inventory_function,
    pg_catalog.pg_get_function_identity_arguments(pro.oid) AS arguments,
    CASE
        WHEN pro.prosecdef THEN 'FAIL: function became SECURITY DEFINER.'
        ELSE 'PASS: function is still SECURITY INVOKER.'
    END AS security_mode_status,
    CASE
        WHEN pro.proconfig IS NULL THEN 'FAIL: search_path is no longer pinned.'
        ELSE 'PASS: search_path is still pinned.'
    END AS search_path_status,
    CASE
        WHEN has_function_privilege(current_user, pro.oid, 'EXECUTE')
            THEN 'PASS: the connected role can still execute it.'
        ELSE 'FAIL: the connected role lost EXECUTE.'
    END AS runtime_execute_status
FROM pg_catalog.pg_proc AS pro
JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
WHERE ns.nspname = 'public'
  AND pro.proname LIKE 'akay\_inventory\_%'
ORDER BY pro.proname, arguments;

SELECT
    CASE
        WHEN to_regclass('public.medicine_inventory_transactions') IS NULL
            THEN 'SKIPPED: ledger table is absent.'
        WHEN EXISTS (
            SELECT 1
            FROM pg_catalog.pg_trigger AS tg
            WHERE tg.tgrelid = to_regclass('public.medicine_inventory_transactions')
              AND tg.tgname = 'medicine_inventory_transactions_append_only'
              AND NOT tg.tgisinternal
              AND tg.tgenabled <> 'D'
        ) THEN 'PASS: append-only ledger trigger is still enabled.'
        ELSE 'FAIL: append-only ledger trigger is absent or disabled.'
    END AS inventory_ledger_trigger_status;

-- USAGE on schema public is not revoked in Phase 1. While it remains, a
-- browser-facing role can still resolve object names even though every
-- privilege on those objects is denied.
SELECT
    role_name,
    CASE
        WHEN database_role.oid IS NULL THEN 'SKIPPED: role does not exist.'
        WHEN has_schema_privilege(database_role.oid, 'public', 'USAGE')
            THEN 'INFORMATIONAL: schema USAGE is still granted (see Phase 1 doc).'
        ELSE 'INFORMATIONAL: schema USAGE is already revoked.'
    END AS schema_usage_status
FROM (VALUES ('anon'), ('authenticated')) AS browser_roles(role_name)
LEFT JOIN pg_catalog.pg_roles AS database_role
    ON database_role.rolname = browser_roles.role_name
ORDER BY role_name;
