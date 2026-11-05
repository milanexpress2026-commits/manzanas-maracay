CREATE TABLE "runtime_environment" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"environment" text NOT NULL,
	"database_name" text NOT NULL,
	"database_instance_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"owner_role" text NOT NULL,
	"application_role" text NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runtime_singleton_true" CHECK ("runtime_environment"."singleton"),
	CONSTRAINT "runtime_environment_valid" CHECK ("runtime_environment"."environment" in ('local','test','staging','production')),
	CONSTRAINT "runtime_purpose_valid" CHECK ("runtime_environment"."purpose" in ('development','quality_assurance','automated_test','operation','production_regression'))
);
--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "confirmation_status_snapshot" text DEFAULT 'legacy_unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lot_confirmation_snapshot_valid" CHECK ("lots"."confirmation_status_snapshot" in ('confirmed','pending','legacy_unverified'));
--> statement-breakpoint
-- Bind the database once. A copied QA database may never become a production instance.
DO $$
DECLARE db text := current_database(); env text; purpose text; owner_name text; app_name text;
BEGIN
  IF db='manzanas_maracay_dev' THEN env:='local'; purpose:='development';
  ELSIF db='manzanas_maracay_test' OR db ~ '^manzanas_maracay_migration_test_[a-f0-9]{12}$' THEN env:='test'; purpose:='automated_test';
  ELSIF db='manzanas_maracay_staging' THEN env:='staging'; purpose:='quality_assurance';
  ELSIF db='manzanas_maracay_production' THEN env:='production'; purpose:='operation';
  ELSIF db ~ '^manzanas_maracay_production_test_[a-f0-9]{12}$' THEN env:='production'; purpose:='production_regression';
  ELSE RAISE EXCEPTION 'Database is not an authorized Manzanas environment' USING ERRCODE='23514'; END IF;
  owner_name:=CASE WHEN env='production' THEN 'mm_prod_owner' ELSE 'mm_owner' END;
  app_name:=CASE WHEN env='production' THEN 'mm_prod_app' ELSE 'mm_app' END;
  IF current_user<>owner_name THEN RAISE EXCEPTION 'Migration requires the environment owner role' USING ERRCODE='42501'; END IF;
  IF env='production' AND (
    EXISTS(SELECT 1 FROM fruits) OR EXISTS(SELECT 1 FROM suppliers) OR EXISTS(SELECT 1 FROM clients)
    OR EXISTS(SELECT 1 FROM purchases) OR EXISTS(SELECT 1 FROM lots) OR EXISTS(SELECT 1 FROM sales)
    OR EXISTS(SELECT 1 FROM payments) OR EXISTS(SELECT 1 FROM price_lists) OR EXISTS(SELECT 1 FROM price_items)
    OR EXISTS(SELECT 1 FROM bcv_rates) OR EXISTS(SELECT 1 FROM app_users) OR EXISTS(SELECT 1 FROM audit_events)
    OR EXISTS(SELECT 1 FROM command_receipts)
  ) THEN RAISE EXCEPTION 'New production must start empty; QA data cannot be promoted' USING ERRCODE='23514'; END IF;
  INSERT INTO runtime_environment(environment,database_name,owner_role,application_role,purpose)
    VALUES(env,db,owner_name,app_name,purpose);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER runtime_environment_immutable BEFORE UPDATE OR DELETE ON runtime_environment FOR EACH ROW EXECUTE FUNCTION deny_history_change();
CREATE TRIGGER runtime_environment_no_truncate BEFORE TRUNCATE ON runtime_environment FOR EACH STATEMENT EXECUTE FUNCTION deny_history_change();
--> statement-breakpoint
CREATE FUNCTION mm_runtime_environment() RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE bound runtime_environment%ROWTYPE;
BEGIN
  SELECT * INTO bound FROM runtime_environment WHERE singleton;
  IF NOT FOUND OR bound.database_name<>current_database() THEN
    RAISE EXCEPTION 'Database environment binding is missing or belongs to another database' USING ERRCODE='23514';
  END IF;
  RETURN bound.environment;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION guard_record_environment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE env text := mm_runtime_environment();
BEGIN
  IF TG_OP='UPDATE' AND NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'The historical DEMO/real identity is immutable' USING ERRCODE='23514';
  END IF;
  IF (env='production' AND NEW.is_demo) OR (env IN ('staging','test') AND NOT NEW.is_demo) THEN
    RAISE EXCEPTION 'Record identity does not match this environment' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER clients_environment_guard BEFORE INSERT OR UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION guard_record_environment();
