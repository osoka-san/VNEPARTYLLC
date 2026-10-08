create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
-- Минимальная эмуляция ролей и auth-схемы Supabase для проверки RLS на чистом PostgreSQL.
-- Это НЕ Supabase: GoTrue, PostgREST, MFA-факторы и Storage не эмулируются.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_user::text) $$;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
create table auth.sessions (id uuid primary key, user_id uuid not null, not_after timestamptz);

-- Худший случай Supabase legacy: default privileges выдают всё API-ролям на новые таблицы/последовательности/функции.
-- Миграции обязаны сами сузить права (REVOKE ALL → allowlist); тест проверяет effective privileges.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- Минимальная заглушка storage для локального прогона (в облаке схема управляется платформой).
create schema if not exists storage;
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
