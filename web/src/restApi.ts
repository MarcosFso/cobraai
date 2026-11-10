import { DEMO_EMAIL } from './supabase';
import type { Api, Auth, AuthSession, Customer, Invoice, MonthlyTotal, Notification, Summary } from './types';

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
  return response.json() as Promise<T>;
}

interface AuthResponse {
  token: string;
  email: string;
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
  organization: async () => {
    const me = await request<{ company: string; demo: boolean }>(`${BILLING}/auth/me`);
    return { id: 'current', name: me.company, is_demo: me.demo };
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

  notifications: async () =>
    (await request<NotificationRow[]>(`${NOTIFY}/notifications`)).map(
      (row): Notification => ({ id: row.id, to_email: row.to, subject: row.subject, body: row.body, created_at: row.createdAt }),
    ),
};

function accept(result: AuthResponse): null {
  writeToken(result.token);
  notify({ email: result.email });
  return null;
}

export const restAuth: Auth = {
  async getSession() {
    if (!readToken()) return null;
    try {
      const me = await request<{ email: string }>(`${BILLING}/auth/me`);
      return { email: me.email };
    } catch {
      writeToken(null);
      return null;
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
    try {
      accept(
        await request<AuthResponse>(
          `${BILLING}/auth/register`,
          { method: 'POST', body: JSON.stringify({ email, password, company }) },
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

