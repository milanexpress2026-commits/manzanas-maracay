ALTER TABLE "sale_lines" DROP CONSTRAINT "sale_basis_valid";--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "unit_cost_usd" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_lines" ALTER COLUMN "unit_cost_usd" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_lines" ALTER COLUMN "reference_unit_usd" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_lines" ALTER COLUMN "cost_usd" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sale_lines" ALTER COLUMN "cost_usd" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "cost_usd" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "cost_usd" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_allocations" ALTER COLUMN "cost_usd" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "commercial_unit_label_snapshot" text;--> statement-breakpoint
ALTER TABLE "packing_rules" ADD COLUMN "commercial_unit_label" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "usdt_reference_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "conversion_rounding_usd" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "commercial_unit_label_snapshot" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_usdt_reference_rate_id_usdt_rates_id_fk" FOREIGN KEY ("usdt_reference_rate_id") REFERENCES "public"."usdt_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_usdt_reference_rate_idx" ON "payments" USING btree ("usdt_reference_rate_id");--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lot_commercial_unit_valid" CHECK ("lots"."commercial_unit_label_snapshot" is null or (length(btrim("lots"."commercial_unit_label_snapshot")) between 1 and 80 and "lots"."packing_model_snapshot"='whole' and "lots"."box_weight_kg_snapshot" is null));--> statement-breakpoint
ALTER TABLE "packing_rules" ADD CONSTRAINT "packing_commercial_unit_valid" CHECK ("packing_rules"."commercial_unit_label" is null or (length(btrim("packing_rules"."commercial_unit_label")) between 1 and 80 and "packing_rules"."packing_model"='whole' and "packing_rules"."box_weight_kg" is null));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payment_reference_currency" CHECK ("payments"."usdt_reference_rate_id" is null or "payments"."currency"='USDT');--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payment_rounding_currency" CHECK ("payments"."currency"='VES' or "payments"."conversion_rounding_usd"=0);--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_manual_price_valid" CHECK (("sale_lines"."price_basis"='manual' and "sale_lines"."reference_unit_usd" is null and "sale_lines"."agreed_unit_usd">0) or ("sale_lines"."price_basis"<>'manual' and "sale_lines"."reference_unit_usd" is not null));--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_commercial_unit_valid" CHECK ("sale_lines"."commercial_unit_label_snapshot" is null or (length(btrim("sale_lines"."commercial_unit_label_snapshot")) between 1 and 80 and "sale_lines"."presentation"='box'));--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_basis_valid" CHECK ("sale_lines"."price_basis" in ('usd_cash_promo','ves_regular','manual'));

--> statement-breakpoint
-- A new unknown purchase cost is NULL, never a fabricated zero. Historical
-- records are not updated; nullable equality still ties each lot to its receipt.
CREATE OR REPLACE FUNCTION guard_receipt_lot_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line purchase_lines%ROWTYPE; purchase purchases%ROWTYPE; rule packing_rules%ROWTYPE;
BEGIN
  SELECT * INTO rule FROM packing_rules WHERE id=NEW.packing_rule_id;
  IF NEW.commercial_unit_label_snapshot IS DISTINCT FROM rule.commercial_unit_label THEN
    RAISE EXCEPTION 'Receipt must preserve its reviewed commercial unit' USING ERRCODE='23514';
  END IF;
  IF NEW.purchase_line_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO line FROM purchase_lines WHERE id=NEW.purchase_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt line does not exist' USING ERRCODE='23503'; END IF;
  SELECT * INTO purchase FROM purchases WHERE id=line.purchase_id;
  IF NOT FOUND OR NEW.variant_id IS DISTINCT FROM line.variant_id
    OR purchase.status<>'received' OR (NEW.unit_cost_usd IS NOT NULL AND NEW.unit_cost_usd<=0)
    OR NEW.supplier_id IS DISTINCT FROM purchase.supplier_id
    OR NEW.is_demo IS DISTINCT FROM purchase.is_demo
    OR NEW.unit_cost_usd IS DISTINCT FROM line.unit_cost_usd
    OR NEW.received_boxes IS DISTINCT FROM line.quantity OR line.presentation<>'box'
  THEN RAISE EXCEPTION 'Receipt lot and purchase context disagree' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION guard_commercial_unit_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.commercial_unit_label IS DISTINCT FROM OLD.commercial_unit_label AND
   EXISTS(SELECT 1 FROM lots WHERE packing_rule_id=OLD.id) THEN
  RAISE EXCEPTION 'A commercial unit with historical lots cannot be reclassified' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER packing_commercial_unit_identity BEFORE UPDATE ON packing_rules FOR EACH ROW EXECUTE FUNCTION guard_commercial_unit_identity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_settlement_agreement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; s sales;
