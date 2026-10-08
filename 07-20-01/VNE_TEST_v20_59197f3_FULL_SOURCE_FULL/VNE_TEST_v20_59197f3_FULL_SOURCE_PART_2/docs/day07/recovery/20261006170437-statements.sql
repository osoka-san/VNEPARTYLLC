-- Restricted TEST scaffold, final-state reconstruction. No data or role grants.
-- Not a connected production backend. Real auth/storage schemas are never modified.
set local search_path=public,pg_catalog;
set local check_function_bodies=off;
create schema private;
revoke all on schema private from PUBLIC,anon,authenticated,service_role;

create type "private"."admission_state" as enum ('pending','admitted','exempt','revoked');

create type "public"."application_status" as enum ('submitted','withdrawn','approved','rejected','under_review','needs_info','waitlisted');

create type "public"."event_status" as enum ('draft','published','archived');

create type "public"."invite_status" as enum ('created','sent','failed','accepted','revoked','expired','replaced');

create type "public"."membership_request_status" as enum ('pending','approved','rejected');

create type "public"."order_status" as enum ('awaiting_payment','paid','failed','cancelled','expired','needs_review','refunded');

create type "public"."participation_status" as enum ('active','revoked','refunded');

create type "public"."payment_status" as enum ('pending','succeeded','failed','refunded');

create type "public"."reservation_status" as enum ('active','converted','expired','cancelled');

create type "public"."staff_role" as enum ('owner','admin','editor','moderator','scanner','shift_lead','finance');

create table "private"."audit_log" (
 "id" bigint generated always as identity not null,
 "at" timestamp with time zone default now() not null,
 "actor" uuid,
 "action" text not null,
 "object_type" text not null,
 "object_id" uuid,
 "result" text not null,
 "correlation_id" uuid default gen_random_uuid() not null,
 "details" jsonb default '{}'::jsonb not null
);

alter table "private"."audit_log" enable row level security;

create table "private"."member_admission" (
 "user_id" uuid not null,
 "state" private.admission_state default 'pending'::private.admission_state not null,
 "source" text not null,
 "invite_id" uuid,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null
);

alter table "private"."member_admission" enable row level security;

create table "private"."membership_request_limits" (
 "identifier_hash" text not null,
 "window_started_at" timestamp with time zone default now() not null,
 "attempts" integer default 1 not null
);

alter table "private"."membership_request_limits" enable row level security;

create table "private"."outbox" (
 "id" bigint generated always as identity not null,
 "created_at" timestamp with time zone default now() not null,
 "topic" text not null,
 "payload" jsonb not null,
 "status" text default 'pending'::text not null,
 "attempts" integer default 0 not null
);

alter table "private"."outbox" enable row level security;

create table "private"."ticket_checkins" (
 "pass_id" uuid not null,
 "event_id" uuid not null,
 "actor" uuid not null,
 "operation_id" uuid not null,
 "checked_at" timestamp with time zone default clock_timestamp() not null
);

alter table "private"."ticket_checkins" enable row level security;

create table "private"."ticket_events" (
 "id" bigint generated always as identity not null,
 "pass_id" uuid,
 "event_id" uuid not null,
 "actor" uuid not null,
 "action" text not null,
 "outcome" text not null,
 "detail" text,
 "occurred_at" timestamp with time zone default clock_timestamp() not null
);

alter table "private"."ticket_events" enable row level security;

create table "private"."ticket_operations" (
 "actor" uuid not null,
 "operation_id" uuid not null,
 "kind" text not null,
 "request_body" jsonb not null,
 "pass_id" uuid not null,
 "created_at" timestamp with time zone default clock_timestamp() not null
);

alter table "private"."ticket_operations" enable row level security;

create table "private"."ticket_passes" (
 "id" uuid not null,
 "event_id" uuid not null,
 "participation_id" uuid,
 "user_id" uuid,
 "guest_name" text not null,
 "source" text not null,
 "environment" text not null,
 "access" text not null,
 "reason" text not null,
 "sequence_number" integer not null,
 "status" text default 'active'::text not null,
 "version" integer default 1 not null,
 "generation" integer default 1 not null,
 "token_key_version" text not null,
 "view_token_hash" text not null,
 "scan_token_hash" text not null,
 "valid_until" timestamp with time zone not null,
 "event_snapshot" jsonb not null,
 "design" jsonb,
 "issued_by" uuid not null,
 "issued_at" timestamp with time zone default clock_timestamp() not null,
 "revoked_at" timestamp with time zone,
 "used_at" timestamp with time zone
);

alter table "private"."ticket_passes" enable row level security;

create table "public"."application_events" (
 "id" bigint generated always as identity not null,
 "application_id" uuid not null,
 "at" timestamp with time zone default now() not null,
 "from_status" public.application_status,
 "to_status" public.application_status not null,
 "public_message" text,
 "guest_message" text
);

alter table "public"."application_events" enable row level security;

create table "public"."applications" (
 "id" uuid default gen_random_uuid() not null,
 "event_id" uuid not null,
 "user_id" uuid default auth.uid() not null,
 "status" public.application_status default 'submitted'::public.application_status not null,
 "note" text,
 "reviewed_by" uuid,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null,
 "display_name" text,
 "contact_email" text,
 "age_confirmed" boolean default false not null,
 "consent_version" text,
 "consent_at" timestamp with time zone,
 "consent_method" text,
 "marketing_consent" boolean default false not null,
 "guest_reply" text,
 "public_message" text,
 "version" integer default 1 not null,
 "idempotency_key" uuid,
 "submit_fingerprint" text
);

alter table "public"."applications" enable row level security;

create table "public"."event_tiers" (
 "id" uuid default gen_random_uuid() not null,
 "event_id" uuid not null,
 "name" text not null,
 "amount_minor" bigint not null,
 "currency" text not null,
 "active" boolean default true not null,
 "sort" integer default 0 not null,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null
);

alter table "public"."event_tiers" enable row level security;

create table "public"."events" (
 "id" uuid default gen_random_uuid() not null,
 "slug" text not null,
 "title" text not null,
 "status" public.event_status default 'draft'::public.event_status not null,
 "created_at" timestamp with time zone default now() not null,
 "description" text default ''::text not null,
 "starts_at" timestamp with time zone,
 "timezone" text default 'Europe/Moscow'::text not null,
 "capacity" integer,
 "sales_open" boolean default false not null,
 "sales_close_at" timestamp with time zone,
 "reserve_ttl_minutes" integer default 15 not null,
 "qr_release_at" timestamp with time zone,
 "address_reveal_at" timestamp with time zone,
 "entry_opens_at" timestamp with time zone,
 "entry_closes_at" timestamp with time zone,
 "cancelled_at" timestamp with time zone,
 "is_synthetic" boolean default false not null,
 "version" integer default 1 not null,
 "updated_at" timestamp with time zone default now() not null
);

alter table "public"."events" enable row level security;

create table "public"."invites" (
 "id" uuid default gen_random_uuid() not null,
 "code" text not null,
 "request_id" uuid,
 "email" text not null,
 "status" public.invite_status default 'created'::public.invite_status not null,
 "issued_by" uuid,
 "invited_user_id" uuid,
 "expires_at" timestamp with time zone default (now() + '7 days'::interval) not null,
 "sent_at" timestamp with time zone,
 "accepted_at" timestamp with time zone,
 "revoked_at" timestamp with time zone,
 "error" text,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null,
 "token_hash" text
);

alter table "public"."invites" enable row level security;

create table "public"."membership_requests" (
 "id" uuid default gen_random_uuid() not null,
 "email" text not null,
 "display_name" text not null,
 "telegram_username" text not null,
 "event_slug" text,
 "status" public.membership_request_status default 'pending'::public.membership_request_status not null,
 "invited_user_id" uuid,
 "invited_at" timestamp with time zone,
 "invite_error" text,
 "reviewed_by" uuid,
 "reviewed_at" timestamp with time zone,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null,
 "current_invite_id" uuid,
 "consent_version" text,
 "consent_at" timestamp with time zone,
 "consent_method" text
);

alter table "public"."membership_requests" enable row level security;

create table "public"."orders" (
 "id" uuid default gen_random_uuid() not null,
 "reservation_id" uuid not null,
 "user_id" uuid not null,
 "event_id" uuid not null,
 "tier_id" uuid not null,
 "tier_name" text not null,
 "amount_minor" bigint not null,
 "currency" text not null,
 "environment" text not null,
 "status" public.order_status default 'awaiting_payment'::public.order_status not null,
 "review_reason" text,
 "version" integer default 1 not null,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null
);

alter table "public"."orders" enable row level security;

create table "public"."participations" (
 "id" uuid default gen_random_uuid() not null,
 "order_id" uuid not null,
 "event_id" uuid not null,
 "user_id" uuid not null,
 "status" public.participation_status default 'active'::public.participation_status not null,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null
);

alter table "public"."participations" enable row level security;

create table "public"."payment_events" (
 "id" bigint generated always as identity not null,
 "provider" text not null,
 "environment" text not null,
 "provider_event_id" text not null,
 "provider_payment_id" text not null,
 "order_id" uuid not null,
 "kind" text not null,
 "amount_minor" bigint not null,
 "currency" text not null,
 "occurred_at" timestamp with time zone not null,
 "outcome" text not null,
 "received_at" timestamp with time zone default now() not null
);

alter table "public"."payment_events" enable row level security;

create table "public"."payments" (
 "id" uuid default gen_random_uuid() not null,
 "order_id" uuid not null,
 "provider" text not null,
 "environment" text not null,
 "provider_payment_id" text not null,
 "status" public.payment_status default 'pending'::public.payment_status not null,
 "amount_minor" bigint not null,
 "currency" text not null,
 "last_event_at" timestamp with time zone,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null
);

alter table "public"."payments" enable row level security;

create table "public"."profiles" (
 "id" uuid not null,
 "display_name" text,
 "created_at" timestamp with time zone default now() not null,
 "telegram_id" bigint,
 "telegram_username" text
);

alter table "public"."profiles" enable row level security;

create table "public"."refunds" (
 "id" uuid default gen_random_uuid() not null,
 "order_id" uuid not null,
 "amount_minor" bigint not null,
 "currency" text not null,
 "idempotency_key" uuid not null,
 "request_hash" text not null,
 "actor" uuid not null,
 "environment" text not null,
 "status" text default 'succeeded_sandbox'::text not null,
 "created_at" timestamp with time zone default now() not null
);

