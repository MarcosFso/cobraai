-- Tests for setup.sql. Run after 00_supabase_stub.sql and setup.sql, with ON_ERROR_STOP on.
-- Every check is an ASSERT or an expected error; any failure aborts the run with a non-zero exit code.
\set ON_ERROR_STOP on
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set DEMO '''00000000-0000-4000-8000-00000000de30'''

create schema test;
grant usage on schema test to anon, authenticated;
create table test.ctx (k text primary key, v text);
grant all on test.ctx to anon, authenticated;

-- Runs a statement as the current role and checks that it fails with a message containing p_fragment.
create function test.expect_error(p_sql text, p_fragment text) returns void language plpgsql as $$
begin
    begin
        execute p_sql;
    exception when others then
        if sqlerrm like '%' || p_fragment || '%' then return; end if;
        raise exception 'expected an error containing "%", got "%" for: %', p_fragment, sqlerrm, p_sql;
    end;
    raise exception 'expected an error containing "%", but nothing failed: %', p_fragment, p_sql;
end $$;

-- Valid CPF generated from a counter, so tests do not collide on the unique document.
create function test.cpf(n int) returns text language plpgsql as $$
declare
    base text := lpad((100000000 + n * 7)::text, 9, '0');
    s int := 0; r int; d1 int; d2 int; i int;
begin
    for i in 1..9 loop s := s + substr(base, i, 1)::int * (11 - i); end loop;
    r := (s * 10) % 11; d1 := case when r = 10 then 0 else r end;
    s := 0;
    for i in 1..9 loop s := s + substr(base, i, 1)::int * (12 - i); end loop;
    s := s + d1 * 2;
    r := (s * 10) % 11; d2 := case when r = 10 then 0 else r end;
    return base || d1 || d2;
end $$;
grant execute on function test.cpf(int) to anon, authenticated;

-- =====================================================================================================
-- 1. Sign up creates one company per user; the demo user is linked to the demo organization
-- =====================================================================================================
insert into auth.users (id, email, raw_user_meta_data) values
    (:A, 'a@example.com', '{"company": "Empresa A"}'),
    (:B, 'b@example.com', '{"company": "Empresa B"}');

do $$ begin
    assert (select count(*) from public.organizations where name = 'Empresa A') = 1, 'company A created';
    assert (select count(*) from public.organizations where name = 'Empresa B') = 1, 'company B created';
    assert (select count(*) from public.organizations where is_demo) = 1, 'one demo organization';
    assert (select count(*) from public.memberships) = 3, 'A, B and demo are members';
end $$;

-- =====================================================================================================
-- 2. Company A: customers and invoices follow the business rules
-- =====================================================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false);

do $$
declare c public.customers; i public.invoices;
begin
    c := public.create_customer('Cliente Um', '529.982.247-25', 'um@example.com');
    assert c.document = '52998224725', 'document keeps only digits';
    insert into test.ctx values ('customer', c.id::text);

    perform test.expect_error($q$select public.create_customer('X', '12345678900', 'x@example.com')$q$, 'CPF/CNPJ inválido');
    perform test.expect_error($q$select public.create_customer('X', '111.111.111-11', 'x@example.com')$q$, 'CPF/CNPJ inválido');
    perform test.expect_error($q$select public.create_customer('X', '529.982.247-25', 'x@example.com')$q$, 'Já existe um cliente');
    perform test.expect_error($q$select public.create_customer('X', '11.222.333/0001-81', 'not-an-email')$q$, 'E-mail inválido');
    perform public.create_customer('Empresa Dois', '11.222.333/0001-81', 'dois@example.com'); -- valid CNPJ
    assert c.phone is null, 'phone is optional';
    assert (public.create_customer('Com Telefone', '390.533.447-05', 'tel@example.com', '(11) 91234-5678')).phone = '5511912345678',
           'phone keeps digits and gets the country code';
    assert (public.create_customer('Telefone Fixo', '111.444.777-35', 'fixo@example.com', '+55 (21) 3456-7890')).phone = '552134567890',
           'landline with country code';
    perform test.expect_error($q$select public.create_customer('X', '45.723.174/0001-10', 'x@example.com', '123')$q$, 'Telefone inválido');
    perform test.expect_error($q$select public.create_customer('X', '45.723.174/0001-10', 'x@example.com', '+1 202 555 0143')$q$, 'Telefone inválido');

    perform test.expect_error(format($q$select public.create_invoice(%L, 'Velha', 1000, current_date - 3)$q$, c.id), 'passado');
    perform test.expect_error(format($q$select public.create_invoice(%L, 'Zero', 0, current_date + 5)$q$, c.id), 'maior que zero');
    perform test.expect_error(format($q$select public.create_invoice(%L, 'Neg', -5, current_date + 5)$q$, c.id), 'maior que zero');
    perform test.expect_error($q$select public.create_invoice(gen_random_uuid(), 'Sem cliente', 1000, current_date + 5)$q$, 'Cliente não encontrado');

    i := public.create_invoice(c.id, 'Honorários de novembro', 150000, current_date + 10);
    assert i.status = 'OPEN', 'new invoice is OPEN';
    insert into test.ctx values ('inv_paid', i.id::text);
