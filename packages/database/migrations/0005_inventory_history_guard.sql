ALTER TABLE "inventory_movements" ADD COLUMN "creation_transaction" bigint DEFAULT txid_current() NOT NULL;--> statement-breakpoint
CREATE FUNCTION guard_inventory_entry_creation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE movement inventory_movements%ROWTYPE;
BEGIN
  SELECT * INTO movement FROM inventory_movements WHERE id=NEW.movement_id;
  IF NOT FOUND OR movement.creation_transaction<>txid_current() THEN
    RAISE EXCEPTION 'Entries must be created in the same transaction as their movement' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(movement.after_state) item WHERE item=NEW.after_state)
    OR (NEW.before_state IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(movement.before_state) item WHERE item=NEW.before_state))
    OR (NEW.after_state->>'id')::uuid IS DISTINCT FROM NEW.container_id THEN
    RAISE EXCEPTION 'Ledger entry does not match the immutable movement snapshot' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_entry_creation_guard BEFORE INSERT ON inventory_entries FOR EACH ROW EXECUTE FUNCTION guard_inventory_entry_creation();
