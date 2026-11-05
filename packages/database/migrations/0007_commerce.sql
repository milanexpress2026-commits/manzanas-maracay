-- Commercial documents extend the existing ledger. No operational or customer data is seeded.
ALTER TABLE clients ADD COLUMN notes text NOT NULL DEFAULT '', ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE clients ADD CONSTRAINT client_fields_valid CHECK(length(btrim(name)) BETWEEN 2 AND 120 AND version>0 AND (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'));
--> statement-breakpoint
CREATE UNIQUE INDEX price_list_basis_uq ON price_lists(payment_basis);
ALTER TABLE price_items DROP CONSTRAINT price_presentation_valid;
ALTER TABLE price_items ADD CONSTRAINT price_presentation_valid CHECK(presentation IN ('box','half_box','blister'));
--> statement-breakpoint
CREATE SEQUENCE mm_sale_number_seq;
CREATE SEQUENCE mm_payment_number_seq;
ALTER TABLE sales DROP CONSTRAINT credit_due_required;
ALTER TABLE sales ADD COLUMN reminder_date date, ADD COLUMN client_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN notes text NOT NULL DEFAULT '', ADD COLUMN actor text NOT NULL DEFAULT 'legacy',
  ADD COLUMN is_demo boolean NOT NULL DEFAULT false, ADD COLUMN total_usd numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN cost_usd numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN creation_transaction bigint NOT NULL DEFAULT txid_current();
ALTER TABLE sales ADD CONSTRAINT sales_amounts_valid CHECK(total_usd>=0 AND cost_usd>=0);
ALTER TABLE sale_lines ADD COLUMN line_total_usd numeric(18,2) NOT NULL DEFAULT 0, ADD COLUMN cost_usd numeric(18,4) NOT NULL DEFAULT 0;
ALTER TABLE sale_lines DROP CONSTRAINT sale_presentation_valid;
ALTER TABLE sale_lines ADD CONSTRAINT sale_presentation_valid CHECK(presentation IN ('box','half_box','blister'));
ALTER TABLE sale_lines ADD CONSTRAINT sale_line_totals_valid CHECK(line_total_usd=round(quantity*agreed_unit_usd,2) AND cost_usd>=0);
--> statement-breakpoint
ALTER TABLE payments ADD COLUMN number text NOT NULL DEFAULT ('AB-'||lpad(nextval('mm_payment_number_seq')::text,8,'0')),
  ADD COLUMN method text NOT NULL DEFAULT 'legacy', ADD COLUMN actor text NOT NULL DEFAULT 'legacy',
  ADD COLUMN client_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN creation_transaction bigint NOT NULL DEFAULT txid_current();
CREATE UNIQUE INDEX payments_number_uq ON payments(number);
ALTER TABLE payment_applications ADD COLUMN balance_after_usd numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE payment_applications ADD CONSTRAINT application_balance_valid CHECK(balance_after_usd>=0 AND amount_usd=round(amount_usd,2));
--> statement-breakpoint
CREATE TABLE sale_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_line_id uuid NOT NULL CONSTRAINT sale_allocations_sale_line_id_sale_lines_id_fk REFERENCES sale_lines(id),
  lot_id uuid NOT NULL CONSTRAINT sale_allocations_lot_id_lots_id_fk REFERENCES lots(id), container_id uuid NOT NULL CONSTRAINT sale_allocations_container_id_containers_id_fk REFERENCES containers(id),
  movement_id uuid NOT NULL CONSTRAINT sale_allocations_movement_id_inventory_movements_id_fk REFERENCES inventory_movements(id), quantity integer NOT NULL CHECK(quantity=1),
  cost_usd numeric(18,4) NOT NULL CHECK(cost_usd>=0), created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT allocation_line_container_uq UNIQUE(sale_line_id,container_id),
  CONSTRAINT allocation_movement_container_uq UNIQUE(movement_id,container_id)
);
CREATE INDEX allocations_lot_idx ON sale_allocations(lot_id);
CREATE INDEX allocations_container_idx ON sale_allocations(container_id);
CREATE INDEX allocations_movement_idx ON sale_allocations(movement_id);
CREATE TABLE sale_date_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL CONSTRAINT sale_date_events_sale_id_sales_id_fk REFERENCES sales(id),
  due_date date, reminder_date date, reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 500),
  actor text NOT NULL, event_order bigint GENERATED ALWAYS AS IDENTITY, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sale_dates_sale_order_idx ON sale_date_events(sale_id,event_order);