end $$;

-- the creation event and the simulated e-mail exist, written in the same transaction
do $$ #variable_conflict use_variable
declare id uuid := (select v::uuid from test.ctx where k = 'inv_paid'); begin
    assert (select count(*) from public.invoice_events where invoice_id = id and type = 'invoice.created') = 1, 'created event';
    assert (select subject from public.notifications n join public.invoice_events e on e.id = n.event_id where e.invoice_id = id)
           = 'Nova cobrança de R$ 1.500,00', 'created e-mail subject (BRL format)';
end $$;

-- pay, pay again, cancel after paid
do $$ #variable_conflict use_variable
declare id uuid := (select v::uuid from test.ctx where k = 'inv_paid'); p public.invoices; begin
    p := public.pay_invoice(id);
    assert p.status = 'PAID' and p.paid_at is not null, 'paid';
    perform test.expect_error(format($q$select public.pay_invoice(%L)$q$, id), 'já paga');
    perform test.expect_error(format($q$select public.cancel_invoice(%L)$q$, id), 'já paga');
    assert (select count(*) from public.invoice_events where invoice_id = id and type = 'invoice.paid') = 1, 'exactly one paid event';
    assert (select count(*) from public.notifications n join public.invoice_events e on e.id = n.event_id
            where e.invoice_id = id and e.type = 'invoice.paid') = 1, 'one paid e-mail';
end $$;

-- cancel, then neither pay nor cancel again; canceling sends no e-mail
do $$ declare cid uuid := (select v::uuid from test.ctx where k = 'customer'); i public.invoices; begin
    i := public.create_invoice(cid, 'Contrato cancelado', 50000, current_date + 20);
    insert into test.ctx values ('inv_canceled', i.id::text);
    assert (public.cancel_invoice(i.id)).status = 'CANCELED', 'canceled';
    perform test.expect_error(format($q$select public.pay_invoice(%L)$q$, i.id), 'cancelada');
    perform test.expect_error(format($q$select public.cancel_invoice(%L)$q$, i.id), 'já cancelada');
    assert (select count(*) from public.invoice_events where invoice_id = i.id and type = 'invoice.canceled') = 1, 'canceled event';
    assert (select count(*) from public.notifications n join public.invoice_events e on e.id = n.event_id
            where e.invoice_id = i.id and e.type = 'invoice.canceled') = 0, 'no e-mail for cancel';
end $$;

-- three more invoices: one stays OPEN, two will be made overdue
do $$ declare cid uuid := (select v::uuid from test.ctx where k = 'customer'); begin
    insert into test.ctx values ('inv_open', (public.create_invoice(cid, 'Em aberto', 70000, current_date + 30)).id::text);
    insert into test.ctx values ('inv_over_paid', (public.create_invoice(cid, 'Vai vencer e pagar', 20000, current_date + 1)).id::text);
    insert into test.ctx values ('inv_over', (public.create_invoice(cid, 'Vai ficar vencida', 30000, current_date + 1)).id::text);
end $$;

-- =====================================================================================================
-- 3. Tenant isolation and no direct writes
-- =====================================================================================================
select set_config('request.jwt.claim.sub', :B, false);

do $$ declare inv uuid := (select v::uuid from test.ctx where k = 'inv_open'); begin
    assert (select count(*) from public.customers) = 0, 'B sees no customers of A';
    assert (select count(*) from public.invoices) = 0, 'B sees no invoices of A';
    assert (select count(*) from public.notifications) = 0, 'B sees no e-mails of A';
    perform test.expect_error(format($q$select public.pay_invoice(%L)$q$, inv), 'não encontrada');
    perform test.expect_error(format($q$select public.cancel_invoice(%L)$q$, inv), 'não encontrada');
    perform test.expect_error(format($q$select public.create_invoice((select id from public.customers limit 1), 'x', 1000, current_date + 1)$q$), 'Cliente não encontrado');
    assert (public.report_summary() ->> 'openCents')::bigint = 0, 'B report is empty';
end $$;

do $$ declare inv uuid := (select v::uuid from test.ctx where k = 'inv_open'); begin
    perform test.expect_error(format($q$update public.invoices set status = 'PAID' where id = %L$q$, inv), 'permission denied');
    perform test.expect_error(format($q$delete from public.invoices where id = %L$q$, inv), 'permission denied');
    perform test.expect_error($q$insert into public.customers (org_id, name, document, email) values (gen_random_uuid(), 'x', '52998224725', 'x@example.com')$q$, 'permission denied');
    perform test.expect_error($q$update public.organizations set is_demo = true$q$, 'permission denied');
    perform test.expect_error($q$select public._mark_overdue(null)$q$, 'permission denied');
    perform test.expect_error($q$select public.reset_demo()$q$, 'permission denied');
end $$;

