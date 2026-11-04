ALTER TABLE "inventory_entries" DROP CONSTRAINT "entry_nonzero";--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "movement_kind_valid";--> statement-breakpoint
ALTER TABLE "inventory_entries" ADD COLUMN "entry_order" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "inventory_entries_entry_order_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "inventory_entries" ADD COLUMN "before_state" jsonb;--> statement-breakpoint
ALTER TABLE "inventory_entries" ADD COLUMN "after_state" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "lot_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "reversal_of" uuid;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "lot_version_before" integer;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "lot_version_after" integer;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "before_state" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "after_state" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "received_boxes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "inventory_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reversal_of_inventory_movements_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."inventory_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_container_order_idx" ON "inventory_entries" USING btree ("container_id","entry_order");--> statement-breakpoint
CREATE INDEX "movements_lot_idx" ON "inventory_movements" USING btree ("lot_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name_uq" ON "suppliers" USING btree (lower(btrim("name")));--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "movement_reversal_uq" UNIQUE("reversal_of");--> statement-breakpoint
ALTER TABLE "inventory_entries" ADD CONSTRAINT "entry_nonzero" CHECK ("inventory_entries"."quantity_delta"<>0 or coalesce("inventory_entries"."pieces_delta",0)<>0 or "inventory_entries"."before_state" is distinct from "inventory_entries"."after_state");--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "movement_kind_valid" CHECK ("inventory_movements"."kind" in ('receipt','dispatch','open_box','open_blister','fraction','adjustment','transfer','reversal'));--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_receipt_valid" CHECK ("lots"."received_boxes">=0 and "lots"."inventory_version">=0);--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "physical_package_quantity" CHECK ("stock_balances"."unit"='loose_piece' or "stock_balances"."quantity" in (0,1));--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_fields_valid" CHECK (length(btrim("suppliers"."name")) between 2 and 120 and "suppliers"."version">0);--> statement-breakpoint
INSERT INTO warehouses(name) VALUES ('Almacén principal') ON CONFLICT(name) DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION guard_lot_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-'inventory_version') IS DISTINCT FROM (to_jsonb(OLD)-'inventory_version') THEN
    RAISE EXCEPTION 'Lot receipt snapshots are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.inventory_version <> OLD.inventory_version+1 THEN
    RAISE EXCEPTION 'Lot version must advance once per movement' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER lot_snapshot_immutable BEFORE UPDATE OR DELETE ON lots FOR EACH ROW EXECUTE FUNCTION guard_lot_snapshot();
--> statement-breakpoint
CREATE TRIGGER purchase_lines_append_only BEFORE UPDATE OR DELETE ON purchase_lines FOR EACH ROW EXECUTE FUNCTION deny_history_change();
--> statement-breakpoint
CREATE FUNCTION validate_inventory_physical_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM containers child JOIN containers parent ON parent.id=child.parent_id
    JOIN stock_balances s ON s.container_id=child.id
    WHERE s.quantity>0 AND (parent.kind<>'box' OR parent.state<>'open' OR child.kind NOT IN ('blister','loose_bin'))
  ) THEN RAISE EXCEPTION 'Available contents require an open box parent' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM containers c JOIN stock_balances s ON s.container_id=c.id
    WHERE (c.state='open' AND s.quantity=0 AND NOT EXISTS (
      SELECT 1 FROM containers child JOIN stock_balances child_stock ON child_stock.container_id=child.id
      WHERE child.parent_id=c.id AND child_stock.quantity>0
    )) OR (c.state='sealed' AND s.quantity=0)
    OR (s.quantity>0 AND s.unit='loose_piece' AND c.state<>'open')
    OR (s.quantity>0 AND s.unit='prepared_half_box' AND (c.state<>'sealed' OR s.counted_pieces<=0))
  ) THEN RAISE EXCEPTION 'Empty containers cannot remain available' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER container_physical_valid AFTER INSERT OR UPDATE OR DELETE ON containers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_physical_state();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_physical_valid AFTER INSERT OR UPDATE OR DELETE ON stock_balances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_physical_state();