BEGIN
 IF TG_TABLE_NAME='sales' THEN
  target:=NEW.id;
  IF NEW.settlement_basis='legacy_bcv' THEN
   RAISE EXCEPTION 'New sales require an explicit current settlement agreement' USING ERRCODE='23514';
  END IF;
 ELSE target:=NEW.sale_id;
 END IF;
 SELECT * INTO s FROM sales WHERE id=target;
 IF s.settlement_basis<>'legacy_bcv' AND EXISTS(
  SELECT 1 FROM sale_lines WHERE sale_id=target AND price_basis NOT IN ('manual',CASE s.settlement_basis WHEN 'divisa' THEN 'usd_cash_promo' ELSE 'ves_regular' END)
 ) THEN RAISE EXCEPTION 'Sale lines must preserve their agreed settlement basis' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$$;
--> statement-breakpoint
-- Recover one dispatched unit's exact historical cost, including an automatic
-- opening/split in the same movement. JSON order is the original allocation
-- order: all earlier portions round down and the last keeps the residue.
CREATE FUNCTION dispatched_container_cost(movement uuid, target uuid) RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE m inventory_movements%ROWTYPE; source jsonb; child jsonb; parent jsonb;
  children integer; portion_index integer; basis numeric; portion numeric;
BEGIN
 SELECT * INTO m FROM inventory_movements WHERE id=movement;
 SELECT value INTO source FROM jsonb_array_elements(m.before_state) WHERE value->>'id'=target::text;
 IF FOUND THEN RETURN (source->>'costUsd')::numeric; END IF;
 SELECT value INTO child FROM jsonb_array_elements(m.after_state) WHERE value->>'id'=target::text;
 SELECT value INTO parent FROM jsonb_array_elements(m.before_state) WHERE value->>'id'=child->>'parentId';
 IF parent IS NULL OR parent->>'unit'<>'sealed_box' OR child->>'unit' NOT IN ('intact_blister','prepared_half_box') THEN
   RAISE EXCEPTION 'Dispatch source has no historical cost provenance' USING ERRCODE='23514';
 END IF;
 SELECT count(*),count(*) FILTER (WHERE sibling.ordinality<=chosen.ordinality) INTO children,portion_index
 FROM jsonb_array_elements(m.after_state) WITH ORDINALITY AS sibling(value,ordinality)
 CROSS JOIN LATERAL (SELECT ordinality FROM jsonb_array_elements(m.after_state) WITH ORDINALITY AS selected(value,ordinality)
   WHERE selected.value->>'id'=target::text) chosen
 WHERE sibling.value->>'parentId'=child->>'parentId' AND sibling.value->>'unit'=child->>'unit'
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
    WHERE l.sale_id=target AND (lot.received_at>s.sold_at OR NOT(l.presentation=ANY(lot.allowed_presentations_snapshot))
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_commercial_payment(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p payments; applied numeric; quoted_rate numeric; verified timestamptz; fetched timestamptz; starts timestamptz; ends timestamptz;
BEGIN
 SELECT * INTO p FROM payments WHERE id=target;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT sum(amount_usd) INTO applied FROM payment_applications WHERE payment_id=target;
 IF applied IS NULL OR applied<>p.amount_usd OR p.amount_usd<>round(p.amount_usd,2) THEN
  RAISE EXCEPTION 'Payment must be completely allocated in cents' USING ERRCODE='23514';
 END IF;
 IF p.currency='VES' THEN
  IF p.usdt_rate_id IS NOT NULL THEN
   SELECT rate,verified_at,fetched_at,valid_from,valid_until INTO quoted_rate,verified,fetched,starts,ends FROM usdt_rates WHERE id=p.usdt_rate_id;
  ELSE
   SELECT rate,verified_at,fetched_at,valid_from,valid_until INTO quoted_rate,verified,fetched,starts,ends FROM bcv_rates WHERE id=p.bcv_rate_id;
  END IF;
  IF quoted_rate IS NULL OR verified>p.received_at OR fetched>verified OR p.received_at<starts OR p.received_at>=ends
    OR p.conversion_rounding_usd IS DISTINCT FROM p.amount_usd-round(p.amount/quoted_rate,2)
    OR (p.amount_usd<>round(p.amount/quoted_rate,2) AND p.amount<>round(p.amount_usd*quoted_rate,2)) THEN
   RAISE EXCEPTION 'Payment requires its verified historical rate and exact auditable settlement rounding' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM payment_applications a JOIN sales s ON s.id=a.sale_id WHERE a.payment_id=target
   AND ((s.settlement_basis='divisa' AND p.usdt_rate_id IS NULL) OR (s.settlement_basis IN ('bcv','legacy_bcv') AND p.bcv_rate_id IS NULL))) THEN
   RAISE EXCEPTION 'Payment rate must match the original sale agreement' USING ERRCODE='23514';
  END IF;
 END IF;
 IF p.usdt_reference_rate_id IS NOT NULL THEN
  SELECT rate,verified_at,fetched_at,valid_from,valid_until INTO quoted_rate,verified,fetched,starts,ends FROM usdt_rates WHERE id=p.usdt_reference_rate_id;
  IF p.currency<>'USDT' OR quoted_rate IS NULL OR verified>p.received_at OR fetched>verified OR p.received_at<starts OR p.received_at>=ends THEN
   RAISE EXCEPTION 'Informative USDT reference must be verified at payment time' USING ERRCODE='23514';
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM payment_applications a JOIN sales s ON s.id=a.sale_id WHERE a.payment_id=target AND s.is_demo<>p.is_demo) THEN
  RAISE EXCEPTION 'Demo and real collections cannot be mixed' USING ERRCODE='23514';
 END IF;
