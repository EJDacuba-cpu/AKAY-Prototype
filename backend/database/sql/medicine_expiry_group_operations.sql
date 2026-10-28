-- All writers serialize on the medicine row before resolving or locking groups.
-- Actor permissions remain Laravel's responsibility; the existing assignment-aware
-- helper independently checks trusted actor/facility context at this SQL boundary.
CREATE OR REPLACE FUNCTION public.akay_inventory_group_operation(
    p_medicine_id bigint, p_actor bigint, p_facility_type text, p_facility_id bigint,
    p_action text, p_quantity integer, p_reason text, p_operation_key text, p_options jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $function$
DECLARE
    m public.medicines%ROWTYPE;
    g public.medicine_expiry_groups%ROWTYPE;
    entry jsonb;
    changes jsonb := '[]'::jsonb;
    current_groups jsonb;
    expected_groups jsonb;
    new_available bigint;
    new_quarantined bigint;
    unassigned bigint;
    after_quantity bigint;
    delta bigint := 0;
    discrepancy_value integer := 0;
    transaction_id bigint;
    remaining integer;
    take_quantity integer;
    expiry date;
    no_expiry boolean;
    type_value text := p_action;
    source_value text := 'manual_adjustment';
    source_id_value bigint := p_medicine_id;
    today date;
BEGIN
    IF p_actor IS NULL OR p_actor <= 0 OR p_facility_id IS NULL OR p_facility_id <= 0
       OR p_facility_type IS NULL OR p_facility_type NOT IN ('bhc','rhu')
       OR p_action IS NULL OR p_action NOT IN ('opening_balance','restock','deduct','adjustment_in','adjustment_out','damaged_disposal','expired_disposal','correction','quarantine','release','quarantine_disposal','verify_stock','physical_count','dispense')
       OR p_quantity IS NULL OR p_quantity < 0 OR (p_quantity = 0 AND p_action NOT IN ('verify_stock','physical_count'))
       OR p_operation_key IS NULL OR btrim(p_operation_key) = '' OR length(p_operation_key) > 120
       OR p_options IS NULL OR jsonb_typeof(p_options) <> 'object'
       OR (p_action NOT IN ('opening_balance','dispense') AND btrim(COALESCE(p_reason,'')) = '') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
    END IF;
    IF NOT public.akay_inventory_actor_has_facility(p_actor,p_facility_type,p_facility_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
    END IF;
    SELECT * INTO m FROM public.medicines WHERE id = p_medicine_id FOR UPDATE;
    IF NOT FOUND OR (p_facility_type = 'bhc' AND (m.barangay_health_center_id IS DISTINCT FROM p_facility_id OR m.rural_health_unit_id IS NOT NULL))
       OR (p_facility_type = 'rhu' AND (m.rural_health_unit_id IS DISTINCT FROM p_facility_id OR m.barangay_health_center_id IS NOT NULL)) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
    END IF;
    IF EXISTS (SELECT 1 FROM public.medicine_inventory_transactions t WHERE t.medicine_id = p_medicine_id AND t.operation_key = p_operation_key) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_OPERATION_ALREADY_APPLIED';
    END IF;
    IF NOT m.is_active AND (p_action IN ('opening_balance','restock','dispense','adjustment_in','release') OR (p_action = 'correction' AND p_options->>'direction' = 'in')) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_NOT_DISPENSABLE';
    END IF;
    PERFORM id FROM public.medicine_expiry_groups WHERE medicine_id = p_medicine_id ORDER BY id FOR UPDATE;
    -- A transaction can wait across Manila midnight. Eligibility uses wall time under lock.
    today := (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
    SELECT m.quantity::bigint - COALESCE(sum(available_quantity::bigint + quarantined_quantity),0),
           COALESCE(jsonb_agg(jsonb_build_object('id',id,'available_quantity',available_quantity,'quarantined_quantity',quarantined_quantity) ORDER BY id),'[]'::jsonb)
    INTO unassigned,current_groups FROM public.medicine_expiry_groups WHERE medicine_id = p_medicine_id;
    IF unassigned < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_CONFLICT';
    END IF;
    IF p_action IN ('opening_balance','restock') THEN
        expiry := NULLIF(p_options->>'expiration_date','')::date;
        no_expiry := COALESCE((p_options->>'expiry_not_applicable')::boolean,false);
        IF (expiry IS NULL) = (NOT no_expiry) OR (no_expiry AND m.item_type <> 'health_supply') OR expiry < today THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_EXPIRY';
        END IF;
        IF p_action = 'opening_balance' AND (m.quantity <> 0 OR jsonb_array_length(current_groups) > 0) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_CONFLICT';
        END IF;
        SELECT * INTO g FROM public.medicine_expiry_groups WHERE medicine_id = p_medicine_id AND expiration_date IS NOT DISTINCT FROM expiry AND expiry_not_applicable = no_expiry;
        IF NOT FOUND THEN
            INSERT INTO public.medicine_expiry_groups(medicine_id,expiration_date,expiry_not_applicable,available_quantity,quarantined_quantity,created_at,updated_at)
            VALUES(p_medicine_id,expiry,no_expiry,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING * INTO g;
        END IF;
        new_available := g.available_quantity::bigint + p_quantity;
        new_quarantined := g.quarantined_quantity;
        delta := p_quantity;
        source_value := CASE WHEN p_action = 'opening_balance' THEN 'opening_balance' ELSE 'manual_restock' END;
    ELSIF p_action IN ('verify_stock','physical_count') THEN
        type_value := 'physical_count';
        source_value := 'correction';
        IF jsonb_typeof(p_options->'groups') IS DISTINCT FROM 'array' OR jsonb_typeof(p_options->'expected_groups') IS DISTINCT FROM 'array'
           OR COALESCE(p_options->>'unassigned_quantity','') !~ '^(0|[1-9][0-9]*)$'
           OR COALESCE(p_options->>'expected_unassigned_quantity','') !~ '^(0|[1-9][0-9]*)$' THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
        END IF;
        SELECT COALESCE(jsonb_agg(value ORDER BY (value->>'id')::bigint),'[]'::jsonb) INTO expected_groups FROM jsonb_array_elements(p_options->'expected_groups');
        IF expected_groups IS DISTINCT FROM current_groups OR (p_options->>'expected_unassigned_quantity')::numeric <> unassigned THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_SNAPSHOT_CONFLICT';
        END IF;
        IF jsonb_array_length(p_options->'groups') <> jsonb_array_length(current_groups)
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_options->'groups') GROUP BY value->>'id' HAVING count(*) > 1) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_SNAPSHOT_CONFLICT';
        END IF;
        after_quantity := (p_options->>'unassigned_quantity')::bigint;
        FOR entry IN SELECT value FROM jsonb_array_elements(p_options->'groups') LOOP
            IF COALESCE(entry->>'id','') !~ '^[1-9][0-9]*$' OR COALESCE(entry->>'available_quantity','') !~ '^(0|[1-9][0-9]*)$' OR COALESCE(entry->>'quarantined_quantity','') !~ '^(0|[1-9][0-9]*)$' THEN
                RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
            END IF;
            SELECT * INTO g FROM public.medicine_expiry_groups WHERE id = (entry->>'id')::bigint AND medicine_id = p_medicine_id;
            IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_GROUP_MISMATCH'; END IF;
            new_available := (entry->>'available_quantity')::bigint;
            new_quarantined := (entry->>'quarantined_quantity')::bigint;
            IF new_available + new_quarantined > 2147483647 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_CONFLICT'; END IF;
            changes := changes || jsonb_build_array(jsonb_build_object('id',g.id,'ab',g.available_quantity,'aa',new_available,'qb',g.quarantined_quantity,'qa',new_quarantined));
            after_quantity := after_quantity + new_available + new_quarantined;
        END LOOP;
        delta := after_quantity - m.quantity;
        g := NULL;
    ELSIF p_action = 'dispense' THEN
        source_value := 'health_record';
        source_id_value := (p_options->>'source_id')::bigint;
        IF p_facility_type <> 'bhc' OR source_id_value IS NULL OR NOT EXISTS (SELECT 1 FROM public.health_records WHERE id = source_id_value AND barangay_health_center_id = p_facility_id) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_FACILITY_MISMATCH';
        END IF;
        remaining := p_quantity;
        IF p_options ? 'allocations' THEN
            IF jsonb_typeof(p_options->'allocations') IS DISTINCT FROM 'array' OR btrim(COALESCE(p_options->>'override_reason','')) = '' THEN
                RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
            END IF;
            IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_options->'allocations') GROUP BY value->>'expiry_group_id' HAVING count(*) > 1) THEN
                RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
            END IF;
            p_reason := 'Manual expiry override: ' || btrim(p_options->>'override_reason');
            FOR entry IN SELECT value FROM jsonb_array_elements(p_options->'allocations') LOOP
                IF COALESCE(entry->>'expiry_group_id','') !~ '^[1-9][0-9]*$' OR COALESCE(entry->>'quantity','') !~ '^[1-9][0-9]*$' THEN
                    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
                END IF;
                SELECT * INTO g FROM public.medicine_expiry_groups WHERE id = (entry->>'expiry_group_id')::bigint AND medicine_id = p_medicine_id;
                IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_GROUP_MISMATCH'; END IF;
                take_quantity := (entry->>'quantity')::integer;
                IF g.expiration_date < today THEN
                    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_NOT_DISPENSABLE';
                END IF;
                IF take_quantity > g.available_quantity OR take_quantity > remaining THEN
                    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_CONFLICT';
                END IF;
                changes := changes || jsonb_build_array(jsonb_build_object('id',g.id,'ab',g.available_quantity,'aa',g.available_quantity-take_quantity,'qb',g.quarantined_quantity,'qa',g.quarantined_quantity));
                remaining := remaining - take_quantity;
            END LOOP;
        ELSE
            FOR g IN SELECT * FROM public.medicine_expiry_groups WHERE medicine_id = p_medicine_id AND available_quantity > 0 AND (expiration_date >= today OR expiry_not_applicable) ORDER BY expiration_date ASC NULLS LAST,id LOOP
                EXIT WHEN remaining = 0;
                take_quantity := LEAST(remaining,g.available_quantity);
                changes := changes || jsonb_build_array(jsonb_build_object('id',g.id,'ab',g.available_quantity,'aa',g.available_quantity-take_quantity,'qb',g.quarantined_quantity,'qa',g.quarantined_quantity));
                remaining := remaining-take_quantity;
            END LOOP;
        END IF;
        discrepancy_value := -remaining;
        delta := -p_quantity;
        g := NULL;
        IF remaining > 0 THEN p_reason := concat_ws(' ',NULLIF(btrim(p_reason),''),'Reconciliation Required: unallocated actual dispensing.'); END IF;
    ELSE
        IF p_action = 'deduct' THEN type_value := 'adjustment_out'; END IF;
        IF p_action IN ('damaged_disposal','expired_disposal','quarantine_disposal') THEN source_value := 'disposal'; END IF;
        IF p_action = 'correction' THEN source_value := 'correction'; END IF;
        IF p_action = 'correction' AND COALESCE(p_options->>'direction','') NOT IN ('in','out') THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
        END IF;
        delta := CASE WHEN p_action = 'adjustment_in' OR (p_action = 'correction' AND p_options->>'direction' = 'in') THEN p_quantity ELSE -p_quantity END;
        IF p_options->>'target' = 'unassigned' AND p_options ? 'expiry_group_id' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION'; END IF;
        IF p_options->>'target' = 'unassigned' OR (jsonb_array_length(current_groups) = 0 AND NOT (p_options ? 'expiry_group_id')) THEN
            IF p_action NOT IN ('correction','adjustment_in','adjustment_out','damaged_disposal','expired_disposal') OR unassigned + delta < 0 THEN
                RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_CONFLICT';
            END IF;
            IF p_action = 'expired_disposal' AND (m.expiration_date IS NULL OR m.expiration_date >= today) THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION'; END IF;
        ELSE
            SELECT * INTO g FROM public.medicine_expiry_groups WHERE id = (p_options->>'expiry_group_id')::bigint AND medicine_id = p_medicine_id;
            IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_GROUP_MISMATCH'; END IF;
            new_available := g.available_quantity;
            new_quarantined := g.quarantined_quantity;
            IF p_action = 'quarantine' THEN
                new_available := new_available-p_quantity;
                new_quarantined := new_quarantined+p_quantity;
                delta := 0;
            ELSIF p_action = 'release' THEN
                IF g.expiration_date < today THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEDICINE_NOT_DISPENSABLE'; END IF;
                new_available := new_available+p_quantity;
                new_quarantined := new_quarantined-p_quantity;
                delta := 0;
            ELSIF p_action = 'quarantine_disposal' THEN
                new_quarantined := new_quarantined-p_quantity;
            ELSIF p_action = 'correction' THEN
                IF COALESCE(p_options->>'pool','') NOT IN ('available','quarantined') THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION'; END IF;
                IF p_options->>'pool' = 'quarantined' THEN new_quarantined := new_quarantined+delta; ELSE new_available := new_available+delta; END IF;
            ELSE
                IF COALESCE(p_options->>'pool','available') <> 'available' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION'; END IF;
                IF p_action = 'expired_disposal' AND (g.expiration_date IS NULL OR g.expiration_date >= today) THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION'; END IF;
                new_available := new_available+delta;
            END IF;
        END IF;
    END IF;
    IF g.id IS NOT NULL THEN
        changes := changes || jsonb_build_array(jsonb_build_object('id',g.id,'ab',g.available_quantity,'aa',new_available,'qb',g.quarantined_quantity,'qa',new_quarantined));
    END IF;
    after_quantity := m.quantity::bigint + delta - discrepancy_value;
    IF after_quantity < 0 OR after_quantity > 2147483647 OR delta < -2147483648 OR delta > 2147483647 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_CONFLICT';
    END IF;
    INSERT INTO public.medicine_inventory_transactions(medicine_id,actor_user_id,transaction_type,quantity_delta,quantity_before,quantity_after,discrepancy,source_type,source_id,reason,operation_key,created_at)
    VALUES(p_medicine_id,p_actor,type_value,delta,m.quantity,after_quantity,discrepancy_value,source_value,source_id_value,p_reason,p_operation_key,CURRENT_TIMESTAMP) RETURNING id INTO transaction_id;
    FOR entry IN SELECT value FROM jsonb_array_elements(changes) LOOP
        new_available := (entry->>'aa')::bigint;
        new_quarantined := (entry->>'qa')::bigint;
        IF new_available < 0 OR new_quarantined < 0 OR new_available+new_quarantined > 2147483647 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_CONFLICT'; END IF;
        UPDATE public.medicine_expiry_groups SET available_quantity = new_available, quarantined_quantity = new_quarantined, updated_at = CURRENT_TIMESTAMP WHERE id = (entry->>'id')::bigint;
        INSERT INTO public.medicine_inventory_allocations(transaction_id,expiry_group_id,available_before,available_delta,available_after,quarantined_before,quarantined_delta,quarantined_after,created_at)
        VALUES(transaction_id,(entry->>'id')::bigint,(entry->>'ab')::integer,new_available-(entry->>'ab')::integer,new_available,(entry->>'qb')::integer,new_quarantined-(entry->>'qb')::integer,new_quarantined,CURRENT_TIMESTAMP);
    END LOOP;
    UPDATE public.medicines SET quantity = after_quantity,
        reconciliation_required = CASE WHEN type_value = 'physical_count' THEN false ELSE reconciliation_required OR discrepancy_value < 0 END,
        availability_status = CASE WHEN after_quantity = 0 THEN 'Unavailable' WHEN after_quantity <= COALESCE(low_stock_threshold,10) THEN 'Low Stock' ELSE 'Available' END,
        updated_by = p_actor, updated_at = CURRENT_TIMESTAMP WHERE id = p_medicine_id;
    RETURN jsonb_build_object('transaction_id',transaction_id,'medicine_id',p_medicine_id,'quantity_before',m.quantity,'quantity_after',after_quantity,'quantity_delta',delta,'discrepancy',discrepancy_value,'transaction_type',type_value);
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
END;
$function$;

