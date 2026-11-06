CREATE SEQUENCE "public"."mm_receipt_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "supplier_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "supplier_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "reference" DROP NOT NULL;--> statement-breakpoint
-- Existing references and documents remain byte-for-byte unchanged. Historical
-- rows have no new internal number; only future INSERTs use the sequence.
ALTER TABLE "purchases" ADD COLUMN "receipt_number" bigint;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "receipt_number" SET DEFAULT nextval('mm_receipt_number_seq');--> statement-breakpoint
CREATE INDEX "lots_previous_cost_idx" ON "lots" USING btree ("packing_rule_id","is_demo","received_at" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_receipt_number_uq" ON "purchases" USING btree ("receipt_number") WHERE "purchases"."receipt_number" is not null;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchase_receipt_number_positive" CHECK ("purchases"."receipt_number" is null or "purchases"."receipt_number">0);
--> statement-breakpoint
CREATE FUNCTION guard_receipt_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' AND (NEW.receipt_number IS NULL OR NEW.receipt_number<=0) THEN
    RAISE EXCEPTION 'A new receipt requires a server-generated internal number' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.receipt_number IS DISTINCT FROM OLD.receipt_number THEN
    RAISE EXCEPTION 'The receipt internal number is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER purchases_internal_number BEFORE INSERT OR UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION guard_receipt_number();
--> statement-breakpoint
-- Null means no supplier was indicated, not an orphan or a fictitious supplier.
-- Keep the physical lot tied to its immutable purchase line/document.
CREATE FUNCTION guard_receipt_lot_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line purchase_lines%ROWTYPE; purchase purchases%ROWTYPE;
BEGIN
  IF NEW.purchase_line_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO line FROM purchase_lines WHERE id=NEW.purchase_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt line does not exist' USING ERRCODE='23503'; END IF;
  SELECT * INTO purchase FROM purchases WHERE id=line.purchase_id;
  IF NOT FOUND OR NEW.variant_id IS DISTINCT FROM line.variant_id
    OR purchase.status<>'received' OR NEW.unit_cost_usd<=0
    OR NEW.supplier_id IS DISTINCT FROM purchase.supplier_id
    OR NEW.is_demo IS DISTINCT FROM purchase.is_demo
    OR NEW.unit_cost_usd IS DISTINCT FROM line.unit_cost_usd
    OR NEW.received_boxes IS DISTINCT FROM line.quantity OR line.presentation<>'box'
  THEN RAISE EXCEPTION 'Receipt lot and purchase context disagree' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lots_receipt_context BEFORE INSERT ON lots FOR EACH ROW EXECUTE FUNCTION guard_receipt_lot_context();
