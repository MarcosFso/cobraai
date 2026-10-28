const BILLING = import.meta.env.VITE_BILLING_URL ?? 'http://localhost:8080';
const REPORT = import.meta.env.VITE_REPORT_URL ?? 'http://localhost:8000';

export type InvoiceStatus = 'OPEN' | 'PAID' | 'OVERDUE' | 'CANCELED';

export interface Customer {
  id: string;
  name: string;
  document: string;
  email: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  description: string;
  amountCents: number;
  dueDate: string;
  status: InvoiceStatus;
  paidAt: string | null;
}

export interface Summary {
  month: string;
  issuedCents: number;
  receivedCents: number;
  openCents: number;
  overdueCents: number;
  delinquencyRate: number;
}

export interface MonthlyTotal {
  month: string;
  issuedCents: number;
  receivedCents: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': crypto.randomUUID(), ...init?.headers },
  });
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

export const api = {
  customers: () => request<Customer[]>(`${BILLING}/customers`),
  createCustomer: (body: { name: string; document: string; email: string }) =>
    request<Customer>(`${BILLING}/customers`, { method: 'POST', body: JSON.stringify(body) }),
  invoices: (status?: InvoiceStatus) =>
    request<Invoice[]>(`${BILLING}/invoices${status ? `?status=${status}` : ''}`),
  createInvoice: (body: { customerId: string; description: string; amountCents: number; dueDate: string }) =>
    request<Invoice>(`${BILLING}/invoices`, { method: 'POST', body: JSON.stringify(body) }),
  pay: (id: string) => request<Invoice>(`${BILLING}/invoices/${id}/pay`, { method: 'POST' }),
  cancel: (id: string) => request<Invoice>(`${BILLING}/invoices/${id}/cancel`, { method: 'POST' }),
  summary: () => request<Summary>(`${REPORT}/reports/summary`),
  monthly: (year: number) => request<MonthlyTotal[]>(`${REPORT}/reports/monthly?year=${year}`),
};