reset role;
set role anon;
do $$ begin
    perform test.expect_error($q$select * from public.customers$q$, 'permission denied');
    perform test.expect_error($q$select public.report_summary()$q$, 'permission denied');
    perform test.expect_error($q$select public.create_customer('x', '52998224725', 'x@example.com')$q$, 'permission denied');
end $$;
reset role;

-- =====================================================================================================
-- 4. Overdue job: only OPEN invoices past the due date, once
-- =====================================================================================================
update public.invoices set due_date = current_date - 3
where id in (select v::uuid from test.ctx where k in ('inv_over_paid', 'inv_over'));

do $$ declare n int; begin
    n := public._mark_overdue(null);
    assert n >= 2, 'job marked the two overdue invoices';
    assert (select count(*) from public.invoices where status = 'OVERDUE' and id in
            (select v::uuid from test.ctx where k in ('inv_over_paid', 'inv_over'))) = 2, 'both are OVERDUE';
    assert (select status from public.invoices where id = (select v::uuid from test.ctx where k = 'inv_open')) = 'OPEN',
           'future invoice stays OPEN';
    assert public._mark_overdue(null) = 0, 'running the job twice emits nothing';
    assert (select count(*) from public.invoice_events where type = 'invoice.overdue'
            and invoice_id in (select v::uuid from test.ctx where k in ('inv_over_paid', 'inv_over'))) = 2, 'one overdue event each';
end $$;

select set_config('request.jwt.claim.sub', :A, false);
set role authenticated;

do $$ begin
    assert public.refresh_overdue() = 0, 'refresh has nothing left to do';
    -- an overdue invoice can still be paid
    assert (public.pay_invoice((select v::uuid from test.ctx where k = 'inv_over_paid'))).status = 'PAID', 'overdue -> paid';
end $$;

-- =====================================================================================================
-- 5. Reports
--    PAID 150.000 + 20.000 | OPEN 70.000 | OVERDUE 30.000 | CANCELED 50.000
-- =====================================================================================================
do $$ declare s jsonb := public.report_summary(); m jsonb := public.report_monthly(extract(year from current_date)::int); begin
    assert (s ->> 'openCents')::bigint = 70000, 'open total';
    assert (s ->> 'overdueCents')::bigint = 30000, 'overdue total';
    assert (s ->> 'receivedCents')::bigint = 170000, 'received this month';
    assert (s ->> 'issuedCents')::bigint = 320000, 'issued this month (all five invoices)';
    assert (s -> 'allTime' ->> 'canceledCents')::bigint = 50000, 'canceled total';
    assert (s ->> 'delinquencyRate')::numeric = 11.11, 'delinquency = 30000 / (70000 + 30000 + 170000)';
    assert jsonb_array_length(m) = 12, 'twelve months';
    assert (select sum((x ->> 'receivedCents')::bigint) from jsonb_array_elements(m) x) = 170000, 'monthly received adds up';
    assert (select sum((x ->> 'issuedCents')::bigint) from jsonb_array_elements(m) x) = 320000, 'monthly issued adds up';
end $$;

-- =====================================================================================================
-- 6. Demo organization: seeded, limited, and reset
-- =====================================================================================================
reset role;
do $$ begin
    assert (select bool_and(public.is_valid_document(document)) from public.customers c
            join public.organizations o on o.id = c.org_id and o.is_demo), 'every demo document is valid';
end $$;

select set_config('request.jwt.claim.sub', :DEMO, false);
set role authenticated;

do $$ begin
    assert (select count(*) from public.customers) = 6, 'demo has 6 customers';
    assert (select count(*) from public.customers where phone is not null) = 6, 'demo customers have phones';
    assert (select count(*) from public.invoices) = 23, 'demo has 23 invoices';
    assert (select count(*) from public.invoices where status = 'OVERDUE') = 3, 'demo has overdue invoices';
    assert (select count(*) from public.notifications) > 0, 'demo has e-mails';
    assert (public.report_summary() ->> 'overdueCents')::bigint = 228000, 'demo overdue total';
    assert (public.report_summary() ->> 'receivedCents')::bigint = 210000, 'demo received this month (two payments today)';
end $$;

do $$ declare n int; begin
    for n in 1..24 loop perform public.create_customer('Visitante ' || n, test.cpf(n), 'v' || n || '@example.com'); end loop;
    perform test.expect_error($q$select public.create_customer('Excedente', '529.982.247-25', 'x@example.com')$q$, 'Limite da demonstração');
    perform test.expect_error(format($q$select public.create_customer('Excedente', %L, 'x@example.com')$q$, test.cpf(99)), 'Limite da demonstração');
end $$;

reset role;
select public.reset_demo();
do $$ begin
    assert (select count(*) from public.customers c join public.organizations o on o.id = c.org_id and o.is_demo) = 6, 'reset restores customers';
    assert (select count(*) from public.invoices i join public.organizations o on o.id = i.org_id and o.is_demo) = 23, 'reset restores invoices';
    assert (select count(*) from public.customers c join public.organizations o on o.id = c.org_id where not o.is_demo) = 4,
           'reset does not touch real companies';
end $$;

select 'ALL SQL TESTS PASSED' as result;
