CREATE TABLE "payment_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"expected_version" integer NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"amount_usd" numeric(18, 2) NOT NULL,
	"applications" jsonb NOT NULL,
	"kind" text NOT NULL,
	"sale_reduction_id" uuid,
	"credit_delta_usd" numeric(18, 2) NOT NULL,
	"actor" text NOT NULL,
	"reason" text NOT NULL,
	"creation_transaction" bigint DEFAULT txid_current() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_correction_version_uq" UNIQUE("payment_id","expected_version"),
	CONSTRAINT "correction_values_valid" CHECK ("payment_corrections"."expected_version">=0 and "payment_corrections"."amount">=0 and "payment_corrections"."amount_usd">=0 and "payment_corrections"."kind" in ('entry','refund','credit') and (("payment_corrections"."kind"='entry' and "payment_corrections"."sale_reduction_id" is null and "payment_corrections"."credit_delta_usd"=0) or ("payment_corrections"."kind"<>'entry' and "payment_corrections"."sale_reduction_id" is not null)) and jsonb_typeof("payment_corrections"."applications")='array'),
	CONSTRAINT "correction_reason_valid" CHECK (length(btrim("payment_corrections"."reason")) between 5 and 500)
);
--> statement-breakpoint
CREATE TABLE "sale_reduction_allocations" (
	"allocation_id" uuid PRIMARY KEY NOT NULL,
	"reduction_line_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_reduction_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reduction_id" uuid NOT NULL,
	"sale_line_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"reduction_usd" numeric(18, 2) NOT NULL,
	CONSTRAINT "reduction_line_uq" UNIQUE("reduction_id","sale_line_id"),
	CONSTRAINT "reduction_line_valid" CHECK ("sale_reduction_lines"."quantity">0 and "sale_reduction_lines"."reduction_usd">=0)
);
--> statement-breakpoint
CREATE TABLE "sale_reductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"expected_version" integer NOT NULL,
	"reduction_usd" numeric(18, 2) NOT NULL,
	"excess_usd" numeric(18, 2) NOT NULL,
	"resolution" text NOT NULL,
	"actor" text NOT NULL,
	"reason" text NOT NULL,
	"creation_transaction" bigint DEFAULT txid_current() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reduction_version_uq" UNIQUE("sale_id","expected_version"),
	CONSTRAINT "reduction_values_valid" CHECK ("sale_reductions"."expected_version">=0 and "sale_reductions"."reduction_usd">=0 and "sale_reductions"."excess_usd">=0 and "sale_reductions"."excess_usd"<="sale_reductions"."reduction_usd" and "sale_reductions"."resolution" in ('none','refund','credit') and (("sale_reductions"."excess_usd"=0 and "sale_reductions"."resolution"='none') or ("sale_reductions"."excess_usd">0 and "sale_reductions"."resolution"<>'none'))),
	CONSTRAINT "reduction_reason_valid" CHECK (length(btrim("sale_reductions"."reason")) between 5 and 500)
);
--> statement-breakpoint
ALTER TABLE "payment_corrections" ADD CONSTRAINT "payment_corrections_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_corrections" ADD CONSTRAINT "payment_corrections_sale_reduction_id_sale_reductions_id_fk" FOREIGN KEY ("sale_reduction_id") REFERENCES "public"."sale_reductions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_reduction_allocations" ADD CONSTRAINT "sale_reduction_allocations_allocation_id_sale_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."sale_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_reduction_allocations" ADD CONSTRAINT "sale_reduction_allocations_reduction_line_id_sale_reduction_lines_id_fk" FOREIGN KEY ("reduction_line_id") REFERENCES "public"."sale_reduction_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_reduction_lines" ADD CONSTRAINT "sale_reduction_lines_reduction_id_sale_reductions_id_fk" FOREIGN KEY ("reduction_id") REFERENCES "public"."sale_reductions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_reduction_lines" ADD CONSTRAINT "sale_reduction_lines_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_reductions" ADD CONSTRAINT "sale_reductions_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "correction_reduction_idx" ON "payment_corrections" USING btree ("sale_reduction_id");--> statement-breakpoint
CREATE INDEX "reduction_allocations_line_idx" ON "sale_reduction_allocations" USING btree ("reduction_line_id");--> statement-breakpoint
CREATE INDEX "reductions_line_idx" ON "sale_reduction_lines" USING btree ("sale_line_id");--> statement-breakpoint
CREATE INDEX "reductions_sale_idx" ON "sale_reductions" USING btree ("sale_id");
--> statement-breakpoint
-- Originals remain immutable. Current documents are projections of their corrections.
CREATE VIEW effective_payments WITH (security_invoker=true) AS
 SELECT p.id,p.number,p.method,p.actor,p.client_snapshot,p.is_demo,p.creation_transaction,p.client_id,p.currency,
 coalesce(c.amount,p.amount)::numeric(18,4) AS amount,coalesce(c.amount_usd,p.amount_usd)::numeric(18,4) AS amount_usd,
 p.bcv_rate_id,p.usdt_rate_id,p.usdt_reference_rate_id,
 CASE WHEN c.id IS NULL THEN p.conversion_rounding_usd WHEN p.currency='VES' THEN
 c.amount_usd-round(c.amount/coalesce(b.rate,u.rate),2) ELSE 0 END::numeric(18,2) AS conversion_rounding_usd,
 p.received_at,p.idempotency_key,p.created_at,coalesce(c.expected_version+1,0) AS version
 FROM payments p LEFT JOIN LATERAL(SELECT * FROM payment_corrections WHERE payment_id=p.id ORDER BY expected_version DESC LIMIT 1)c ON true
 LEFT JOIN bcv_rates b ON b.id=p.bcv_rate_id LEFT JOIN usdt_rates u ON u.id=p.usdt_rate_id;