CREATE OR REPLACE FUNCTION public.akay_inventory_dispense_batch(
    p_actor_user_id bigint,p_facility_type text,p_facility_id bigint,p_source_type text,p_source_id bigint,p_operation_key text,p_items jsonb
) RETURNS TABLE(inventory_transaction_id bigint,result_medicine_id bigint,quantity_before bigint,quantity_after bigint,quantity_delta bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $function$
DECLARE entry jsonb; result jsonb;
BEGIN
    IF p_facility_type IS DISTINCT FROM 'bhc' OR p_source_type IS DISTINCT FROM 'health_record' OR p_source_id IS NULL
       OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) WHERE jsonb_typeof(value) <> 'object' OR COALESCE(value->>'medicine_id','') !~ '^[1-9][0-9]*$' OR COALESCE(value->>'quantity','') !~ '^[1-9][0-9]*$')
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) GROUP BY value->>'medicine_id' HAVING count(*) > 1) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
    END IF;
    -- Acquire every medicine first, then each operation takes group locks in ID order.
    PERFORM m.id FROM public.medicines m WHERE m.id IN (SELECT (value->>'medicine_id')::bigint FROM jsonb_array_elements(p_items)) ORDER BY m.id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.medicine_inventory_transactions WHERE operation_key = p_operation_key) THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_OPERATION_ALREADY_APPLIED'; END IF;
    FOR entry IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'medicine_id')::bigint LOOP
        result := public.akay_inventory_group_operation((entry->>'medicine_id')::bigint,p_actor_user_id,p_facility_type,p_facility_id,'dispense',(entry->>'quantity')::integer,NULL,p_operation_key,entry || jsonb_build_object('source_id',p_source_id));
        inventory_transaction_id := (result->>'transaction_id')::bigint;
        result_medicine_id := (result->>'medicine_id')::bigint;
        quantity_before := (result->>'quantity_before')::bigint;
        quantity_after := (result->>'quantity_after')::bigint;
        quantity_delta := (result->>'quantity_delta')::bigint;
        RETURN NEXT;
    END LOOP;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_OPERATION';
