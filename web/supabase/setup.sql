-- Billing Platform (web): database setup for Supabase.
-- Paste this whole file in the Supabase SQL Editor and click Run. It is safe to run only once on an empty project.
--
-- Design:
--   * Multi-tenant: every row belongs to an organization (a company). Users only see their own organization (RLS).
--   * Nobody writes to the tables directly: the site calls functions (RPC) that enforce the business rules.
--   * Every state change also writes an event (invoice_events); a trigger turns events into simulated e-mails
--     (notifications). Same idea as the Kafka version of the project, inside Postgres.
--   * A demo organization with a shared test user is reset every night by pg_cron.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------------

create table public.organizations (
    id          uuid primary key default gen_random_uuid(),
    name        text not null check (char_length(name) between 1 and 120),
    is_demo     boolean not null default false,
    created_at  timestamptz not null default now()
);

create table public.memberships (
    user_id  uuid not null references auth.users (id) on delete cascade,
    org_id   uuid not null references public.organizations (id) on delete cascade,
    role     text not null default 'owner' check (role in ('owner', 'member')),
    primary key (user_id, org_id)
);
create unique index memberships_one_org_per_user on public.memberships (user_id); -- MVP: one company per user
create index memberships_org_idx on public.memberships (org_id);

create table public.customers (
    id          uuid primary key default gen_random_uuid(),
    org_id      uuid not null references public.organizations (id) on delete cascade,
    name        text not null check (char_length(name) between 1 and 120),
    document    text not null check (document ~ '^[0-9]{11}$' or document ~ '^[0-9]{14}$'),
    email       text not null check (char_length(email) <= 160 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    phone       text check (phone ~ '^55[0-9]{10,11}$'), -- Brazilian number with country code, digits only (optional)
    created_at  timestamptz not null default now(),
    unique (org_id, document)
);

create table public.invoices (
    id            uuid primary key default gen_random_uuid(),
    org_id        uuid not null references public.organizations (id) on delete cascade,
    customer_id   uuid not null references public.customers (id) on delete cascade,
    description   text not null check (char_length(description) between 1 and 200),
    amount_cents  bigint not null check (amount_cents > 0 and amount_cents <= 100000000000), -- money is always cents
    due_date      date not null,
    status        text not null default 'OPEN' check (status in ('OPEN', 'PAID', 'OVERDUE', 'CANCELED')),
    paid_at       timestamptz,
    created_at    timestamptz not null default now()
);
create index invoices_org_status_idx on public.invoices (org_id, status);
create index invoices_org_due_idx on public.invoices (org_id, due_date);
create index invoices_customer_idx on public.invoices (customer_id);

create table public.invoice_events (
    id           uuid primary key default gen_random_uuid(),
    org_id       uuid not null references public.organizations (id) on delete cascade,
    invoice_id   uuid not null references public.invoices (id) on delete cascade,
    type         text not null check (type in ('invoice.created', 'invoice.paid', 'invoice.overdue', 'invoice.canceled')),
    payload      jsonb not null,
    occurred_at  timestamptz not null default now()
);
create index invoice_events_org_idx on public.invoice_events (org_id, occurred_at desc);
create index invoice_events_invoice_idx on public.invoice_events (invoice_id);

create table public.notifications (
    id           uuid primary key default gen_random_uuid(),
    org_id       uuid not null references public.organizations (id) on delete cascade,
    event_id     uuid not null unique references public.invoice_events (id) on delete cascade, -- idempotent: one e-mail per event
    customer_id  uuid references public.customers (id) on delete cascade,
    to_email     text not null,
    subject      text not null,
    body         text not null,
    created_at   timestamptz not null default now()
);
create index notifications_org_idx on public.notifications (org_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------------

create function public.current_org() returns uuid
language sql stable security definer set search_path = public as $$
    select org_id from public.memberships where user_id = auth.uid() limit 1
$$;

create function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.memberships where user_id = auth.uid() and org_id = p_org)
$$;

-- "Today" is always the Sao Paulo calendar day (due dates are plain dates).
create function public.today_sp() returns date
language sql stable as $$
    select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- CPF (11 digits) and CNPJ (14 digits) check digits.
create function public.is_valid_document(p text) returns boolean
language plpgsql immutable as $$
declare
    d  int[];
    s  int;
    r  int;
    i  int;
    w1 int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    w2 int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
begin
    if p is null or p !~ '^[0-9]+$' or length(p) not in (11, 14) or p ~ '^(.)\1+$' then
        return false;
    end if;
    d := array(select substr(p, n, 1)::int from generate_series(1, length(p)) n order by n);

    if length(p) = 11 then
        s := 0;
        for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
        r := (s * 10) % 11; if r = 10 then r := 0; end if;
        if r <> d[10] then return false; end if;
        s := 0;
        for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
        r := (s * 10) % 11; if r = 10 then r := 0; end if;
        return r = d[11];
    end if;

    s := 0;
    for i in 1..12 loop s := s + d[i] * w1[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    if r <> d[13] then return false; end if;
    s := 0;
    for i in 1..13 loop s := s + d[i] * w2[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    return r = d[14];
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Events and simulated e-mails
-- ---------------------------------------------------------------------------------------------------------------

create function public._emit_event(p_invoice public.invoices, p_type text) returns void
language plpgsql security definer set search_path = public as $$
declare
    v_email text;
begin
    select email into v_email from public.customers where id = p_invoice.customer_id;
    insert into public.invoice_events (org_id, invoice_id, type, payload)
    values (p_invoice.org_id, p_invoice.id, p_type, jsonb_build_object(
        'customerId', p_invoice.customer_id,
        'customerEmail', v_email,
        'amountCents', p_invoice.amount_cents,
        'dueDate', p_invoice.due_date));
end $$;

-- The "notification service": reacts to events and writes the e-mail that would be sent.
create function public._notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_amount  text;
    v_due     text;
    v_subject text;
    v_body    text;
begin
    if new.type = 'invoice.canceled' then
        return new; -- canceling does not notify the customer
    end if;

    v_amount := 'R$ ' || replace(replace(replace(
        to_char((new.payload ->> 'amountCents')::numeric / 100, 'FM999,999,999,990.00'), ',', '#'), '.', ','), '#', '.');
    v_due := to_char((new.payload ->> 'dueDate')::date, 'DD/MM/YYYY');

    if new.type = 'invoice.created' then
        v_subject := 'Nova cobrança de ' || v_amount;
        v_body := 'Olá! Foi emitida uma cobrança de ' || v_amount || ' com vencimento em ' || v_due || '.';
    elsif new.type = 'invoice.paid' then
        v_subject := 'Pagamento confirmado: ' || v_amount;
        v_body := 'Olá! Recebemos o pagamento de ' || v_amount || ' (vencimento ' || v_due || '). Obrigado!';
    else
        v_subject := 'Cobrança vencida: ' || v_amount;
        v_body := 'Olá! A cobrança de ' || v_amount || ' venceu em ' || v_due || ' e ainda está em aberto.';
    end if;

    insert into public.notifications (org_id, event_id, customer_id, to_email, subject, body)
    values (new.org_id, new.id, (new.payload ->> 'customerId')::uuid, new.payload ->> 'customerEmail', v_subject, v_body)
    on conflict (event_id) do nothing;
    return new;
end $$;

create trigger invoice_events_notify after insert on public.invoice_events
    for each row execute function public._notify();

-- ---------------------------------------------------------------------------------------------------------------
-- Demo limits (the shared test user cannot fill the database)
-- ---------------------------------------------------------------------------------------------------------------

create function public._enforce_demo_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_demo  boolean;
    v_count int;
    v_max   int := case tg_table_name when 'customers' then 30 else 120 end;
begin
    select is_demo into v_demo from public.organizations where id = new.org_id;
    if v_demo then
        execute format('select count(*) from public.%I where org_id = $1', tg_table_name) into v_count using new.org_id;
        if v_count >= v_max then
            raise exception 'Limite da demonstração atingido (% registros). Os dados são restaurados toda madrugada.', v_max
                using errcode = '53400';
        end if;
    end if;
    return new;
end $$;

create trigger customers_demo_limit before insert on public.customers
    for each row execute function public._enforce_demo_limits();
create trigger invoices_demo_limit before insert on public.invoices
    for each row execute function public._enforce_demo_limits();

-- ---------------------------------------------------------------------------------------------------------------
-- Business functions (the only way to write data)
-- ---------------------------------------------------------------------------------------------------------------

create function public.create_customer(p_name text, p_document text, p_email text, p_phone text default null)
returns public.customers
language plpgsql security definer set search_path = public as $$
declare
    v_org   uuid := public.current_org();
    v_doc   text := regexp_replace(coalesce(p_document, ''), '\D', '', 'g');
    v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
    v_row   public.customers;
begin
    if v_org is null then raise exception 'Usuário sem empresa' using errcode = '42501'; end if;
    if coalesce(trim(p_name), '') = '' then raise exception 'Informe o nome do cliente' using errcode = '22023'; end if;
    if not public.is_valid_document(v_doc) then raise exception 'CPF/CNPJ inválido' using errcode = '22023'; end if;
    if coalesce(trim(p_email), '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'E-mail inválido' using errcode = '22023';
    end if;
    if v_phone is not null then
        if length(v_phone) in (10, 11) then v_phone := '55' || v_phone; end if; -- DDD + number: add the country code
        -- 55 + DDD (2 digits, no zeros) + 9 digits starting with 9 (mobile) or 8 digits starting with 2-5 (landline)
        if v_phone !~ '^55[1-9][1-9](9[0-9]{8}|[2-5][0-9]{7})$' then
            raise exception 'Telefone inválido. Use o DDD e o número, por exemplo (11) 91234-5678' using errcode = '22023';
        end if;
    end if;

    begin
        insert into public.customers (org_id, name, document, email, phone)
        values (v_org, left(trim(p_name), 120), v_doc, left(trim(p_email), 160), v_phone)
        returning * into v_row;
    exception when unique_violation then
        raise exception 'Já existe um cliente com esse CPF/CNPJ' using errcode = '23505';
    end;
    return v_row;
end $$;

create function public.create_invoice(p_customer_id uuid, p_description text, p_amount_cents bigint, p_due_date date)
returns public.invoices
language plpgsql security definer set search_path = public as $$
declare
    v_org uuid := public.current_org();
    v_row public.invoices;
begin
    if v_org is null then raise exception 'Usuário sem empresa' using errcode = '42501'; end if;
    if p_amount_cents is null or p_amount_cents <= 0 then
        raise exception 'O valor precisa ser maior que zero' using errcode = '22023';
    end if;
    if coalesce(trim(p_description), '') = '' then raise exception 'Informe a descrição' using errcode = '22023'; end if;
    if p_due_date is null or p_due_date < public.today_sp() then
        raise exception 'O vencimento não pode estar no passado' using errcode = '22023';
    end if;
    if not exists (select 1 from public.customers where id = p_customer_id and org_id = v_org) then
        raise exception 'Cliente não encontrado' using errcode = 'P0002';
    end if;

    insert into public.invoices (org_id, customer_id, description, amount_cents, due_date)
    values (v_org, p_customer_id, left(trim(p_description), 200), p_amount_cents, p_due_date)
    returning * into v_row;
    perform public._emit_event(v_row, 'invoice.created');
    return v_row;
end $$;

-- OPEN or OVERDUE -> PAID. The UPDATE is atomic, so two simultaneous clicks cannot both pay.
create function public.pay_invoice(p_id uuid) returns public.invoices
language plpgsql security definer set search_path = public as $$
declare
    v_org    uuid := public.current_org();
    v_row    public.invoices;
    v_status text;
begin
    if v_org is null then raise exception 'Usuário sem empresa' using errcode = '42501'; end if;
    update public.invoices set status = 'PAID', paid_at = now()
    where id = p_id and org_id = v_org and status in ('OPEN', 'OVERDUE')
    returning * into v_row;

    if not found then
        select status into v_status from public.invoices where id = p_id and org_id = v_org;
        if v_status is null then raise exception 'Cobrança não encontrada' using errcode = 'P0002'; end if;
        raise exception 'Não é possível pagar uma cobrança %',
            case v_status when 'PAID' then 'já paga' else 'cancelada' end using errcode = 'P0001';
    end if;
    perform public._emit_event(v_row, 'invoice.paid');
    return v_row;
end $$;

-- OPEN or OVERDUE -> CANCELED.
create function public.cancel_invoice(p_id uuid) returns public.invoices
language plpgsql security definer set search_path = public as $$
declare
    v_org    uuid := public.current_org();
    v_row    public.invoices;
    v_status text;
begin
    if v_org is null then raise exception 'Usuário sem empresa' using errcode = '42501'; end if;
    update public.invoices set status = 'CANCELED'
    where id = p_id and org_id = v_org and status in ('OPEN', 'OVERDUE')
    returning * into v_row;

    if not found then
        select status into v_status from public.invoices where id = p_id and org_id = v_org;
        if v_status is null then raise exception 'Cobrança não encontrada' using errcode = 'P0002'; end if;
        raise exception 'Não é possível cancelar uma cobrança %',
            case v_status when 'PAID' then 'já paga' else 'já cancelada' end using errcode = 'P0001';
    end if;
    perform public._emit_event(v_row, 'invoice.canceled');
    return v_row;
end $$;

-- OPEN invoices whose due date passed become OVERDUE. p_org = null means every organization (used by the nightly job).
-- Running it twice emits nothing the second time: only OPEN invoices are touched.
create function public._mark_overdue(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
    v_row     public.invoices;
    v_updated public.invoices;
    v_count   integer := 0;
begin
    for v_row in
        select * from public.invoices
        where status = 'OPEN' and due_date < public.today_sp() and (p_org is null or org_id = p_org)
        for update skip locked
    loop
        update public.invoices set status = 'OVERDUE' where id = v_row.id returning * into v_updated;
        perform public._emit_event(v_updated, 'invoice.overdue');
        v_count := v_count + 1;
    end loop;
    return v_count;
end $$;

-- Called by the site when it opens, so the screen is right even before the nightly job runs.
create function public.refresh_overdue() returns integer
language plpgsql security definer set search_path = public as $$
declare
    v_org uuid := public.current_org();
begin
    if v_org is null then return 0; end if; -- never pass null: that would touch every organization
    return public._mark_overdue(v_org);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Reports (same shape as the report-service of the microservices version)
-- ---------------------------------------------------------------------------------------------------------------

create function public.report_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    v_org     uuid := public.current_org();
    v_start   date := date_trunc('month', public.today_sp())::date;
    v_end     date := (date_trunc('month', public.today_sp()) + interval '1 month')::date;
    v_issued_all bigint; v_received_all bigint; v_open bigint; v_overdue bigint; v_canceled bigint;
    v_issued_m bigint; v_received_m bigint; v_base bigint;
begin
    if v_org is null then raise exception 'Usuário sem empresa' using errcode = '42501'; end if;

    select coalesce(sum(amount_cents), 0),
           coalesce(sum(amount_cents) filter (where status = 'PAID'), 0),
           coalesce(sum(amount_cents) filter (where status = 'OPEN'), 0),
           coalesce(sum(amount_cents) filter (where status = 'OVERDUE'), 0),
           coalesce(sum(amount_cents) filter (where status = 'CANCELED'), 0),
           coalesce(sum(amount_cents) filter (where (created_at at time zone 'America/Sao_Paulo')::date >= v_start
                                                and (created_at at time zone 'America/Sao_Paulo')::date < v_end), 0),
           coalesce(sum(amount_cents) filter (where status = 'PAID'
                                                and (paid_at at time zone 'America/Sao_Paulo')::date >= v_start
                                                and (paid_at at time zone 'America/Sao_Paulo')::date < v_end), 0)
    into v_issued_all, v_received_all, v_open, v_overdue, v_canceled, v_issued_m, v_received_m
    from public.invoices where org_id = v_org;

    v_base := v_open + v_overdue + v_received_all;
    return jsonb_build_object(
        'month', to_char(v_start, 'YYYY-MM'),
        'issuedCents', v_issued_m,
        'receivedCents', v_received_m,
        'openCents', v_open,
        'overdueCents', v_overdue,
        'delinquencyRate', case when v_base = 0 then 0 else round(v_overdue * 100.0 / v_base, 2) end,
        'allTime', jsonb_build_object('issuedCents', v_issued_all, 'receivedCents', v_received_all,
                                      'openCents', v_open, 'overdueCents', v_overdue, 'canceledCents', v_canceled));
end $$;

create function public.report_monthly(p_year integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    v_org uuid := public.current_org();
begin
    if v_org is null then raise exception 'Usuário sem empresa' using errcode = '42501'; end if;
    return (
        select jsonb_agg(jsonb_build_object('month', p_year || '-' || lpad(m::text, 2, '0'),
                                            'issuedCents', coalesce(i.issued, 0),
                                            'receivedCents', coalesce(r.received, 0)) order by m)
        from generate_series(1, 12) m
        left join (select extract(month from created_at at time zone 'America/Sao_Paulo')::int as mm, sum(amount_cents) as issued
                   from public.invoices
                   where org_id = v_org and extract(year from created_at at time zone 'America/Sao_Paulo') = p_year
                   group by 1) i on i.mm = m
        left join (select extract(month from paid_at at time zone 'America/Sao_Paulo')::int as mm, sum(amount_cents) as received
                   from public.invoices
                   where org_id = v_org and status = 'PAID' and extract(year from paid_at at time zone 'America/Sao_Paulo') = p_year
                   group by 1) r on r.mm = m);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- New users get their own company
-- ---------------------------------------------------------------------------------------------------------------

create function public._handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_org uuid;
begin
    if coalesce(new.raw_user_meta_data ->> 'demo', 'false') = 'true' then
        return new; -- the demo user is linked to the demo organization below
    end if;
    insert into public.organizations (name)
    values (left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'company'), ''), 'Minha empresa'), 120))
    returning id into v_org;
    insert into public.memberships (user_id, org_id, role) values (new.id, v_org, 'owner');
    return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
    for each row execute function public._handle_new_user();

-- ---------------------------------------------------------------------------------------------------------------
-- Demo organization, shared test user and nightly reset
-- ---------------------------------------------------------------------------------------------------------------

create function public._seed_demo_data(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
    c  uuid[] := array[]::uuid[];
    v_id uuid;
    v_inv public.invoices;
    rec record;
begin
    for rec in select * from (values
        ('Padaria Pão Quente Ltda',      '11222333000181', 'financeiro@paoquente.example',   '5511987650001'),
        ('Clínica Bem Viver',            '11444777000161', 'contas@bemviver.example',        '5511987650002'),
        ('Ana Souza',                    '52998224725',    'ana.souza@example.com',          '5511987650003'),
        ('Oficina Mecânica Irmãos Lima', '45723174000110', 'pagamentos@oficinalima.example', '5511987650004'),
        ('Carlos Pereira',               '11144477735',    'carlos.pereira@example.com',     '5511987650005'),
        ('Mariana Costa',                '39053344705',    'mariana.costa@example.com',      '5511987650006')
    ) as t(name, document, email, phone) loop
        insert into public.customers (org_id, name, document, email, phone)
        values (p_org, rec.name, rec.document, rec.email, rec.phone)
        returning id into v_id;
        c := c || v_id;
    end loop;

    -- (customer index, description, cents, due offset in days, status, created N days ago, paid N days ago)
    for rec in select * from (values
        (1, 'Honorários de março',         150000, -235, 'PAID',    245, 238),
        (2, 'Mensalidade de abril',        89000,  -205, 'PAID',    215, 208),
        (3, 'Consultoria de maio',         42000,  -175, 'PAID',    185, 176),
        (5, 'Honorários de junho',         60000,  -145, 'PAID',    155, 147),
        (4, 'Abertura de filial',          95000,  -120, 'PAID',    128, 119),
        (1, 'Honorários de julho',         150000, -100, 'PAID',    108, 98),
        (1, 'Honorários de agosto',        150000, -75, 'PAID',     80, 70),
        (2, 'Mensalidade de agosto',       89000,  -70, 'PAID',     78, 68),
        (3, 'Consultoria contábil',        42000,  -60, 'PAID',     65, 58),
        (1, 'Honorários de setembro',      150000, -45, 'PAID',     50, 44),
        (4, 'Declaração de imposto',       35000,  -40, 'PAID',     48, 41),
        (2, 'Mensalidade de setembro',     89000,  -40, 'PAID',     47, 38),
        (5, 'Abertura de empresa',         120000, -30, 'PAID',     36, 29),
        (6, 'Honorários de outubro',       60000,  -20, 'PAID',     26, 0),
        (1, 'Honorários de outubro',       150000, -12, 'PAID',     20, 0),
        (3, 'Balanço trimestral',          98000,  -15, 'OVERDUE',  25, null),
        (4, 'Folha de pagamento de out.',  54000,  -8,  'OVERDUE',  18, null),
        (5, 'Regularização fiscal',        76000,  -3,  'OVERDUE',  12, null),
        (2, 'Mensalidade de outubro',      89000,  5,   'OPEN',     5,  null),
        (1, 'Honorários de novembro',      150000, 12,  'OPEN',     2,  null),
        (6, 'Honorários de novembro',      60000,  18,  'OPEN',     1,  null),
        (3, 'Planejamento tributário',     135000, 25,  'OPEN',     0,  null),
        (4, 'Contrato cancelado',          45000,  7,   'CANCELED', 9,  null)
    ) as t(ci, descr, cents, due_off, status, created_ago, paid_ago) loop
        insert into public.invoices (org_id, customer_id, description, amount_cents, due_date, status, paid_at, created_at)
        values (p_org, c[rec.ci], rec.descr, rec.cents, public.today_sp() + rec.due_off, rec.status,
                case when rec.paid_ago is null then null else now() - make_interval(days => rec.paid_ago) end,
                now() - make_interval(days => rec.created_ago))
        returning * into v_inv;
        perform public._emit_event(v_inv, 'invoice.created');
        if rec.status = 'PAID' then perform public._emit_event(v_inv, 'invoice.paid'); end if;
        if rec.status = 'OVERDUE' then perform public._emit_event(v_inv, 'invoice.overdue'); end if;
        if rec.status = 'CANCELED' then perform public._emit_event(v_inv, 'invoice.canceled'); end if;
    end loop;
end $$;

create function public.reset_demo() returns void
language plpgsql security definer set search_path = public as $$
declare
    v_org uuid;
begin
    select id into v_org from public.organizations where is_demo limit 1;
    if v_org is null then return; end if;
    delete from public.customers where org_id = v_org; -- cascades to invoices, events and notifications
    perform public._seed_demo_data(v_org);
end $$;

-- Shared test user: demo@example.com / Demo-2026!  (public on purpose; shown on the login screen)
do $$
declare
    v_user uuid := '00000000-0000-4000-8000-00000000de30';
    v_org  uuid;
begin
    if not exists (select 1 from auth.users where id = v_user) then
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                                raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                                confirmation_token, email_change, email_change_token_new, recovery_token)
        values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', 'demo@example.com',
                extensions.crypt('Demo-2026!', extensions.gen_salt('bf')), now(),
                '{"provider":"email","providers":["email"]}', '{"demo":true}', now(), now(), '', '', '', '');
        insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), v_user, v_user::text,
                jsonb_build_object('sub', v_user::text, 'email', 'demo@example.com'), 'email', now(), now(), now());
    end if;

    select id into v_org from public.organizations where is_demo limit 1;
    if v_org is null then
        insert into public.organizations (name, is_demo) values ('Empresa Demonstração', true) returning id into v_org;
        insert into public.memberships (user_id, org_id, role) values (v_user, v_org, 'owner');
        perform public._seed_demo_data(v_org);
    end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Scheduled jobs (pg_cron). Skipped silently where the extension is not available.