END;
$$;
--> statement-breakpoint
-- Unknown provenance cannot acquire a known value through a physical operation.
-- Known portions still reconcile separately even when a movement contains NULLs.
CREATE OR REPLACE FUNCTION validate_inventory_cost_conservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m inventory_movements%ROWTYPE; old_cost numeric; new_cost numeric; lot_cost numeric; item jsonb; source jsonb;
BEGIN
 SELECT * INTO m FROM inventory_movements WHERE id=NEW.id;
 IF m.kind='receipt' THEN
  SELECT unit_cost_usd INTO lot_cost FROM lots WHERE id=m.lot_id;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(m.after_state) s
    WHERE (s->>'quantity')::integer>0 AND (s->>'costUsd')::numeric IS DISTINCT FROM lot_cost) THEN
   RAISE EXCEPTION 'Receipt cost must preserve known or unknown lot provenance' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
 END IF;
 IF m.kind NOT IN ('open_box','open_blister','fraction','commercial_split','dispatch','adjustment') THEN RETURN NULL; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(m.after_state) WHERE (value->>'quantity')::integer>0 LOOP
  SELECT value INTO source FROM jsonb_array_elements(m.before_state) WHERE value->>'id'=item->>'id';
  IF source IS NULL THEN
   SELECT value INTO source FROM jsonb_array_elements(m.before_state) WHERE value->>'id'=item->>'parentId' AND (value->>'quantity')::integer>0;
  END IF;
  IF source IS NULL AND m.kind='fraction' THEN
   SELECT value INTO source FROM jsonb_array_elements(m.before_state) WHERE (value->>'quantity')::integer>0 LIMIT 1;
  END IF;
  IF source IS NULL OR ((source->>'costUsd' IS NULL) IS DISTINCT FROM (item->>'costUsd' IS NULL)) THEN
   RAISE EXCEPTION 'Physical operation must preserve cost knowledge of its source' USING ERRCODE='23514';
  END IF;
  IF m.kind='adjustment' AND source->>'costUsd' IS NOT NULL AND
    (item->>'costUsd')::numeric IS DISTINCT FROM trunc((source->>'costUsd')::numeric*(item->>'quantity')::numeric/nullif((source->>'quantity')::numeric,0),4) THEN
   RAISE EXCEPTION 'Count adjustment must preserve exact historical cost proportion' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF m.kind='adjustment' THEN RETURN NULL; END IF;
 SELECT coalesce(sum((s->>'costUsd')::numeric),0) INTO old_cost FROM jsonb_array_elements(m.before_state) s;
 SELECT coalesce(sum((s->>'costUsd')::numeric),0) INTO new_cost FROM jsonb_array_elements(m.after_state) s;
 IF (m.kind='dispatch' AND new_cost>old_cost)
    OR (m.kind<>'dispatch' AND new_cost<>old_cost) THEN
  RAISE EXCEPTION 'Physical operations must conserve known historical cost' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$$;