CREATE VIEW effective_payment_applications WITH (security_invoker=true) AS
 SELECT a.id,a.payment_id,a.sale_id,a.client_id,
 CASE WHEN c.id IS NULL THEN a.amount_usd ELSE (j.value->>'amountUsd')::numeric END::numeric(18,4) AS amount_usd,
 CASE WHEN c.id IS NULL THEN a.balance_after_usd ELSE (j.value->>'balanceAfterUsd')::numeric END::numeric(18,2) AS balance_after_usd,a.created_at
 FROM payment_applications a LEFT JOIN LATERAL(SELECT * FROM payment_corrections WHERE payment_id=a.payment_id ORDER BY expected_version DESC LIMIT 1)c ON true
 LEFT JOIN LATERAL(SELECT value FROM jsonb_array_elements(c.applications) WHERE value->>'saleId'=a.sale_id::text)j ON true;
CREATE VIEW client_credit_balances WITH (security_invoker=true) AS
 SELECT c.id AS client_id,(coalesce(e.amount,0)-coalesce(p.amount,0))::numeric(18,2) AS credit_usd FROM clients c
 LEFT JOIN LATERAL(SELECT sum(pc.credit_delta_usd) AS amount FROM payment_corrections pc JOIN payments p ON p.id=pc.payment_id WHERE p.client_id=c.id)e ON true
 LEFT JOIN LATERAL(SELECT sum(amount_usd) AS amount FROM effective_payments p WHERE p.client_id=c.id AND p.method='client_credit'
 AND NOT EXISTS(SELECT 1 FROM payment_reversals r WHERE r.payment_id=p.id))p ON true;
CREATE VIEW effective_sale_lines WITH (security_invoker=true) AS
 SELECT l.id,l.sale_id,l.variant_id,l.presentation,(l.quantity-coalesce(r.quantity,0))::integer AS quantity,
 l.price_basis,l.reference_unit_usd,l.agreed_unit_usd,
 round((l.quantity-coalesce(r.quantity,0))*l.agreed_unit_usd,2)::numeric(18,2) AS line_total_usd,
 l.cost_usd,l.description_snapshot,l.commercial_unit_label_snapshot,l.addition_id
 FROM sale_lines l LEFT JOIN LATERAL(SELECT sum(quantity) AS quantity FROM sale_reduction_lines WHERE sale_line_id=l.id)r ON true;
CREATE OR REPLACE VIEW sale_totals WITH (security_invoker=true) AS
 SELECT s.id AS sale_id,(s.total_usd+coalesce(e.total,0)-coalesce(r.total,0))::numeric(18,2) AS total_usd,
 (coalesce(e.version,0)+coalesce(r.version,0))::integer AS version FROM sales s
 LEFT JOIN LATERAL(SELECT sum(total_usd) AS total,count(*) AS version FROM sale_additions WHERE sale_id=s.id)e ON true
 LEFT JOIN LATERAL(SELECT sum(reduction_usd) AS total,count(*) AS version FROM sale_reductions WHERE sale_id=s.id)r ON true;