--> statement-breakpoint
CREATE FUNCTION validate_inventory_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; c containers%ROWTYPE; s stock_balances%ROWTYPE; last_state jsonb;
BEGIN
  IF TG_TABLE_NAME='containers' THEN target:=coalesce(NEW.id,OLD.id);
  ELSE target:=coalesce(NEW.container_id,OLD.container_id); END IF;
  SELECT * INTO c FROM containers WHERE id=target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO s FROM stock_balances WHERE container_id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Every physical container requires a balance projection' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM inventory_entries WHERE container_id=target GROUP BY unit
    HAVING sum(quantity_delta) <> CASE WHEN unit=s.unit THEN s.quantity ELSE 0 END
  ) OR coalesce((SELECT sum(quantity_delta) FROM inventory_entries WHERE container_id=target AND unit=s.unit),0)<>s.quantity THEN
    RAISE EXCEPTION 'Inventory ledger and balance disagree' USING ERRCODE='23514';
  END IF;
  SELECT after_state INTO last_state FROM inventory_entries WHERE container_id=target ORDER BY entry_order DESC LIMIT 1;
  IF last_state IS NULL OR (last_state->>'quantity')::integer IS DISTINCT FROM s.quantity
    OR last_state->>'unit' IS DISTINCT FROM s.unit
    OR (last_state->>'countedPieces')::integer IS DISTINCT FROM s.counted_pieces
    OR (last_state->>'version')::integer IS DISTINCT FROM s.version
    OR last_state->>'state' IS DISTINCT FROM c.state
    OR last_state->>'kind' IS DISTINCT FROM c.kind
    OR (last_state->>'parentId')::uuid IS DISTINCT FROM c.parent_id THEN
    RAISE EXCEPTION 'Inventory projection needs a matching immutable event' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER container_projection_valid AFTER INSERT OR UPDATE OR DELETE ON containers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_projection();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_projection_valid AFTER INSERT OR UPDATE OR DELETE ON stock_balances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_projection();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER entry_projection_valid AFTER INSERT ON inventory_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_projection();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_inventory_tree() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_lot uuid;
BEGIN
  IF TG_TABLE_NAME='containers' THEN target_lot:=coalesce(NEW.lot_id,OLD.lot_id);
  ELSE SELECT lot_id INTO target_lot FROM containers WHERE id=coalesce(NEW.container_id,OLD.container_id); END IF;
  IF EXISTS (
    WITH RECURSIVE ancestry AS (
      SELECT id AS start_id,id,parent_id,ARRAY[id] AS path,false AS cycle FROM containers WHERE lot_id=target_lot
      UNION ALL SELECT a.start_id,p.id,p.parent_id,a.path||p.id,p.id=ANY(a.path)
      FROM ancestry a JOIN containers p ON p.id=a.parent_id WHERE NOT a.cycle
    ) SELECT 1 FROM ancestry WHERE cycle
  ) THEN RAISE EXCEPTION 'Container ancestry cannot contain cycles' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id AS child_id,parent_id AS ancestor_id FROM containers WHERE lot_id=target_lot AND parent_id IS NOT NULL
      UNION ALL SELECT a.child_id,c.parent_id FROM ancestors a JOIN containers c ON c.id=a.ancestor_id WHERE c.parent_id IS NOT NULL
    ) SELECT 1 FROM ancestors a JOIN stock_balances child ON child.container_id=a.child_id AND child.quantity>0
      JOIN stock_balances parent ON parent.container_id=a.ancestor_id AND parent.quantity>0
  ) THEN RAISE EXCEPTION 'Do not count packaging and its contents twice' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM stock_balances s JOIN containers c ON c.id=s.container_id WHERE c.lot_id=target_lot AND s.quantity>0 AND (
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
CREATE FUNCTION validate_lot_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; current_version integer; event_count integer; last_version integer; unique_versions integer;
BEGIN
  IF TG_TABLE_NAME='lots' THEN target:=NEW.id; ELSE target:=NEW.lot_id; END IF;
  IF target IS NULL THEN RETURN NULL; END IF;
  SELECT inventory_version INTO current_version FROM lots WHERE id=target;
  SELECT count(*)::integer,coalesce(max(lot_version_after),0),count(distinct lot_version_after)::integer
    INTO event_count,last_version,unique_versions FROM inventory_movements WHERE lot_id=target;
  IF current_version<>last_version OR event_count<>last_version OR unique_versions<>event_count OR EXISTS (
    SELECT 1 FROM inventory_movements WHERE lot_id=target AND (
      lot_version_before IS NULL OR lot_version_after IS NULL OR lot_version_before<0 OR lot_version_after<>lot_version_before+1
      OR (lot_version_after=1 AND kind<>'receipt')
      OR (kind='fraction' AND counted_before<>(SELECT coalesce(sum((item->>'countedPieces')::integer),0) FROM jsonb_array_elements(after_state) item WHERE (item->>'quantity')::integer>0))
    )
  ) THEN RAISE EXCEPTION 'Lot version and immutable movement history disagree' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM inventory_entries e JOIN inventory_movements m ON m.id=e.movement_id JOIN containers c ON c.id=e.container_id
    WHERE m.lot_id=target AND c.lot_id<>target
  ) THEN RAISE EXCEPTION 'Movement and container must belong to the same lot' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER lot_history_valid AFTER INSERT OR UPDATE ON lots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_lot_history();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER movement_history_valid AFTER INSERT ON inventory_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_lot_history();
