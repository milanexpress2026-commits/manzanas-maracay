-- Qualify JSON values explicitly: an outer containers.state column otherwise
-- shadows the function alias and attempts the JSON operator on text.
-- Preserve all commercial validation and historical applied migrations.
CREATE OR REPLACE FUNCTION validate_commercial_sale(target uuid) RETURNS void LANGUAGE plpgsql AS $$
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
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.after_state) AS dispatched_state(value) WHERE dispatched_state.value->>'id'=c.id::text AND dispatched_state.value->>'state'='dispatched' AND (dispatched_state.value->>'quantity')::integer=0))) THEN
    RAISE EXCEPTION 'Sale allocation must match its own atomic physical dispatch' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM sale_allocations a JOIN sale_lines l ON l.id=a.sale_line_id
    JOIN lots lot ON lot.id=a.lot_id JOIN inventory_movements m ON m.id=a.movement_id
    WHERE l.sale_id=target AND (lot.received_at>s.sold_at OR NOT(l.presentation=ANY(lot.allowed_presentations_snapshot))
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.after_state) AS snapshot(value) WHERE snapshot.value->>'id'=a.container_id::text
        AND snapshot.value->>'unit'=CASE l.presentation WHEN 'box' THEN 'sealed_box' WHEN 'blister' THEN 'intact_blister' ELSE 'prepared_half_box' END))) THEN
    RAISE EXCEPTION 'Sale presentation must match its historical physical source' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM inventory_movements m WHERE m.id IN(
      SELECT a.movement_id FROM sale_allocations a JOIN sale_lines l ON l.id=a.sale_line_id WHERE l.sale_id=target)
    AND (
      EXISTS(SELECT 1 FROM jsonb_array_elements(m.before_state) AS snapshot(value) WHERE (snapshot.value->>'quantity')::integer>0 AND snapshot.value->>'costUsd' IS NULL)
      OR (SELECT sum(a.cost_usd) FROM sale_allocations a WHERE a.movement_id=m.id)
         <>coalesce((SELECT sum((snapshot.value->>'costUsd')::numeric) FROM jsonb_array_elements(m.before_state) AS snapshot(value)),0)
           -coalesce((SELECT sum((snapshot.value->>'costUsd')::numeric) FROM jsonb_array_elements(m.after_state) AS snapshot(value)),0)
      OR (SELECT count(*) FROM sale_allocations a WHERE a.movement_id=m.id)
         <>(SELECT count(*) FROM jsonb_array_elements(m.after_state) AS snapshot(value) WHERE snapshot.value->>'state'='dispatched')
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
