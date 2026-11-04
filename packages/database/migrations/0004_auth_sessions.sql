CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_username_valid" CHECK ("app_users"."username" ~ '^[a-z0-9][a-z0-9._@+-]{2,79}$'),
	CONSTRAINT "app_users_display_name_valid" CHECK (length(btrim("app_users"."display_name")) between 2 and 100),
	CONSTRAINT "app_users_hash_valid" CHECK (length("app_users"."password_hash") between 80 and 512)
);
--> statement-breakpoint
CREATE TABLE "auth_login_buckets" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_login_attempts_valid" CHECK ("auth_login_buckets"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "auth_session_hash_valid" CHECK ("auth_sessions"."token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "auth_session_expiry_valid" CHECK ("auth_sessions"."expires_at" > "auth_sessions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_username_uq" ON "app_users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "auth_login_buckets_updated_idx" ON "auth_login_buckets" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expiry_idx" ON "auth_sessions" USING btree ("expires_at");