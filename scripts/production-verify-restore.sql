-- Read-only checks on an isolated restored production dump, never synthetic writes.
BEGIN READ ONLY;
SET LOCAL statement_timeout='120s';
DO $$
DECLARE required_table text; item record; usdt_table oid; collector_configured boolean;
BEGIN
  IF current_database()<>'manzanas_maracay_production' OR current_user<>'mm_prod_bootstrap'
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
    RAISE EXCEPTION 'Unexpected production restoration identity';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('mm_prod_owner','mm_prod_app'))<>2
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('mm_prod_owner','mm_prod_app')
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
      WHERE r.rolname IN ('mm_prod_owner','mm_prod_app')) THEN
    RAISE EXCEPTION 'Owner/application have unexpected administrative privileges';
  END IF;
  IF (SELECT count(*) FROM runtime_environment)<>1 OR NOT EXISTS(
    SELECT 1 FROM runtime_environment WHERE singleton AND environment='production'
    AND database_name=current_database() AND owner_role='mm_prod_owner'
    AND application_role='mm_prod_app' AND purpose='operation'
  ) THEN RAISE EXCEPTION 'Unexpected production environment binding'; END IF;
  FOREACH required_table IN ARRAY ARRAY['fruits','packing_rules','suppliers','purchases','purchase_lines','lots','containers','stock_balances','inventory_movements','inventory_entries','inventory_cost_openings','inventory_cost_entries','clients','sales','sale_lines','sale_allocations','payments','payment_applications','sale_cancellations','payment_reversals','audit_events','app_users','push_devices','push_notices'] LOOP
    IF to_regclass('public.'||required_table) IS NULL THEN RAISE EXCEPTION 'Required production table missing'; END IF;
  END LOOP;
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL OR EXISTS(
    SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated
  ) THEN RAISE EXCEPTION 'Missing migrations or unvalidated constraints'; END IF;
  -- ACLs are part of disaster recovery, not reconstructed by silently granting
  -- extra rights. Test the restored application permissions without writes.
  IF NOT has_database_privilege('mm_prod_app',current_database(),'CONNECT')
    OR has_database_privilege('mm_prod_app',current_database(),'CREATE,TEMPORARY')
    OR NOT has_schema_privilege('mm_prod_app','public','USAGE')
    OR has_schema_privilege('mm_prod_app','public','CREATE')
    OR EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL
      aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE n.nspname='public' AND a.grantee=0) THEN
    RAISE EXCEPTION 'Restored schema privileges do not match production';
  END IF;
  FOREACH required_table IN ARRAY ARRAY['fruits','calibers','product_variants','varieties','packing_rules','suppliers','lots','containers','stock_balances','warehouses','purchases','purchase_lines','inventory_movements','inventory_entries','inventory_cost_entries','inventory_cost_openings','bcv_rates','clients','price_items','price_lists','sales','sale_lines','sale_allocations','sale_date_events','sale_cancellations','payments','payment_applications','payment_reversals','receivables','push_devices','push_notices','app_users','auth_sessions','auth_login_buckets','runtime_environment','command_receipts'] LOOP
    IF NOT has_table_privilege('mm_prod_app','public.'||required_table,'SELECT') THEN
      RAISE EXCEPTION 'Restored application read privilege missing';
    END IF;
  END LOOP;
  FOREACH required_table IN ARRAY ARRAY['varieties','packing_rules','suppliers','lots','containers','stock_balances','clients','price_items','push_devices','push_notices'] LOOP
    IF NOT has_table_privilege('mm_prod_app','public.'||required_table,'INSERT')
      OR NOT has_table_privilege('mm_prod_app','public.'||required_table,'UPDATE')
      OR has_table_privilege('mm_prod_app','public.'||required_table,'DELETE,TRUNCATE,TRIGGER') THEN
      RAISE EXCEPTION 'Restored projection/configuration permissions incorrect';
    END IF;
  END LOOP;
  FOREACH required_table IN ARRAY ARRAY['inventory_cost_entries_entry_order_seq','inventory_entries_entry_order_seq','mm_sale_number_seq','mm_payment_number_seq','sale_date_events_event_order_seq'] LOOP
    IF NOT has_sequence_privilege('mm_prod_app','public.'||required_table,'USAGE')
      OR NOT has_sequence_privilege('mm_prod_app','public.'||required_table,'SELECT')
      OR has_sequence_privilege('mm_prod_app','public.'||required_table,'UPDATE') THEN
      RAISE EXCEPTION 'Restored sequence permissions incorrect';
    END IF;
  END LOOP;
  -- V4.2 adds an internal receipt number without renumbering older receipts.
  -- Optional here so the same verifier can recover pre-upgrade backups.
  IF to_regclass('public.mm_receipt_number_seq') IS NOT NULL THEN
    IF NOT has_sequence_privilege('mm_prod_app','public.mm_receipt_number_seq','USAGE')
      OR NOT has_sequence_privilege('mm_prod_app','public.mm_receipt_number_seq','SELECT')
      OR has_sequence_privilege('mm_prod_app','public.mm_receipt_number_seq','UPDATE')
      OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
        AND table_name='purchases' AND column_name='receipt_number' AND data_type='bigint')
      OR EXISTS(SELECT 1 FROM purchases WHERE receipt_number IS NOT NULL AND receipt_number<=0)
      OR EXISTS(SELECT receipt_number FROM purchases WHERE receipt_number IS NOT NULL
        GROUP BY receipt_number HAVING count(*)>1)
    THEN RAISE EXCEPTION 'Restored receipt numbering or permissions incorrect'; END IF;
  END IF;
  FOREACH required_table IN ARRAY ARRAY['purchases','purchase_lines','inventory_movements','inventory_entries','inventory_cost_entries','sales','sale_lines','sale_allocations','sale_date_events','sale_cancellations','payments','payment_applications','payment_reversals','command_receipts'] LOOP
    IF NOT has_table_privilege('mm_prod_app','public.'||required_table,'INSERT')
      OR has_table_privilege('mm_prod_app','public.'||required_table,'UPDATE,DELETE,TRUNCATE,TRIGGER') THEN
      RAISE EXCEPTION 'Restored document/history permissions are not append-only';
    END IF;
  END LOOP;
  FOREACH required_table IN ARRAY ARRAY['runtime_environment','app_users','inventory_cost_openings','bcv_rates'] LOOP
    IF has_table_privilege('mm_prod_app','public.'||required_table,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') THEN
      RAISE EXCEPTION 'Restored application can mutate administrative data';
    END IF;
  END LOOP;
  -- V3/V4 rate schema is optional for restoration of older phase-4 backups.
  usdt_table:=to_regclass('public.usdt_rates');
  IF usdt_table IS NOT NULL THEN
    IF NOT has_table_privilege('mm_prod_app',usdt_table,'SELECT')
      OR has_table_privilege('mm_prod_app',usdt_table,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
    THEN RAISE EXCEPTION 'Application rate cache must remain read-only'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mm_prod_rates') THEN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mm_prod_rates'
        AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit OR rolconnlimit<>2))
      OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member='mm_prod_rates'::regrole OR roleid='mm_prod_rates'::regrole)
      OR has_database_privilege('mm_prod_rates',current_database(),'CREATE,TEMPORARY,CONNECT WITH GRANT OPTION')
      OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'
        AND has_schema_privilege('mm_prod_rates',oid,'CREATE,USAGE WITH GRANT OPTION'))
      OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE CASE WHEN c.relkind='S' AND n.nspname NOT IN('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
          THEN has_sequence_privilege('mm_prod_rates',c.oid,'USAGE,SELECT,UPDATE') ELSE false END)
      OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(priv)
        WHERE CASE WHEN c.relkind IN('r','p','v','m','f') AND n.nspname NOT IN('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
          THEN has_table_privilege('mm_prod_rates',c.oid,p.priv) ELSE false END
          AND NOT(n.nspname='public' AND ((c.relname='runtime_environment' AND p.priv='SELECT')
            OR(c.relname IN('bcv_rates','usdt_rates') AND p.priv IN('SELECT','INSERT')))))
      OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(priv)
        WHERE CASE WHEN c.relkind IN('r','p','v','m','f') AND n.nspname NOT IN('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
          THEN has_table_privilege('mm_prod_rates',c.oid,p.priv||' WITH GRANT OPTION') ELSE false END)
      OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(priv)
        WHERE CASE WHEN c.relkind IN('r','p','v','m','f') AND n.nspname NOT IN('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
          THEN (
            has_any_column_privilege('mm_prod_rates',c.oid,p.priv||' WITH GRANT OPTION') OR
            (has_any_column_privilege('mm_prod_rates',c.oid,p.priv) AND NOT(n.nspname='public' AND (
              (c.relname='runtime_environment' AND p.priv='SELECT') OR
              (c.relname IN('bcv_rates','usdt_rates') AND p.priv IN('SELECT','INSERT')))))) ELSE false END) THEN
      RAISE EXCEPTION 'Collector has unexpected effective privileges';
    END IF;
    -- A role exists in every isolated restore, including the 13-migration backup
    -- from before rate collection existed. Require working cache permissions
    -- only when the dump actually contains collector grants; never invent them.
    collector_configured:=has_table_privilege('mm_prod_rates','public.runtime_environment','SELECT')
      OR has_table_privilege('mm_prod_rates','public.bcv_rates','SELECT,INSERT');
    IF usdt_table IS NOT NULL THEN
      collector_configured:=collector_configured OR has_table_privilege('mm_prod_rates',usdt_table,'SELECT,INSERT');
    END IF;
    IF collector_configured THEN
      IF usdt_table IS NULL OR NOT has_database_privilege('mm_prod_rates',current_database(),'CONNECT')
        OR NOT has_schema_privilege('mm_prod_rates','public','USAGE')
        OR NOT has_table_privilege('mm_prod_rates','public.runtime_environment','SELECT')
        OR NOT has_table_privilege('mm_prod_rates','public.bcv_rates','SELECT')
        OR NOT has_table_privilege('mm_prod_rates','public.bcv_rates','INSERT')
        OR NOT has_table_privilege('mm_prod_rates',usdt_table,'SELECT')
        OR NOT has_table_privilege('mm_prod_rates',usdt_table,'INSERT')
      THEN RAISE EXCEPTION 'Restored collector cache permissions are incomplete'; END IF;
    END IF;
  END IF;
  FOREACH required_table IN ARRAY ARRAY['auth_sessions','auth_login_buckets'] LOOP
    IF NOT has_table_privilege('mm_prod_app','public.'||required_table,'INSERT')
      OR NOT has_table_privilege('mm_prod_app','public.'||required_table,'UPDATE')
      OR NOT has_table_privilege('mm_prod_app','public.'||required_table,'DELETE') THEN
      RAISE EXCEPTION 'Restored session management permissions missing';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE n.nspname='public' AND c.relname IN ('app_users','auth_sessions','auth_login_buckets','runtime_environment') AND a.grantee=0) THEN
    RAISE EXCEPTION 'Restored private tables have PUBLIC privileges';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('clients','purchases','lots','sales','payments')
    AND c.relrowsecurity AND c.relforcerowsecurity)<>5 THEN
    RAISE EXCEPTION 'Restored production row security is not forced';
  END IF;
  IF EXISTS(SELECT 1 FROM clients WHERE is_demo UNION ALL SELECT 1 FROM lots WHERE is_demo
    UNION ALL SELECT 1 FROM purchases WHERE is_demo UNION ALL SELECT 1 FROM sales WHERE is_demo
    UNION ALL SELECT 1 FROM payments WHERE is_demo) THEN RAISE EXCEPTION 'Production contains synthetic operations'; END IF;
  IF (SELECT count(*) FROM app_users)>1 THEN RAISE EXCEPTION 'Unexpected additional production account'; END IF;
  IF EXISTS(
    SELECT 1 FROM containers c LEFT JOIN stock_balances s ON s.container_id=c.id
    LEFT JOIN LATERAL (SELECT after_state FROM inventory_entries WHERE container_id=c.id ORDER BY entry_order DESC LIMIT 1) e ON true
    WHERE s.id IS NULL OR e.after_state IS NULL
      OR (e.after_state->>'quantity')::integer IS DISTINCT FROM s.quantity
      OR e.after_state->>'unit' IS DISTINCT FROM s.unit
      OR (e.after_state->>'countedPieces')::integer IS DISTINCT FROM s.counted_pieces
      OR (e.after_state->>'version')::integer IS DISTINCT FROM s.version
      OR e.after_state->>'state' IS DISTINCT FROM c.state
      OR e.after_state->>'kind' IS DISTINCT FROM c.kind
      OR (e.after_state->>'parentId')::uuid IS DISTINCT FROM c.parent_id
  ) THEN RAISE EXCEPTION 'Physical projection differs from history'; END IF;
  IF EXISTS(
    SELECT 1 FROM stock_balances s LEFT JOIN LATERAL
      (SELECT sum(quantity_delta) AS quantity FROM inventory_entries WHERE container_id=s.container_id AND unit=s.unit) e ON true
      WHERE coalesce(e.quantity,0)<>s.quantity
    UNION ALL
    SELECT 1 FROM inventory_entries e JOIN stock_balances s ON s.container_id=e.container_id
      WHERE e.unit<>s.unit GROUP BY e.container_id,e.unit HAVING sum(e.quantity_delta)<>0
  ) THEN RAISE EXCEPTION 'Accumulated quantities differ from projection'; END IF;
  IF EXISTS(
    SELECT 1 FROM lots l LEFT JOIN LATERAL
      (SELECT count(*) AS total,count(DISTINCT lot_version_after) AS versions,max(lot_version_after) AS last_version FROM inventory_movements WHERE lot_id=l.id) m ON true
    WHERE l.inventory_version<>coalesce(m.last_version,0) OR m.total<>l.inventory_version OR m.versions<>m.total
  ) THEN RAISE EXCEPTION 'Lot versions differ from immutable history'; END IF;
  IF EXISTS(
    SELECT 1 FROM stock_balances s LEFT JOIN LATERAL
      (SELECT id,after_usd FROM inventory_cost_entries WHERE container_id=s.container_id ORDER BY entry_order DESC LIMIT 1) e ON true
    LEFT JOIN inventory_cost_openings o ON o.container_id=s.container_id
    WHERE s.cost_usd IS DISTINCT FROM CASE WHEN e.id IS NOT NULL THEN e.after_usd ELSE o.cost_usd END
      OR (s.quantity=0 AND s.cost_usd IS NOT NULL AND s.cost_usd<>0)
  ) THEN RAISE EXCEPTION 'Cost projection differs from its ledger'; END IF;
  FOR item IN SELECT id FROM sales LOOP PERFORM validate_commercial_sale(item.id); END LOOP;
  FOR item IN SELECT id FROM payments LOOP PERFORM validate_commercial_payment(item.id); END LOOP;
