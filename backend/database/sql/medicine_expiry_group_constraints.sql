ALTER TABLE public.medicines ADD CONSTRAINT medicines_item_type_check CHECK (item_type IN ('medicine','health_supply'));
ALTER TABLE public.medicine_expiry_groups ADD CONSTRAINT medicine_expiry_group_pool_check CHECK (available_quantity >= 0 AND quarantined_quantity >= 0 AND available_quantity::bigint + quarantined_quantity <= 2147483647);
ALTER TABLE public.medicine_expiry_groups ADD CONSTRAINT medicine_expiry_group_date_check CHECK ((expiration_date IS NOT NULL AND NOT expiry_not_applicable) OR (expiration_date IS NULL AND expiry_not_applicable));
CREATE UNIQUE INDEX IF NOT EXISTS medicine_expiry_group_date_unique ON public.medicine_expiry_groups(medicine_id, expiration_date);
CREATE UNIQUE INDEX IF NOT EXISTS medicine_expiry_group_na_unique ON public.medicine_expiry_groups(medicine_id) WHERE expiry_not_applicable;
ALTER TABLE public.medicine_inventory_allocations ADD CONSTRAINT medicine_inventory_allocation_balance_check CHECK (
    available_before >= 0 AND available_after >= 0 AND quarantined_before >= 0 AND quarantined_after >= 0
    AND available_before::bigint + available_delta = available_after
    AND quarantined_before::bigint + quarantined_delta = quarantined_after
);
ALTER TABLE public.medicine_inventory_transactions DROP CONSTRAINT IF EXISTS medicine_inventory_transactions_type_check;
ALTER TABLE public.medicine_inventory_transactions ADD CONSTRAINT medicine_inventory_transactions_type_check CHECK (transaction_type IN ('opening_balance','restock','dispense','adjustment_in','adjustment_out','damaged_disposal','expired_disposal','correction','quarantine','release','quarantine_disposal','physical_count'));
ALTER TABLE public.medicine_inventory_transactions DROP CONSTRAINT IF EXISTS medicine_inventory_transactions_quantity_check;
ALTER TABLE public.medicine_inventory_transactions ADD CONSTRAINT medicine_inventory_transactions_quantity_check CHECK (
    (quantity_delta <> 0 OR transaction_type IN ('quarantine','release','physical_count'))
    AND (transaction_type NOT IN ('quarantine','release') OR quantity_delta = 0)
    AND quantity_before >= 0 AND quantity_after >= 0 AND discrepancy <= 0
    AND (discrepancy = 0 OR transaction_type = 'dispense')
    AND quantity_before + quantity_delta = quantity_after + discrepancy
);

CREATE OR REPLACE FUNCTION public.akay_inventory_group_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $function$
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.medicine_id IS DISTINCT FROM OLD.medicine_id OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date OR NEW.expiry_not_applicable IS DISTINCT FROM OLD.expiry_not_applicable) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_GROUP_IDENTITY_IMMUTABLE';
    END IF;
    IF NEW.expiry_not_applicable AND NOT EXISTS (SELECT 1 FROM public.medicines WHERE id = NEW.medicine_id AND item_type = 'health_supply') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_INVENTORY_EXPIRY';
    END IF;
    RETURN NEW;
END;
$function$;
CREATE TRIGGER medicine_expiry_group_guard BEFORE INSERT OR UPDATE ON public.medicine_expiry_groups FOR EACH ROW EXECUTE FUNCTION public.akay_inventory_group_guard();

CREATE OR REPLACE FUNCTION public.akay_inventory_allocation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $function$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_LEDGER_APPEND_ONLY';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.medicine_inventory_transactions t JOIN public.medicine_expiry_groups g ON g.medicine_id = t.medicine_id WHERE t.id = NEW.transaction_id AND g.id = NEW.expiry_group_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVENTORY_GROUP_MISMATCH';
    END IF;
    RETURN NEW;
END;
$function$;
CREATE TRIGGER medicine_inventory_allocations_append_only BEFORE INSERT OR UPDATE OR DELETE ON public.medicine_inventory_allocations FOR EACH ROW EXECUTE FUNCTION public.akay_inventory_allocation_guard();

ALTER TABLE public.medicine_expiry_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_inventory_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.medicine_expiry_groups, public.medicine_inventory_allocations FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.medicine_expiry_groups_id_seq, public.medicine_inventory_allocations_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION public.akay_inventory_group_guard(), public.akay_inventory_allocation_guard() FROM PUBLIC;
DO $block$
DECLARE role_name text;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('REVOKE ALL ON public.medicine_expiry_groups, public.medicine_inventory_allocations FROM %I', role_name);
            EXECUTE format('REVOKE ALL ON SEQUENCE public.medicine_expiry_groups_id_seq, public.medicine_inventory_allocations_id_seq FROM %I', role_name);
            EXECUTE format('REVOKE ALL ON FUNCTION public.akay_inventory_group_guard(), public.akay_inventory_allocation_guard() FROM %I', role_name);
        END IF;
    END LOOP;
END;
$block$;