--> statement-breakpoint
-- Current-time verification belongs to INSERT, never historical validation:
-- restored transaction IDs may coincide with a new database's transaction IDs.
-- Capture the wall clock after waiting for locks, rather than transaction start.
CREATE FUNCTION guard_new_payment_quote() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE instant timestamptz:=clock_timestamp(); quoted_rate numeric; verified timestamptz;
  fetched timestamptz; starts timestamptz; ends timestamptz;
BEGIN
 IF NEW.currency='VES' THEN
  IF NEW.usdt_rate_id IS NOT NULL THEN
   SELECT rate,verified_at,fetched_at,valid_from,valid_until INTO quoted_rate,verified,fetched,starts,ends FROM usdt_rates WHERE id=NEW.usdt_rate_id;
  ELSE
   SELECT rate,verified_at,fetched_at,valid_from,valid_until INTO quoted_rate,verified,fetched,starts,ends FROM bcv_rates WHERE id=NEW.bcv_rate_id;
  END IF;
  IF quoted_rate IS NULL OR quoted_rate<=0 OR verified>instant OR fetched>verified OR instant<starts OR instant>=ends THEN
   RAISE EXCEPTION 'New collection requires a currently valid verified quote' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.usdt_reference_rate_id IS NOT NULL THEN
  SELECT rate,verified_at,fetched_at,valid_from,valid_until INTO quoted_rate,verified,fetched,starts,ends FROM usdt_rates WHERE id=NEW.usdt_reference_rate_id;
  IF NEW.currency<>'USDT' OR quoted_rate IS NULL OR quoted_rate<=0 OR fetched>verified
    OR verified>NEW.received_at OR NEW.received_at<starts OR NEW.received_at>=ends
    OR verified>instant OR instant<starts THEN
   RAISE EXCEPTION 'Informative USDT reference must match the effective payment time' USING ERRCODE='23514';
  END IF;
  -- A reference that expires between application review and this INSERT cannot
  -- stop an actual USDT payment. Its USD settlement remains exactly 1:1.
  IF instant>=ends THEN NEW.usdt_reference_rate_id:=NULL; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER payments_current_quote BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION guard_new_payment_quote();
