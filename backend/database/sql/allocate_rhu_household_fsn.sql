-- Invoker permissions: only the Laravel database role should execute this.
CREATE OR REPLACE FUNCTION akay_allocate_rhu_household_fsn(p_rhu bigint, p_year integer)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint; serial text;
BEGIN
    PERFORM pg_advisory_xact_lock(72420, p_rhu::integer);
    INSERT INTO household_fsn_counters (rural_health_unit_id, year, last_number)
        VALUES (p_rhu, p_year, 0) ON CONFLICT DO NOTHING;
    LOOP
        UPDATE household_fsn_counters SET last_number = last_number + 1
            WHERE rural_health_unit_id = p_rhu AND year = p_year RETURNING last_number INTO n;
        serial := 'FSN-' || p_year || '-' || CASE WHEN n < 10000 THEN lpad(n::text, 4, '0') ELSE n::text END;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM households WHERE rural_health_unit_id = p_rhu AND serial_number = serial)
            AND NOT EXISTS (SELECT 1 FROM patients WHERE rural_health_unit_id = p_rhu AND household_id IS NULL AND upper(btrim(family_serial_number)) = serial);
    END LOOP;
    RETURN serial;
END;
$$;
