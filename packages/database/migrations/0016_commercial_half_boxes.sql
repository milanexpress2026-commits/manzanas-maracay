-- Add exact commercial fractions without reclassifying lots or rewriting history.
-- Production guards must use the same effective presentations as previews and sales.
CREATE OR REPLACE FUNCTION guard_production_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF mm_runtime_environment()='production' AND NEW.confirmation_status='confirmed' AND (
  cardinality(NEW.allowed_presentations)<>(SELECT count(DISTINCT value) FROM unnest(NEW.allowed_presentations) value)
  OR ('blister'=ANY(NEW.allowed_presentations) AND (NEW.packing_model<>'blister' OR NEW.blisters_per_box IS NULL))
  OR ('half_box'=ANY(NEW.allowed_presentations) AND NEW.half_preparation NOT IN ('counted','commercial')
      AND NOT (NEW.packing_model='halves' OR (NEW.packing_model='blister' AND NEW.blisters_per_box IS NOT NULL)))
 ) THEN RAISE EXCEPTION 'Confirm only presentations with known preparation rules' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_production_sale_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rule packing_rules%ROWTYPE;
BEGIN
 IF mm_runtime_environment()<>'production' THEN RETURN NEW; END IF;
 SELECT * INTO rule FROM packing_rules WHERE variant_id=NEW.variant_id FOR SHARE;
 IF NOT FOUND OR rule.confirmation_status<>'confirmed' OR NOT (NEW.presentation=ANY(rule.allowed_presentations)
   OR (NEW.presentation='half_box' AND (rule.packing_model='halves' OR (rule.packing_model='blister' AND rule.blisters_per_box IS NOT NULL)))) THEN
  RAISE EXCEPTION 'Real sale requires a confirmed and permitted presentation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_price_presentation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF mm_runtime_environment()='production' AND NOT EXISTS(
  SELECT 1 FROM packing_rules WHERE variant_id=NEW.variant_id AND (NEW.presentation=ANY(allowed_presentations)
   OR (NEW.presentation='half_box' AND (packing_model='halves' OR (packing_model='blister' AND blisters_per_box IS NOT NULL))))
 ) THEN RAISE EXCEPTION 'Price presentation is not configured' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
ALTER TABLE stock_balances DROP CONSTRAINT stock_unit_valid;
--> statement-breakpoint
ALTER TABLE stock_balances ADD CONSTRAINT stock_unit_valid CHECK(unit IN ('sealed_box','intact_blister','prepared_half_box','loose_piece','box_fraction'));
--> statement-breakpoint
ALTER TABLE inventory_entries DROP CONSTRAINT entry_unit_valid;
--> statement-breakpoint
ALTER TABLE inventory_entries ADD CONSTRAINT entry_unit_valid CHECK(unit IN ('sealed_box','intact_blister','prepared_half_box','loose_piece','box_fraction'));
--> statement-breakpoint
ALTER TABLE stock_balances DROP CONSTRAINT physical_package_quantity;
--> statement-breakpoint
ALTER TABLE stock_balances ADD CONSTRAINT physical_package_quantity CHECK(unit IN ('loose_piece','box_fraction') OR quantity IN (0,1));
--> statement-breakpoint
CREATE FUNCTION validate_commercial_fraction_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM stock_balances s JOIN containers c ON c.id=s.container_id JOIN lots l ON l.id=c.lot_id
  WHERE s.unit='box_fraction' AND (
   s.counted_pieces IS NOT NULL OR l.packing_model_snapshot<>'blister' OR l.blisters_per_box_snapshot IS NULL
   OR c.kind NOT IN ('box','blister','half_box')
   OR (s.quantity>0 AND c.state<>'open')
   OR (s.quantity=0 AND c.state NOT IN ('empty','dispatched'))
   OR s.quantity > CASE c.kind WHEN 'box' THEN 2*l.blisters_per_box_snapshot WHEN 'half_box' THEN l.blisters_per_box_snapshot ELSE 2 END
  )) THEN RAISE EXCEPTION 'Commercial fraction must retain its exact package capacity and no fruit count' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER commercial_fraction_stock_valid AFTER INSERT OR UPDATE ON stock_balances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_commercial_fraction_state();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER commercial_fraction_container_valid AFTER INSERT OR UPDATE ON containers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_commercial_fraction_state();
--> statement-breakpoint
CREATE FUNCTION inventory_commercial_portions(items jsonb, blisters integer) RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(sum(CASE WHEN (s->>'quantity')::integer<=0 THEN 0
  WHEN s->>'unit'='box_fraction' THEN (s->>'quantity')::integer
  WHEN s->>'unit'='sealed_box' THEN 2*blisters
  WHEN s->>'unit'='intact_blister' THEN 2
  WHEN s->>'unit'='prepared_half_box' AND s->>'countedPieces' IS NULL THEN blisters
  ELSE 0 END),0)::bigint FROM jsonb_array_elements(items) s