CREATE TRIGGER purchases_environment_guard BEFORE INSERT OR UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION guard_record_environment();
CREATE TRIGGER lots_environment_guard BEFORE INSERT OR UPDATE ON lots FOR EACH ROW EXECUTE FUNCTION guard_record_environment();
CREATE TRIGGER sales_environment_guard BEFORE INSERT OR UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION guard_record_environment();
CREATE TRIGGER payments_environment_guard BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION guard_record_environment();
--> statement-breakpoint
-- Read defense in depth. Existing QA flags remain historical and are never rewritten.
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
CREATE POLICY clients_environment_read ON clients USING (mm_runtime_environment()<>'production' OR NOT is_demo) WITH CHECK (mm_runtime_environment()<>'production' OR NOT is_demo);
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases FORCE ROW LEVEL SECURITY;
CREATE POLICY purchases_environment_read ON purchases USING (mm_runtime_environment()<>'production' OR NOT is_demo) WITH CHECK (mm_runtime_environment()<>'production' OR NOT is_demo);
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots FORCE ROW LEVEL SECURITY;
CREATE POLICY lots_environment_read ON lots USING (mm_runtime_environment()<>'production' OR NOT is_demo) WITH CHECK (mm_runtime_environment()<>'production' OR NOT is_demo);
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales FORCE ROW LEVEL SECURITY;
CREATE POLICY sales_environment_read ON sales USING (mm_runtime_environment()<>'production' OR NOT is_demo) WITH CHECK (mm_runtime_environment()<>'production' OR NOT is_demo);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
CREATE POLICY payments_environment_read ON payments USING (mm_runtime_environment()<>'production' OR NOT is_demo) WITH CHECK (mm_runtime_environment()<>'production' OR NOT is_demo);
--> statement-breakpoint
CREATE FUNCTION guard_production_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF mm_runtime_environment()='production' AND NEW.confirmation_status='confirmed' AND (
    cardinality(NEW.allowed_presentations)<>(SELECT count(DISTINCT value) FROM unnest(NEW.allowed_presentations) value)
    OR ('blister'=ANY(NEW.allowed_presentations) AND (NEW.packing_model<>'blister' OR NEW.blisters_per_box IS NULL))
    OR ('half_box'=ANY(NEW.allowed_presentations) AND NEW.half_preparation NOT IN ('counted','commercial'))
  ) THEN RAISE EXCEPTION 'Confirm only presentations with known preparation rules' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER packing_production_confirmation BEFORE INSERT OR UPDATE ON packing_rules FOR EACH ROW EXECUTE FUNCTION guard_production_configuration();
--> statement-breakpoint
CREATE FUNCTION guard_production_lot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rule packing_rules%ROWTYPE;
BEGIN
  IF mm_runtime_environment()<>'production' THEN RETURN NEW; END IF;
  SELECT * INTO rule FROM packing_rules WHERE id=NEW.packing_rule_id FOR SHARE;
  IF NOT FOUND OR rule.confirmation_status<>'confirmed' OR NEW.confirmation_status_snapshot<>'confirmed'
    OR NEW.packing_rule_version<>rule.version OR NEW.variant_id<>rule.variant_id
    OR NEW.packing_model_snapshot<>rule.packing_model OR NEW.half_preparation_snapshot<>rule.half_preparation
    OR NEW.allowed_presentations_snapshot IS DISTINCT FROM rule.allowed_presentations
    OR NEW.box_weight_kg_snapshot IS DISTINCT FROM rule.box_weight_kg
    OR ('blister'=ANY(NEW.allowed_presentations_snapshot) AND NEW.blisters_per_box_snapshot IS NULL)
  THEN RAISE EXCEPTION 'Real receipt requires a confirmed historical packing configuration' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lots_production_confirmation BEFORE INSERT ON lots FOR EACH ROW EXECUTE FUNCTION guard_production_lot();
--> statement-breakpoint
CREATE FUNCTION guard_production_sale_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rule packing_rules%ROWTYPE;
BEGIN
  IF mm_runtime_environment()<>'production' THEN RETURN NEW; END IF;
  SELECT * INTO rule FROM packing_rules WHERE variant_id=NEW.variant_id FOR SHARE;
  IF NOT FOUND OR rule.confirmation_status<>'confirmed' OR NOT (NEW.presentation=ANY(rule.allowed_presentations)) THEN
    RAISE EXCEPTION 'Real sale requires a confirmed and permitted presentation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sale_lines_production_confirmation BEFORE INSERT ON sale_lines FOR EACH ROW EXECUTE FUNCTION guard_production_sale_line();
--> statement-breakpoint
CREATE FUNCTION guard_production_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF mm_runtime_environment()='production' AND NOT EXISTS(
    SELECT 1 FROM lots WHERE id=NEW.lot_id AND NOT is_demo AND confirmation_status_snapshot='confirmed'
  ) THEN RAISE EXCEPTION 'Real sale cannot use unverified or DEMO inventory' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allocations_production_confirmation BEFORE INSERT ON sale_allocations FOR EACH ROW EXECUTE FUNCTION guard_production_allocation();
--> statement-breakpoint
CREATE FUNCTION guard_price_presentation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF mm_runtime_environment()='production' AND NOT EXISTS(
    SELECT 1 FROM packing_rules WHERE variant_id=NEW.variant_id AND NEW.presentation=ANY(allowed_presentations)
  ) THEN RAISE EXCEPTION 'Price presentation is not configured' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prices_production_presentation BEFORE INSERT OR UPDATE ON price_items FOR EACH ROW EXECUTE FUNCTION guard_price_presentation();