CREATE OR REPLACE VIEW receivables AS
 SELECT s.id AS sale_id,s.client_id,s.number,CASE WHEN d.id IS NULL THEN s.due_date ELSE d.due_date END AS due_date,
 'USD'::text AS currency,t.total_usd,coalesce(p.paid,0)::numeric(18,2) AS paid_usd,(t.total_usd-coalesce(p.paid,0))::numeric(18,2) AS balance_usd
 FROM sales s JOIN sale_totals t ON t.sale_id=s.id
 LEFT JOIN LATERAL(SELECT id,due_date FROM sale_date_events WHERE sale_id=s.id ORDER BY event_order DESC LIMIT 1)d ON true
 LEFT JOIN LATERAL(SELECT sum(a.amount_usd) AS paid FROM effective_payment_applications a WHERE a.sale_id=s.id
 AND NOT EXISTS(SELECT 1 FROM payment_reversals r WHERE r.payment_id=a.payment_id))p ON true
 WHERE s.status='confirmed' AND NOT EXISTS(SELECT 1 FROM sale_cancellations c WHERE c.sale_id=s.id);

--> statement-breakpoint
CREATE FUNCTION guard_sale_reduction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s record;
BEGIN
 SELECT t.*,r.paid_usd INTO s FROM sale_totals t JOIN receivables r ON r.sale_id=t.sale_id WHERE t.sale_id=NEW.sale_id;
 IF s.sale_id IS NULL OR NEW.expected_version<>s.version OR NEW.creation_transaction<>txid_current()
 OR NEW.reduction_usd>s.total_usd OR NEW.excess_usd<>greatest(s.paid_usd-(s.total_usd-NEW.reduction_usd),0) THEN
 RAISE EXCEPTION 'Review the current sale before reducing it' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
-- The new ledgers inherit the same environment visibility as their parent documents.
ALTER TABLE sale_reductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_reduction_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_reduction_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY reduction_environment ON sale_reductions USING (EXISTS(SELECT 1 FROM sales s WHERE s.id=sale_id)) WITH CHECK (EXISTS(SELECT 1 FROM sales s WHERE s.id=sale_id));
CREATE POLICY reduction_line_environment ON sale_reduction_lines USING (EXISTS(SELECT 1 FROM sale_reductions r WHERE r.id=reduction_id)) WITH CHECK (EXISTS(SELECT 1 FROM sale_reductions r WHERE r.id=reduction_id));
CREATE POLICY reduction_allocation_environment ON sale_reduction_allocations USING (EXISTS(SELECT 1 FROM sale_reduction_lines l WHERE l.id=reduction_line_id)) WITH CHECK (EXISTS(SELECT 1 FROM sale_reduction_lines l WHERE l.id=reduction_line_id));
CREATE POLICY correction_environment ON payment_corrections USING (EXISTS(SELECT 1 FROM payments p WHERE p.id=payment_id)) WITH CHECK (EXISTS(SELECT 1 FROM payments p WHERE p.id=payment_id));
CREATE TRIGGER reduction_guard BEFORE INSERT ON sale_reductions FOR EACH ROW EXECUTE FUNCTION guard_sale_reduction();
CREATE FUNCTION guard_reduction_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_NAME='sale_reduction_lines' THEN target:=NEW.reduction_id;
 ELSE SELECT reduction_id INTO target FROM sale_reduction_lines WHERE id=NEW.reduction_line_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM sale_reductions WHERE id=target AND creation_transaction=txid_current()) THEN
 RAISE EXCEPTION 'Return belongs to its original correction transaction' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER reduction_line_guard BEFORE INSERT ON sale_reduction_lines FOR EACH ROW EXECUTE FUNCTION guard_reduction_child();
CREATE TRIGGER reduction_allocation_guard BEFORE INSERT ON sale_reduction_allocations FOR EACH ROW EXECUTE FUNCTION guard_reduction_child();

