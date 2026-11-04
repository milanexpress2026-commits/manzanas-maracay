CREATE TABLE "inventory_cost_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movement_id" uuid NOT NULL,
	"container_id" uuid NOT NULL,
	"before_usd" numeric(18, 4),
	"after_usd" numeric(18, 4),
	"entry_order" bigint GENERATED ALWAYS AS IDENTITY (sequence name "inventory_cost_entries_entry_order_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	CONSTRAINT "cost_entry_movement_container_uq" UNIQUE("movement_id","container_id"),
	CONSTRAINT "cost_entry_nonnegative" CHECK (("inventory_cost_entries"."before_usd" is null or "inventory_cost_entries"."before_usd">=0) and ("inventory_cost_entries"."after_usd" is null or "inventory_cost_entries"."after_usd">=0))
);
--> statement-breakpoint
CREATE TABLE "inventory_cost_openings" (
	"container_id" uuid PRIMARY KEY NOT NULL,
	"cost_usd" numeric(18, 4),
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_cost_nonnegative" CHECK ("inventory_cost_openings"."cost_usd" is null or "inventory_cost_openings"."cost_usd">=0)
);
--> statement-breakpoint
ALTER TABLE "product_variants" DROP CONSTRAINT "variant_combination_uq";--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "movement_kind_valid";--> statement-breakpoint
ALTER TABLE "lots" DROP CONSTRAINT "lots_values_valid";--> statement-breakpoint
ALTER TABLE "stock_balances" DROP CONSTRAINT "half_box_count_required";--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "blisters_per_box_snapshot" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "packing_rules" ALTER COLUMN "blisters_per_box" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ALTER COLUMN "variety_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ALTER COLUMN "caliber_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "packing_model_snapshot" text DEFAULT 'blister' NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "half_preparation_snapshot" text DEFAULT 'counted' NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "allowed_presentations_snapshot" text[] DEFAULT ARRAY['box','half_box','blister']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "box_weight_kg_snapshot" numeric(8, 3);--> statement-breakpoint
ALTER TABLE "packing_rules" ADD COLUMN "packing_model" text DEFAULT 'blister' NOT NULL;--> statement-breakpoint
ALTER TABLE "packing_rules" ADD COLUMN "half_preparation" text DEFAULT 'counted' NOT NULL;--> statement-breakpoint
ALTER TABLE "packing_rules" ADD COLUMN "allowed_presentations" text[] DEFAULT ARRAY['box','half_box','blister']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "packing_rules" ADD COLUMN "box_weight_kg" numeric(8, 3);--> statement-breakpoint
ALTER TABLE "packing_rules" ADD COLUMN "confirmation_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "cost_usd" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "commercial_line" text DEFAULT 'Estándar' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_cost_entries" ADD CONSTRAINT "inventory_cost_entries_movement_id_inventory_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cost_entries" ADD CONSTRAINT "inventory_cost_entries_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cost_openings" ADD CONSTRAINT "inventory_cost_openings_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_entry_container_order_idx" ON "inventory_cost_entries" USING btree ("container_id","entry_order");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "variant_commercial_combination_uq" UNIQUE NULLS NOT DISTINCT("fruit_id","variety_id","caliber_id","commercial_line");--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "movement_kind_valid" CHECK ("inventory_movements"."kind" in ('receipt','dispatch','open_box','open_blister','fraction','commercial_split','adjustment','transfer','reversal'));--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_values_valid" CHECK (("lots"."blisters_per_box_snapshot" is null or "lots"."blisters_per_box_snapshot" between 1 and 100) and "lots"."unit_cost_usd">=0 and "lots"."packing_rule_version">0);--> statement-breakpoint
ALTER TABLE "packing_rules" ADD CONSTRAINT "packing_mode_valid" CHECK ("packing_rules"."packing_model" in ('blister','halves','whole') and "packing_rules"."half_preparation" in ('counted','commercial','pending','none') and "packing_rules"."confirmation_status" in ('confirmed','pending') and ("packing_rules"."box_weight_kg" is null or "packing_rules"."box_weight_kg">0));--> statement-breakpoint
ALTER TABLE "packing_rules" ADD CONSTRAINT "packing_presentations_valid" CHECK ("packing_rules"."allowed_presentations" <@ ARRAY['box','half_box','blister']::text[] and 'box'=any("packing_rules"."allowed_presentations") and cardinality("packing_rules"."allowed_presentations") between 1 and 3 and ("packing_rules"."packing_model"='blister' or "packing_rules"."blisters_per_box" is null) and ("packing_rules"."packing_model"<>'whole' or ("packing_rules"."allowed_presentations"=ARRAY['box']::text[] and "packing_rules"."half_preparation"='none')) and ("packing_rules"."packing_model"<>'halves' or (not ('blister'=any("packing_rules"."allowed_presentations")) and "packing_rules"."half_preparation"='commercial')));--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_cost_nonnegative" CHECK ("stock_balances"."cost_usd" is null or "stock_balances"."cost_usd">=0);--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_inventory_physical_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM containers child JOIN containers parent ON parent.id=child.parent_id JOIN stock_balances s ON s.container_id=child.id
    WHERE s.quantity>0 AND (parent.kind<>'box' OR parent.state<>'open' OR child.kind NOT IN ('blister','loose_bin','half_box'))
  ) THEN RAISE EXCEPTION 'Available contents require an open box parent' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM containers c JOIN stock_balances s ON s.container_id=c.id JOIN lots l ON l.id=c.lot_id
    WHERE (c.state='open' AND s.quantity=0 AND NOT EXISTS (
      SELECT 1 FROM containers child JOIN stock_balances cs ON cs.container_id=child.id WHERE child.parent_id=c.id AND cs.quantity>0
    )) OR (c.state='sealed' AND s.quantity=0)
    OR (s.quantity>0 AND s.unit='loose_piece' AND c.state<>'open')
    OR (s.quantity>0 AND s.unit='prepared_half_box' AND (c.state<>'sealed'
      OR (l.half_preparation_snapshot='counted' AND (s.counted_pieces IS NULL OR s.counted_pieces<=0))
      OR (l.half_preparation_snapshot='commercial' AND s.counted_pieces IS NOT NULL)
      OR l.half_preparation_snapshot NOT IN ('counted','commercial')))
    OR (s.quantity>0 AND l.packing_model_snapshot<>'blister' AND s.unit IN ('intact_blister','loose_piece'))
    OR (s.quantity>0 AND l.packing_model_snapshot='whole' AND s.unit<>'sealed_box')
  ) THEN RAISE EXCEPTION 'Physical state does not match the historical packaging model' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_cost_openings_immutable BEFORE UPDATE OR DELETE ON inventory_cost_openings FOR EACH ROW EXECUTE FUNCTION deny_history_change();