END;
$function$;

-- Contextless receipts cannot establish a dated physical balance.
CREATE OR REPLACE FUNCTION public.akay_inventory_opening_balance(p_medicine_id bigint,p_actor_user_id bigint,p_facility_type text,p_facility_id bigint,p_quantity integer,p_operation_key text)
RETURNS TABLE(inventory_transaction_id bigint,result_medicine_id bigint,quantity_before bigint,quantity_after bigint,quantity_delta bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $function$
BEGIN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_GROUP_CONTEXT_REQUIRED'; END;
$function$;
CREATE OR REPLACE FUNCTION public.akay_inventory_restock(p_medicine_id bigint,p_actor_user_id bigint,p_facility_type text,p_facility_id bigint,p_quantity integer,p_reason text,p_operation_key text)
RETURNS TABLE(inventory_transaction_id bigint,result_medicine_id bigint,quantity_before bigint,quantity_after bigint,quantity_delta bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $function$
BEGIN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_GROUP_CONTEXT_REQUIRED'; END;
$function$;
CREATE OR REPLACE FUNCTION public.akay_inventory_adjust(p_medicine_id bigint,p_actor_user_id bigint,p_facility_type text,p_facility_id bigint,p_action text,p_direction text,p_quantity integer,p_reason text,p_operation_key text)
RETURNS TABLE(inventory_transaction_id bigint,result_medicine_id bigint,quantity_before bigint,quantity_after bigint,quantity_delta bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $function$
DECLARE result jsonb;
BEGIN
    PERFORM id FROM public.medicines WHERE id = p_medicine_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.medicine_expiry_groups WHERE medicine_id = p_medicine_id) OR p_action NOT IN ('correction','adjustment_in','adjustment_out','damaged_disposal','expired_disposal') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_GROUP_CONTEXT_REQUIRED';
    END IF;
    result := public.akay_inventory_group_operation(p_medicine_id,p_actor_user_id,p_facility_type,p_facility_id,p_action,p_quantity,p_reason,p_operation_key,jsonb_build_object('target','unassigned','direction',p_direction));
    RETURN QUERY SELECT (result->>'transaction_id')::bigint,(result->>'medicine_id')::bigint,(result->>'quantity_before')::bigint,(result->>'quantity_after')::bigint,(result->>'quantity_delta')::bigint;
END;
$function$;

DO $block$
DECLARE signature text; role_name text;
BEGIN
    FOREACH signature IN ARRAY ARRAY[
        'public.akay_inventory_group_operation(bigint,bigint,text,bigint,text,integer,text,text,jsonb)',
        'public.akay_inventory_dispense_batch(bigint,text,bigint,text,bigint,text,jsonb)',
        'public.akay_inventory_opening_balance(bigint,bigint,text,bigint,integer,text)',
        'public.akay_inventory_restock(bigint,bigint,text,bigint,integer,text,text)',
        'public.akay_inventory_adjust(bigint,bigint,text,bigint,text,text,integer,text,text)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',signature);
        FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',signature,role_name); END IF;
        END LOOP;
    END LOOP;
END;
$block$;
