-- Minimal stand-in for the Supabase pieces that setup.sql depends on. Used only to run the tests on a plain
-- Postgres (local Docker or CI). Never run this on a real Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create schema extensions;
create extension pgcrypto schema extensions;

create table auth.users (
    instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
    email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz,
    confirmation_token text, email_change text, email_change_token_new text, recovery_token text
);

create table auth.identities (
    id uuid primary key, user_id uuid references auth.users (id) on delete cascade, provider_id text,
    identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);

-- Same definition Supabase uses: the user id comes from the JWT claims of the request.
create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
