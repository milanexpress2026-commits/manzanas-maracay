CREATE TABLE "sale_additions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"total_usd" numeric(18, 2) NOT NULL,
	"cost_usd" numeric(18, 4),
	"actor" text NOT NULL,
	"creation_transaction" bigint DEFAULT txid_current() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_additions_id_sale_uq" UNIQUE("id","sale_id"),
	CONSTRAINT "sale_additions_amounts_valid" CHECK ("sale_additions"."total_usd">0 and "sale_additions"."cost_usd">=0)
);
--> statement-breakpoint
CREATE TABLE "sale_stock_returns" (
	"allocation_id" uuid PRIMARY KEY NOT NULL,
	"container_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_stock_returns_container_id_unique" UNIQUE("container_id")
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "movement_kind_valid";--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "addition_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "seller" text;--> statement-breakpoint
ALTER TABLE "sale_additions" ADD CONSTRAINT "sale_additions_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_stock_returns" ADD CONSTRAINT "sale_stock_returns_allocation_id_sale_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."sale_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_stock_returns" ADD CONSTRAINT "sale_stock_returns_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_stock_returns" ADD CONSTRAINT "sale_stock_returns_movement_id_inventory_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_additions_sale_idx" ON "sale_additions" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_stock_returns_movement_idx" ON "sale_stock_returns" USING btree ("movement_id");--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_addition_id_sale_additions_id_fk" FOREIGN KEY ("addition_id") REFERENCES "public"."sale_additions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "movement_kind_valid" CHECK ("inventory_movements"."kind" in ('receipt','dispatch','open_box','open_blister','fraction','commercial_split','adjustment','transfer','reversal','sale_return'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_valid" CHECK ("sales"."seller" is null or "sales"."seller" in ('carlos','randy'));
--> statement-breakpoint
-- Historical documents stay immutable. Each addition has its own transaction,
-- quantities, price and payment; the balance is derived from both sets of lines.
CREATE INDEX sales_date_seller_idx ON sales(sold_at,seller);
ALTER TABLE sale_lines ADD CONSTRAINT sale_line_addition_sale_fk FOREIGN KEY(addition_id,sale_id) REFERENCES sale_additions(id,sale_id);
CREATE TRIGGER additions_append_only BEFORE UPDATE OR DELETE ON sale_additions FOR EACH ROW EXECUTE FUNCTION deny_history_change();
CREATE TRIGGER returns_append_only BEFORE UPDATE OR DELETE ON sale_stock_returns FOR EACH ROW EXECUTE FUNCTION deny_history_change();
CREATE TRIGGER additions_serialized BEFORE INSERT ON sale_additions FOR EACH STATEMENT EXECUTE FUNCTION lock_inventory_tree();
CREATE TRIGGER returns_serialized BEFORE INSERT ON sale_stock_returns FOR EACH STATEMENT EXECUTE FUNCTION lock_inventory_tree();
CREATE FUNCTION guard_sale_addition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s sales;
BEGIN
 SELECT * INTO s FROM sales WHERE id=NEW.sale_id;
 IF s.id IS NULL OR s.status<>'confirmed' OR EXISTS(SELECT 1 FROM sale_cancellations WHERE sale_id=s.id)
  OR NEW.creation_transaction<>txid_current() OR NEW.created_at<s.sold_at THEN
  RAISE EXCEPTION 'Only a current addition to an active sale is allowed' USING ERRCODE='23514'; END IF;
 IF s.condition='credit' AND EXISTS(SELECT 1 FROM payment_applications a WHERE a.sale_id=s.id
   AND NOT EXISTS(SELECT 1 FROM payment_reversals r WHERE r.payment_id=a.payment_id)) THEN
  RAISE EXCEPTION 'Credit with active payments cannot be edited' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER addition_creation_guard BEFORE INSERT ON sale_additions FOR EACH ROW EXECUTE FUNCTION guard_sale_addition();
CREATE OR REPLACE FUNCTION guard_commercial_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE document_transaction bigint;
BEGIN
 IF TG_TABLE_NAME='sale_lines' THEN
  SELECT coalesce(e.creation_transaction,s.creation_transaction) INTO document_transaction
   FROM sales s LEFT JOIN sale_additions e ON e.id=NEW.addition_id AND e.sale_id=s.id WHERE s.id=NEW.sale_id;
 ELSIF TG_TABLE_NAME='sale_allocations' THEN
  SELECT coalesce(e.creation_transaction,s.creation_transaction) INTO document_transaction FROM sales s
   JOIN sale_lines l ON l.sale_id=s.id LEFT JOIN sale_additions e ON e.id=l.addition_id WHERE l.id=NEW.sale_line_id;
 ELSE SELECT creation_transaction INTO document_transaction FROM payments WHERE id=NEW.payment_id; END IF;
 IF document_transaction IS DISTINCT FROM txid_current() THEN
  RAISE EXCEPTION 'Commercial lines belong to their original document or addition transaction' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE VIEW sale_totals WITH (security_invoker=true) AS
 SELECT s.id AS sale_id,(s.total_usd+coalesce(e.total,0))::numeric(18,2) AS total_usd,
 coalesce(e.version,0)::integer AS version FROM sales s LEFT JOIN LATERAL
 (SELECT sum(total_usd) AS total,count(*) AS version FROM sale_additions WHERE sale_id=s.id) e ON true;
CREATE OR REPLACE VIEW receivables AS
 SELECT s.id AS sale_id,s.client_id,s.number,CASE WHEN d.id IS NULL THEN s.due_date ELSE d.due_date END AS due_date,
 'USD'::text AS currency,t.total_usd,coalesce(p.paid,0)::numeric(18,2) AS paid_usd,
 (t.total_usd-coalesce(p.paid,0))::numeric(18,2) AS balance_usd
 FROM sales s JOIN sale_totals t ON t.sale_id=s.id
 LEFT JOIN LATERAL(SELECT id,due_date FROM sale_date_events WHERE sale_id=s.id ORDER BY event_order DESC LIMIT 1)d ON true
 LEFT JOIN LATERAL(SELECT sum(a.amount_usd) AS paid FROM payment_applications a WHERE a.sale_id=s.id
  AND NOT EXISTS(SELECT 1 FROM payment_reversals r WHERE r.payment_id=a.payment_id))p ON true
 WHERE s.status='confirmed' AND NOT EXISTS(SELECT 1 FROM sale_cancellations c WHERE c.sale_id=s.id);

--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_commercial_sale(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s sales; total numeric; cost numeric; paid numeric; e sale_additions;
BEGIN
  SELECT * INTO s FROM sales WHERE id=target;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM clients WHERE id=s.client_id AND is_demo<>s.is_demo) THEN
    RAISE EXCEPTION 'Demo and real customer operations cannot be mixed' USING ERRCODE='23514';
  END IF;
  SELECT sum(line_total_usd),CASE WHEN bool_or(cost_usd IS NULL) THEN NULL ELSE sum(cost_usd) END
    INTO total,cost FROM sale_lines WHERE sale_id=target AND addition_id IS NULL;
  IF total IS NULL OR total<>s.total_usd OR cost IS DISTINCT FROM s.cost_usd OR s.status<>'confirmed' THEN
    RAISE EXCEPTION 'A confirmed sale requires exact lines and historical totals' USING ERRCODE='23514';
  END IF;
  FOR e IN SELECT * FROM sale_additions WHERE sale_id=target LOOP
    SELECT sum(line_total_usd),CASE WHEN bool_or(cost_usd IS NULL) THEN NULL ELSE sum(cost_usd) END
      INTO total,cost FROM sale_lines WHERE addition_id=e.id;
    IF total IS DISTINCT FROM e.total_usd OR cost IS DISTINCT FROM e.cost_usd THEN
      RAISE EXCEPTION 'Addition requires exact immutable lines and cost' USING ERRCODE='23514'; END IF;
  END LOOP;
  s.total_usd:=s.total_usd+coalesce((SELECT sum(total_usd) FROM sale_additions WHERE sale_id=target),0);
  IF EXISTS(SELECT 1 FROM sale_lines l LEFT JOIN LATERAL (
    SELECT sum(quantity) AS quantity,CASE WHEN bool_or(cost_usd IS NULL) THEN NULL ELSE sum(cost_usd) END AS cost
    FROM sale_allocations a WHERE a.sale_line_id=l.id
  ) a ON true WHERE l.sale_id=target AND (coalesce(a.quantity,0)<>l.quantity OR a.cost IS DISTINCT FROM l.cost_usd)) THEN
    RAISE EXCEPTION 'Sale quantity and FIFO allocations disagree' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM sale_allocations a JOIN sale_lines l ON l.id=a.sale_line_id
    JOIN lots lot ON lot.id=a.lot_id JOIN containers c ON c.id=a.container_id JOIN inventory_movements m ON m.id=a.movement_id
    WHERE l.sale_id=target AND (lot.variant_id<>l.variant_id OR c.lot_id<>lot.id OR m.lot_id<>lot.id OR m.kind<>'dispatch'
      OR m.creation_transaction<>coalesce((SELECT creation_transaction FROM sale_additions WHERE id=l.addition_id),s.creation_transaction) OR lot.is_demo<>s.is_demo
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.after_state) AS dispatched_state(value) WHERE dispatched_state.value->>'id'=c.id::text AND dispatched_state.value->>'state'='dispatched' AND (dispatched_state.value->>'quantity')::integer=0))) THEN
    RAISE EXCEPTION 'Sale allocation must match its own atomic physical dispatch' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM sale_allocations a JOIN sale_lines l ON l.id=a.sale_line_id
    JOIN lots lot ON lot.id=a.lot_id JOIN inventory_movements m ON m.id=a.movement_id
    WHERE l.sale_id=target AND (lot.received_at>coalesce((SELECT created_at FROM sale_additions WHERE id=l.addition_id),s.sold_at) OR NOT(l.presentation=ANY(lot.allowed_presentations_snapshot) OR (l.presentation='half_box' AND (lot.packing_model_snapshot='halves' OR (lot.packing_model_snapshot='blister' AND lot.blisters_per_box_snapshot>0))))
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
      AND NOT EXISTS(SELECT 1 FROM inventory_movements r WHERE r.reversal_of=a.movement_id)
      AND NOT EXISTS(SELECT 1 FROM sale_stock_returns r WHERE r.allocation_id=a.id)) THEN
      RAISE EXCEPTION 'Cancellation requires reversed stock and no active payment' USING ERRCODE='23514';
    END IF;
  END IF;