CREATE TABLE sale_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL UNIQUE CONSTRAINT sale_cancellations_sale_id_sales_id_fk REFERENCES sales(id),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 500), actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payment_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL UNIQUE CONSTRAINT payment_reversals_payment_id_payments_id_fk REFERENCES payments(id),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 500), actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TRIGGER sales_append_only BEFORE UPDATE OR DELETE ON sales FOR EACH ROW EXECUTE FUNCTION deny_history_change();
CREATE TRIGGER sale_lines_append_only BEFORE UPDATE OR DELETE ON sale_lines FOR EACH ROW EXECUTE FUNCTION deny_history_change();
CREATE TRIGGER payments_append_only BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION deny_history_change();
CREATE TRIGGER applications_append_only BEFORE UPDATE OR DELETE ON payment_applications FOR EACH ROW EXECUTE FUNCTION deny_history_change();
CREATE TRIGGER allocations_append_only BEFORE UPDATE OR DELETE ON sale_allocations FOR EACH ROW EXECUTE FUNCTION deny_history_change();
CREATE TRIGGER dates_append_only BEFORE UPDATE OR DELETE ON sale_date_events FOR EACH ROW EXECUTE FUNCTION deny_history_change();
CREATE TRIGGER cancellations_append_only BEFORE UPDATE OR DELETE ON sale_cancellations FOR EACH ROW EXECUTE FUNCTION deny_history_change();
CREATE TRIGGER payment_reversals_append_only BEFORE UPDATE OR DELETE ON payment_reversals FOR EACH ROW EXECUTE FUNCTION deny_history_change();
--> statement-breakpoint
CREATE FUNCTION guard_commercial_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE document_transaction bigint;
BEGIN
  IF TG_TABLE_NAME='sale_lines' THEN SELECT creation_transaction INTO document_transaction FROM sales WHERE id=NEW.sale_id;
  ELSIF TG_TABLE_NAME='sale_allocations' THEN SELECT s.creation_transaction INTO document_transaction FROM sales s JOIN sale_lines l ON l.sale_id=s.id WHERE l.id=NEW.sale_line_id;
  ELSE SELECT creation_transaction INTO document_transaction FROM payments WHERE id=NEW.payment_id; END IF;
  IF document_transaction IS DISTINCT FROM txid_current() THEN
    RAISE EXCEPTION 'Commercial document children must be inserted in their original transaction' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sale_lines_creation_guard BEFORE INSERT ON sale_lines FOR EACH ROW EXECUTE FUNCTION guard_commercial_child();
