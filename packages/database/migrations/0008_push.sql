CREATE TABLE push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot integer NOT NULL DEFAULT 1,
  generation uuid NOT NULL DEFAULT gen_random_uuid(),
  device_label text NOT NULL,
  endpoint text,
  p256dh text,
  auth text,
  active boolean NOT NULL DEFAULT true,
  updated_by uuid NOT NULL CONSTRAINT push_devices_updated_by_app_users_id_fk REFERENCES app_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_single_device_uq UNIQUE(slot),
  CONSTRAINT push_single_device_slot CHECK(slot=1),
  CONSTRAINT push_label_valid CHECK(length(btrim(device_label)) BETWEEN 2 AND 80),
  CONSTRAINT push_active_keys CHECK(NOT active OR (endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE push_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL CONSTRAINT push_notices_sale_id_sales_id_fk REFERENCES sales(id),
  reminder_date date NOT NULL,
  device_generation uuid NOT NULL,
  batch_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'claimed',
  result_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT push_notice_sale_date_uq UNIQUE(sale_id,reminder_date),
  CONSTRAINT push_notice_status_valid CHECK(status IN ('claimed','accepted','failed','uncertain','cancelled'))
);
CREATE INDEX push_notice_batch_idx ON push_notices(batch_id);
--> statement-breakpoint
CREATE FUNCTION preserve_push_notice_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR ROW(NEW.id,NEW.sale_id,NEW.reminder_date,NEW.device_generation,NEW.batch_id,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.sale_id,OLD.reminder_date,OLD.device_generation,OLD.batch_id,OLD.created_at)
    OR OLD.status<>'claimed' OR NEW.status='claimed' THEN
    RAISE EXCEPTION 'Push notice identity and terminal state are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER push_notice_identity_guard BEFORE UPDATE OR DELETE ON push_notices FOR EACH ROW EXECUTE FUNCTION preserve_push_notice_identity();
