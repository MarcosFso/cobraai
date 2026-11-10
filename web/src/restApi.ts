import { DEMO_EMAIL } from './supabase';
import type { Api, Auth, AuthSession, Customer, CustomerRisk, ForecastMonth, Invoice, Member, MonthlyTotal, Notification, Recurring, Role, Summary } from './types';

/**
 * The same screens, talking to the microservices instead of Supabase:
 *   billing-service (Java)      customers, invoices, login           -> BILLING
 *   report-service (Python)     totals and the monthly chart         -> REPORT
 *   notification-service (Node) history of the e-mails sent          -> NOTIFY
 * One login token (JWT) from the billing service is accepted by all three.
 */
const BILLING = import.meta.env.VITE_BILLING_URL ?? '/api/billing';
const REPORT = import.meta.env.VITE_REPORT_URL ?? '/api/report';
const NOTIFY = import.meta.env.VITE_NOTIFICATION_URL ?? '/api/notification';

const TOKEN_KEY = 'billing.token';
let memoryToken: string | null = null;

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken; // storage can be blocked (private window): the login lasts until the page closes
  }
}

function writeToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* not remembered */
  }
}

const listeners = new Set<(session: AuthSession | null) => void>();
const notify = (session: AuthSession | null) => listeners.forEach((listener) => listener(session));