END;
$$;

--> statement-breakpoint
CREATE FUNCTION validate_sale_addition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM validate_commercial_sale(NEW.sale_id);
 IF EXISTS(SELECT 1 FROM sales s JOIN receivables r ON r.sale_id=s.id
    WHERE s.id=NEW.sale_id AND s.condition='cash' AND r.balance_usd<>0) THEN
  RAISE EXCEPTION 'Cash additions must be paid in full in the same transaction' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER addition_document_valid AFTER INSERT ON sale_additions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_sale_addition();
CREATE FUNCTION guard_sale_stock_return() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM inventory_movements m WHERE m.id=NEW.movement_id AND m.kind='sale_return'
  AND m.creation_transaction=txid_current()) THEN
  RAISE EXCEPTION 'Stock returns must belong to their cancellation transaction' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER stock_return_creation_guard BEFORE INSERT ON sale_stock_returns FOR EACH ROW EXECUTE FUNCTION guard_sale_stock_return();
CREATE FUNCTION validate_sale_stock_return() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m inventory_movements; item jsonb; a record; expected_pieces integer;
BEGIN
 SELECT * INTO m FROM inventory_movements WHERE id=NEW.id;
 IF m.kind<>'sale_return' THEN RETURN NULL; END IF;
 IF jsonb_array_length(m.before_state)<>0 OR jsonb_array_length(m.after_state)=0
  OR jsonb_array_length(m.after_state)<>(SELECT count(*) FROM sale_stock_returns WHERE movement_id=m.id) THEN
  RAISE EXCEPTION 'Cancellation returns only its own delivered packages' USING ERRCODE='23514'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(m.after_state) LOOP
  SELECT sa.*,l.sale_id,l.presentation,original.before_state,original.creation_transaction AS original_tx
   INTO a FROM sale_stock_returns r JOIN sale_allocations sa ON sa.id=r.allocation_id
   JOIN sale_lines l ON l.id=sa.sale_line_id JOIN inventory_movements original ON original.id=sa.movement_id
   WHERE r.movement_id=m.id AND r.container_id=(item->>'id')::uuid;
  SELECT (value->>'countedPieces')::integer INTO expected_pieces FROM jsonb_array_elements(a.before_state)
   WHERE value->>'id'=a.container_id::text;
  IF a.id IS NULL OR a.lot_id<>m.lot_id OR NOT EXISTS(SELECT 1 FROM sale_cancellations WHERE sale_id=a.sale_id)
   OR EXISTS(SELECT 1 FROM inventory_movements WHERE reversal_of=a.movement_id)
   OR item->>'parentId' IS NOT NULL OR (item->>'quantity')::integer<>1 OR item->>'state'<>'sealed'
   OR item->>'unit'<>(CASE a.presentation WHEN 'box' THEN 'sealed_box' WHEN 'blister' THEN 'intact_blister' ELSE 'prepared_half_box' END)
   OR (item->>'costUsd')::numeric IS DISTINCT FROM a.cost_usd
   OR (item->>'countedPieces')::integer IS DISTINCT FROM expected_pieces
   OR NOT EXISTS(SELECT 1 FROM containers WHERE id=(item->>'id')::uuid AND created_at>=m.created_at) THEN
   RAISE EXCEPTION 'Return must match cancelled allocation, historical cost and physical presentation' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER sale_stock_return_valid AFTER INSERT ON inventory_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_sale_stock_return();