CREATE FUNCTION guard_payment_correction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p record; r sale_reductions; quoted numeric; applied numeric; entry jsonb; old_amount numeric; difference numeric;
BEGIN
 SELECT * INTO p FROM effective_payments WHERE id=NEW.payment_id;
 IF p.id IS NULL OR NEW.expected_version<>p.version OR NEW.creation_transaction<>txid_current()
 OR EXISTS(SELECT 1 FROM payment_reversals WHERE payment_id=p.id) THEN
 RAISE EXCEPTION 'Review the current payment before correcting it' USING ERRCODE='23514'; END IF;
 IF p.currency='VES' THEN
 SELECT coalesce(b.rate,u.rate) INTO quoted FROM payments x LEFT JOIN bcv_rates b ON b.id=x.bcv_rate_id LEFT JOIN usdt_rates u ON u.id=x.usdt_rate_id WHERE x.id=p.id;
 IF NOT (NEW.amount_usd=round(NEW.amount/quoted,2) OR NEW.amount=round(NEW.amount_usd*quoted,2)) THEN
 RAISE EXCEPTION 'Correction preserves the original conversion rate' USING ERRCODE='23514'; END IF;
 ELSIF NEW.amount<>NEW.amount_usd THEN RAISE EXCEPTION 'USD and USDT remain one to one' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(NEW.applications)<>(SELECT count(*) FROM payment_applications WHERE payment_id=p.id)
 OR jsonb_array_length(NEW.applications)<>(SELECT count(DISTINCT (value->>'saleId')::uuid) FROM jsonb_array_elements(NEW.applications)) THEN
 RAISE EXCEPTION 'Correction preserves the original invoice allocation scope' USING ERRCODE='23514'; END IF;
 applied:=0;
 IF NEW.kind<>'entry' THEN
 SELECT * INTO r FROM sale_reductions WHERE id=NEW.sale_reduction_id;
 IF r.id IS NULL OR r.creation_transaction<>txid_current() OR r.resolution<>NEW.kind OR NEW.amount_usd>=p.amount_usd THEN
 RAISE EXCEPTION 'Refund or credit must resolve a current merchandise return' USING ERRCODE='23514'; END IF;
 END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(NEW.applications) LOOP
 old_amount:=NULL;
 SELECT amount_usd INTO old_amount FROM effective_payment_applications WHERE payment_id=p.id AND sale_id=(entry->>'saleId')::uuid;
 IF old_amount IS NULL OR (entry->>'amountUsd') IS NULL OR (entry->>'amountUsd')::numeric<0
 OR (entry->>'amountUsd')::numeric<>round((entry->>'amountUsd')::numeric,2)
 OR (entry->>'balanceAfterUsd') IS NULL OR (entry->>'balanceAfterUsd')::numeric<0 THEN
 RAISE EXCEPTION 'Correction requires exact nonnegative original allocations' USING ERRCODE='23514'; END IF;
 IF NEW.kind<>'entry' AND (((entry->>'saleId')::uuid<>r.sale_id AND (entry->>'amountUsd')::numeric<>old_amount)
 OR ((entry->>'saleId')::uuid=r.sale_id AND (entry->>'amountUsd')::numeric>old_amount)) THEN
 RAISE EXCEPTION 'Return cannot change payments of another sale' USING ERRCODE='23514'; END IF;
 applied:=applied+(entry->>'amountUsd')::numeric;
 END LOOP;
 IF applied<>NEW.amount_usd THEN RAISE EXCEPTION 'Corrected payment must be fully allocated' USING ERRCODE='23514'; END IF;
 difference:=p.amount_usd-NEW.amount_usd;
 IF NEW.credit_delta_usd<>(CASE WHEN NEW.kind='entry' THEN 0 WHEN p.method='client_credit' AND NEW.kind='refund' THEN -difference
 WHEN p.method<>'client_credit' AND NEW.kind='credit' THEN difference ELSE 0 END) THEN
 RAISE EXCEPTION 'Customer credit must match the actual payment difference' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER payment_correction_guard BEFORE INSERT ON payment_corrections FOR EACH ROW EXECUTE FUNCTION guard_payment_correction();

