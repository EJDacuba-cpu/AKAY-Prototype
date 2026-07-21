<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const FUNCTIONS = [
        'akay_inventory_actor_has_facility(bigint,text,bigint)',
        'akay_inventory_opening_balance(bigint,bigint,text,bigint,integer,text)',
        'akay_inventory_restock(bigint,bigint,text,bigint,integer,text,text)',
        'akay_inventory_adjust(bigint,bigint,text,bigint,text,text,integer,text,text)',
        'akay_inventory_dispense_batch(bigint,text,bigint,text,bigint,text,jsonb)',
    ];

    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared($this->functionSql());
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION public.akay_inventory_ledger_append_only()
            RETURNS trigger
            LANGUAGE plpgsql
            SECURITY INVOKER
            SET search_path = pg_catalog, public
            AS $function$
            BEGIN
                RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_LEDGER_APPEND_ONLY';
            END;
            $function$;

            CREATE TRIGGER medicine_inventory_transactions_append_only
            BEFORE UPDATE OR DELETE ON public.medicine_inventory_transactions
            FOR EACH ROW EXECUTE FUNCTION public.akay_inventory_ledger_append_only();
        SQL);

        foreach (self::FUNCTIONS as $signature) {
            DB::statement("REVOKE ALL ON FUNCTION public.{$signature} FROM PUBLIC");
        }
        DB::statement(
            'REVOKE ALL ON FUNCTION public.akay_inventory_ledger_append_only() FROM PUBLIC'
        );

        DB::unprepared($this->browserRoleRevocationsSql());
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(
            'DROP TRIGGER IF EXISTS medicine_inventory_transactions_append_only ON public.medicine_inventory_transactions'
        );
        DB::statement('DROP FUNCTION IF EXISTS public.akay_inventory_ledger_append_only()');

        foreach (array_reverse(self::FUNCTIONS) as $signature) {
            DB::statement("DROP FUNCTION IF EXISTS public.{$signature}");
        }
    }

    private function functionSql(): string
    {
        return <<<'SQL'
CREATE OR REPLACE FUNCTION public.akay_inventory_actor_has_facility(
    p_actor_user_id bigint,
    p_facility_type text,
    p_facility_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
    SELECT CASE
        WHEN p_facility_type = 'bhc' THEN EXISTS (
            SELECT 1
            FROM public.users AS u
            JOIN public.barangay_health_centers AS bhc
              ON bhc.id = u.barangay_health_center_id
            WHERE u.id = p_actor_user_id
              AND u.role = 'bhw'
              AND u.status = 'active'
              AND u.rural_health_unit_id IS NULL
              AND bhc.id = p_facility_id
              AND bhc.status = 'active'
        )
        WHEN p_facility_type = 'rhu' THEN EXISTS (
            SELECT 1
            FROM public.users AS u
            JOIN public.rural_health_units AS rhu
              ON rhu.id = u.rural_health_unit_id
            WHERE u.id = p_actor_user_id
              AND u.role = 'rhu_staff'
              AND u.status = 'active'
              AND u.barangay_health_center_id IS NULL
              AND rhu.id = p_facility_id
              AND rhu.status = 'active'
        )
        ELSE false
    END
$function$;

CREATE OR REPLACE FUNCTION public.akay_inventory_opening_balance(
    p_medicine_id bigint,
    p_actor_user_id bigint,
    p_facility_type text,
    p_facility_id bigint,
    p_quantity integer,
    p_operation_key text
)
RETURNS TABLE (
    inventory_transaction_id bigint,
    result_medicine_id bigint,
    quantity_before bigint,
    quantity_after bigint,
    quantity_delta bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_medicine public.medicines%ROWTYPE;
    v_transaction_id bigint;
BEGIN
    IF p_actor_user_id IS NULL OR p_actor_user_id <= 0
        OR p_facility_id IS NULL OR p_facility_id <= 0
        OR p_facility_type NOT IN ('bhc', 'rhu')
        OR p_quantity IS NULL OR p_quantity <= 0
        OR p_operation_key IS NULL OR btrim(p_operation_key) = '' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
    END IF;

    IF NOT public.akay_inventory_actor_has_facility(
        p_actor_user_id, p_facility_type, p_facility_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
    END IF;

    SELECT m.* INTO v_medicine
    FROM public.medicines AS m
    WHERE m.id = p_medicine_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
    END IF;

    IF (p_facility_type = 'bhc' AND (
            v_medicine.barangay_health_center_id IS DISTINCT FROM p_facility_id
            OR v_medicine.rural_health_unit_id IS NOT NULL
        )) OR (p_facility_type = 'rhu' AND (
            v_medicine.rural_health_unit_id IS DISTINCT FROM p_facility_id
            OR v_medicine.barangay_health_center_id IS NOT NULL
        )) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.medicine_inventory_transactions AS mit
        WHERE mit.operation_key = p_operation_key
          AND mit.medicine_id = p_medicine_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_OPERATION_ALREADY_APPLIED';
    END IF;

    IF NOT v_medicine.is_active
        OR v_medicine.expiration_date < CURRENT_DATE THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_NOT_DISPENSABLE';
    END IF;

    IF v_medicine.quantity <> 0 OR p_quantity > 2147483647 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_CONFLICT';
    END IF;

    UPDATE public.medicines AS m
    SET quantity = p_quantity,
        availability_status = CASE
            WHEN p_quantity <= COALESCE(m.low_stock_threshold, 10) THEN 'Low Stock'
            ELSE 'Available'
        END,
        updated_by = p_actor_user_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE m.id = p_medicine_id;

    INSERT INTO public.medicine_inventory_transactions (
        medicine_id, actor_user_id, transaction_type, quantity_delta,
        quantity_before, quantity_after, source_type, source_id,
        reason, operation_key, created_at
    ) VALUES (
        p_medicine_id, p_actor_user_id, 'opening_balance', p_quantity,
        0, p_quantity, 'opening_balance', p_medicine_id,
        NULL, p_operation_key, CURRENT_TIMESTAMP
    ) RETURNING id INTO v_transaction_id;

    RETURN QUERY SELECT v_transaction_id, p_medicine_id, 0::bigint,
        p_quantity::bigint, p_quantity::bigint;
END;
$function$;

CREATE OR REPLACE FUNCTION public.akay_inventory_restock(
    p_medicine_id bigint,
    p_actor_user_id bigint,
    p_facility_type text,
    p_facility_id bigint,
    p_quantity integer,
    p_reason text,
    p_operation_key text
)
RETURNS TABLE (
    inventory_transaction_id bigint,
    result_medicine_id bigint,
    quantity_before bigint,
    quantity_after bigint,
    quantity_delta bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_medicine public.medicines%ROWTYPE;
    v_after bigint;
    v_transaction_id bigint;
BEGIN
    IF p_actor_user_id IS NULL OR p_actor_user_id <= 0
        OR p_facility_id IS NULL OR p_facility_id <= 0
        OR p_facility_type NOT IN ('bhc', 'rhu')
        OR p_quantity IS NULL OR p_quantity <= 0
        OR p_reason IS NULL OR btrim(p_reason) = ''
        OR p_operation_key IS NULL OR btrim(p_operation_key) = '' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
    END IF;

    IF NOT public.akay_inventory_actor_has_facility(
        p_actor_user_id, p_facility_type, p_facility_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
    END IF;

    SELECT m.* INTO v_medicine
    FROM public.medicines AS m
    WHERE m.id = p_medicine_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
    END IF;

    IF (p_facility_type = 'bhc' AND (
            v_medicine.barangay_health_center_id IS DISTINCT FROM p_facility_id
            OR v_medicine.rural_health_unit_id IS NOT NULL
        )) OR (p_facility_type = 'rhu' AND (
            v_medicine.rural_health_unit_id IS DISTINCT FROM p_facility_id
            OR v_medicine.barangay_health_center_id IS NOT NULL
        )) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.medicine_inventory_transactions AS mit
        WHERE mit.operation_key = p_operation_key AND mit.medicine_id = p_medicine_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_OPERATION_ALREADY_APPLIED';
    END IF;

    IF NOT v_medicine.is_active OR v_medicine.expiration_date < CURRENT_DATE THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_NOT_DISPENSABLE';
    END IF;

    v_after := v_medicine.quantity::bigint + p_quantity::bigint;
    IF v_after > 2147483647 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_CONFLICT';
    END IF;

    UPDATE public.medicines AS m
    SET quantity = v_after,
        availability_status = CASE
            WHEN v_after <= 0 THEN 'Unavailable'
            WHEN v_after <= COALESCE(m.low_stock_threshold, 10) THEN 'Low Stock'
            ELSE 'Available'
        END,
        updated_by = p_actor_user_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE m.id = p_medicine_id;

    INSERT INTO public.medicine_inventory_transactions (
        medicine_id, actor_user_id, transaction_type, quantity_delta,
        quantity_before, quantity_after, source_type, source_id,
        reason, operation_key, created_at
    ) VALUES (
        p_medicine_id, p_actor_user_id, 'restock', p_quantity,
        v_medicine.quantity, v_after, 'manual_restock', p_medicine_id,
        btrim(p_reason), p_operation_key, CURRENT_TIMESTAMP
    ) RETURNING id INTO v_transaction_id;

    RETURN QUERY SELECT v_transaction_id, p_medicine_id,
        v_medicine.quantity::bigint, v_after, p_quantity::bigint;
END;
$function$;

CREATE OR REPLACE FUNCTION public.akay_inventory_adjust(
    p_medicine_id bigint,
    p_actor_user_id bigint,
    p_facility_type text,
    p_facility_id bigint,
    p_action text,
    p_direction text,
    p_quantity integer,
    p_reason text,
    p_operation_key text
)
RETURNS TABLE (
    inventory_transaction_id bigint,
    result_medicine_id bigint,
    quantity_before bigint,
    quantity_after bigint,
    quantity_delta bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_medicine public.medicines%ROWTYPE;
    v_delta bigint;
    v_after bigint;
    v_source_type text;
    v_transaction_id bigint;
BEGIN
    IF p_actor_user_id IS NULL OR p_actor_user_id <= 0
        OR p_facility_id IS NULL OR p_facility_id <= 0
        OR p_facility_type NOT IN ('bhc', 'rhu')
        OR p_action NOT IN (
            'adjustment_in', 'adjustment_out', 'damaged_disposal',
            'expired_disposal', 'correction'
        )
        OR p_quantity IS NULL OR p_quantity <= 0
        OR p_reason IS NULL OR btrim(p_reason) = ''
        OR p_operation_key IS NULL OR btrim(p_operation_key) = ''
        OR (p_action = 'correction' AND COALESCE(p_direction, '') NOT IN ('in', 'out'))
        OR (p_action <> 'correction' AND btrim(COALESCE(p_direction, '')) <> '') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
    END IF;

    IF NOT public.akay_inventory_actor_has_facility(
        p_actor_user_id, p_facility_type, p_facility_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
    END IF;

    SELECT m.* INTO v_medicine
    FROM public.medicines AS m
    WHERE m.id = p_medicine_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
    END IF;

    IF (p_facility_type = 'bhc' AND (
            v_medicine.barangay_health_center_id IS DISTINCT FROM p_facility_id
            OR v_medicine.rural_health_unit_id IS NOT NULL
        )) OR (p_facility_type = 'rhu' AND (
            v_medicine.rural_health_unit_id IS DISTINCT FROM p_facility_id
            OR v_medicine.barangay_health_center_id IS NOT NULL
        )) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.medicine_inventory_transactions AS mit
        WHERE mit.operation_key = p_operation_key AND mit.medicine_id = p_medicine_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_OPERATION_ALREADY_APPLIED';
    END IF;

    IF NOT v_medicine.is_active AND p_action IN ('adjustment_in', 'correction') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_NOT_DISPENSABLE';
    END IF;

    IF p_action = 'expired_disposal'
        AND (v_medicine.expiration_date IS NULL OR v_medicine.expiration_date >= CURRENT_DATE) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
    END IF;

    v_delta := CASE
        WHEN p_action = 'adjustment_in' THEN p_quantity
        WHEN p_action = 'correction' AND p_direction = 'in' THEN p_quantity
        ELSE -p_quantity
    END;
    v_after := v_medicine.quantity::bigint + v_delta;

    IF v_after < 0 OR v_after > 2147483647 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_CONFLICT';
    END IF;

    v_source_type := CASE
        WHEN p_action IN ('damaged_disposal', 'expired_disposal') THEN 'disposal'
        WHEN p_action = 'correction' THEN 'correction'
        ELSE 'manual_adjustment'
    END;

    UPDATE public.medicines AS m
    SET quantity = v_after,
        availability_status = CASE
            WHEN v_after <= 0 THEN 'Unavailable'
            WHEN v_after <= COALESCE(m.low_stock_threshold, 10) THEN 'Low Stock'
            ELSE 'Available'
        END,
        updated_by = p_actor_user_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE m.id = p_medicine_id;

    INSERT INTO public.medicine_inventory_transactions (
        medicine_id, actor_user_id, transaction_type, quantity_delta,
        quantity_before, quantity_after, source_type, source_id,
        reason, operation_key, created_at
    ) VALUES (
        p_medicine_id, p_actor_user_id, p_action, v_delta,
        v_medicine.quantity, v_after, v_source_type, p_medicine_id,
        btrim(p_reason), p_operation_key, CURRENT_TIMESTAMP
    ) RETURNING id INTO v_transaction_id;

    RETURN QUERY SELECT v_transaction_id, p_medicine_id,
        v_medicine.quantity::bigint, v_after, v_delta;
END;
$function$;

CREATE OR REPLACE FUNCTION public.akay_inventory_dispense_batch(
    p_actor_user_id bigint,
    p_facility_type text,
    p_facility_id bigint,
    p_source_type text,
    p_source_id bigint,
    p_operation_key text,
    p_items jsonb
)
RETURNS TABLE (
    inventory_transaction_id bigint,
    result_medicine_id bigint,
    quantity_before bigint,
    quantity_after bigint,
    quantity_delta bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_item record;
    v_medicine public.medicines%ROWTYPE;
    v_after bigint;
    v_transaction_id bigint;
BEGIN
    IF p_actor_user_id IS NULL OR p_actor_user_id <= 0
        OR p_facility_type <> 'bhc'
        OR p_facility_id IS NULL OR p_facility_id <= 0
        OR p_source_type <> 'health_record'
        OR p_source_id IS NULL OR p_source_id <= 0
        OR p_operation_key IS NULL OR btrim(p_operation_key) = ''
        OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
        OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
    END IF;

    IF NOT public.akay_inventory_actor_has_facility(
        p_actor_user_id, p_facility_type, p_facility_id
    ) OR NOT EXISTS (
        SELECT 1
        FROM public.health_records AS hr
        WHERE hr.id = p_source_id
          AND hr.barangay_health_center_id = p_facility_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
    END IF;

    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_items) AS item(value)
        WHERE jsonb_typeof(item.value) <> 'object'
           OR COALESCE(item.value ->> 'medicine_id', '') !~ '^[1-9][0-9]*$'
           OR COALESCE(item.value ->> 'quantity', '') !~ '^[1-9][0-9]*$'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
    END IF;

    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_items) AS item(value)
        WHERE (item.value ->> 'quantity')::numeric > 2147483647
           OR (item.value ->> 'medicine_id')::numeric > 9223372036854775807
    ) OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_items) AS item(value)
        GROUP BY item.value ->> 'medicine_id'
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
    END IF;

    FOR v_item IN
        SELECT (item.value ->> 'medicine_id')::bigint AS medicine_id,
               (item.value ->> 'quantity')::integer AS quantity
        FROM jsonb_array_elements(p_items) AS item(value)
        ORDER BY (item.value ->> 'medicine_id')::bigint
    LOOP
        SELECT m.* INTO v_medicine
        FROM public.medicines AS m
        WHERE m.id = v_item.medicine_id
        FOR UPDATE;

        IF NOT FOUND
            OR v_medicine.barangay_health_center_id IS DISTINCT FROM p_facility_id
            OR v_medicine.rural_health_unit_id IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1 FROM public.medicine_inventory_transactions AS mit
        WHERE mit.operation_key = p_operation_key
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_OPERATION_ALREADY_APPLIED';
    END IF;

    FOR v_item IN
        SELECT (item.value ->> 'medicine_id')::bigint AS medicine_id,
               (item.value ->> 'quantity')::integer AS quantity
        FROM jsonb_array_elements(p_items) AS item(value)
        ORDER BY (item.value ->> 'medicine_id')::bigint
    LOOP
        SELECT m.* INTO v_medicine
        FROM public.medicines AS m
        WHERE m.id = v_item.medicine_id;

        IF NOT v_medicine.is_active
            OR v_medicine.expiration_date < CURRENT_DATE
            OR lower(v_medicine.availability_status) = 'unavailable' THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_NOT_DISPENSABLE';
        END IF;

        IF v_item.quantity > v_medicine.quantity THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INSUFFICIENT_STOCK';
        END IF;
    END LOOP;

    FOR v_item IN
        SELECT (item.value ->> 'medicine_id')::bigint AS medicine_id,
               (item.value ->> 'quantity')::integer AS quantity
        FROM jsonb_array_elements(p_items) AS item(value)
        ORDER BY (item.value ->> 'medicine_id')::bigint
    LOOP
        SELECT m.* INTO v_medicine
        FROM public.medicines AS m
        WHERE m.id = v_item.medicine_id;
        v_after := v_medicine.quantity::bigint - v_item.quantity::bigint;

        UPDATE public.medicines AS m
        SET quantity = v_after,
            availability_status = CASE
                WHEN v_after <= 0 THEN 'Unavailable'
                WHEN v_after <= COALESCE(m.low_stock_threshold, 10) THEN 'Low Stock'
                ELSE 'Available'
            END,
            updated_by = p_actor_user_id,
            updated_at = CURRENT_TIMESTAMP
        WHERE m.id = v_item.medicine_id;

        INSERT INTO public.medicine_inventory_transactions (
            medicine_id, actor_user_id, transaction_type, quantity_delta,
            quantity_before, quantity_after, source_type, source_id,
            reason, operation_key, created_at
        ) VALUES (
            v_item.medicine_id, p_actor_user_id, 'dispense', -v_item.quantity,
            v_medicine.quantity, v_after, p_source_type, p_source_id,
            NULL, p_operation_key, CURRENT_TIMESTAMP
        ) RETURNING id INTO v_transaction_id;

        inventory_transaction_id := v_transaction_id;
        result_medicine_id := v_item.medicine_id;
        quantity_before := v_medicine.quantity;
        quantity_after := v_after;
        quantity_delta := -v_item.quantity;
        RETURN NEXT;
    END LOOP;
END;
$function$;
SQL;
    }

    private function browserRoleRevocationsSql(): string
    {
        return <<<'SQL'
DO $block$
DECLARE
    v_role text;
    v_signature text;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_role) THEN
            FOREACH v_signature IN ARRAY ARRAY[
                'public.akay_inventory_actor_has_facility(bigint,text,bigint)',
                'public.akay_inventory_opening_balance(bigint,bigint,text,bigint,integer,text)',
                'public.akay_inventory_restock(bigint,bigint,text,bigint,integer,text,text)',
                'public.akay_inventory_adjust(bigint,bigint,text,bigint,text,text,integer,text,text)',
                'public.akay_inventory_dispense_batch(bigint,text,bigint,text,bigint,text,jsonb)',
                'public.akay_inventory_ledger_append_only()'
            ]
            LOOP
                EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_signature, v_role);
            END LOOP;
        END IF;
    END LOOP;
END;
$block$;
SQL;
    }
};
