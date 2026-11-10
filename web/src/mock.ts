import { isValidDocument, normalizePhone } from './document';
import { addDaysIso, formatBrl, formatDate, todayIso } from './format';
import { buildForecast, scoreCustomer } from './risk';
import type { Api, Auth, AuthSession, Customer, CustomerRisk, Invoice, InvoiceStatus, Member, MonthlyTotal, Notification, Recurring, Summary } from './types';

/**
 * In-memory stand-in for the back end: same rules and messages as the database functions, sample data like the
 * demo company. Used for design previews (VITE_MOCK=true) and tests. Not part of the real product.
 */

const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const uid = () => crypto.randomUUID();
const daysAgoIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

let customers: Customer[] = [];
let invoices: Invoice[] = [];
let notifications: Notification[] = [];
let recurrings: Recurring[] = [];
let members: Member[] = [{ id: 'me', email: 'voce@empresa.example', role: 'ADMIN', you: true }];

function emit(invoice: Invoice, type: 'created' | 'paid' | 'overdue') {
  const customer = customers.find((c) => c.id === invoice.customer_id);
  if (!customer) return;
  const amount = formatBrl(invoice.amount_cents);
  const due = formatDate(invoice.due_date);
  const texts = {
    created: [`Nova cobrança de ${amount}`, `Olá! Foi emitida uma cobrança de ${amount} com vencimento em ${due}.`],
    paid: [`Pagamento confirmado: ${amount}`, `Olá! Recebemos o pagamento de ${amount} (vencimento ${due}). Obrigado!`],
    overdue: [`Cobrança vencida: ${amount}`, `Olá! A cobrança de ${amount} venceu em ${due} e ainda está em aberto.`],
  } as const;
  notifications.unshift({ id: uid(), to_email: customer.email, subject: texts[type][0], body: texts[type][1], created_at: new Date().toISOString() });
}

function seed() {
  const today = todayIso();
  customers = [
    ['Padaria Pão Quente Ltda', '11222333000181', 'financeiro@paoquente.example', '5511987650001'],
    ['Clínica Bem Viver', '11444777000161', 'contas@bemviver.example', '5511987650002'],
    ['Ana Souza', '52998224725', 'ana.souza@example.com', '5511987650003'],
    ['Oficina Mecânica Irmãos Lima', '45723174000110', 'pagamentos@oficinalima.example', '5511987650004'],
    ['Carlos Pereira', '11144477735', 'carlos.pereira@example.com', '5511987650005'],
    ['Mariana Costa', '39053344705', 'mariana.costa@example.com', '5511987650006'],
  ].map(([name, document, email, phone], index) => ({
    id: uid(), name, document, email, phone, created_at: daysAgoIso(90 - index),
  }));

  // [customer, description, cents, due offset, status, created N days ago, paid N days ago]
  const rows: [number, string, number, number, InvoiceStatus, number, number | null][] = [
    [0, 'Honorários de março', 150000, -235, 'PAID', 245, 238],
    [1, 'Mensalidade de abril', 89000, -205, 'PAID', 215, 208],
    [2, 'Consultoria de maio', 42000, -175, 'PAID', 185, 176],
    [4, 'Honorários de junho', 60000, -145, 'PAID', 155, 147],
    [3, 'Abertura de filial', 95000, -120, 'PAID', 128, 119],
    [0, 'Honorários de julho', 150000, -100, 'PAID', 108, 98],
    [0, 'Honorários de agosto', 150000, -75, 'PAID', 80, 70],
    [1, 'Mensalidade de agosto', 89000, -70, 'PAID', 78, 68],
    [2, 'Consultoria contábil', 42000, -60, 'PAID', 65, 58],
    [0, 'Honorários de setembro', 150000, -45, 'PAID', 50, 44],
    [3, 'Declaração de imposto', 35000, -40, 'PAID', 48, 41],
    [1, 'Mensalidade de setembro', 89000, -40, 'PAID', 47, 38],
    [4, 'Abertura de empresa', 120000, -30, 'PAID', 36, 29],
    [5, 'Honorários de outubro', 60000, -20, 'PAID', 26, 0],
    [0, 'Honorários de outubro', 150000, -12, 'PAID', 20, 0],
    [2, 'Balanço trimestral', 98000, -15, 'OVERDUE', 25, null],
    [3, 'Folha de pagamento de out.', 54000, -8, 'OVERDUE', 18, null],
    [4, 'Regularização fiscal', 76000, -3, 'OVERDUE', 12, null],
    [1, 'Mensalidade de outubro', 89000, 5, 'OPEN', 5, null],
    [0, 'Honorários de novembro', 150000, 12, 'OPEN', 2, null],
    [5, 'Honorários de novembro', 60000, 18, 'OPEN', 1, null],
    [2, 'Planejamento tributário', 135000, 25, 'OPEN', 0, null],
    [3, 'Contrato cancelado', 45000, 7, 'CANCELED', 9, null],
  ];
  notifications = [];
  recurrings = [{
    id: uid(), customer_id: customers[0].id, customer_name: customers[0].name, description: 'Honorários mensais',
    amount_cents: 150000, day_of_month: 10, next_due_date: addDaysIso(today, 25), active: true,
  }];
  invoices = rows.map(([ci, description, cents, offset, status, created, paid]) => {
    const customer = customers[ci];
    const invoice: Invoice = {
      id: uid(), customer_id: customer.id, description, amount_cents: cents, due_date: addDaysIso(today, offset), status,
      paid_at: paid === null ? null : daysAgoIso(paid), created_at: daysAgoIso(created),
      customers: { name: customer.name, phone: customer.phone },
    };
    emit(invoice, 'created');
    if (status === 'PAID') emit(invoice, 'paid');
    if (status === 'OVERDUE') emit(invoice, 'overdue');
    return invoice;
  });
}
seed();