CREATE TRIGGER allocations_creation_guard BEFORE INSERT ON sale_allocations FOR EACH ROW EXECUTE FUNCTION guard_commercial_child();
CREATE TRIGGER applications_creation_guard BEFORE INSERT ON payment_applications FOR EACH ROW EXECUTE FUNCTION guard_commercial_child();
-- Serialize even direct SQL writes before the deferred checks; application row locks alone
-- would not protect a second writer bypassing the API from a concurrent over-application.
CREATE TRIGGER sales_serialized BEFORE INSERT ON sales FOR EACH STATEMENT EXECUTE FUNCTION lock_inventory_tree();
CREATE TRIGGER sale_lines_serialized BEFORE INSERT ON sale_lines FOR EACH STATEMENT EXECUTE FUNCTION lock_inventory_tree();
CREATE TRIGGER payments_serialized BEFORE INSERT ON payments FOR EACH STATEMENT EXECUTE FUNCTION lock_inventory_tree();
CREATE TRIGGER applications_serialized BEFORE INSERT ON payment_applications FOR EACH STATEMENT EXECUTE FUNCTION lock_inventory_tree();
CREATE TRIGGER allocations_serialized BEFORE INSERT ON sale_allocations FOR EACH STATEMENT EXECUTE FUNCTION lock_inventory_tree();
CREATE TRIGGER dates_serialized BEFORE INSERT ON sale_date_events FOR EACH STATEMENT EXECUTE FUNCTION lock_inventory_tree();
CREATE TRIGGER cancellations_serialized BEFORE INSERT ON sale_cancellations FOR EACH STATEMENT EXECUTE FUNCTION lock_inventory_tree();
CREATE TRIGGER payment_reversals_serialized BEFORE INSERT ON payment_reversals FOR EACH STATEMENT EXECUTE FUNCTION lock_inventory_tree();
--> statement-breakpoint
CREATE FUNCTION validate_commercial_sale(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s sales; total numeric; cost numeric; paid numeric;
BEGIN
  SELECT * INTO s FROM sales WHERE id=target;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM clients WHERE id=s.client_id AND is_demo<>s.is_demo) THEN
    RAISE EXCEPTION 'Demo and real customer operations cannot be mixed' USING ERRCODE='23514';
  END IF;
  SELECT sum(line_total_usd),sum(cost_usd) INTO total,cost FROM sale_lines WHERE sale_id=target;
  IF total IS NULL OR total<>s.total_usd OR cost<>s.cost_usd OR s.status<>'confirmed' THEN
    RAISE EXCEPTION 'A confirmed sale requires exact lines and historical totals' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM sale_lines l LEFT JOIN LATERAL (
    SELECT sum(quantity) AS quantity,sum(cost_usd) AS cost FROM sale_allocations a WHERE a.sale_line_id=l.id
  ) a ON true WHERE l.sale_id=target AND (coalesce(a.quantity,0)<>l.quantity OR coalesce(a.cost,0)<>l.cost_usd)) THEN
    RAISE EXCEPTION 'Sale quantity and FIFO allocations disagree' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM sale_allocations a JOIN sale_lines l ON l.id=a.sale_line_id
    JOIN lots lot ON lot.id=a.lot_id JOIN containers c ON c.id=a.container_id JOIN inventory_movements m ON m.id=a.movement_id
    WHERE l.sale_id=target AND (lot.variant_id<>l.variant_id OR c.lot_id<>lot.id OR m.lot_id<>lot.id OR m.kind<>'dispatch'
      OR m.creation_transaction<>s.creation_transaction OR lot.is_demo<>s.is_demo
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.after_state) state WHERE state->>'id'=c.id::text AND state->>'state'='dispatched' AND (state->>'quantity')::integer=0))) THEN
    RAISE EXCEPTION 'Sale allocation must match its own atomic physical dispatch' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM sale_allocations a JOIN sale_lines l ON l.id=a.sale_line_id
    JOIN lots lot ON lot.id=a.lot_id JOIN inventory_movements m ON m.id=a.movement_id
    WHERE l.sale_id=target AND (lot.received_at>s.sold_at OR NOT(l.presentation=ANY(lot.allowed_presentations_snapshot))
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.after_state) c WHERE c->>'id'=a.container_id::text
        AND c->>'unit'=CASE l.presentation WHEN 'box' THEN 'sealed_box' WHEN 'blister' THEN 'intact_blister' ELSE 'prepared_half_box' END))) THEN
    RAISE EXCEPTION 'Sale presentation must match its historical physical source' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM inventory_movements m WHERE m.id IN(
      SELECT a.movement_id FROM sale_allocations a JOIN sale_lines l ON l.id=a.sale_line_id WHERE l.sale_id=target)
    AND (
      EXISTS(SELECT 1 FROM jsonb_array_elements(m.before_state) c WHERE (c->>'quantity')::integer>0 AND c->>'costUsd' IS NULL)
      OR (SELECT sum(a.cost_usd) FROM sale_allocations a WHERE a.movement_id=m.id)
         <>coalesce((SELECT sum((c->>'costUsd')::numeric) FROM jsonb_array_elements(m.before_state)c),0)
           -coalesce((SELECT sum((c->>'costUsd')::numeric) FROM jsonb_array_elements(m.after_state)c),0)
      OR (SELECT count(*) FROM sale_allocations a WHERE a.movement_id=m.id)
         <>(SELECT count(*) FROM jsonb_array_elements(m.after_state)c WHERE c->>'state'='dispatched')
    )) THEN RAISE EXCEPTION 'Commercial allocations must reconcile all dispatched containers and cost' USING ERRCODE='23514'; END IF;
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
CREATE FUNCTION validate_commercial_payment(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p payments; applied numeric; r bcv_rates;
BEGIN
  SELECT * INTO p FROM payments WHERE id=target;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT sum(amount_usd) INTO applied FROM payment_applications WHERE payment_id=target;
  IF applied IS NULL OR applied<>p.amount_usd OR p.amount_usd<>round(p.amount_usd,2) THEN
    RAISE EXCEPTION 'Payment must be completely allocated in cents' USING ERRCODE='23514';
  END IF;
  IF p.currency='VES' THEN
    SELECT * INTO r FROM bcv_rates WHERE id=p.bcv_rate_id;
    IF NOT FOUND OR r.verified_at>p.received_at OR r.fetched_at>r.verified_at OR p.received_at<r.valid_from OR p.received_at>=r.valid_until
      OR p.amount_usd<>round(p.amount/r.rate,2) THEN
      RAISE EXCEPTION 'Payment requires the verified official rate valid at collection time' USING ERRCODE='23514';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM payment_applications a JOIN sales s ON s.id=a.sale_id WHERE a.payment_id=target AND s.is_demo<>p.is_demo) THEN
    RAISE EXCEPTION 'Demo and real collections cannot be mixed' USING ERRCODE='23514';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION validate_commercial_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
  IF TG_TABLE_NAME='sales' THEN PERFORM validate_commercial_sale(NEW.id);
  ELSIF TG_TABLE_NAME IN ('sale_lines','sale_date_events','sale_cancellations') THEN PERFORM validate_commercial_sale(NEW.sale_id);
  ELSIF TG_TABLE_NAME='sale_allocations' THEN SELECT sale_id INTO target FROM sale_lines WHERE id=NEW.sale_line_id; PERFORM validate_commercial_sale(target);
  ELSIF TG_TABLE_NAME='payment_applications' THEN PERFORM validate_commercial_sale(NEW.sale_id); PERFORM validate_commercial_payment(NEW.payment_id);
  ELSIF TG_TABLE_NAME='payments' THEN
    PERFORM validate_commercial_payment(NEW.id);
    FOR target IN SELECT sale_id FROM payment_applications WHERE payment_id=NEW.id LOOP PERFORM validate_commercial_sale(target); END LOOP;
  ELSIF TG_TABLE_NAME='payment_reversals' THEN
    FOR target IN SELECT sale_id FROM payment_applications WHERE payment_id=NEW.payment_id LOOP PERFORM validate_commercial_sale(target); END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER sale_document_valid AFTER INSERT ON sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_commercial_event();
