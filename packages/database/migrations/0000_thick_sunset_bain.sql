CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"actor" text NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bcv_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate" numeric(20, 8) NOT NULL,
	"source" text DEFAULT 'BCV' NOT NULL,
	"source_url" text NOT NULL,
	"source_hash" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"verified_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bcv_source_period_uq" UNIQUE("source_hash","valid_from"),
	CONSTRAINT "bcv_verified_official" CHECK ("bcv_rates"."source"='BCV' and "bcv_rates"."rate">0 and "bcv_rates"."valid_until">"bcv_rates"."valid_from" and "bcv_rates"."verified_at">="bcv_rates"."fetched_at" and "bcv_rates"."source_url" ~ '^https://(www.)?bcv.org.ve(/|$)')
);
--> statement-breakpoint
CREATE TABLE "calibers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fruit_id" uuid NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calibers_fruit_id_uq" UNIQUE("id","fruit_id"),
	CONSTRAINT "calibers_label_valid" CHECK (length(btrim("calibers"."label")) between 1 and 30)
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tax_id" text,
	"phone" text,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "command_receipts" (
	"key" uuid PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "containers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" text NOT NULL,
	"state" text DEFAULT 'sealed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "containers_context_uq" UNIQUE("id","lot_id","warehouse_id"),
	CONSTRAINT "container_not_own_parent" CHECK ("containers"."parent_id" is null or "containers"."parent_id"<>"containers"."id"),
	CONSTRAINT "container_kind_valid" CHECK ("containers"."kind" in ('box','blister','half_box','loose_bin')),
	CONSTRAINT "container_state_valid" CHECK ("containers"."state" in ('sealed','open','empty','dispatched'))
);
--> statement-breakpoint
CREATE TABLE "fruits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fruits_name_valid" CHECK (length(btrim("fruits"."name")) between 2 and 80)
);
--> statement-breakpoint
CREATE TABLE "inventory_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movement_id" uuid NOT NULL,
	"container_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"quantity_delta" integer NOT NULL,
	"pieces_delta" integer,
	CONSTRAINT "entry_nonzero" CHECK ("inventory_entries"."quantity_delta"<>0 or coalesce("inventory_entries"."pieces_delta",0)<>0),
	CONSTRAINT "entry_unit_valid" CHECK ("inventory_entries"."unit" in ('sealed_box','intact_blister','prepared_half_box','loose_piece'))
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"actor" text NOT NULL,
	"counted_before" integer,
	"delivered_pieces" integer,
	"remaining_pieces" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movement_idempotency_uq" UNIQUE("idempotency_key"),
	CONSTRAINT "movement_kind_valid" CHECK ("inventory_movements"."kind" in ('receipt','dispatch','open_box','fraction','adjustment','transfer','reversal')),
	CONSTRAINT "movement_reason_required" CHECK (length(btrim("inventory_movements"."reason"))>0),
	CONSTRAINT "fraction_conservation" CHECK ("inventory_movements"."kind"<>'fraction' or ("inventory_movements"."counted_before" is not null and "inventory_movements"."delivered_pieces" is not null and "inventory_movements"."remaining_pieces" is not null and "inventory_movements"."counted_before">0 and "inventory_movements"."delivered_pieces">=0 and "inventory_movements"."remaining_pieces">=0 and "inventory_movements"."counted_before"="inventory_movements"."delivered_pieces"+"inventory_movements"."remaining_pieces"))
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"variant_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_line_id" uuid,
	"packing_rule_id" uuid NOT NULL,
	"packing_rule_version" integer NOT NULL,
	"blisters_per_box_snapshot" integer NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"unit_cost_usd" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lots_code_uq" UNIQUE("code"),
	CONSTRAINT "lots_values_valid" CHECK ("lots"."blisters_per_box_snapshot" between 1 and 100 and "lots"."unit_cost_usd">=0 and "lots"."packing_rule_version">0)
);
--> statement-breakpoint
CREATE TABLE "packing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"blisters_per_box" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packing_variant_uq" UNIQUE("variant_id"),
	CONSTRAINT "packing_id_variant_uq" UNIQUE("id","variant_id"),
	CONSTRAINT "packing_positive" CHECK ("packing_rules"."blisters_per_box" between 1 and 100),
	CONSTRAINT "packing_version_positive" CHECK ("packing_rules"."version">0),
	CONSTRAINT "packing_notes_length" CHECK (length("packing_rules"."notes")<=500)
);
--> statement-breakpoint
CREATE TABLE "payment_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"amount_usd" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_payment_sale_uq" UNIQUE("payment_id","sale_id"),
	CONSTRAINT "application_positive" CHECK ("payment_applications"."amount_usd">0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"amount_usd" numeric(18, 4) NOT NULL,
	"bcv_rate_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_idempotency_uq" UNIQUE("idempotency_key"),
	CONSTRAINT "payments_id_client_uq" UNIQUE("id","client_id"),
	CONSTRAINT "payment_positive" CHECK ("payments"."amount">0 and "payments"."amount_usd">0),
	CONSTRAINT "payment_currency_rate" CHECK (("payments"."currency"='USD' and "payments"."bcv_rate_id" is null and "payments"."amount"="payments"."amount_usd") or ("payments"."currency"='VES' and "payments"."bcv_rate_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "price_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_list_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"presentation" text NOT NULL,
	"unit_usd" numeric(18, 4) NOT NULL,
	CONSTRAINT "price_item_uq" UNIQUE("price_list_id","variant_id","presentation"),
	CONSTRAINT "price_positive" CHECK ("price_items"."unit_usd">=0),
	CONSTRAINT "price_presentation_valid" CHECK ("price_items"."presentation" in ('box','blister','half_box','piece'))
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"payment_basis" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_basis_valid" CHECK ("price_lists"."payment_basis" in ('usd_cash_promo','ves_regular')),
	CONSTRAINT "price_currency_usd" CHECK ("price_lists"."currency"='USD')
);
--> statement-breakpoint
CREATE TABLE "purchase_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"presentation" text NOT NULL,
	"unit_cost_usd" numeric(18, 4) NOT NULL,
	CONSTRAINT "purchase_line_positive" CHECK ("purchase_lines"."quantity">0 and "purchase_lines"."unit_cost_usd">=0),
	CONSTRAINT "purchase_presentation_valid" CHECK ("purchase_lines"."presentation" in ('box','blister','half_box','piece'))
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"purchased_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_reference_uq" UNIQUE("supplier_id","reference"),
	CONSTRAINT "purchase_status_valid" CHECK ("purchases"."status" in ('draft','received','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"presentation" text NOT NULL,
	"quantity" integer NOT NULL,
	"reference_unit_usd" numeric(18, 4) NOT NULL,
	"agreed_unit_usd" numeric(18, 4) NOT NULL,
	"price_basis" text NOT NULL,
	"description_snapshot" text NOT NULL,
	CONSTRAINT "sale_line_valid" CHECK ("sale_lines"."quantity">0 and "sale_lines"."reference_unit_usd">=0 and "sale_lines"."agreed_unit_usd">=0),
	CONSTRAINT "sale_presentation_valid" CHECK ("sale_lines"."presentation" in ('box','blister','half_box','piece')),
	CONSTRAINT "sale_basis_valid" CHECK ("sale_lines"."price_basis" in ('usd_cash_promo','ves_regular'))
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"client_id" uuid NOT NULL,
	"condition" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"sold_at" timestamp with time zone NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_number_uq" UNIQUE("number"),
	CONSTRAINT "sales_id_client_uq" UNIQUE("id","client_id"),
	CONSTRAINT "sales_condition_valid" CHECK ("sales"."condition" in ('cash','credit')),
	CONSTRAINT "sales_status_valid" CHECK ("sales"."status" in ('draft','confirmed','cancelled')),
	CONSTRAINT "sales_currency_usd" CHECK ("sales"."currency"='USD'),
	CONSTRAINT "credit_due_required" CHECK ("sales"."condition"<>'credit' or "sales"."due_date" is not null)
);
--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"quantity" integer NOT NULL,
	"counted_pieces" integer,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "stock_container_uq" UNIQUE("container_id"),
	CONSTRAINT "stock_nonnegative" CHECK ("stock_balances"."quantity">=0 and ("stock_balances"."counted_pieces" is null or "stock_balances"."counted_pieces">=0) and "stock_balances"."version">0),
	CONSTRAINT "stock_unit_valid" CHECK ("stock_balances"."unit" in ('sealed_box','intact_blister','prepared_half_box','loose_piece')),
	CONSTRAINT "loose_count_exact" CHECK ("stock_balances"."unit"<>'loose_piece' or ("stock_balances"."counted_pieces" is not null and "stock_balances"."counted_pieces"="stock_balances"."quantity")),
	CONSTRAINT "half_box_count_required" CHECK ("stock_balances"."unit"<>'prepared_half_box' or "stock_balances"."counted_pieces" is not null)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tax_id" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fruit_id" uuid NOT NULL,
	"variety_id" uuid NOT NULL,
	"caliber_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variant_combination_uq" UNIQUE("variety_id","caliber_id")
);
--> statement-breakpoint
CREATE TABLE "varieties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fruit_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "varieties_fruit_id_uq" UNIQUE("id","fruit_id"),
	CONSTRAINT "varieties_name_valid" CHECK (length(btrim("varieties"."name")) between 2 and 80)
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouses_name_uq" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "calibers" ADD CONSTRAINT "calibers_fruit_id_fruits_id_fk" FOREIGN KEY ("fruit_id") REFERENCES "public"."fruits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_parent_id_lot_id_warehouse_id_containers_id_lot_id_warehouse_id_fk" FOREIGN KEY ("parent_id","lot_id","warehouse_id") REFERENCES "public"."containers"("id","lot_id","warehouse_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_movement_id_inventory_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_purchase_line_id_purchase_lines_id_fk" FOREIGN KEY ("purchase_line_id") REFERENCES "public"."purchase_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_packing_rule_id_variant_id_packing_rules_id_variant_id_fk" FOREIGN KEY ("packing_rule_id","variant_id") REFERENCES "public"."packing_rules"("id","variant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_rules" ADD CONSTRAINT "packing_rules_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_payment_id_client_id_payments_id_client_id_fk" FOREIGN KEY ("payment_id","client_id") REFERENCES "public"."payments"("id","client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_sale_id_client_id_sales_id_client_id_fk" FOREIGN KEY ("sale_id","client_id") REFERENCES "public"."sales"("id","client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bcv_rate_id_bcv_rates_id_fk" FOREIGN KEY ("bcv_rate_id") REFERENCES "public"."bcv_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_items" ADD CONSTRAINT "price_items_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_items" ADD CONSTRAINT "price_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_fruit_id_fruits_id_fk" FOREIGN KEY ("fruit_id") REFERENCES "public"."fruits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_variety_id_fruit_id_varieties_id_fruit_id_fk" FOREIGN KEY ("variety_id","fruit_id") REFERENCES "public"."varieties"("id","fruit_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_caliber_id_fruit_id_calibers_id_fruit_id_fk" FOREIGN KEY ("caliber_id","fruit_id") REFERENCES "public"."calibers"("id","fruit_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varieties" ADD CONSTRAINT "varieties_fruit_id_fruits_id_fk" FOREIGN KEY ("fruit_id") REFERENCES "public"."fruits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_date_idx" ON "audit_events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_request_idx" ON "audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "bcv_validity_idx" ON "bcv_rates" USING btree ("valid_from","valid_until");--> statement-breakpoint
CREATE UNIQUE INDEX "calibers_label_uq" ON "calibers" USING btree ("fruit_id",lower(btrim("label")));--> statement-breakpoint
CREATE INDEX "containers_lot_idx" ON "containers" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "containers_warehouse_idx" ON "containers" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "containers_parent_idx" ON "containers" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fruits_name_uq" ON "fruits" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "entries_movement_idx" ON "inventory_entries" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "entries_container_idx" ON "inventory_entries" USING btree ("container_id");--> statement-breakpoint
CREATE INDEX "movements_date_idx" ON "inventory_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lots_variant_idx" ON "lots" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "lots_supplier_idx" ON "lots" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "lots_purchase_idx" ON "lots" USING btree ("purchase_line_id");--> statement-breakpoint
CREATE INDEX "lots_rule_idx" ON "lots" USING btree ("packing_rule_id");--> statement-breakpoint
CREATE INDEX "applications_sale_idx" ON "payment_applications" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "applications_client_idx" ON "payment_applications" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "payments_client_idx" ON "payments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "payments_rate_idx" ON "payments" USING btree ("bcv_rate_id");--> statement-breakpoint
CREATE INDEX "price_items_variant_idx" ON "price_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "purchase_lines_purchase_idx" ON "purchase_lines" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_lines_variant_idx" ON "purchase_lines" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "purchases_supplier_idx" ON "purchases" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "sale_lines_sale_idx" ON "sale_lines" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_lines_variant_idx" ON "sale_lines" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "sales_client_date_idx" ON "sales" USING btree ("client_id","sold_at");--> statement-breakpoint
CREATE INDEX "sales_due_idx" ON "sales" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "variants_fruit_idx" ON "product_variants" USING btree ("fruit_id");--> statement-breakpoint
CREATE INDEX "variants_caliber_idx" ON "product_variants" USING btree ("caliber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "varieties_name_uq" ON "varieties" USING btree ("fruit_id",lower(btrim("name")));--> statement-breakpoint
CREATE VIEW "public"."receivables" AS (select s.id as sale_id, s.client_id, s.number, s.due_date, 'USD'::text as currency, coalesce(l.total,0)::numeric(18,2) as total_usd, coalesce(p.paid,0)::numeric(18,2) as paid_usd, (coalesce(l.total,0)-coalesce(p.paid,0))::numeric(18,2) as balance_usd from sales s left join (select sale_id, round(sum(quantity*agreed_unit_usd),2) as total from sale_lines group by sale_id) l on l.sale_id=s.id left join (select sale_id,sum(amount_usd) as paid from payment_applications group by sale_id) p on p.sale_id=s.id where s.status='confirmed');