-- Existing documents retain their former BCV settlement rule. No totals, lines,
-- payments or historical rates are rewritten.
ALTER TABLE sales ADD COLUMN settlement_basis text NOT NULL DEFAULT 'legacy_bcv';
ALTER TABLE sales ADD CONSTRAINT sales_settlement_valid CHECK(settlement_basis IN ('divisa','bcv','legacy_bcv'));
--> statement-breakpoint
CREATE TABLE usdt_rates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rate numeric(20,8) NOT NULL,
 source text NOT NULL DEFAULT 'BINANCE_P2P_BUY', source_url text NOT NULL, source_hash text NOT NULL,
 valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL,
 fetched_at timestamptz NOT NULL, verified_at timestamptz NOT NULL, verified_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT usdt_quote_valid CHECK(source='BINANCE_P2P_BUY' AND rate>0 AND valid_until>valid_from
  AND valid_until<=valid_from+interval '15 minutes' AND verified_at>=fetched_at
  AND source_hash ~ '^[a-f0-9]{64}$'
  AND source_url='https://www.binance.com/bapi/c2c/v1/public/c2c/agent/quote-price?fiat=VES&asset=USDT&tradeType=BUY')
);
CREATE INDEX usdt_validity_idx ON usdt_rates(valid_until,verified_at);
CREATE TRIGGER usdt_append_only BEFORE UPDATE OR DELETE ON usdt_rates FOR EACH ROW EXECUTE FUNCTION deny_history_change();
ALTER TABLE payments ADD COLUMN usdt_rate_id uuid CONSTRAINT payments_usdt_rate_id_usdt_rates_id_fk REFERENCES usdt_rates(id);
CREATE INDEX payments_usdt_rate_idx ON payments(usdt_rate_id);
ALTER TABLE payments DROP CONSTRAINT payment_currency_rate;
ALTER TABLE payments ADD CONSTRAINT payment_currency_rate CHECK(
 (currency IN ('USD','USDT') AND bcv_rate_id IS NULL AND usdt_rate_id IS NULL AND amount=amount_usd)
 OR (currency='VES' AND ((bcv_rate_id IS NOT NULL AND usdt_rate_id IS NULL) OR (bcv_rate_id IS NULL AND usdt_rate_id IS NOT NULL)))
);
--> statement-breakpoint
CREATE FUNCTION validate_settlement_agreement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; s sales;
BEGIN
 IF TG_TABLE_NAME='sales' THEN
  target:=NEW.id;
  IF NEW.settlement_basis='legacy_bcv' THEN
   RAISE EXCEPTION 'New sales require an explicit current settlement agreement' USING ERRCODE='23514';
  END IF;
 ELSE
  target:=NEW.sale_id;
 END IF;
 SELECT * INTO s FROM sales WHERE id=target;
 IF s.settlement_basis<>'legacy_bcv' AND EXISTS(
  SELECT 1 FROM sale_lines WHERE sale_id=target AND price_basis<>CASE s.settlement_basis WHEN 'divisa' THEN 'usd_cash_promo' ELSE 'ves_regular' END
 ) THEN RAISE EXCEPTION 'Sale lines must preserve their agreed settlement basis' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER sale_settlement_valid AFTER INSERT ON sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_settlement_agreement();
CREATE CONSTRAINT TRIGGER lines_settlement_valid AFTER INSERT ON sale_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_settlement_agreement();
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
  IF quoted_rate IS NULL OR verified>p.received_at OR fetched>verified OR p.received_at<starts OR p.received_at>=ends OR p.amount_usd<>round(p.amount/quoted_rate,2) THEN
   RAISE EXCEPTION 'Payment requires its verified historical rate valid at collection time' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM payment_applications a JOIN sales s ON s.id=a.sale_id WHERE a.payment_id=target
   AND ((s.settlement_basis='divisa' AND p.usdt_rate_id IS NULL) OR (s.settlement_basis IN ('bcv','legacy_bcv') AND p.bcv_rate_id IS NULL))) THEN
   RAISE EXCEPTION 'Payment rate must match the original sale agreement' USING ERRCODE='23514';
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM payment_applications a JOIN sales s ON s.id=a.sale_id WHERE a.payment_id=target AND s.is_demo<>p.is_demo) THEN
  RAISE EXCEPTION 'Demo and real collections cannot be mixed' USING ERRCODE='23514';
 END IF;
END;
$$;