alter table "public"."refunds" enable row level security;

create table "public"."reservations" (
 "id" uuid default gen_random_uuid() not null,
 "event_id" uuid not null,
 "tier_id" uuid not null,
 "user_id" uuid not null,
 "application_id" uuid not null,
 "status" public.reservation_status default 'active'::public.reservation_status not null,
 "expires_at" timestamp with time zone not null,
 "idempotency_key" uuid not null,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null
);

alter table "public"."reservations" enable row level security;

create table "public"."staff_assignments" (
 "id" uuid default gen_random_uuid() not null,
 "user_id" uuid not null,
 "role" public.staff_role not null,
 "event_id" uuid,
 "valid_from" timestamp with time zone default now() not null,
 "valid_until" timestamp with time zone,
 "revoked_at" timestamp with time zone,
 "granted_by" uuid,
 "created_at" timestamp with time zone default now() not null
);

alter table "public"."staff_assignments" enable row level security;

alter table "private"."audit_log" add constraint "audit_log_pkey" PRIMARY KEY (id);

alter table "private"."audit_log" add constraint "audit_log_result_check" CHECK ((result = ANY (ARRAY['ok'::text, 'noop'::text, 'denied'::text])));

alter table "private"."member_admission" add constraint "member_admission_pkey" PRIMARY KEY (user_id);

alter table "private"."membership_request_limits" add constraint "membership_request_limits_attempts_check" CHECK (((attempts >= 1) AND (attempts <= 1000)));

alter table "private"."membership_request_limits" add constraint "membership_request_limits_pkey" PRIMARY KEY (identifier_hash);

alter table "private"."outbox" add constraint "outbox_pkey" PRIMARY KEY (id);

alter table "private"."outbox" add constraint "outbox_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'held'::text])));

alter table "private"."ticket_checkins" add constraint "ticket_checkins_actor_operation_id_key" UNIQUE (actor, operation_id);

alter table "private"."ticket_checkins" add constraint "ticket_checkins_pkey" PRIMARY KEY (pass_id);

alter table "private"."ticket_events" add constraint "ticket_events_pkey" PRIMARY KEY (id);

alter table "private"."ticket_operations" add constraint "ticket_operations_pkey" PRIMARY KEY (actor, operation_id);

alter table "private"."ticket_passes" add constraint "ticket_passes_access_check" CHECK ((access = ANY (ARRAY['GENERAL'::text, 'VIP'::text, 'SECURITY'::text, 'ARTIST'::text])));

alter table "private"."ticket_passes" add constraint "ticket_passes_check" CHECK ((((source = 'manual'::text) AND (participation_id IS NULL)) OR ((source = 'participation'::text) AND (participation_id IS NOT NULL))));

alter table "private"."ticket_passes" add constraint "ticket_passes_environment_check" CHECK ((environment = ANY (ARRAY['sandbox'::text, 'live'::text])));

alter table "private"."ticket_passes" add constraint "ticket_passes_event_id_sequence_number_key" UNIQUE (event_id, sequence_number);

alter table "private"."ticket_passes" add constraint "ticket_passes_guest_name_check" CHECK (((char_length(guest_name) >= 1) AND (char_length(guest_name) <= 80)));

alter table "private"."ticket_passes" add constraint "ticket_passes_participation_id_key" UNIQUE (participation_id);

alter table "private"."ticket_passes" add constraint "ticket_passes_pkey" PRIMARY KEY (id);

alter table "private"."ticket_passes" add constraint "ticket_passes_reason_check" CHECK (((char_length(reason) >= 3) AND (char_length(reason) <= 300)));

alter table "private"."ticket_passes" add constraint "ticket_passes_scan_token_hash_check" CHECK ((scan_token_hash ~ '^[a-f0-9]{64}$'::text));

alter table "private"."ticket_passes" add constraint "ticket_passes_scan_token_hash_key" UNIQUE (scan_token_hash);

alter table "private"."ticket_passes" add constraint "ticket_passes_sequence_number_check" CHECK ((sequence_number > 0));

alter table "private"."ticket_passes" add constraint "ticket_passes_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'participation'::text])));

alter table "private"."ticket_passes" add constraint "ticket_passes_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'used'::text])));

alter table "private"."ticket_passes" add constraint "ticket_passes_view_token_hash_check" CHECK ((view_token_hash ~ '^[a-f0-9]{64}$'::text));

alter table "private"."ticket_passes" add constraint "ticket_passes_view_token_hash_key" UNIQUE (view_token_hash);

alter table "public"."application_events" add constraint "application_events_pkey" PRIMARY KEY (id);

alter table "public"."application_events" add constraint "application_events_public_message_check" CHECK (((public_message IS NULL) OR (char_length(public_message) <= 500)));

alter table "public"."applications" add constraint "applications_consent_method" CHECK (((consent_method IS NULL) OR (consent_method = 'web_form_checkbox'::text)));

alter table "public"."applications" add constraint "applications_display_name_len" CHECK (((display_name IS NULL) OR ((char_length(display_name) >= 1) AND (char_length(display_name) <= 80))));

alter table "public"."applications" add constraint "applications_event_id_user_id_key" UNIQUE (event_id, user_id);

alter table "public"."applications" add constraint "applications_note_check" CHECK ((char_length(note) <= 1000));

alter table "public"."applications" add constraint "applications_pkey" PRIMARY KEY (id);

alter table "public"."applications" add constraint "applications_public_message_len" CHECK (((public_message IS NULL) OR (char_length(public_message) <= 500)));

alter table "public"."applications" add constraint "applications_reply_len" CHECK (((guest_reply IS NULL) OR (char_length(guest_reply) <= 1000)));

alter table "public"."event_tiers" add constraint "event_tiers_amount_minor_check" CHECK (((amount_minor >= 0) AND (amount_minor <= 100000000)));

alter table "public"."event_tiers" add constraint "event_tiers_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text));

alter table "public"."event_tiers" add constraint "event_tiers_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)));

alter table "public"."event_tiers" add constraint "event_tiers_pkey" PRIMARY KEY (id);

alter table "public"."events" add constraint "events_capacity_check" CHECK (((capacity IS NULL) OR ((capacity >= 1) AND (capacity <= 100000))));

alter table "public"."events" add constraint "events_pkey" PRIMARY KEY (id);

alter table "public"."events" add constraint "events_reserve_ttl_minutes_check" CHECK (((reserve_ttl_minutes >= 5) AND (reserve_ttl_minutes <= 240)));

alter table "public"."events" add constraint "events_slug_check" CHECK ((slug ~ '^[a-z0-9-]{3,64}$'::text));

alter table "public"."events" add constraint "events_slug_key" UNIQUE (slug);

alter table "public"."events" add constraint "events_title_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)));

alter table "public"."invites" add constraint "invites_code_key" UNIQUE (code);

alter table "public"."invites" add constraint "invites_pkey" PRIMARY KEY (id);

alter table "public"."invites" add constraint "invites_token_hash_format" CHECK (((token_hash IS NULL) OR (token_hash ~ '^[0-9a-f]{64}$'::text)));

alter table "public"."membership_requests" add constraint "membership_requests_display_name_length" CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 80)));

alter table "public"."membership_requests" add constraint "membership_requests_email_format" CHECK ((((char_length(email) >= 3) AND (char_length(email) <= 254)) AND (email = lower(email)) AND (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::text)));

alter table "public"."membership_requests" add constraint "membership_requests_event_slug_format" CHECK (((event_slug IS NULL) OR (event_slug ~ '^[a-z0-9-]{3,64}$'::text)));

alter table "public"."membership_requests" add constraint "membership_requests_invite_shape" CHECK ((((invited_at IS NULL) AND (invited_user_id IS NULL)) OR ((status = 'approved'::public.membership_request_status) AND (invited_at IS NOT NULL) AND (invited_user_id IS NOT NULL))));

alter table "public"."membership_requests" add constraint "membership_requests_pkey" PRIMARY KEY (id);

alter table "public"."membership_requests" add constraint "membership_requests_review_shape" CHECK ((((status = 'pending'::public.membership_request_status) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL)) OR ((status = ANY (ARRAY['approved'::public.membership_request_status, 'rejected'::public.membership_request_status])) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL))));

