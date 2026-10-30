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