$$;
--> statement-breakpoint
CREATE FUNCTION validate_commercial_fraction_conservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m inventory_movements; b integer; consumed bigint; allocated bigint;
BEGIN
 SELECT * INTO m FROM inventory_movements WHERE id=NEW.id;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.before_state||m.after_state) s WHERE s->>'unit'='box_fraction') THEN RETURN NULL; END IF;
 IF m.kind='reversal' THEN RETURN NULL; END IF; -- Existing reversal guard requires the exact inverse immutable snapshots.
 IF m.kind<>'dispatch' THEN
  IF NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(m.before_state) b FULL JOIN jsonb_array_elements(m.after_state) a ON a->>'id'=b->>'id'
    WHERE (b->>'unit'='box_fraction' OR a->>'unit'='box_fraction') AND
      (b->>'unit',b->>'quantity',b->>'costUsd',b->>'state') IS DISTINCT FROM (a->>'unit',a->>'quantity',a->>'costUsd',a->>'state')
  ) THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'Commercial fractions change only through an atomic sale or its reversal' USING ERRCODE='23514';
 END IF;
 SELECT blisters_per_box_snapshot INTO b FROM lots WHERE id=m.lot_id;
 consumed:=inventory_commercial_portions(m.before_state,b)-inventory_commercial_portions(m.after_state,b);
 SELECT coalesce(sum(CASE
  WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(m.before_state) s WHERE s->>'id'=a.container_id::text AND s->>'unit'='prepared_half_box' AND s->>'countedPieces' IS NOT NULL) THEN 0
  WHEN l.presentation='box' THEN 2*b WHEN l.presentation='blister' THEN 2 ELSE b END),0)
 INTO allocated FROM sale_allocations a JOIN sale_lines l ON l.id=a.sale_line_id WHERE a.movement_id=m.id;
 IF consumed<>allocated OR consumed<=0 THEN RAISE EXCEPTION 'Commercial fractions must equal the presentations sold exactly' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER commercial_fraction_conservation AFTER INSERT ON inventory_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_commercial_fraction_conservation();

