-- Inventory is a model in phase 1. No application grants permit stock writes yet.
CREATE FUNCTION deny_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historical records are append-only; use a compensating event' USING ERRCODE='23514'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION deny_history_change();
--> statement-breakpoint
CREATE TRIGGER movement_append_only BEFORE UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION deny_history_change();
--> statement-breakpoint
CREATE TRIGGER entries_append_only BEFORE UPDATE OR DELETE ON inventory_entries FOR EACH ROW EXECUTE FUNCTION deny_history_change();
--> statement-breakpoint
CREATE TRIGGER bcv_append_only BEFORE UPDATE OR DELETE ON bcv_rates FOR EACH ROW EXECUTE FUNCTION deny_history_change();
--> statement-breakpoint
CREATE TRIGGER receipts_append_only BEFORE UPDATE OR DELETE ON command_receipts FOR EACH ROW EXECUTE FUNCTION deny_history_change();
--> statement-breakpoint
CREATE FUNCTION validate_inventory_tree() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Serialize future tree writes before this deferred validation. Future movement service also locks rows.
  IF EXISTS (
    WITH RECURSIVE ancestry AS (
      SELECT id AS start_id,id,parent_id,ARRAY[id] AS path,false AS cycle FROM containers
      UNION ALL
      SELECT a.start_id,p.id,p.parent_id,a.path||p.id,p.id=ANY(a.path)
      FROM ancestry a JOIN containers p ON p.id=a.parent_id WHERE NOT a.cycle
    ) SELECT 1 FROM ancestry WHERE cycle
  ) THEN RAISE EXCEPTION 'Container ancestry cannot contain cycles' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id AS child_id,parent_id AS ancestor_id FROM containers WHERE parent_id IS NOT NULL
      UNION ALL
      SELECT a.child_id,c.parent_id FROM ancestors a JOIN containers c ON c.id=a.ancestor_id WHERE c.parent_id IS NOT NULL
    ) SELECT 1 FROM ancestors a JOIN stock_balances child ON child.container_id=a.child_id AND child.quantity>0
      JOIN stock_balances parent ON parent.container_id=a.ancestor_id AND parent.quantity>0
  ) THEN RAISE EXCEPTION 'Do not count packaging and its contents twice' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM stock_balances s JOIN containers c ON c.id=s.container_id WHERE s.quantity>0 AND (
      (s.unit='sealed_box' AND (c.kind<>'box' OR c.state<>'sealed')) OR
      (s.unit='intact_blister' AND (c.kind<>'blister' OR c.state<>'sealed')) OR
      (s.unit='prepared_half_box' AND c.kind<>'half_box') OR
      (s.unit='loose_piece' AND c.kind NOT IN ('loose_bin','blister')) OR
      c.state IN ('empty','dispatched')
    )
  ) THEN RAISE EXCEPTION 'Container state and stock unit disagree' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION lock_inventory_tree() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM pg_advisory_xact_lock(68493003); RETURN NULL; END;
$$;
--> statement-breakpoint
CREATE TRIGGER containers_serialized BEFORE INSERT OR UPDATE OR DELETE ON containers FOR EACH STATEMENT EXECUTE FUNCTION lock_inventory_tree();
--> statement-breakpoint
CREATE TRIGGER stock_serialized BEFORE INSERT OR UPDATE OR DELETE ON stock_balances FOR EACH STATEMENT EXECUTE FUNCTION lock_inventory_tree();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER container_tree_valid AFTER INSERT OR UPDATE OR DELETE ON containers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_tree();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_tree_valid AFTER INSERT OR UPDATE OR DELETE ON stock_balances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_tree();