const sum = (list: Invoice[]) => list.reduce((acc, invoice) => acc + invoice.amount_cents, 0);
const sameMonth = (iso: string, month: string) => new Date(iso).toISOString().slice(0, 7) === month || iso.startsWith(month);

function find(id: string): Invoice {
  const invoice = invoices.find((i) => i.id === id);
  if (!invoice) throw new Error('Cobrança não encontrada');
  return invoice;
}

const dayDiff = (later: string, earlier: string) =>
  Math.round((new Date(`${later.slice(0, 10)}T12:00:00`).getTime() - new Date(`${earlier.slice(0, 10)}T12:00:00`).getTime()) / 86_400_000);

function riskRows(): CustomerRisk[] {
  const today = todayIso();
  return customers.map((customer) => {
    const mine = invoices.filter((i) => i.customer_id === customer.id);
    const paid = mine.filter((i) => i.status === 'PAID' && i.paid_at);
    const delays = paid.map((i) => Math.max(0, dayDiff(i.paid_at as string, i.due_date)));
    const overdueDays = mine.filter((i) => i.status === 'OVERDUE').map((i) => dayDiff(today, i.due_date)).filter((d) => d > 0);
    return {
      customer_id: customer.id, customer_name: customer.name,
      ...(() => {
        const s = scoreCustomer(paid.length, delays.filter((d) => d > 3).length, delays.reduce((a, b) => a + b, 0), overdueDays);
        return { score: s.score, level: s.level, avg_delay_days: s.avgDelayDays, late_rate: s.lateRate, limited_data: s.limitedData };
      })(),
      paid_count: paid.length, overdue_count: overdueDays.length,
      oldest_overdue_days: overdueDays.length ? Math.max(...overdueDays) : 0,
      unpaid_cents: sum(mine.filter((i) => i.status === 'OPEN' || i.status === 'OVERDUE')),
    };
  }).sort((a, b) => Number(a.level === 'NO_DATA') - Number(b.level === 'NO_DATA') || b.score - a.score);
}

