-- Keep the deferred constraints and serialization. Validate the changed branch,
-- not every unrelated box in the warehouse for every inserted balance.
CREATE OR REPLACE FUNCTION validate_inventory_tree() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_NAME='containers' THEN target:=coalesce(NEW.id,OLD.id);
 ELSE target:=coalesce(NEW.container_id,OLD.container_id); END IF;
 IF EXISTS (SELECT 1 FROM containers WHERE id=target AND parent_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM containers WHERE parent_id=target) THEN
 IF EXISTS (
  WITH RECURSIVE ancestry AS (
   SELECT id,parent_id,ARRAY[id] AS path,false AS cycle FROM containers WHERE id=target
   UNION ALL SELECT p.id,p.parent_id,a.path||p.id,p.id=ANY(a.path)
   FROM ancestry a JOIN containers p ON p.id=a.parent_id WHERE NOT a.cycle
  ) SELECT 1 FROM ancestry WHERE cycle
 ) THEN RAISE EXCEPTION 'Container ancestry cannot contain cycles' USING ERRCODE='23514'; END IF;
 -- Changing a parent's stock or ancestry can affect descendants as well as itself.
 -- UNION bounds traversal even if another pending row introduced a cycle.
 IF EXISTS (
  WITH RECURSIVE branch AS (
   SELECT id,parent_id FROM containers WHERE id=target
   UNION SELECT c.id,c.parent_id FROM containers c JOIN branch b ON c.parent_id=b.id
  ), ancestors AS (
   SELECT id AS child_id,parent_id AS ancestor_id FROM branch WHERE parent_id IS NOT NULL
   UNION SELECT a.child_id,c.parent_id FROM ancestors a JOIN containers c ON c.id=a.ancestor_id WHERE c.parent_id IS NOT NULL
  ) SELECT 1 FROM ancestors a JOIN stock_balances child ON child.container_id=a.child_id AND child.quantity>0
    JOIN stock_balances parent ON parent.container_id=a.ancestor_id AND parent.quantity>0
 ) THEN RAISE EXCEPTION 'Do not count packaging and its contents twice' USING ERRCODE='23514'; END IF;
 END IF;
 IF EXISTS (
  SELECT 1 FROM stock_balances s JOIN containers c ON c.id=s.container_id WHERE c.id=target AND s.quantity>0 AND (
   (s.unit='sealed_box' AND (c.kind<>'box' OR c.state<>'sealed')) OR
   (s.unit='intact_blister' AND (c.kind<>'blister' OR c.state<>'sealed')) OR
   (s.unit='prepared_half_box' AND c.kind<>'half_box') OR
   (s.unit='loose_piece' AND c.kind NOT IN ('loose_bin','blister')) OR c.state IN ('empty','dispatched')
  )
 ) THEN RAISE EXCEPTION 'Container state and stock unit disagree' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$$;
--> statement-breakpoint
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
    OR (l.half_preparation_snapshot='counted' AND (s.counted_pieces IS NULL OR s.counted_pieces<=0))
    OR (l.half_preparation_snapshot='commercial' AND s.counted_pieces IS NOT NULL)
    OR l.half_preparation_snapshot NOT IN ('counted','commercial')))
   OR (s.quantity>0 AND l.packing_model_snapshot<>'blister' AND s.unit IN ('intact_blister','loose_piece'))
   OR (s.quantity>0 AND l.packing_model_snapshot='whole' AND s.unit<>'sealed_box')
  )
  THEN RAISE EXCEPTION 'Physical state does not match the historical packaging model' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_commercial_fraction_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_NAME='containers' THEN target:=coalesce(NEW.id,OLD.id);
 ELSE target:=coalesce(NEW.container_id,OLD.container_id); END IF;
 IF EXISTS(SELECT 1 FROM stock_balances s JOIN containers c ON c.id=s.container_id JOIN lots l ON l.id=c.lot_id
  WHERE s.container_id=target AND s.unit='box_fraction' AND (
   s.counted_pieces IS NOT NULL OR l.packing_model_snapshot<>'blister' OR l.blisters_per_box_snapshot IS NULL
   OR c.kind NOT IN ('box','blister','half_box')
   OR (s.quantity>0 AND c.state<>'open')
   OR (s.quantity=0 AND c.state NOT IN ('empty','dispatched'))
   OR s.quantity > CASE c.kind WHEN 'box' THEN 2*l.blisters_per_box_snapshot WHEN 'half_box' THEN l.blisters_per_box_snapshot ELSE 2 END
  )) THEN RAISE EXCEPTION 'Commercial fraction must retain its exact package capacity and no fruit count' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$$;