async function request<T>(url: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const headers: Record<string, string> = { 'X-Correlation-Id': crypto.randomUUID() };
  if (init.body) headers['Content-Type'] = 'application/json';
  const token = readToken();
  if (authenticated && token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  if (response.status === 401 && authenticated) {
    writeToken(null); // the token expired or is not valid anymore: back to the login screen
    notify(null);
  }
  if (!response.ok) {
    let detail = `Erro ${response.status}`;
    try {
      detail = (await response.json()).detail ?? detail;
    } catch {
      /* body is not JSON */
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

interface AuthResponse {
  token: string;
  email: string;
  pending?: boolean;
  mustChangePassword?: boolean;
}

interface MeResponse {
  email: string;
  company: string | null;
  demo: boolean;
  role: Role | null;
  pending: boolean;
  mustChangePassword?: boolean;
  /** Only present when the token in use is out of date. */
  token?: string;
}

interface BillingRecurring {
  id: string;
  customerId: string;
  customerName: string | null;
  description: string;
  amountCents: number;
  dayOfMonth: number;
  nextDueDate: string;
  active: boolean;
}

interface BillingMember {
  id: string;
  email: string;
  role: Role;
  you: boolean;
  passwordResetPending?: boolean;
}

interface ReportRisk {
  customerId: string;
  customerName: string;
  score: number;
  level: CustomerRisk['level'];
  avgDelayDays: number;
  lateRate: number;
  limitedData: boolean;
  paidCount: number;
  overdueCount: number;
  oldestOverdueDays: number;
  unpaidCents: number;
}

interface ReportForecast {
  month: string;
  receivedCents: number;
  nominalCents: number;
  expectedCents: number;
}

const toRecurring = (r: BillingRecurring): Recurring => ({
  id: r.id, customer_id: r.customerId, customer_name: r.customerName, description: r.description,
  amount_cents: r.amountCents, day_of_month: r.dayOfMonth, next_due_date: r.nextDueDate, active: r.active,
});

const toMember = (m: BillingMember): Member => ({
  id: m.id, email: m.email, role: m.role, you: m.you, password_reset_pending: m.passwordResetPending ?? false,
});

/** Asks who the caller is, and keeps the stored token current when an administrator changed the account. */
async function me(): Promise<MeResponse> {
  const current = await request<MeResponse>(`${BILLING}/auth/me`);
  if (current.token) writeToken(current.token);
  return current;
}

const post = <T>(url: string, body?: unknown) =>
  request<T>(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

interface BillingCustomer {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string | null;
  createdAt: string;
}

interface BillingInvoice {
  id: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  description: string;
  amountCents: number;
  dueDate: string;
  status: Invoice['status'];
  paidAt: string | null;
  createdAt: string;
  recurring?: boolean;
}

const toCustomer = (c: BillingCustomer): Customer => ({
  id: c.id, name: c.name, document: c.document, email: c.email, phone: c.phone, created_at: c.createdAt,
});

const toInvoice = (i: BillingInvoice): Invoice => ({
  id: i.id,
  customer_id: i.customerId,
  description: i.description,
  amount_cents: i.amountCents,
  due_date: i.dueDate,
  status: i.status,
  paid_at: i.paidAt,
  created_at: i.createdAt,
  recurring: i.recurring ?? false,
  customers: i.customerName === null ? null : { name: i.customerName, phone: i.customerPhone },
});

interface NotificationRow {
  id: string;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
}

export const restApi: Api = {
  features: { team: true, recurring: true, risk: true },

  risk: async () =>
    (await request<ReportRisk[]>(`${REPORT}/reports/risk`)).map((r): CustomerRisk => ({
      customer_id: r.customerId, customer_name: r.customerName, score: r.score, level: r.level,
      avg_delay_days: r.avgDelayDays, late_rate: r.lateRate, limited_data: r.limitedData, paid_count: r.paidCount,
      overdue_count: r.overdueCount, oldest_overdue_days: r.oldestOverdueDays, unpaid_cents: r.unpaidCents,
    })),
  forecast: async () =>
    (await request<{ months: ReportForecast[] }>(`${REPORT}/reports/forecast`)).months.map((m): ForecastMonth => ({
      month: m.month, received_cents: m.receivedCents, nominal_cents: m.nominalCents, expected_cents: m.expectedCents,
    })),

  organization: async () => {
    const current = await me();
    return { id: 'current', name: current.company ?? '', is_demo: current.demo, role: current.role };
  },

  refreshOverdue: async () => 0, // the billing service marks overdue invoices by itself, on a schedule
  summary: () => request<Summary>(`${REPORT}/reports/summary`),
  monthly: (year) => request<MonthlyTotal[]>(`${REPORT}/reports/monthly?year=${year}`),

  customers: async () => (await request<BillingCustomer[]>(`${BILLING}/customers`)).map(toCustomer),
  createCustomer: async (body) =>
    toCustomer(await post<BillingCustomer>(`${BILLING}/customers`, { ...body, phone: body.phone || null })),

  invoices: async () => (await request<BillingInvoice[]>(`${BILLING}/invoices`)).map(toInvoice),
  createInvoice: async (body) => toInvoice(await post<BillingInvoice>(`${BILLING}/invoices`, body)),
  pay: async (id) => toInvoice(await post<BillingInvoice>(`${BILLING}/invoices/${id}/pay`)),
  cancel: async (id) => toInvoice(await post<BillingInvoice>(`${BILLING}/invoices/${id}/cancel`)),

  createRecurring: async (body) =>
    toInvoice(await post<BillingInvoice>(`${BILLING}/recurring`, {
      customerId: body.customerId, description: body.description, amountCents: body.amountCents, firstDueDate: body.dueDate,
    })),
  recurring: async () => (await request<BillingRecurring[]>(`${BILLING}/recurring`)).map(toRecurring),
  stopRecurring: async (id) => toRecurring(await post<BillingRecurring>(`${BILLING}/recurring/${id}/stop`)),

  team: async () => (await request<BillingMember[]>(`${BILLING}/team`)).map(toMember),
  addMember: async (email, role) => toMember(await post<BillingMember>(`${BILLING}/team`, { email, role })),
  changeRole: async (id, role) =>
    toMember(await request<BillingMember>(`${BILLING}/team/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) })),
  resetPassword: async (id) => (await post<{ temporaryPassword: string }>(`${BILLING}/team/${id}/reset-password`)).temporaryPassword,
  removeMember: async (id) => {
    await request<void>(`${BILLING}/team/${id}`, { method: 'DELETE' });
  },

  notifications: async () =>
    (await request<NotificationRow[]>(`${NOTIFY}/notifications`)).map(
      (row): Notification => ({ id: row.id, to_email: row.to, subject: row.subject, body: row.body, created_at: row.createdAt }),
    ),
};

function accept(result: AuthResponse): null {
  writeToken(result.token);
  notify({ email: result.email, pending: result.pending ?? false, mustChangePassword: result.mustChangePassword ?? false });
  return null;
}

export const restAuth: Auth = {
  async getSession() {
    if (!readToken()) return null;
    try {
      const current = await me();
      return { email: current.email, pending: current.pending, mustChangePassword: current.mustChangePassword ?? false };
    } catch {
      writeToken(null);
      return null;
    }
  },

  async refresh() {
    const current = await me();
    return { email: current.email, pending: current.pending, mustChangePassword: current.mustChangePassword ?? false };
  },

  async changePassword(currentPassword, newPassword) {
    try {
      accept(await post<AuthResponse>(`${BILLING}/auth/password`, { currentPassword, newPassword }));
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  },

  onChange(callback) {
    listeners.add(callback);
    return () => void listeners.delete(callback);
  },

  async signIn(email, password) {
    try {
      // "Entrar como visitante" asks for a brand new sandbox company instead of logging into a shared account
      if (email === DEMO_EMAIL) return accept(await request<AuthResponse>(`${BILLING}/auth/demo`, { method: 'POST' }, false));
      return accept(
        await request<AuthResponse>(`${BILLING}/auth/login`, { method: 'POST', body: JSON.stringify({ email, password }) }, false),
      );
    } catch (error) {
      return (error as Error).message;
    }
  },

  async signUp(email, password, company) {
    // no company name = an account that waits for an administrator to add it to an existing company
    try {
      accept(
        await request<AuthResponse>(
          `${BILLING}/auth/register`,
          { method: 'POST', body: JSON.stringify({ email, password, company: company ?? '' }) },
          false,
        ),
      );
      return {};
    } catch (error) {
      return { error: (error as Error).message };
    }
  },

  async signOut() {
    writeToken(null);
    notify(null);
  },
};