CREATE CONSTRAINT TRIGGER cancellations_document_valid AFTER INSERT ON sale_cancellations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_commercial_event();
CREATE CONSTRAINT TRIGGER payment_document_valid AFTER INSERT ON payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_commercial_event();
CREATE CONSTRAINT TRIGGER payment_reversal_document_valid AFTER INSERT ON payment_reversals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_commercial_event();
--> statement-breakpoint
CREATE OR REPLACE VIEW receivables AS
SELECT s.id AS sale_id,s.client_id,s.number,CASE WHEN d.id IS NULL THEN s.due_date ELSE d.due_date END AS due_date,
  'USD'::text AS currency,s.total_usd,coalesce(p.paid,0)::numeric(18,2) AS paid_usd,(s.total_usd-coalesce(p.paid,0))::numeric(18,2) AS balance_usd
FROM sales s
LEFT JOIN LATERAL(SELECT id,due_date FROM sale_date_events WHERE sale_id=s.id ORDER BY event_order DESC LIMIT 1)d ON true
LEFT JOIN LATERAL(SELECT sum(a.amount_usd) AS paid FROM payment_applications a WHERE a.sale_id=s.id
  AND NOT EXISTS(SELECT 1 FROM payment_reversals r WHERE r.payment_id=a.payment_id))p ON true
WHERE s.status='confirmed' AND NOT EXISTS(SELECT 1 FROM sale_cancellations c WHERE c.sale_id=s.id);