export const mockApi: Api = {
  features: { team: true, recurring: true, risk: true },

  risk: async () => (await delay(), riskRows()),
  forecast: async () => {
    await delay();
    const rows = riskRows();
    const paying = rows.filter((r) => r.paid_count > 0);
    const payments = paying.reduce((a, r) => a + r.paid_count, 0);
    const fallback = payments ? paying.reduce((a, r) => a + r.avg_delay_days * r.paid_count, 0) / payments : 0;
    const month = todayIso().slice(0, 7);
    const received = sum(invoices.filter((i) => i.status === 'PAID' && i.paid_at && sameMonth(i.paid_at, month)));
    const unpaid = invoices.filter((i) => i.status === 'OPEN' || i.status === 'OVERDUE')
      .map((i) => ({ customerId: i.customer_id, amountCents: i.amount_cents, dueDate: i.due_date }));
    return buildForecast(unpaid, new Map(rows.map((r) => [r.customer_id, r])), received, todayIso(), fallback);
  },
  organization: async () => (await delay(), { id: 'demo', name: 'Empresa Demonstração', is_demo: true, role: 'ADMIN' }),

  createRecurring: async (body) => {
    const first = await mockApi.createInvoice(body);
    const customer = customers.find((c) => c.id === body.customerId);
    const next = new Date(`${body.dueDate}T12:00:00`);
    next.setMonth(next.getMonth() + 1);
    recurrings.unshift({
      id: uid(), customer_id: body.customerId, customer_name: customer?.name ?? null, description: body.description.trim(),
      amount_cents: body.amountCents, day_of_month: Number(body.dueDate.slice(8, 10)), next_due_date: next.toISOString().slice(0, 10), active: true,
    });
    first.recurring = true;
    return first;
  },
  recurring: async () => (await delay(), recurrings.map((r) => ({ ...r }))),
  stopRecurring: async (id) => {
    await delay();
    const recurring = recurrings.find((r) => r.id === id);
    if (!recurring) throw new Error('Cobrança recorrente não encontrada');
    recurring.active = false;
    return { ...recurring };
  },

  team: async () => (await delay(), members.map((m) => ({ ...m }))),
  addMember: async (email, role) => {
    await delay();
    const member: Member = { id: uid(), email: email.trim().toLowerCase(), role, you: false };
    members.push(member);
    return member;
  },
  changeRole: async (id, role) => {
    await delay();
    const member = members.find((m) => m.id === id);
    if (!member) throw new Error('Pessoa não encontrada');
    member.role = role;
    return { ...member };
  },
  removeMember: async (id) => {
    await delay();
    members = members.filter((m) => m.id !== id);
  },

  refreshOverdue: async () => {
    await delay();
    const today = todayIso();
    let changed = 0;
    for (const invoice of invoices) {
      if (invoice.status === 'OPEN' && invoice.due_date < today) {
        invoice.status = 'OVERDUE';
        emit(invoice, 'overdue');
        changed += 1;
      }
    }
    return changed;
  },

  summary: async (): Promise<Summary> => {
    await delay();
    const month = todayIso().slice(0, 7);
    const open = sum(invoices.filter((i) => i.status === 'OPEN'));
    const overdue = sum(invoices.filter((i) => i.status === 'OVERDUE'));
    const received = sum(invoices.filter((i) => i.status === 'PAID'));
    const base = open + overdue + received;
    return {
      month,
      issuedCents: sum(invoices.filter((i) => sameMonth(i.created_at, month))),
      receivedCents: sum(invoices.filter((i) => i.status === 'PAID' && i.paid_at && sameMonth(i.paid_at, month))),
      openCents: open,
      overdueCents: overdue,
      delinquencyRate: base === 0 ? 0 : Math.round((overdue * 10000) / base) / 100,
    };
  },

  monthly: async (year): Promise<MonthlyTotal[]> => {
    await delay();
    return Array.from({ length: 12 }, (_, index) => {
      const month = `${year}-${String(index + 1).padStart(2, '0')}`;
      return {
        month,
        issuedCents: sum(invoices.filter((i) => sameMonth(i.created_at, month))),
        receivedCents: sum(invoices.filter((i) => i.status === 'PAID' && i.paid_at && sameMonth(i.paid_at, month))),
      };
    });
  },

  customers: async () => (await delay(), [...customers].sort((a, b) => a.name.localeCompare(b.name))),

  createCustomer: async (body) => {
    await delay();
    const document = body.document.replace(/\D/g, '');
    if (!body.name.trim()) throw new Error('Informe o nome do cliente');
    if (!isValidDocument(document)) throw new Error('CPF/CNPJ inválido');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim())) throw new Error('E-mail inválido');
    const phone = body.phone.trim() ? normalizePhone(body.phone) : null;
    if (body.phone.trim() && !phone) throw new Error('Telefone inválido. Use o DDD e o número, por exemplo (11) 91234-5678');
    if (customers.some((c) => c.document === document)) throw new Error('Já existe um cliente com esse CPF/CNPJ');
    if (customers.length >= 30) throw new Error('Limite da demonstração atingido (30 registros). Os dados são restaurados toda madrugada.');
    const customer: Customer = { id: uid(), name: body.name.trim(), document, email: body.email.trim(), phone, created_at: new Date().toISOString() };
    customers.push(customer);
    return customer;
  },

  invoices: async () => (await delay(), invoices.map((i) => ({ ...i })).sort((a, b) => b.due_date.localeCompare(a.due_date))),

  createInvoice: async (body) => {
    await delay();
    if (body.amountCents <= 0) throw new Error('O valor precisa ser maior que zero');
    if (!body.description.trim()) throw new Error('Informe a descrição');
    if (!body.dueDate || body.dueDate < todayIso()) throw new Error('O vencimento não pode estar no passado');
    const customer = customers.find((c) => c.id === body.customerId);
    if (!customer) throw new Error('Cliente não encontrado');
    const invoice: Invoice = {
      id: uid(), customer_id: customer.id, description: body.description.trim(), amount_cents: body.amountCents,
      due_date: body.dueDate, status: 'OPEN', paid_at: null, created_at: new Date().toISOString(),
      customers: { name: customer.name, phone: customer.phone },
    };
    invoices.push(invoice);
    emit(invoice, 'created');
    return invoice;
  },

  pay: async (id) => {
    await delay();
    const invoice = find(id);
    if (invoice.status !== 'OPEN' && invoice.status !== 'OVERDUE') {
      throw new Error(`Não é possível pagar uma cobrança ${invoice.status === 'PAID' ? 'já paga' : 'cancelada'}`);
    }
    invoice.status = 'PAID';
    invoice.paid_at = new Date().toISOString();
    emit(invoice, 'paid');
    return invoice;
  },

  cancel: async (id) => {
    await delay();
    const invoice = find(id);
    if (invoice.status !== 'OPEN' && invoice.status !== 'OVERDUE') {
      throw new Error(`Não é possível cancelar uma cobrança ${invoice.status === 'PAID' ? 'já paga' : 'já cancelada'}`);
    }
    invoice.status = 'CANCELED';
    return invoice;
  },

  notifications: async () => (await delay(), notifications.map((n) => ({ ...n }))),
};

// ---------------------------------------------------------------------------------------------------------------

let session: AuthSession | null = null;
let refreshes = 0;
const listeners = new Set<(session: AuthSession | null) => void>();
const setSession = (next: AuthSession | null) => {
  session = next;
  listeners.forEach((listener) => listener(next));
};

export const mockAuth: Auth = {
  getSession: async () => session,
  onChange: (callback) => {
    listeners.add(callback);
    return () => void listeners.delete(callback);
  },
  signIn: async (email, password) => {
    await delay(250);
    if (!password) return 'E-mail ou senha incorretos.';
    setSession({ email });
    return null;
  },
  signUp: async (email, _password, company) => {
    await delay(250);
    refreshes = 0;
    setSession({ email, pending: !company });
    return {};
  },
  // an account without a company is "released" on the second check, to show the waiting screen working
  refresh: async () => {
    await delay();
    refreshes += 1;
    if (session?.pending && refreshes >= 2) session = { email: session.email, pending: false };
    return session;
  },
  signOut: async () => setSession(null),
};