alter table "public"."membership_requests" add constraint "membership_requests_telegram_format" CHECK ((telegram_username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$'::text));

alter table "public"."orders" add constraint "orders_amount_minor_check" CHECK ((amount_minor >= 0));

alter table "public"."orders" add constraint "orders_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text));

alter table "public"."orders" add constraint "orders_environment_check" CHECK ((environment = ANY (ARRAY['sandbox'::text, 'live'::text])));

alter table "public"."orders" add constraint "orders_pkey" PRIMARY KEY (id);

alter table "public"."orders" add constraint "orders_reservation_id_key" UNIQUE (reservation_id);

alter table "public"."participations" add constraint "participations_order_id_key" UNIQUE (order_id);

alter table "public"."participations" add constraint "participations_pkey" PRIMARY KEY (id);

alter table "public"."payment_events" add constraint "payment_events_pkey" PRIMARY KEY (id);

alter table "public"."payment_events" add constraint "payment_events_provider_environment_provider_event_id_key" UNIQUE (provider, environment, provider_event_id);

alter table "public"."payments" add constraint "payments_environment_check" CHECK ((environment = ANY (ARRAY['sandbox'::text, 'live'::text])));

alter table "public"."payments" add constraint "payments_pkey" PRIMARY KEY (id);

alter table "public"."payments" add constraint "payments_provider_environment_provider_payment_id_key" UNIQUE (provider, environment, provider_payment_id);

alter table "public"."profiles" add constraint "profiles_display_name_check" CHECK ((char_length(display_name) <= 80));

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);

alter table "public"."profiles" add constraint "profiles_telegram_id_key" UNIQUE (telegram_id);

alter table "public"."profiles" add constraint "profiles_telegram_username_check" CHECK (((telegram_username IS NULL) OR (telegram_username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$'::text)));

alter table "public"."refunds" add constraint "refunds_amount_minor_check" CHECK ((amount_minor > 0));

alter table "public"."refunds" add constraint "refunds_idempotency_key_key" UNIQUE (idempotency_key);

alter table "public"."refunds" add constraint "refunds_pkey" PRIMARY KEY (id);

alter table "public"."reservations" add constraint "reservations_pkey" PRIMARY KEY (id);

alter table "public"."reservations" add constraint "reservations_user_id_idempotency_key_key" UNIQUE (user_id, idempotency_key);

alter table "public"."staff_assignments" add constraint "event_role_scope_and_expiry" CHECK (((role <> ALL (ARRAY['moderator'::public.staff_role, 'scanner'::public.staff_role, 'shift_lead'::public.staff_role])) OR ((event_id IS NOT NULL) AND (valid_until IS NOT NULL))));

alter table "public"."staff_assignments" add constraint "event_scoped_roles" CHECK ((((role = ANY (ARRAY['moderator'::public.staff_role, 'scanner'::public.staff_role, 'shift_lead'::public.staff_role])) AND (event_id IS NOT NULL)) OR ((role = ANY (ARRAY['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role, 'finance'::public.staff_role])) AND (event_id IS NULL))));

alter table "public"."staff_assignments" add constraint "staff_assignments_pkey" PRIMARY KEY (id);

alter table "public"."staff_assignments" add constraint "valid_window" CHECK (((valid_until IS NULL) OR (valid_until > valid_from)));

alter table "private"."member_admission" add constraint "member_admission_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "private"."ticket_checkins" add constraint "ticket_checkins_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id);

alter table "private"."ticket_checkins" add constraint "ticket_checkins_pass_id_fkey" FOREIGN KEY (pass_id) REFERENCES private.ticket_passes(id);

alter table "private"."ticket_events" add constraint "ticket_events_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id);

alter table "private"."ticket_events" add constraint "ticket_events_pass_id_fkey" FOREIGN KEY (pass_id) REFERENCES private.ticket_passes(id);

alter table "private"."ticket_operations" add constraint "ticket_operations_pass_id_fkey" FOREIGN KEY (pass_id) REFERENCES private.ticket_passes(id);

alter table "private"."ticket_passes" add constraint "ticket_passes_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

alter table "private"."ticket_passes" add constraint "ticket_passes_participation_id_fkey" FOREIGN KEY (participation_id) REFERENCES public.participations(id) ON DELETE RESTRICT;

alter table "public"."application_events" add constraint "application_events_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;

alter table "public"."applications" add constraint "applications_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

alter table "public"."applications" add constraint "applications_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);

alter table "public"."applications" add constraint "applications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."event_tiers" add constraint "event_tiers_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

alter table "public"."invites" add constraint "invites_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.membership_requests(id);

alter table "public"."membership_requests" add constraint "membership_requests_current_invite_id_fkey" FOREIGN KEY (current_invite_id) REFERENCES public.invites(id);

alter table "public"."orders" add constraint "orders_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

alter table "public"."orders" add constraint "orders_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE RESTRICT;

alter table "public"."orders" add constraint "orders_tier_id_fkey" FOREIGN KEY (tier_id) REFERENCES public.event_tiers(id) ON DELETE RESTRICT;

alter table "public"."participations" add constraint "participations_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

alter table "public"."participations" add constraint "participations_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;

alter table "public"."payment_events" add constraint "payment_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;

alter table "public"."payments" add constraint "payments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."refunds" add constraint "refunds_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;

alter table "public"."reservations" add constraint "reservations_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE RESTRICT;

alter table "public"."reservations" add constraint "reservations_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

alter table "public"."reservations" add constraint "reservations_tier_id_fkey" FOREIGN KEY (tier_id) REFERENCES public.event_tiers(id) ON DELETE RESTRICT;

alter table "public"."staff_assignments" add constraint "staff_assignments_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

alter table "public"."staff_assignments" add constraint "staff_assignments_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES auth.users(id);

alter table "public"."staff_assignments" add constraint "staff_assignments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX ticket_events_pass ON private.ticket_events USING btree (pass_id, id DESC);

CREATE INDEX ticket_passes_event ON private.ticket_passes USING btree (event_id, issued_at DESC);

CREATE INDEX application_events_application_id_at_idx ON public.application_events USING btree (application_id, at);

CREATE UNIQUE INDEX applications_user_idem ON public.applications USING btree (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE INDEX applications_event_status ON public.applications USING btree (event_id, status, created_at DESC);

CREATE INDEX invites_request_idx ON public.invites USING btree (request_id, created_at DESC);

CREATE INDEX invites_user_idx ON public.invites USING btree (invited_user_id);

CREATE UNIQUE INDEX invites_one_active ON public.invites USING btree (request_id) WHERE (status = ANY (ARRAY['created'::public.invite_status, 'sent'::public.invite_status]));

CREATE UNIQUE INDEX invites_token_hash_uniq ON public.invites USING btree (token_hash) WHERE (token_hash IS NOT NULL);

CREATE UNIQUE INDEX membership_requests_pending_email_uq ON public.membership_requests USING btree (lower(email)) WHERE (status = 'pending'::public.membership_request_status);

CREATE INDEX membership_requests_status_created_idx ON public.membership_requests USING btree (status, created_at DESC);

CREATE INDEX orders_event ON public.orders USING btree (event_id, created_at DESC);

CREATE INDEX orders_user ON public.orders USING btree (user_id);

CREATE UNIQUE INDEX participations_one_active ON public.participations USING btree (event_id, user_id) WHERE (status = 'active'::public.participation_status);

CREATE UNIQUE INDEX profiles_telegram_username_lower_uq ON public.profiles USING btree (lower(telegram_username));

CREATE INDEX reservations_event_active ON public.reservations USING btree (event_id) WHERE (status = 'active'::public.reservation_status);

CREATE INDEX staff_assignments_user_idx ON public.staff_assignments USING btree (user_id) WHERE (revoked_at IS NULL);

CREATE OR REPLACE FUNCTION private.admin_event_transition(_id uuid, _action text, _expected_version integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events; u uuid := auth.uid();
begin
  if not private.staff_can('events_manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.events where id = _id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if e.version <> _expected_version then raise exception 'version conflict' using errcode = '40001'; end if;
  case _action
    when 'publish' then update public.events set status = 'published' where id = _id;
    when 'unpublish' then update public.events set status = 'draft', sales_open = false where id = _id;
    when 'open_sales' then update public.events set sales_open = true where id = _id;
    when 'close_sales' then update public.events set sales_open = false where id = _id;
    when 'archive' then update public.events set status = 'archived', sales_open = false where id = _id;
    when 'cancel' then update public.events set cancelled_at = now(), sales_open = false where id = _id;
      -- sandbox cancellation: open holds are cancelled; paid orders go to review, nothing is deleted
      update public.orders o set status = 'cancelled', updated_at = now(), version = o.version + 1 where o.event_id = _id and o.status = 'awaiting_payment';
      update public.reservations set status = 'cancelled', updated_at = now() where event_id = _id and status = 'active';
      update public.orders o set status = 'needs_review', review_reason = 'event_cancelled', updated_at = now(), version = o.version + 1 where o.event_id = _id and o.status = 'paid';
    else raise exception 'invalid action' using errcode = '22023';
  end case;
  update public.events set version = version + 1, updated_at = now() where id = _id;
  insert into private.audit_log(actor, action, object_type, object_id, result) values (u, 'event.' || _action, 'event', _id, 'ok');
  return _action;
end $function$
;

CREATE OR REPLACE FUNCTION private.admin_save_event(_id uuid, _expected_version integer, _data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid; u uuid := auth.uid();
begin
  if not private.staff_can('events_manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if _id is null then
    insert into public.events(slug, title, description, starts_at, timezone, capacity, sales_close_at, reserve_ttl_minutes,
      qr_release_at, address_reveal_at, entry_opens_at, entry_closes_at, is_synthetic)
    values (_data->>'slug', _data->>'title', coalesce(_data->>'description',''), (_data->>'starts_at')::timestamptz,
      coalesce(_data->>'timezone','Europe/Moscow'), (_data->>'capacity')::int, (_data->>'sales_close_at')::timestamptz,
      coalesce((_data->>'reserve_ttl_minutes')::int, 15), (_data->>'qr_release_at')::timestamptz, (_data->>'address_reveal_at')::timestamptz,
      (_data->>'entry_opens_at')::timestamptz, (_data->>'entry_closes_at')::timestamptz, coalesce((_data->>'is_synthetic')::boolean, false))
    returning id into v;
  else
    update public.events set slug = _data->>'slug', title = _data->>'title', description = coalesce(_data->>'description',''),
      starts_at = (_data->>'starts_at')::timestamptz, timezone = coalesce(_data->>'timezone', timezone), capacity = (_data->>'capacity')::int,
      sales_close_at = (_data->>'sales_close_at')::timestamptz, reserve_ttl_minutes = coalesce((_data->>'reserve_ttl_minutes')::int, reserve_ttl_minutes),
      qr_release_at = (_data->>'qr_release_at')::timestamptz, address_reveal_at = (_data->>'address_reveal_at')::timestamptz,
      entry_opens_at = (_data->>'entry_opens_at')::timestamptz, entry_closes_at = (_data->>'entry_closes_at')::timestamptz,
      version = version + 1, updated_at = now()
    where id = _id and version = _expected_version returning id into v;
    if v is null then raise exception 'version conflict' using errcode = '40001'; end if;
  end if;
  insert into private.audit_log(actor, action, object_type, object_id, result) values (u, 'event.save', 'event', v, 'ok');
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION private.admin_save_tier(_event uuid, _tier uuid, _name text, _amount bigint, _currency text, _active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid;
begin
  if not private.staff_can('events_manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if _tier is null then
    insert into public.event_tiers(event_id, name, amount_minor, currency, active) values (_event, _name, _amount, upper(_currency), _active) returning id into v;
  else
    -- price changes never touch existing orders (they keep their snapshot)
    update public.event_tiers set name = _name, amount_minor = _amount, currency = upper(_currency), active = _active, updated_at = now()
      where id = _tier and event_id = _event returning id into v;
  end if;
  insert into private.audit_log(actor, action, object_type, object_id, result, details) values (auth.uid(), 'tier.save', 'event', _event, 'ok', jsonb_build_object('tier', v));
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION private.applications_fingerprint_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.submit_fingerprint is distinct from old.submit_fingerprint then
    raise exception 'submit_fingerprint is immutable' using errcode = '42501';
  end if;
  if new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'idempotency_key is immutable' using errcode = '42501';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.apply_payment_event(_provider text, _env text, _event_id text, _payment_id text, _order uuid, _kind text, _amount bigint, _currency text, _occurred_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.orders; r public.reservations; p public.payments; v_outcome text; rank_new int; rank_old int; v_event uuid; e public.events;
begin
  if _kind not in ('pending','succeeded','failed') then return 'invalid_kind'; end if;
  -- Serialize one delivery, including a retry that raced before the first commit.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'payment.event:' || jsonb_build_array(_provider, _env, _event_id)::text, 0));
  if exists (select 1 from public.payment_events where provider = _provider and environment = _env and provider_event_id = _event_id) then return 'duplicate'; end if;
  -- Shared seat-allocation mutex; always event BEFORE order/reservation.
  -- The initial lookup does not lock the order and cannot create a reverse lock dependency.
  select event_id into v_event from public.orders where id = _order;
  if not found then return 'unknown_order'; end if;
  select * into e from public.events where id = v_event for update;
  if not found then return 'unknown_order'; end if;
  select * into o from public.orders where id = _order for update;
  if not found then return 'unknown_order'; end if;
  if o.environment <> _env or o.amount_minor <> _amount or o.currency <> _currency then return 'mismatch'; end if;
  select * into p from public.payments where provider = _provider and environment = _env and provider_payment_id = _payment_id for update;
  if found and p.order_id <> o.id then return 'mismatch'; end if;
  if not found then
    insert into public.payments(order_id, provider, environment, provider_payment_id, amount_minor, currency, last_event_at)
      values (o.id, _provider, _env, _payment_id, _amount, _currency, _occurred_at) returning * into p;
  end if;
  -- monotonic reconciliation: pending(0) < failed(1) < succeeded(2); refunded is terminal and set only by refund
  rank_new := case _kind when 'pending' then 0 when 'failed' then 1 else 2 end;
  rank_old := case p.status when 'pending' then 0 when 'failed' then 1 when 'succeeded' then 2 else 3 end;
  if rank_new <= rank_old and not (rank_new = 0 and rank_old = 0) then
    v_outcome := 'stale';
  elsif _kind = 'pending' then
    v_outcome := 'pending';
  else
    update public.payments set status = _kind::public.payment_status, last_event_at = _occurred_at, updated_at = now() where id = p.id;
    select * into r from public.reservations where id = o.reservation_id for update;
    if _kind = 'failed' then
      if o.status = 'awaiting_payment' then
        update public.orders set status = 'failed', updated_at = now(), version = version + 1 where id = o.id;
        update public.reservations set status = 'cancelled', updated_at = now() where id = r.id and status = 'active';
      end if;
      v_outcome := 'failed';
    elsif o.status = 'awaiting_payment' and r.status = 'active' and r.expires_at > clock_timestamp() then
      update public.orders set status = 'paid', updated_at = now(), version = version + 1 where id = o.id;
      update public.reservations set status = 'converted', updated_at = now() where id = r.id;
      insert into public.participations(order_id, event_id, user_id) values (o.id, o.event_id, o.user_id);
      insert into private.outbox(topic, payload, status) values ('participation.confirmed', jsonb_build_object('order', o.id), 'held');
      v_outcome := 'paid';
    elsif o.status = 'paid' then
      v_outcome := 'already_paid';
    else
      -- late / after cancel / after failure: never grant a seat over capacity automatically
      update public.orders set status = 'needs_review', review_reason = 'late_payment:' || o.status::text, updated_at = now(), version = version + 1 where id = o.id;
      if r.status = 'active' then update public.reservations set status = 'expired', updated_at = now() where id = r.id; end if;
      insert into private.outbox(topic, payload, status) values ('order.needs_review', jsonb_build_object('order', o.id), 'held');
      v_outcome := 'needs_review';
    end if;
  end if;
  insert into public.payment_events(provider, environment, provider_event_id, provider_payment_id, order_id, kind, amount_minor, currency, occurred_at, outcome)
    values (_provider, _env, _event_id, _payment_id, o.id, _kind, _amount, _currency, _occurred_at, v_outcome);
  insert into private.audit_log(action, object_type, object_id, result, details)
    values ('payment.event', 'order', o.id, case when v_outcome in ('stale','already_paid') then 'noop' else 'ok' end,
      jsonb_build_object('kind', _kind, 'outcome', v_outcome, 'provider', _provider, 'env', _env));
  return v_outcome;
end $function$
;

CREATE OR REPLACE FUNCTION private.cancel_my_order(_order uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid := auth.uid(); o public.orders;
begin
  if u is null or not private.is_admitted(u) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into o from public.orders where id = _order and user_id = u for update;
  if not found then raise exception 'not found' using errcode = '42501'; end if;
  if o.status <> 'awaiting_payment' then return o.status::text; end if;
  update public.orders set status = 'cancelled', updated_at = now(), version = version + 1 where id = o.id;
  update public.reservations set status = 'cancelled', updated_at = now() where id = o.reservation_id and status = 'active';
  insert into private.audit_log(actor, action, object_type, object_id, result) values (u, 'order.cancel', 'order', o.id, 'ok');
  return 'cancelled';
end $function$
;

CREATE OR REPLACE FUNCTION private.current_consent_version()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select 'draft-2026-09'::text $function$
;

CREATE OR REPLACE FUNCTION private.events_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.slug !~ '^[a-z0-9-]{2,80}$' then raise exception 'invalid slug' using errcode = '22023'; end if;
  if new.timezone not in (select name from pg_catalog.pg_timezone_names) then raise exception 'invalid timezone' using errcode = '22023'; end if;
  if new.sales_close_at is not null and new.starts_at is not null and new.sales_close_at > new.starts_at then raise exception 'sales close after start' using errcode = '22023'; end if;
  if new.entry_opens_at is not null and new.entry_closes_at is not null and new.entry_closes_at <= new.entry_opens_at then raise exception 'entry window order' using errcode = '22023'; end if;
  if new.qr_release_at is not null and new.entry_opens_at is not null and new.qr_release_at > new.entry_opens_at then raise exception 'qr after entry' using errcode = '22023'; end if;
  if new.address_reveal_at is not null and new.starts_at is not null and new.address_reveal_at > new.starts_at then raise exception 'address after start' using errcode = '22023'; end if;
  if new.sales_open and (new.status <> 'published' or new.capacity is null or new.starts_at is null or new.sales_close_at is null or new.cancelled_at is not null) then
    raise exception 'sales require published event with capacity and dates' using errcode = '22023'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.expire_reservations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  with x as (update public.reservations set status = 'expired', updated_at = now() where status = 'active' and expires_at <= now() returning id)
  select count(*) into n from x;
  update public.orders o set status = 'expired', updated_at = now(), version = version + 1
    from public.reservations r where r.id = o.reservation_id and r.status = 'expired' and o.status = 'awaiting_payment';
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION private.grant_staff_assignment(_email text, _role public.staff_role, _event uuid DEFAULT NULL::uuid, _valid_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_id uuid; v_corr uuid := gen_random_uuid();
begin
  if not private.staff_can('team') then raise exception 'forbidden' using errcode = '42501'; end if;
  if _role = 'owner' then raise exception 'owner cannot be granted here' using errcode = '42501'; end if;
  if _role = 'admin' and not private.has_role(array['owner']::public.staff_role[], null) then
    raise exception 'forbidden' using errcode = '42501'; end if;
  if _role in ('moderator','scanner','shift_lead') and _event is null then
    raise exception 'event required' using errcode = '22023'; end if;
  if _role in ('moderator','scanner','shift_lead') and _valid_until is null then
    raise exception 'expiry required' using errcode = '22023'; end if;
  if _role in ('admin','editor') and _event is not null then
    raise exception 'global role' using errcode = '22023'; end if;
  if _valid_until is not null and _valid_until <= now() then
    raise exception 'expiry in past' using errcode = '22023'; end if;
  if _event is not null and not exists (select 1 from public.events where id = _event) then
    raise exception 'event not found' using errcode = 'P0002'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(_email));
  if v_user is null then raise exception 'user not found' using errcode = 'P0002'; end if;
  select id into v_id from public.staff_assignments
   where user_id = v_user and role = _role and event_id is not distinct from _event and revoked_at is null
     and (valid_until is null or valid_until > now());
  if v_id is not null then return v_id; end if;
  insert into public.staff_assignments(user_id, role, event_id, valid_until, granted_by)
    values (v_user, _role, _event, _valid_until, auth.uid()) returning id into v_id;
  insert into private.audit_log (actor, action, object_type, object_id, result, correlation_id, details)
    values (auth.uid(), 'staff.grant', 'staff_assignment', v_id, 'ok', v_corr,
      jsonb_build_object('role', _role, 'event', _event, 'valid_until', _valid_until));
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION private.guest_application_action(_app uuid, _action text, _expected_version integer, _reply text)
 RETURNS public.application_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.applications; v_to public.application_status;
begin
  if _expected_version is null or _expected_version < 1 then raise exception 'version required' using errcode = '22023'; end if;
  select * into r from public.applications where id = _app and user_id = auth.uid() for update;
  if r.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.version is distinct from _expected_version then raise exception 'stale' using errcode = 'PT409'; end if;
  if _action = 'withdraw' and r.status in ('submitted','under_review','needs_info','waitlisted') then v_to := 'withdrawn';
  elsif _action = 'reply' and r.status = 'needs_info' and coalesce(char_length(trim(_reply)),0) between 1 and 1000 then v_to := 'under_review';
  else raise exception 'invalid transition' using errcode = '22023'; end if;
  update public.applications set status = v_to, version = version + 1, updated_at = now(),
    guest_reply = case when _action = 'reply' then trim(_reply) else guest_reply end where id = _app;
  perform private.log_app2(_app, r.status, v_to, null, case when _action = 'reply' then trim(_reply) end, 'application.guest_' || _action);
  return v_to;
end $function$
;

CREATE OR REPLACE FUNCTION private.guest_update_display_name(_app uuid, _name text, _expected_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.applications; v_new int;
begin
  if _expected_version is null or _expected_version < 1 then raise exception 'version required' using errcode = '22023'; end if;
  if coalesce(char_length(trim(_name)), 0) not between 1 and 80 then raise exception 'invalid name' using errcode = '22023'; end if;
  select * into r from public.applications where id = _app and user_id = auth.uid() for update;
  if r.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.version is distinct from _expected_version then raise exception 'stale' using errcode = 'PT409'; end if;
  if r.status not in ('submitted','under_review','needs_info','waitlisted') then raise exception 'invalid transition' using errcode = '22023'; end if;
  update public.applications set display_name = trim(_name), version = version + 1, updated_at = now() where id = _app returning version into v_new;
  insert into private.audit_log(actor, action, object_type, object_id, result, details)
    values (auth.uid(), 'application.guest_rename', 'application', _app, 'ok', jsonb_build_object('field', 'display_name'));
  return v_new;
end $function$
;

CREATE OR REPLACE FUNCTION private.has_role(_roles public.staff_role[], _event uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.staff_assignments s
    where s.user_id = auth.uid() and s.role = any (_roles) and s.revoked_at is null
      and s.valid_from <= now() and (s.valid_until is null or s.valid_until > now())
      and (s.event_id is null or s.event_id = _event)
  )
$function$
;

CREATE OR REPLACE FUNCTION private.invite_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := extensions.gen_random_bytes(8); r text := 'VNE-'; i int;
begin
  for i in 0..7 loop
    if i = 4 then r := r || '-'; end if;
    r := r || substr(a, (get_byte(b, i) % 31) + 1, 1);
  end loop;
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION private.is_admitted(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select _uid is not null and exists (select 1 from private.member_admission a
    where a.user_id = _uid and a.state in ('admitted','exempt'))
$function$
;

CREATE OR REPLACE FUNCTION private.log_app(_app uuid, _from public.application_status, _to public.application_status, _msg text, _action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_corr uuid := gen_random_uuid();
begin
  insert into public.application_events(application_id, from_status, to_status, public_message) values (_app, _from, _to, _msg);
  insert into private.audit_log(actor, action, object_type, object_id, result, correlation_id, details)
    values (auth.uid(), _action, 'application', _app, 'ok', v_corr, jsonb_build_object('from', _from, 'to', _to));
  insert into private.outbox(topic, payload, status)
    values ('application.status_changed', jsonb_build_object('application_id', _app, 'to', _to, 'correlation_id', v_corr), 'held');
end $function$
;

CREATE OR REPLACE FUNCTION private.log_app2(_app uuid, _from public.application_status, _to public.application_status, _msg text, _guest text, _action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_corr uuid := gen_random_uuid();
begin
  insert into public.application_events(application_id, from_status, to_status, public_message, guest_message) values (_app, _from, _to, _msg, _guest);
  insert into private.audit_log(actor, action, object_type, object_id, result, correlation_id, details)
    values (auth.uid(), _action, 'application', _app, 'ok', v_corr, jsonb_build_object('from', _from, 'to', _to));
  insert into private.outbox(topic, payload, status)
    values ('application.status_changed', jsonb_build_object('application_id', _app, 'to', _to, 'correlation_id', v_corr), 'held');
end $function$
;

CREATE OR REPLACE FUNCTION private.membership_decide(_request uuid, _decision public.membership_request_status)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status public.membership_request_status; v_email text; v_corr uuid := gen_random_uuid(); v_inv uuid; v_code text; n int := 0;
begin
  if not private.staff_can('membership') then raise exception 'forbidden' using errcode = '42501'; end if;
  if _decision not in ('approved','rejected') then raise exception 'invalid decision' using errcode = '22023'; end if;
  select status, email into v_status, v_email from public.membership_requests where id = _request for update;
  if v_status is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if v_status <> 'pending' then
    insert into private.audit_log(actor, action, object_type, object_id, result, correlation_id, details)
      values (auth.uid(), 'membership_request.review', 'membership_request', _request, 'noop', v_corr, jsonb_build_object('current', v_status, 'requested', _decision));
    return jsonb_build_object('result', 'noop', 'status', v_status);
  end if;
  update public.membership_requests set status = _decision, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = _request;
  if _decision = 'approved' then
    loop
      n := n + 1;
      begin
        insert into public.invites(code, request_id, email, issued_by) values (private.invite_code(), _request, v_email, auth.uid())
          returning id, code into v_inv, v_code;
        exit;
      exception when unique_violation then if n > 5 then raise; end if; end;
    end loop;
    update public.membership_requests set current_invite_id = v_inv where id = _request;
  end if;
  insert into private.audit_log(actor, action, object_type, object_id, result, correlation_id, details)
    values (auth.uid(), 'membership_request.review', 'membership_request', _request, 'ok', v_corr, jsonb_build_object('decision', _decision, 'invite', v_inv));
  insert into private.outbox(topic, payload, status)
    values ('membership.decided', jsonb_build_object('request_id', _request, 'decision', _decision, 'invite_id', v_inv, 'correlation_id', v_corr), 'held');
  return jsonb_build_object('result', 'changed', 'status', _decision, 'invite_id', v_inv, 'code', v_code);
end $function$
;

CREATE OR REPLACE FUNCTION private.moderate_application(_app uuid, _action text, _expected_version integer, _public_message text)
 RETURNS public.application_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_event uuid; r public.applications; v_to public.application_status; v_ok boolean;
begin
  if not private.staff_session_ok() then raise exception 'forbidden' using errcode = '42501'; end if;
  select event_id into v_event from public.applications where id = _app;
  if v_event is null or not private.has_role(array['owner','admin','moderator']::public.staff_role[], v_event) then
    raise exception 'forbidden' using errcode = '42501'; end if;
  if _expected_version is null or _expected_version < 1 then raise exception 'version required' using errcode = '22023'; end if;
  select * into r from public.applications where id = _app for update;
  if r.version is distinct from _expected_version then raise exception 'stale' using errcode = 'PT409'; end if;
  v_to := case _action when 'take' then 'under_review' when 'request_info' then 'needs_info' when 'approve' then 'approved'
    when 'reject' then 'rejected' when 'waitlist' then 'waitlisted' end::public.application_status;
  v_ok := case _action
    when 'take' then r.status = 'submitted'
    when 'request_info' then r.status in ('submitted','under_review')
    when 'approve' then r.status in ('submitted','under_review','waitlisted')
    when 'reject' then r.status in ('submitted','under_review','needs_info','waitlisted')
    when 'waitlist' then r.status in ('submitted','under_review')
    else false end;
  if not coalesce(v_ok, false) then raise exception 'invalid transition' using errcode = '22023'; end if;
  if _action = 'request_info' and coalesce(char_length(trim(_public_message)),0) not between 1 and 500 then
    raise exception 'message required' using errcode = '22023'; end if;
  update public.applications set status = v_to, version = version + 1, reviewed_by = auth.uid(), updated_at = now(),
    public_message = case when _action = 'request_info' then trim(_public_message) else null end,
    guest_reply = case when _action = 'request_info' then null else guest_reply end
  where id = _app;
  perform private.log_app2(_app, r.status, v_to, case when _action = 'request_info' then trim(_public_message) end, null, 'application.' || _action);
  return v_to;
end $function$
;

CREATE OR REPLACE FUNCTION private.my_staff_access(_area text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case _area
    when 'admin' then private.staff_can('shell')
    when 'scan' then private.staff_session_ok() and exists (
        select 1 from public.staff_assignments s where s.user_id = auth.uid()
          and s.role = any (array['owner','admin','scanner','shift_lead']::public.staff_role[])
          and s.revoked_at is null and s.valid_from <= now() and (s.valid_until is null or s.valid_until > now()))
    else false end
$function$
;

CREATE OR REPLACE FUNCTION private.order_history(_order uuid)
 RETURNS TABLE(at timestamp with time zone, action text, result text, details jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.at, a.action, a.result, a.details from private.audit_log a
  where a.object_id = _order and exists (select 1 from public.orders o where o.id = _order and private.staff_can('orders_view', o.event_id))
  order by a.at desc limit 100
$function$
;

CREATE OR REPLACE FUNCTION private.refund_sandbox(_order uuid, _amount bigint, _idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.orders; f public.refunds; h text; u uuid := auth.uid(); done bigint;
begin
  select * into o from public.orders where id = _order for update;
  if not found or not private.staff_can('finance_refund') then raise exception 'forbidden' using errcode = '42501'; end if;
  h := encode(extensions.digest(_order::text || ':' || _amount::text, 'sha256'), 'hex');
  select * into f from public.refunds where idempotency_key = _idem;
  if found then
    if f.request_hash <> h then raise exception 'idempotency key reused' using errcode = '22023'; end if;
    return jsonb_build_object('refund_id', f.id, 'replayed', true);
  end if;
  if o.environment <> 'sandbox' then raise exception 'live refunds disabled' using errcode = '42501'; end if;
  if o.status not in ('paid','needs_review') then raise exception 'not refundable' using errcode = 'P0001'; end if;
  select coalesce(sum(amount_minor),0) into done from public.refunds where order_id = o.id;
  if _amount <= 0 or _amount + done > o.amount_minor then raise exception 'invalid amount' using errcode = '22023'; end if;
  insert into public.refunds(order_id, amount_minor, currency, idempotency_key, request_hash, actor, environment)
    values (o.id, _amount, o.currency, _idem, h, u, o.environment) returning * into f;
  if _amount + done = o.amount_minor then
    update public.orders set status = 'refunded', updated_at = now(), version = version + 1 where id = o.id;
    update public.participations set status = 'refunded', updated_at = now() where order_id = o.id and status = 'active';
    update public.payments set status = 'refunded', updated_at = now() where order_id = o.id and status = 'succeeded';
  end if;
  insert into private.outbox(topic, payload, status) values ('order.refunded', jsonb_build_object('order', o.id, 'refund', f.id), 'held');
  insert into private.audit_log(actor, action, object_type, object_id, result, details)
    values (u, 'order.refund_sandbox', 'order', o.id, 'ok', jsonb_build_object('amount_minor', _amount));
  return jsonb_build_object('refund_id', f.id, 'replayed', false);
end $function$
;

CREATE OR REPLACE FUNCTION private.require_admitted()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_admitted(auth.uid()) then raise exception 'not admitted' using errcode = '42501'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION private.reserve_seat(_event uuid, _tier uuid, _idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid := auth.uid(); e public.events; t public.event_tiers; r public.reservations; o public.orders; v_app uuid;
begin
  if u is null or not private.is_admitted(u) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _idem is null then raise exception 'idempotency required' using errcode = '22023'; end if;
  -- replay of the same command returns the existing result
  select * into r from public.reservations where user_id = u and idempotency_key = _idem;
  if found then
    if r.event_id <> _event or r.tier_id <> _tier then raise exception 'idempotency key reused' using errcode = '22023'; end if;
    select * into o from public.orders where reservation_id = r.id;
    return jsonb_build_object('order_id', o.id, 'replayed', true);
  end if;
  select * into e from public.events where id = _event for update;  -- serializes last-seat contention
  if not found or e.status <> 'published' or not e.sales_open or e.cancelled_at is not null then raise exception 'sales closed' using errcode = 'P0001'; end if;
  if now() >= e.sales_close_at then raise exception 'sales closed' using errcode = 'P0001'; end if;
  select a.id into v_app from public.applications a where a.event_id = _event and a.user_id = u and a.status = 'approved' limit 1;
  if v_app is null then raise exception 'not approved' using errcode = '42501'; end if;
  select * into t from public.event_tiers where id = _tier and event_id = _event and active;
  if not found then raise exception 'tier unavailable' using errcode = 'P0001'; end if;
  -- expire stale holds of this event right here; does not rely on cron
  update public.reservations set status = 'expired', updated_at = now() where event_id = _event and status = 'active' and expires_at <= now();
  update public.orders o2 set status = 'expired', updated_at = now(), version = version + 1
    from public.reservations r2 where r2.id = o2.reservation_id and r2.event_id = _event and r2.status = 'expired' and o2.status = 'awaiting_payment';
  if exists (select 1 from public.participations p where p.event_id = _event and p.user_id = u and p.status = 'active')
     or exists (select 1 from public.reservations x where x.event_id = _event and x.user_id = u and x.status = 'active') then
    raise exception 'already holding' using errcode = 'P0002'; end if;
  if private.seats_taken(_event) >= e.capacity then raise exception 'sold out' using errcode = 'P0003'; end if;
  insert into public.reservations(event_id, tier_id, user_id, application_id, expires_at, idempotency_key)
    values (_event, _tier, u, v_app, now() + make_interval(mins => e.reserve_ttl_minutes), _idem) returning * into r;
  insert into public.orders(reservation_id, user_id, event_id, tier_id, tier_name, amount_minor, currency, environment)
    values (r.id, u, _event, _tier, t.name, t.amount_minor, t.currency, 'sandbox') returning * into o;
  insert into private.audit_log(actor, action, object_type, object_id, result, details)
    values (u, 'order.create', 'order', o.id, 'ok', jsonb_build_object('event', _event, 'amount_minor', o.amount_minor, 'currency', o.currency));
  return jsonb_build_object('order_id', o.id, 'replayed', false);
end $function$
;

CREATE OR REPLACE FUNCTION private.review_membership_request(_request uuid, _decision public.membership_request_status, _actor uuid)
 RETURNS public.membership_request_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status public.membership_request_status;
  v_corr uuid := gen_random_uuid();
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _decision not in ('approved', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.staff_assignments
    where user_id = _actor
      and role = any(array['owner','admin','moderator']::public.staff_role[])
      and revoked_at is null
      and valid_from <= now()
      and (valid_until is null or valid_until > now())
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_status
  from public.membership_requests
  where id = _request
  for update;

  if v_status is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    return v_status;
  end if;

  update public.membership_requests
  set status = _decision,
      reviewed_by = _actor,
      reviewed_at = now(),
      updated_at = now()
  where id = _request and status = 'pending';

  insert into private.audit_log(actor, action, object_type, object_id, result, correlation_id, details)
  values (_actor, 'membership_request.review', 'membership_request', _request, 'ok', v_corr,
    jsonb_build_object('decision', _decision));

  return _decision;
end
$function$
;

CREATE OR REPLACE FUNCTION private.revoke_staff_assignment(_assignment uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_corr uuid := gen_random_uuid(); v_role public.staff_role; v_revoked timestamptz; v_n int;
begin
  if not private.staff_session_ok() or not private.has_role(array['owner','admin']::public.staff_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select role, revoked_at into v_role, v_revoked from public.staff_assignments where id = _assignment for update;
  if not found then
    raise exception 'assignment not found' using errcode = 'P0002';
  end if;
  if v_role = 'owner' then
    raise exception 'owner cannot be revoked here' using errcode = '42501';
  end if;
  if v_revoked is not null then
    insert into private.audit_log (actor, action, object_type, object_id, result, correlation_id)
      values (auth.uid(), 'staff.revoke', 'staff_assignment', _assignment, 'noop', v_corr);
    return 'already_revoked';
  end if;
  update public.staff_assignments set revoked_at = now() where id = _assignment and revoked_at is null;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'revoke not applied' using errcode = 'PT409';
  end if;
  insert into private.audit_log (actor, action, object_type, object_id, result, correlation_id)
    values (auth.uid(), 'staff.revoke', 'staff_assignment', _assignment, 'ok', v_corr);
  return 'revoked';
end $function$
;

CREATE OR REPLACE FUNCTION private.seats_taken(_event uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select (select count(*) from public.participations p where p.event_id=_event and p.status='active')::int
 +(select count(*) from public.reservations r where r.event_id=_event and r.status='active' and r.expires_at>clock_timestamp())::int
 +(select count(*) from private.ticket_passes p where p.event_id=_event and p.source='manual' and p.status in ('active','used'))::int
 +(select count(*) from private.ticket_passes tp
   where tp.event_id=_event and tp.source='participation' and tp.status='used'
   and not exists(select 1 from public.participations p where p.id=tp.participation_id and p.status='active'))::int
$function$
;

CREATE OR REPLACE FUNCTION private.staff_can(_cap text, _event uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.staff_session_ok() and case _cap
    when 'shell' then exists (select 1 from public.staff_assignments s where s.user_id = auth.uid()
      and s.role = any (array['owner','admin','editor','moderator','finance']::public.staff_role[])
      and s.revoked_at is null and s.valid_from <= now() and (s.valid_until is null or s.valid_until > now()))
    when 'membership' then private.has_role(array['owner','admin']::public.staff_role[], null)
    when 'team' then private.has_role(array['owner','admin']::public.staff_role[], null)
    when 'content' then private.has_role(array['owner','admin','editor']::public.staff_role[], null)
    when 'event_moderate' then _event is not null and private.has_role(array['owner','admin','moderator']::public.staff_role[], _event)
    when 'events_manage' then private.has_role(array['owner','admin']::public.staff_role[], null)
    when 'orders_view' then private.has_role(array['owner','admin','finance']::public.staff_role[], null)
      or (_event is not null and private.has_role(array['shift_lead']::public.staff_role[], _event))
    when 'finance_refund' then private.has_role(array['owner','finance']::public.staff_role[], null)
    when 'payment_simulate' then private.has_role(array['owner','admin','finance']::public.staff_role[], null)
    else false end
$function$
;

CREATE OR REPLACE FUNCTION private.staff_session_ok()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and private.is_admitted(auth.uid())
     and exists (select 1 from auth.sessions s
       where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid and s.user_id = auth.uid()
         and (s.not_after is null or s.not_after > now()))
$function$
;

CREATE OR REPLACE FUNCTION private.submit_application(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text, _idempotency uuid)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select (private.submit_application_v2(_event, _display_name, _age_confirmed, _consent_version, _idempotency)->>'id')::uuid
$function$
;

CREATE OR REPLACE FUNCTION private.submit_application_v2(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text, _idempotency uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); r record; v_fp text; v_id uuid; v_email text; v_recent int;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if _idempotency is null or _event is null then raise exception 'invalid request' using errcode = '22023'; end if;
  v_fp := private.submit_fingerprint(_event, _display_name, _age_confirmed, _consent_version);
  select id, event_id, submit_fingerprint, display_name, status into r
    from public.applications where user_id = v_uid and idempotency_key = _idempotency;
  if found then
    if r.event_id <> _event or (r.submit_fingerprint is not null and r.submit_fingerprint <> v_fp) then
      raise exception 'idempotency key reused with different payload' using errcode = 'PT422';
    end if;
    return jsonb_build_object('id', r.id, 'outcome', 'replay', 'display_name', r.display_name, 'status', r.status);
  end if;
  select id, display_name, status into r from public.applications where user_id = v_uid and event_id = _event;
  if found then
    return jsonb_build_object('id', r.id, 'outcome', 'existing', 'display_name', r.display_name, 'status', r.status);
  end if;
  if coalesce(char_length(trim(_display_name)), 0) not between 1 and 80 or _age_confirmed is not true
     or _consent_version is distinct from private.current_consent_version() then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.events e where e.id = _event and e.status = 'published') then
    raise exception 'event unavailable' using errcode = '22023';
  end if;
  select count(*) into v_recent from public.applications where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 10 then raise exception 'rate limited' using errcode = 'P0001'; end if;
  select email into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then raise exception 'contact unconfirmed' using errcode = '42501'; end if;
  insert into public.applications(event_id, user_id, display_name, contact_email, age_confirmed, consent_version, consent_at, consent_method, idempotency_key, submit_fingerprint)
    values (_event, v_uid, trim(_display_name), v_email, true, private.current_consent_version(), now(), 'web_form_checkbox', _idempotency, v_fp)
    on conflict do nothing returning id into v_id;
  if v_id is null then
    select id, event_id, submit_fingerprint, display_name, status into r
      from public.applications where user_id = v_uid and idempotency_key = _idempotency;
    if found then
      if r.submit_fingerprint is distinct from v_fp then
        raise exception 'idempotency key reused with different payload' using errcode = 'PT422'; end if;
      return jsonb_build_object('id', r.id, 'outcome', 'replay', 'display_name', r.display_name, 'status', r.status);
    end if;
    select id, display_name, status into r from public.applications where user_id = v_uid and event_id = _event;
    return jsonb_build_object('id', r.id, 'outcome', 'existing', 'display_name', r.display_name, 'status', r.status);
  end if;
  perform private.log_app(v_id, null, 'submitted', null, 'application.submit');
  return jsonb_build_object('id', v_id, 'outcome', 'created', 'display_name', trim(_display_name), 'status', 'submitted');
end $function$
;

CREATE OR REPLACE FUNCTION private.submit_fingerprint(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select encode(sha256(convert_to(concat_ws(chr(31), 'v1', _event::text, coalesce(trim(_display_name), ''),
    coalesce(_age_confirmed::text, 'null'), coalesce(_consent_version, '')), 'UTF8')), 'hex')
$function$
;

CREATE OR REPLACE FUNCTION private.ticket_admin(_action text, _input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare u uuid:=auth.uid(); p private.ticket_passes; op private.ticket_operations; eid uuid; result jsonb; reason text; t timestamptz;
begin
 if u is null or (not private.staff_can('events_manage') or not private.ticket_live_role(null,false)) then raise exception 'forbidden' using errcode='42501'; end if;
 if _action='catalog' then
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'startsAt',e.starts_at,'timezone',e.timezone,
   'capacity',e.capacity,'taken',private.seats_taken(e.id),'synthetic',e.is_synthetic,'entryOpensAt',e.entry_opens_at,
   'entryClosesAt',e.entry_closes_at,'qrReleaseAt',e.qr_release_at) order by e.starts_at), '[]'::jsonb) into result
  from public.events e where e.status='published' and e.cancelled_at is null and (e.entry_closes_at is null or e.entry_closes_at>clock_timestamp());
  return jsonb_build_object('events',result);
 elsif _action='list' then
  eid:=nullif(_input->>'eventId','')::uuid;
  select coalesce(jsonb_agg(private.ticket_dto(s.id) order by s.issued_at desc),'[]'::jsonb) into result
  from (select id,issued_at from private.ticket_passes where (eid is null or event_id=eid)
   and (coalesce(_input->>'query','')='' or guest_name ilike '%'||left(_input->>'query',80)||'%')
   order by issued_at desc,id limit 50 offset greatest(0,least(coalesce((_input->>'page')::int,0),10000))*50) s;
  return jsonb_build_object('items',result);
 end if;
 select * into p from private.ticket_passes where id=(_input->>'id')::uuid;
 if not found then raise exception 'pass_not_found'; end if;
 if _action='get' then return jsonb_build_object('pass',private.ticket_dto(p.id)); end if;
 if _action='history' then
  select coalesce(jsonb_agg(to_jsonb(s) order by s.id desc),'[]'::jsonb) into result
  from(select id,actor,action,outcome,detail,occurred_at from private.ticket_events where pass_id=p.id order by id desc limit 100)s;
  return jsonb_build_object('items',result);
 end if;
 if _action<>'revoke' then raise exception 'invalid_action'; end if;
 reason:=btrim(_input->>'reason');
 if reason is null or char_length(reason) not between 3 and 300 or nullif(_input->>'operationId','') is null then raise exception 'invalid_input'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||(_input->>'operationId'),0));
 select * into op from private.ticket_operations where actor=u and operation_id=(_input->>'operationId')::uuid;
 if found then
  if op.kind<>'revoke' or op.request_body<>_input then raise exception 'idempotency_conflict'; end if;
  return jsonb_build_object('pass',private.ticket_dto(op.pass_id),'duplicate',true);
 end if;
 perform 1 from public.events where id=p.event_id for update;
 select * into p from private.ticket_passes where id=p.id for update;
 if (not private.staff_can('events_manage') or not private.ticket_live_role(null,false)) then raise exception 'forbidden' using errcode='42501'; end if;
 if p.status='used' then raise exception 'already_used'; end if;
 if p.version<>coalesce((_input->>'expectedVersion')::int,0) then raise exception 'version_conflict'; end if;
 if p.status<>'revoked' then
  t:=clock_timestamp();update private.ticket_passes set status='revoked',revoked_at=t,version=version+1 where id=p.id;
  insert into private.ticket_events(pass_id,event_id,actor,action,outcome,detail) values(p.id,p.event_id,u,'revoke','revoked',reason);
  insert into private.audit_log(actor,action,object_type,object_id,result,details) values(u,'ticket.revoke','ticket',p.id,'ok',jsonb_build_object('event',p.event_id,'reason',reason));
 end if;
 insert into private.ticket_operations(actor,operation_id,kind,request_body,pass_id) values(u,(_input->>'operationId')::uuid,'revoke',_input,p.id);
 return jsonb_build_object('pass',private.ticket_dto(p.id),'duplicate',false);
end $function$
;

CREATE OR REPLACE FUNCTION private.ticket_dto(_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare p private.ticket_passes; e public.events; v_status text; t timestamptz:=clock_timestamp(); eligible boolean;
begin
 select * into p from private.ticket_passes where id=_id;
 if not found then return null; end if;
 select * into e from public.events where id=p.event_id;
 v_status:=p.status;
 if v_status='active' and (e.status<>'published' or e.cancelled_at is not null or
   (p.participation_id is not null and not exists(
    select 1 from public.participations a join public.orders o on o.id=a.order_id
    where a.id=p.participation_id and a.status='active' and o.status='paid'
    and a.event_id=p.event_id and o.event_id=p.event_id and a.user_id=p.user_id and o.user_id=p.user_id
    and o.environment=p.environment))) then v_status:='revoked'; end if;
 if v_status='active' and (t>=p.valid_until or (e.entry_closes_at is not null and t>=e.entry_closes_at)) then v_status:='expired'; end if;
 eligible:=v_status='active' and e.qr_release_at is not null and t>=e.qr_release_at;
 return jsonb_build_object('id',p.id,'ticketCode','VNE-'||upper(p.id::text),'userId',coalesce(p.user_id::text,''),
  'name',p.guest_name,'telegram',null,'access',p.access,'theme','ember','sequenceNumber',p.sequence_number,
  'sequenceLabel',lpad(p.sequence_number::text,greatest(2,length(p.sequence_number::text)),'0')||'/'||(p.event_snapshot->>'totalTickets'),
  'event',p.event_snapshot,'status',v_status,'source',p.source,'demo',p.environment='sandbox',
  'environment',p.environment,'validUntil',p.valid_until,'qrReleaseAt',e.qr_release_at,
  'qrEligible',eligible,'generation',p.generation,'tokenKeyVersion',p.token_key_version,'version',p.version,'design',p.design);
end $function$
;

CREATE OR REPLACE FUNCTION private.ticket_issue(_input jsonb, _id uuid, _view_hash text, _scan_hash text, _key_version text, _operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare u uuid:=auth.uid(); e public.events; a public.participations; o public.orders; p private.ticket_passes;
 op private.ticket_operations; eid uuid; aid uuid; uname text; src text; envname text; expiry timestamptz; num integer; t timestamptz;
begin
 if u is null or (not private.staff_can('events_manage') or not private.ticket_live_role(null,false)) then raise exception 'forbidden' using errcode='42501'; end if;
 if _operation is null or _id is null or _input is null or jsonb_typeof(_input)<>'object'
 or _view_hash is null or _view_hash !~ '^[a-f0-9]{64}$' or _scan_hash is null or _scan_hash !~ '^[a-f0-9]{64}$'
 or _key_version is null or _key_version !~ '^[A-Za-z0-9_-]{1,24}$' then raise exception 'invalid_input'; end if;
 if coalesce(_input->>'access','') not in ('GENERAL','VIP','SECURITY','ARTIST')
 or char_length(coalesce(_input->>'reason','')) not between 3 and 300 then raise exception 'invalid_input'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||_operation::text,0));
 select * into op from private.ticket_operations where actor=u and operation_id=_operation;
 if found then
  if op.kind<>'issue' or op.request_body<>_input then raise exception 'idempotency_conflict'; end if;
  return jsonb_build_object('pass',private.ticket_dto(op.pass_id),'duplicate',true);
 end if;
 eid:=(_input->>'eventId')::uuid; aid:=nullif(_input->>'participationId','')::uuid;
 select * into e from public.events where id=eid for update;
 if not found then raise exception 'event_not_found'; end if;
 if aid is not null then
  select * into a from public.participations where id=aid;
  select * into o from public.orders where id=a.order_id for update;
  select * into a from public.participations where id=aid for update;
  if a.id is null or o.id is null or a.event_id<>eid or o.event_id<>eid or a.user_id<>o.user_id
   or a.status<>'active' or o.status<>'paid' then raise exception 'participation_inactive'; end if;
  src:='participation'; envname:=o.environment;
  select coalesce(nullif(btrim(display_name),''),'Участник') into uname from public.profiles where id=a.user_id;
  uname:=coalesce(uname,'Участник');
  if exists(select 1 from private.ticket_passes where participation_id=aid) then raise exception 'ticket_exists'; end if;
 else
  src:='manual'; envname:=case when e.is_synthetic then 'sandbox' else 'live' end;
  uname:=btrim(_input->>'name');
  if uname is null or char_length(uname) not between 1 and 80 then raise exception 'invalid_name'; end if;
  if e.capacity is null or private.seats_taken(eid)>=e.capacity then raise exception 'event_capacity_reached'; end if;
 end if;
 -- Recheck after waiting on locks. Never turn a stale staff session into a pass.
 if (not private.staff_can('events_manage') or not private.ticket_live_role(null,false)) then raise exception 'forbidden' using errcode='42501'; end if;
 t:=clock_timestamp();
 if e.status<>'published' or e.cancelled_at is not null then raise exception 'event_unavailable'; end if;
 if e.entry_opens_at is null or e.entry_closes_at is null or e.qr_release_at is null or e.capacity is null
 or e.entry_closes_at<=t or e.entry_closes_at<=e.entry_opens_at or e.qr_release_at>e.entry_opens_at then raise exception 'event_window_required'; end if;
 expiry:=coalesce(nullif(_input->>'validUntil','')::timestamptz,e.entry_closes_at);
 if expiry<=t or expiry>e.entry_closes_at or expiry<=e.entry_opens_at then raise exception 'invalid_valid_until'; end if;
 if _input->'design' is not null and _input->'design'<>'null'::jsonb then
  if jsonb_typeof(_input->'design')<>'object' or pg_catalog.octet_length((_input->'design')::text)>4000 then raise exception 'invalid_design'; end if;
 end if;
 select coalesce(max(sequence_number),0)+1 into num from private.ticket_passes where event_id=eid;
 insert into private.ticket_passes(id,event_id,participation_id,user_id,guest_name,source,environment,access,reason,sequence_number,
 token_key_version,view_token_hash,scan_token_hash,valid_until,event_snapshot,design,issued_by)
 values(_id,eid,aid,case when aid is null then null else a.user_id end,uname,src,envname,_input->>'access',_input->>'reason',num,
 _key_version,_view_hash,_scan_hash,expiry,jsonb_build_object('id',e.id,'title',e.title,
 'date',to_char(e.starts_at at time zone e.timezone,'YYYY-MM-DD'),'when',e.starts_at,'timezone',e.timezone,'totalTickets',e.capacity),
 nullif(_input->'design','null'::jsonb),u) returning * into p;
 insert into private.ticket_operations(actor,operation_id,kind,request_body,pass_id) values(u,_operation,'issue',_input,p.id);
 insert into private.ticket_events(pass_id,event_id,actor,action,outcome,detail) values(p.id,eid,u,'issue','issued',p.reason);
 insert into private.audit_log(actor,action,object_type,object_id,result,details) values(u,'ticket.issue','ticket',p.id,'ok',jsonb_build_object('event',eid,'source',src,'environment',envname));
 return jsonb_build_object('pass',private.ticket_dto(p.id),'duplicate',false);
end $function$
;

CREATE OR REPLACE FUNCTION private.ticket_live_role(_event uuid, _scan boolean)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.staff_session_ok()
 and exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=auth.uid() and (s.not_after is null or s.not_after>clock_timestamp()))
 and exists(select 1 from public.staff_assignments a where a.user_id=auth.uid() and a.revoked_at is null
 and a.valid_from<=clock_timestamp() and (a.valid_until is null or a.valid_until>clock_timestamp())
 and (a.event_id is null or a.event_id=_event)
 and (a.role in ('owner','admin') or (_scan and a.role in ('scanner','shift_lead'))))
$function$
;

CREATE OR REPLACE FUNCTION private.ticket_read(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare id uuid;
begin
 if _token is null or _token !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
 select p.id into id from private.ticket_passes p where p.view_token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex');
 return private.ticket_dto(id);
end $function$
;

CREATE OR REPLACE FUNCTION private.ticket_scan(_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare u uuid:=auth.uid(); eid uuid:=(_input->>'eventId')::uuid; p private.ticket_passes; e public.events;
 a public.participations; o public.orders; op private.ticket_operations; token text; outcome text; t timestamptz; consume boolean;
begin
 if not private.ticket_scan_allowed(eid) then raise exception 'forbidden' using errcode='42501'; end if;
 consume:=coalesce((_input->>'consume')::boolean,false);token:=_input->>'token';
 if token is null or token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'invalid_token'; end if;
 if consume then
  if nullif(_input->>'operationId','') is null then raise exception 'invalid_input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||(_input->>'operationId'),0));
  select * into op from private.ticket_operations where actor=u and operation_id=(_input->>'operationId')::uuid;
  if found then
   -- Stored command never contains a raw token.
   if op.kind<>'checkin' or op.request_body<>jsonb_build_object('eventId',eid,'scanHash',encode(sha256(convert_to(token,'UTF8')),'hex'),'expectedVersion',_input->'expectedVersion') then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('outcome','accepted','replayed',true,'pass',private.ticket_dto(op.pass_id));
  end if;
 end if;
 select * into e from public.events where id=eid for update;
 select * into p from private.ticket_passes where event_id=eid and scan_token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
 if p.id is null then return jsonb_build_object('outcome','not_found'); end if;
 if p.participation_id is not null then
  select * into a from public.participations where id=p.participation_id;
  select * into o from public.orders where id=a.order_id for update;
  select * into a from public.participations where id=p.participation_id for update;
 end if;
 select * into p from private.ticket_passes where id=p.id for update;
 t:=clock_timestamp();
 if not private.ticket_scan_allowed(eid) then raise exception 'forbidden' using errcode='42501'; end if;
 outcome:=case
  when p.environment<>'live' or e.is_synthetic then 'sandbox'
  when e.status<>'published' or e.cancelled_at is not null then 'event_unavailable'
  when p.status='revoked' then 'revoked'
  when p.status='used' then 'used'
  when p.participation_id is not null and (a.id is null or o.id is null or a.status<>'active' or o.status<>'paid'
   or a.event_id<>eid or o.event_id<>eid or a.user_id<>p.user_id or o.user_id<>p.user_id or o.environment<>p.environment) then 'revoked'
  when t>=p.valid_until then 'expired'
  when e.entry_opens_at is null or e.entry_closes_at is null or e.qr_release_at is null then 'window_required'
  when t<e.entry_opens_at or t<e.qr_release_at then 'too_early'
  when t>=e.entry_closes_at then 'expired'
  when consume and p.version<>coalesce((_input->>'expectedVersion')::int,0) then 'version_conflict'
  else 'ready' end;
 if consume and outcome='ready' then
  update private.ticket_passes set status='used',used_at=t,version=version+1 where id=p.id and status='active';
  insert into private.ticket_checkins(pass_id,event_id,actor,operation_id,checked_at) values(p.id,eid,u,(_input->>'operationId')::uuid,t);
  insert into private.ticket_operations(actor,operation_id,kind,request_body,pass_id)
   values(u,(_input->>'operationId')::uuid,'checkin',jsonb_build_object('eventId',eid,'scanHash',p.scan_token_hash,'expectedVersion',_input->'expectedVersion'),p.id);
  insert into private.audit_log(actor,action,object_type,object_id,result,details) values(u,'ticket.checkin','ticket',p.id,'ok',jsonb_build_object('event',eid));
  outcome:='accepted';
 end if;
 insert into private.ticket_events(pass_id,event_id,actor,action,outcome) values(p.id,eid,u,case when consume then 'checkin' else 'verify' end,outcome);
 return jsonb_build_object('outcome',outcome,'replayed',false,'pass',private.ticket_dto(p.id));
end $function$
;

CREATE OR REPLACE FUNCTION private.ticket_scan_allowed(_event uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and private.staff_session_ok()
 and private.ticket_live_role(_event,true)
$function$
;

CREATE OR REPLACE FUNCTION private.ticket_scan_catalog()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare result jsonb;
begin
 if not private.staff_session_ok() then raise exception 'forbidden' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'startsAt',e.starts_at,'timezone',e.timezone,
 'synthetic',e.is_synthetic,'entryOpensAt',e.entry_opens_at,'entryClosesAt',e.entry_closes_at,'qrReleaseAt',e.qr_release_at) order by e.starts_at),'[]'::jsonb) into result
 from public.events e where private.ticket_scan_allowed(e.id) and e.status='published' and e.cancelled_at is null and (e.entry_closes_at is null or e.entry_closes_at>clock_timestamp());
 return jsonb_build_object('events',result);
end $function$
;

CREATE TRIGGER applications_fingerprint_immutable BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION private.applications_fingerprint_immutable();

CREATE TRIGGER events_validate BEFORE INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION private.events_validate();

revoke all on table "private"."audit_log" from PUBLIC,anon,authenticated,service_role;

revoke all on table "private"."member_admission" from PUBLIC,anon,authenticated,service_role;

revoke all on table "private"."membership_request_limits" from PUBLIC,anon,authenticated,service_role;

revoke all on table "private"."outbox" from PUBLIC,anon,authenticated,service_role;

revoke all on table "private"."ticket_checkins" from PUBLIC,anon,authenticated,service_role;

revoke all on table "private"."ticket_events" from PUBLIC,anon,authenticated,service_role;

revoke all on table "private"."ticket_operations" from PUBLIC,anon,authenticated,service_role;

revoke all on table "private"."ticket_passes" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."application_events" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."applications" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."event_tiers" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."events" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."invites" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."membership_requests" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."orders" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."participations" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."payment_events" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."payments" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."profiles" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."refunds" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."reservations" from PUBLIC,anon,authenticated,service_role;

revoke all on table "public"."staff_assignments" from PUBLIC,anon,authenticated,service_role;

revoke all on all sequences in schema private from PUBLIC,anon,authenticated,service_role;

revoke all on sequence "public"."application_events_id_seq" from PUBLIC,anon,authenticated,service_role;

revoke all on sequence "public"."payment_events_id_seq" from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."admin_event_transition"(_id uuid, _action text, _expected_version integer) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."admin_save_event"(_id uuid, _expected_version integer, _data jsonb) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."admin_save_tier"(_event uuid, _tier uuid, _name text, _amount bigint, _currency text, _active boolean) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."applications_fingerprint_immutable"() from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."apply_payment_event"(_provider text, _env text, _event_id text, _payment_id text, _order uuid, _kind text, _amount bigint, _currency text, _occurred_at timestamp with time zone) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."cancel_my_order"(_order uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."current_consent_version"() from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."events_validate"() from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."expire_reservations"() from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."grant_staff_assignment"(_email text, _role public.staff_role, _event uuid, _valid_until timestamp with time zone) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."guest_application_action"(_app uuid, _action text, _expected_version integer, _reply text) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."guest_update_display_name"(_app uuid, _name text, _expected_version integer) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."has_role"(_roles public.staff_role[], _event uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."invite_code"() from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."is_admitted"(_uid uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."log_app"(_app uuid, _from public.application_status, _to public.application_status, _msg text, _action text) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."log_app2"(_app uuid, _from public.application_status, _to public.application_status, _msg text, _guest text, _action text) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."membership_decide"(_request uuid, _decision public.membership_request_status) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."moderate_application"(_app uuid, _action text, _expected_version integer, _public_message text) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."my_staff_access"(_area text) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."order_history"(_order uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."refund_sandbox"(_order uuid, _amount bigint, _idem uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."require_admitted"() from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."reserve_seat"(_event uuid, _tier uuid, _idem uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."review_membership_request"(_request uuid, _decision public.membership_request_status, _actor uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."revoke_staff_assignment"(_assignment uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."seats_taken"(_event uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."staff_can"(_cap text, _event uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."staff_session_ok"() from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."submit_application"(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text, _idempotency uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."submit_application_v2"(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text, _idempotency uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."submit_fingerprint"(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."ticket_admin"(_action text, _input jsonb) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."ticket_dto"(_id uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."ticket_issue"(_input jsonb, _id uuid, _view_hash text, _scan_hash text, _key_version text, _operation uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."ticket_live_role"(_event uuid, _scan boolean) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."ticket_read"(_token text) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."ticket_scan"(_input jsonb) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."ticket_scan_allowed"(_event uuid) from PUBLIC,anon,authenticated,service_role;

revoke all on function "private"."ticket_scan_catalog"() from PUBLIC,anon,authenticated,service_role;

set local check_function_bodies=on;
do $validate$ declare r record; begin
 for r in select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' order by p.proname,p.oid loop execute r.def; end loop;
end $validate$;