-- ---------------------------------------------------------------------------------------------------------------

do $$
begin
    create extension if not exists pg_cron;
    perform cron.schedule('billing-mark-overdue', '0 4 * * *', 'select public._mark_overdue(null)');  -- 01:00 Sao Paulo
    perform cron.schedule('billing-reset-demo',   '30 4 * * *', 'select public.reset_demo()');         -- 01:30 Sao Paulo
exception when others then
    raise notice 'pg_cron not available, scheduled jobs skipped: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Security: row level security and privileges
-- ---------------------------------------------------------------------------------------------------------------

alter table public.organizations   enable row level security;
alter table public.memberships     enable row level security;
alter table public.customers       enable row level security;
alter table public.invoices        enable row level security;
alter table public.invoice_events  enable row level security;
alter table public.notifications   enable row level security;

create policy organizations_select on public.organizations for select to authenticated using (public.is_member(id));
create policy memberships_select   on public.memberships   for select to authenticated using (user_id = (select auth.uid()));
create policy customers_select     on public.customers      for select to authenticated using (public.is_member(org_id));
create policy invoices_select      on public.invoices       for select to authenticated using (public.is_member(org_id));
create policy events_select        on public.invoice_events for select to authenticated using (public.is_member(org_id));
create policy notifications_select on public.notifications for select to authenticated using (public.is_member(org_id));

-- Tables: read only, and only for logged users. Writes happen through the functions below.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

-- Functions: nothing is callable by default; open only what the site needs.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
    public.current_org(), public.is_member(uuid),
    public.create_customer(text, text, text, text), public.create_invoice(uuid, text, bigint, date),
    public.pay_invoice(uuid), public.cancel_invoice(uuid), public.refresh_overdue(),
    public.report_summary(), public.report_monthly(integer)
to authenticated;