--> statement-breakpoint
CREATE FUNCTION validate_sale_reduction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r sale_reductions; l record; earlier integer; corrected numeric;
BEGIN
 SELECT * INTO r FROM sale_reductions WHERE id=NEW.id;
 IF r.reduction_usd IS DISTINCT FROM (SELECT sum(reduction_usd) FROM sale_reduction_lines WHERE reduction_id=r.id) THEN
 RAISE EXCEPTION 'Reduction requires exact line totals' USING ERRCODE='23514'; END IF;
 FOR l IN SELECT x.*,s.sale_id,s.quantity AS original_quantity,s.agreed_unit_usd FROM sale_reduction_lines x JOIN sale_lines s ON s.id=x.sale_line_id WHERE x.reduction_id=r.id LOOP
 SELECT coalesce(sum(x.quantity),0) INTO earlier FROM sale_reduction_lines x JOIN sale_reductions h ON h.id=x.reduction_id
 WHERE x.sale_line_id=l.sale_line_id AND h.expected_version<r.expected_version;
 IF l.sale_id<>r.sale_id OR earlier+l.quantity>l.original_quantity OR l.reduction_usd<>
 round((l.original_quantity-earlier)*l.agreed_unit_usd,2)-round((l.original_quantity-earlier-l.quantity)*l.agreed_unit_usd,2)
 OR l.quantity<>(SELECT count(*) FROM sale_reduction_allocations WHERE reduction_line_id=l.id)
 OR EXISTS(SELECT 1 FROM sale_reduction_allocations x JOIN sale_allocations a ON a.id=x.allocation_id
 LEFT JOIN sale_stock_returns ret ON ret.allocation_id=a.id LEFT JOIN inventory_movements m ON m.id=ret.movement_id
 WHERE x.reduction_line_id=l.id AND (a.sale_line_id<>l.sale_line_id OR ret.allocation_id IS NULL OR m.creation_transaction<>r.creation_transaction)) THEN
 RAISE EXCEPTION 'Reduction must return its exact units once and preserve rounded prices' USING ERRCODE='23514'; END IF;
 END LOOP;
 SELECT coalesce(sum(coalesce(prev.amount_usd,p.amount_usd)-c.amount_usd),0) INTO corrected FROM payment_corrections c JOIN payments p ON p.id=c.payment_id
 LEFT JOIN LATERAL(SELECT amount_usd FROM payment_corrections WHERE payment_id=c.payment_id AND expected_version<c.expected_version ORDER BY expected_version DESC LIMIT 1)prev ON true
 WHERE c.sale_reduction_id=r.id;
 IF corrected<>r.excess_usd THEN RAISE EXCEPTION 'Resolve exactly the surplus, without losing actual collections' USING ERRCODE='23514'; END IF;
 PERFORM validate_commercial_sale(r.sale_id);
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER reduction_document_valid AFTER INSERT ON sale_reductions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_sale_reduction();
CREATE FUNCTION validate_payment_correction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
 FOR target IN SELECT sale_id FROM payment_applications WHERE payment_id=NEW.payment_id LOOP PERFORM validate_commercial_sale(target); END LOOP;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER correction_document_valid AFTER INSERT ON payment_corrections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_payment_correction();
CREATE FUNCTION validate_customer_credit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_NAME='payments' THEN target:=NEW.client_id; ELSE SELECT client_id INTO target FROM payments WHERE id=NEW.payment_id; END IF;
 IF EXISTS(SELECT 1 FROM client_credit_balances WHERE client_id=target AND credit_usd<0) THEN
 RAISE EXCEPTION 'Customer credit cannot be spent twice or exceed the available balance' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='payments' THEN
 IF NEW.method='client_credit' AND NEW.currency<>'USD' THEN
 RAISE EXCEPTION 'Customer credit is recorded in USD' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER payment_credit_valid AFTER INSERT ON payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_customer_credit();
CREATE CONSTRAINT TRIGGER correction_credit_valid AFTER INSERT ON payment_corrections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_customer_credit();
CREATE CONSTRAINT TRIGGER reversal_credit_valid AFTER INSERT ON payment_reversals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_customer_credit();
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['sale_reductions','sale_reduction_lines','sale_reduction_allocations','payment_corrections'] LOOP
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_history_change()',tab||'_append_only',tab);
 EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH STATEMENT EXECUTE FUNCTION lock_inventory_tree()',tab||'_serialized',tab);
 END LOOP;
END; $$;

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
  SELECT total_usd INTO s.total_usd FROM sale_totals WHERE sale_id=target;
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
  SELECT coalesce(sum(a.amount_usd),0) INTO paid FROM effective_payment_applications a
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
CREATE OR REPLACE FUNCTION validate_sale_stock_return() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF a.id IS NULL OR a.lot_id<>m.lot_id OR (NOT EXISTS(SELECT 1 FROM sale_cancellations WHERE sale_id=a.sale_id) AND NOT EXISTS(SELECT 1 FROM sale_reduction_allocations ra JOIN sale_reduction_lines rl ON rl.id=ra.reduction_line_id JOIN sale_reductions h ON h.id=rl.reduction_id WHERE ra.allocation_id=a.id AND h.sale_id=a.sale_id AND h.creation_transaction=m.creation_transaction))
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
CREATE OR REPLACE FUNCTION guard_sale_addition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s sales;
BEGIN
 SELECT * INTO s FROM sales WHERE id=NEW.sale_id;
 IF s.id IS NULL OR s.status<>'confirmed' OR EXISTS(SELECT 1 FROM sale_cancellations WHERE sale_id=s.id)
  OR NEW.creation_transaction<>txid_current() OR NEW.created_at<s.sold_at THEN
  RAISE EXCEPTION 'Only a current addition to an active sale is allowed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