END $$;
-- Exercise restored permissions under the real application role. The expected
-- counts are captured with bootstrap visibility, so an accidental RLS filter
-- cannot make a populated restored database look empty. Only this transaction
-- holds the comparison; no business rows, ACLs or login credentials are changed.
DO $$
DECLARE relation_name text; actual_count bigint; expected jsonb := '{}'::jsonb;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['fruits','varieties','calibers','product_variants',
    'packing_rules','suppliers','warehouses','purchases','purchase_lines','lots','containers',
    'stock_balances','inventory_movements','inventory_entries','inventory_cost_entries',
    'inventory_cost_openings','clients','sales','sale_lines','sale_allocations','payments',
    'payment_applications','sale_cancellations','payment_reversals','sale_date_events',
    'command_receipts','price_lists','price_items','receivables','push_devices',
    'push_notices','app_users','auth_sessions','auth_login_buckets',
    'runtime_environment','bcv_rates'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', relation_name) INTO actual_count;
    expected := expected || jsonb_build_object(relation_name, actual_count);
  END LOOP;
  IF to_regclass('public.usdt_rates') IS NOT NULL THEN
    SELECT count(*) INTO actual_count FROM usdt_rates;
    expected := expected || jsonb_build_object('usdt_rates', actual_count);
  END IF;
  PERFORM set_config('mm.restore_expected_counts', expected::text, true);
END $$;
SET LOCAL ROLE mm_prod_app;
DO $$
DECLARE relation_name text; actual_count bigint;
  expected jsonb := current_setting('mm.restore_expected_counts')::jsonb;
BEGIN
  IF current_user <> 'mm_prod_app'
    OR current_setting('transaction_read_only') <> 'on'
    OR public.mm_runtime_environment() <> 'production' THEN
    RAISE EXCEPTION 'Restored application role/read-only environment not active';
  END IF;
  FOR relation_name IN SELECT jsonb_object_keys(expected) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', relation_name) INTO actual_count;
    IF actual_count IS DISTINCT FROM (expected->>relation_name)::bigint THEN
      RAISE EXCEPTION 'Restored application cannot read all expected rows in %', relation_name;
    END IF;
  END LOOP;
  -- These joins exercise the columns used for stock and receivables, rather
  -- than relying only on catalog declarations of SELECT privileges.
  PERFORM l.id, c.id, s.quantity, s.unit FROM lots l
    JOIN containers c ON c.lot_id=l.id JOIN stock_balances s ON s.container_id=c.id LIMIT 1;
  PERFORM s.id, s.client_id, s.total_usd, p.amount_usd FROM sales s
    LEFT JOIN payment_applications p ON p.sale_id=s.id LIMIT 1;
  PERFORM u.id, u.username FROM app_users u LIMIT 1;
END $$;
RESET ROLE;
COMMIT;