--> statement-breakpoint
-- Returned commercial halves keep their exact half-box quantity, without invented fruit counts.
CREATE OR REPLACE FUNCTION validate_inventory_physical_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; affected uuid[]; c containers%ROWTYPE; s stock_balances%ROWTYPE; l lots%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='containers' THEN
  target:=coalesce(NEW.id,OLD.id);
  affected:=ARRAY[target,NEW.parent_id,OLD.parent_id];
 ELSE
  target:=coalesce(NEW.container_id,OLD.container_id);
  affected:=ARRAY[target,(SELECT parent_id FROM containers WHERE id=target)];
 END IF;
 -- Include children when the changed row is their parent, and both parents on
 -- reparent/delete so removing the last available child cannot leave an open box.
 FOR c IN
  SELECT * FROM containers WHERE id=ANY(affected)
  UNION SELECT * FROM containers WHERE parent_id=target
 LOOP
  SELECT * INTO s FROM stock_balances WHERE container_id=c.id;
  IF NOT FOUND THEN CONTINUE; END IF; -- The projection constraint requires the balance.
  SELECT * INTO l FROM lots WHERE id=c.lot_id;
  IF s.quantity>0 AND c.parent_id IS NOT NULL AND (
   c.kind NOT IN ('blister','loose_bin','half_box') OR EXISTS(
    SELECT 1 FROM containers parent WHERE parent.id=c.parent_id AND (parent.kind<>'box' OR parent.state<>'open')
   )
  ) THEN RAISE EXCEPTION 'Available contents require an open box parent' USING ERRCODE='23514'; END IF;
  IF (
   (c.state='open' AND s.quantity=0 AND NOT EXISTS (
    SELECT 1 FROM containers child JOIN stock_balances cs ON cs.container_id=child.id WHERE child.parent_id=c.id AND cs.quantity>0
   )) OR (c.state='sealed' AND s.quantity=0)
   OR (s.quantity>0 AND s.unit='loose_piece' AND c.state<>'open')
   OR (s.quantity>0 AND s.unit='prepared_half_box' AND (c.state<>'sealed'
    OR (l.half_preparation_snapshot='counted' AND (s.counted_pieces IS NULL OR s.counted_pieces<=0) AND NOT (s.counted_pieces IS NULL AND (l.packing_model_snapshot='halves' OR (l.packing_model_snapshot='blister' AND l.blisters_per_box_snapshot>0))))
    OR (l.half_preparation_snapshot='commercial' AND s.counted_pieces IS NOT NULL)
    OR (l.half_preparation_snapshot NOT IN ('counted','commercial') AND NOT (s.counted_pieces IS NULL AND (l.packing_model_snapshot='halves' OR (l.packing_model_snapshot='blister' AND l.blisters_per_box_snapshot>0))))))
   OR (s.quantity>0 AND l.packing_model_snapshot<>'blister' AND s.unit IN ('intact_blister','loose_piece'))
   OR (s.quantity>0 AND l.packing_model_snapshot='whole' AND s.unit<>'sealed_box')
  )
  THEN RAISE EXCEPTION 'Physical state does not match the historical packaging model' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END;
$$;