--> statement-breakpoint
CREATE TRIGGER inventory_cost_entries_immutable BEFORE UPDATE OR DELETE ON inventory_cost_entries FOR EACH ROW EXECUTE FUNCTION deny_history_change();
--> statement-breakpoint
CREATE FUNCTION guard_inventory_cost_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m inventory_movements%ROWTYPE; expected numeric; state jsonb;
BEGIN
  SELECT * INTO m FROM inventory_movements WHERE id=NEW.movement_id;
  IF m.creation_transaction IS DISTINCT FROM txid_current() THEN RAISE EXCEPTION 'Cost entry must share movement transaction' USING ERRCODE='23514'; END IF;
  SELECT item INTO state FROM jsonb_array_elements(m.after_state) item WHERE (item->>'id')::uuid=NEW.container_id;
  IF state IS NULL OR (state->>'costUsd')::numeric IS DISTINCT FROM NEW.after_usd THEN RAISE EXCEPTION 'Cost differs from physical movement snapshot' USING ERRCODE='23514'; END IF;
  SELECT after_usd INTO expected FROM inventory_cost_entries WHERE container_id=NEW.container_id ORDER BY entry_order DESC LIMIT 1;
  IF NOT FOUND THEN SELECT cost_usd INTO expected FROM inventory_cost_openings WHERE container_id=NEW.container_id; END IF;
  IF expected IS DISTINCT FROM NEW.before_usd THEN RAISE EXCEPTION 'Cost history is not contiguous' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_cost_creation_guard BEFORE INSERT ON inventory_cost_entries FOR EACH ROW EXECUTE FUNCTION guard_inventory_cost_entry();
--> statement-breakpoint
CREATE FUNCTION validate_inventory_cost_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; expected numeric; projected numeric;
BEGIN
  target:=coalesce(NEW.container_id,OLD.container_id);
  SELECT cost_usd INTO projected FROM stock_balances WHERE container_id=target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT after_usd INTO expected FROM inventory_cost_entries WHERE container_id=target ORDER BY entry_order DESC LIMIT 1;
  IF NOT FOUND THEN SELECT cost_usd INTO expected FROM inventory_cost_openings WHERE container_id=target; END IF;
  IF expected IS DISTINCT FROM projected THEN RAISE EXCEPTION 'Cost projection requires matching immutable cost history' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_cost_projection_valid AFTER INSERT OR UPDATE OR DELETE ON stock_balances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_cost_projection();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER cost_entry_projection_valid AFTER INSERT ON inventory_cost_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_cost_projection();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER cost_opening_projection_valid AFTER INSERT ON inventory_cost_openings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_cost_projection();
--> statement-breakpoint
CREATE FUNCTION validate_inventory_cost_conservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m inventory_movements%ROWTYPE; old_cost numeric; new_cost numeric;
BEGIN
  SELECT * INTO m FROM inventory_movements WHERE id=NEW.id;
  IF m.kind NOT IN ('open_box','open_blister','fraction','commercial_split','dispatch') THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(m.before_state) s WHERE s->>'costUsd' IS NULL) THEN RETURN NULL; END IF;
  SELECT coalesce(sum((s->>'costUsd')::numeric),0) INTO old_cost FROM jsonb_array_elements(m.before_state) s;
  SELECT coalesce(sum((s->>'costUsd')::numeric),0) INTO new_cost FROM jsonb_array_elements(m.after_state) s;
  IF (m.kind='dispatch' AND new_cost>old_cost) OR (m.kind<>'dispatch' AND new_cost<>old_cost) THEN
    RAISE EXCEPTION 'Opening or splitting must conserve historical cost' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER inventory_cost_conservation AFTER INSERT ON inventory_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_cost_conservation();