--> statement-breakpoint
CREATE FUNCTION commercial_portion_source_state(movement uuid, source_id uuid, before_target uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE m inventory_movements; source jsonb; parent jsonb; delivered jsonb; used jsonb;
 b integer; units integer; basis numeric; children integer; position integer; take integer;
BEGIN
 SELECT * INTO m FROM inventory_movements WHERE id=movement;
 SELECT blisters_per_box_snapshot INTO b FROM lots WHERE id=m.lot_id;
 SELECT value INTO source FROM jsonb_array_elements(m.before_state) WHERE value->>'id'=source_id::text;
 IF FOUND THEN
  units:=inventory_commercial_portions(jsonb_build_array(source),b);
  basis:=(source->>'costUsd')::numeric;
 ELSE
  SELECT value INTO source FROM jsonb_array_elements(m.after_state) WHERE value->>'id'=source_id::text;
  SELECT value INTO parent FROM jsonb_array_elements(m.before_state) WHERE value->>'id'=source->>'parentId';
  IF source IS NULL OR parent IS NULL OR parent->>'unit'<>'sealed_box' OR source->>'kind'<>'blister' THEN
   RAISE EXCEPTION 'Commercial portion source has no immutable provenance' USING ERRCODE='23514';
  END IF;
  SELECT count(*),count(*) FILTER(WHERE sibling.ordinality<=chosen.ordinality) INTO children,position
  FROM jsonb_array_elements(m.after_state) WITH ORDINALITY sibling(value,ordinality)
  CROSS JOIN LATERAL(SELECT ordinality FROM jsonb_array_elements(m.after_state) WITH ORDINALITY selected(value,ordinality) WHERE selected.value->>'id'=source_id::text) chosen
  WHERE sibling.value->>'parentId'=source->>'parentId' AND sibling.value->>'kind'='blister';
  IF children<>b OR position<1 THEN RAISE EXCEPTION 'Original blister opening differs from its lot' USING ERRCODE='23514'; END IF;
  units:=2;basis:=(parent->>'costUsd')::numeric;
  IF basis IS NOT NULL THEN basis:=CASE WHEN position=children THEN basis-trunc(basis/children,4)*(children-1) ELSE trunc(basis/children,4) END; END IF;
 END IF;
 FOR delivered IN SELECT value FROM jsonb_array_elements(m.after_state) LOOP
  EXIT WHEN delivered->>'id'=before_target::text;
  FOR used IN SELECT value FROM jsonb_array_elements(coalesce(delivered->'portionSources','[]'::jsonb)) LOOP
   IF used->>'containerId'<>source_id::text THEN CONTINUE; END IF;
   take:=(used->>'takenPortions')::integer;
   IF take<=0 OR take>units OR (used->>'beforePortions')::integer<>units OR (used->>'costBeforeUsd')::numeric IS DISTINCT FROM basis THEN
    RAISE EXCEPTION 'Commercial portion provenance is not contiguous' USING ERRCODE='23514';
   END IF;
   IF basis IS NOT NULL THEN basis:=basis-trunc(basis*take/units,4); END IF;
   units:=units-take;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('portions',units,'costUsd',basis);
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION dispatched_container_cost(movement uuid, target uuid) RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE m inventory_movements%ROWTYPE; source jsonb; child jsonb; parent jsonb;
  children integer; portion_index integer; basis numeric; portion numeric; part jsonb; proven jsonb; parts integer; wanted integer; total_cost numeric:=0; unknown_cost boolean:=false;
BEGIN
 SELECT * INTO m FROM inventory_movements WHERE id=movement;
 SELECT value INTO source FROM jsonb_array_elements(m.before_state) WHERE value->>'id'=target::text;
 IF FOUND THEN RETURN (source->>'costUsd')::numeric; END IF;
 SELECT value INTO child FROM jsonb_array_elements(m.after_state) WHERE value->>'id'=target::text;

 IF child ? 'portionSources' THEN
  SELECT count(*),count(DISTINCT value->>'containerId') INTO parts,wanted FROM jsonb_array_elements(child->'portionSources');
  IF parts<1 OR parts<>wanted THEN RAISE EXCEPTION 'Commercial dispatch needs distinct source portions' USING ERRCODE='23514'; END IF;
  FOR part IN SELECT value FROM jsonb_array_elements(child->'portionSources') LOOP
   proven:=commercial_portion_source_state(movement,(part->>'containerId')::uuid,target);
   children:=(proven->>'portions')::integer;wanted:=(part->>'takenPortions')::integer;basis:=(proven->>'costUsd')::numeric;
   IF wanted<=0 OR wanted>children OR (part->>'beforePortions')::integer<>children OR (part->>'costBeforeUsd')::numeric IS DISTINCT FROM basis THEN
    RAISE EXCEPTION 'Commercial dispatch cost differs from its source' USING ERRCODE='23514';
   END IF;
   IF basis IS NULL THEN unknown_cost:=true; ELSE total_cost:=total_cost+trunc(basis*wanted/children,4); END IF;
  END LOOP;
  RETURN CASE WHEN unknown_cost THEN NULL ELSE total_cost END;
 END IF;
 SELECT value INTO parent FROM jsonb_array_elements(m.before_state) WHERE value->>'id'=child->>'parentId';
 IF parent IS NULL OR parent->>'unit'<>'sealed_box' OR child->>'unit' NOT IN ('intact_blister','prepared_half_box') THEN
   RAISE EXCEPTION 'Dispatch source has no historical cost provenance' USING ERRCODE='23514';
 END IF;
 SELECT count(*),count(*) FILTER (WHERE sibling.ordinality<=chosen.ordinality) INTO children,portion_index
 FROM jsonb_array_elements(m.after_state) WITH ORDINALITY AS sibling(value,ordinality)
 CROSS JOIN LATERAL (SELECT ordinality FROM jsonb_array_elements(m.after_state) WITH ORDINALITY AS selected(value,ordinality)
   WHERE selected.value->>'id'=target::text) chosen
 WHERE sibling.value->>'parentId'=child->>'parentId' AND (sibling.value->>'unit'=child->>'unit'
   OR (child->>'unit'='intact_blister' AND sibling.value->>'kind'='blister' AND sibling.value->>'unit'='box_fraction'))
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.before_state) old WHERE old->>'id'=sibling.value->>'id');
 IF children<1 OR portion_index<1 THEN RAISE EXCEPTION 'Dispatch portions missing' USING ERRCODE='23514'; END IF;
 basis:=(parent->>'costUsd')::numeric;
 IF basis IS NULL THEN RETURN NULL; END IF;
 portion:=trunc(basis/children,4);
 RETURN CASE WHEN portion_index=children THEN basis-portion*(children-1) ELSE portion END;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_commercial_sale(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s sales; total numeric; cost numeric; paid numeric;
BEGIN
  SELECT * INTO s FROM sales WHERE id=target;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM clients WHERE id=s.client_id AND is_demo<>s.is_demo) THEN
    RAISE EXCEPTION 'Demo and real customer operations cannot be mixed' USING ERRCODE='23514';
  END IF;
  SELECT sum(line_total_usd),CASE WHEN bool_or(cost_usd IS NULL) THEN NULL ELSE sum(cost_usd) END
    INTO total,cost FROM sale_lines WHERE sale_id=target;
  IF total IS NULL OR total<>s.total_usd OR cost IS DISTINCT FROM s.cost_usd OR s.status<>'confirmed' THEN
    RAISE EXCEPTION 'A confirmed sale requires exact lines and historical totals' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM sale_lines l LEFT JOIN LATERAL (
    SELECT sum(quantity) AS quantity,CASE WHEN bool_or(cost_usd IS NULL) THEN NULL ELSE sum(cost_usd) END AS cost
    FROM sale_allocations a WHERE a.sale_line_id=l.id
  ) a ON true WHERE l.sale_id=target AND (coalesce(a.quantity,0)<>l.quantity OR a.cost IS DISTINCT FROM l.cost_usd)) THEN
    RAISE EXCEPTION 'Sale quantity and FIFO allocations disagree' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM sale_allocations a JOIN sale_lines l ON l.id=a.sale_line_id
    JOIN lots lot ON lot.id=a.lot_id JOIN containers c ON c.id=a.container_id JOIN inventory_movements m ON m.id=a.movement_id
    WHERE l.sale_id=target AND (lot.variant_id<>l.variant_id OR c.lot_id<>lot.id OR m.lot_id<>lot.id OR m.kind<>'dispatch'
      OR m.creation_transaction<>s.creation_transaction OR lot.is_demo<>s.is_demo
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.after_state) AS dispatched_state(value) WHERE dispatched_state.value->>'id'=c.id::text AND dispatched_state.value->>'state'='dispatched' AND (dispatched_state.value->>'quantity')::integer=0))) THEN
    RAISE EXCEPTION 'Sale allocation must match its own atomic physical dispatch' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM sale_allocations a JOIN sale_lines l ON l.id=a.sale_line_id
    JOIN lots lot ON lot.id=a.lot_id JOIN inventory_movements m ON m.id=a.movement_id
    WHERE l.sale_id=target AND (lot.received_at>s.sold_at OR NOT(l.presentation=ANY(lot.allowed_presentations_snapshot) OR (l.presentation='half_box' AND (lot.packing_model_snapshot='halves' OR (lot.packing_model_snapshot='blister' AND lot.blisters_per_box_snapshot>0))))
      OR l.commercial_unit_label_snapshot IS DISTINCT FROM lot.commercial_unit_label_snapshot
      OR a.cost_usd IS DISTINCT FROM dispatched_container_cost(m.id,a.container_id)
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.after_state) AS snapshot(value) WHERE snapshot.value->>'id'=a.container_id::text
        AND snapshot.value->>'unit'=CASE l.presentation WHEN 'box' THEN 'sealed_box' WHEN 'blister' THEN 'intact_blister' ELSE 'prepared_half_box' END))) THEN
    RAISE EXCEPTION 'Sale presentation and cost must match its historical physical source' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM inventory_movements m WHERE m.id IN(
      SELECT a.movement_id FROM sale_allocations a JOIN sale_lines l ON l.id=a.sale_line_id WHERE l.sale_id=target)
    AND (
      coalesce((SELECT sum(a.cost_usd) FROM sale_allocations a WHERE a.movement_id=m.id),0)
         <>coalesce((SELECT sum((snapshot.value->>'costUsd')::numeric) FROM jsonb_array_elements(m.before_state) AS snapshot(value)),0)
           -coalesce((SELECT sum((snapshot.value->>'costUsd')::numeric) FROM jsonb_array_elements(m.after_state) AS snapshot(value)),0)
      OR (SELECT count(*) FROM sale_allocations a WHERE a.movement_id=m.id)
         <>(SELECT count(*) FROM jsonb_array_elements(m.after_state) AS snapshot(value) WHERE snapshot.value->>'state'='dispatched')
    )) THEN RAISE EXCEPTION 'Commercial allocations must reconcile all dispatched containers and known historical cost' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(a.amount_usd),0) INTO paid FROM payment_applications a
    WHERE a.sale_id=target AND NOT EXISTS(SELECT 1 FROM payment_reversals r WHERE r.payment_id=a.payment_id);
  IF paid>s.total_usd THEN RAISE EXCEPTION 'Payment exceeds the sale balance' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM sale_cancellations WHERE sale_id=target) THEN
    IF paid<>0 OR EXISTS(SELECT 1 FROM sale_allocations a JOIN sale_lines l ON l.id=a.sale_line_id WHERE l.sale_id=target
      AND NOT EXISTS(SELECT 1 FROM inventory_movements r WHERE r.reversal_of=a.movement_id)) THEN
      RAISE EXCEPTION 'Cancellation requires reversed stock and no active payment' USING ERRCODE='23514';
    END IF;
  END IF;
END;
$$;
