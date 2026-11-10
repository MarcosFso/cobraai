import { supabase } from './supabase';

export type InvoiceStatus = 'OPEN' | 'PAID' | 'OVERDUE' | 'CANCELED';

export interface Organization {
  id: string;
  name: string;
  is_demo: boolean;
}

export interface Customer {
  id: string;
  name: string;
  document: string;
  email: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  customer_id: string;
  description: string;
  amount_cents: number;
  due_date: string;
  status: InvoiceStatus;
  paid_at: string | null;
  created_at: string;
  customers: { name: string } | null;
}

export interface Notification {
  id: string;
  to_email: string;
  subject: string;
  body: string;
  created_at: string;
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

/** Calls a database function. Its error messages are written in Portuguese for the user, so they are shown as they are. */
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export const api = {
  organization: async () =>
    unwrap(await supabase.from('organizations').select('id, name, is_demo').limit(1).maybeSingle<Organization>()),

  refreshOverdue: () => rpc<number>('refresh_overdue'),
  summary: () => rpc<Summary>('report_summary'),
  monthly: (year: number) => rpc<MonthlyTotal[]>('report_monthly', { p_year: year }),

  customers: async () =>
    unwrap(await supabase.from('customers').select('*').order('name').returns<Customer[]>()),
  createCustomer: (body: { name: string; document: string; email: string }) =>
    rpc<Customer>('create_customer', { p_name: body.name, p_document: body.document, p_email: body.email }),

  invoices: async (status?: InvoiceStatus) => {
    let query = supabase.from('invoices').select('*, customers(name)').order('due_date', { ascending: false });
    if (status) query = query.eq('status', status);
    return unwrap(await query.returns<Invoice[]>());
  },
  createInvoice: (body: { customerId: string; description: string; amountCents: number; dueDate: string }) =>
    rpc<Invoice>('create_invoice', {
      p_customer_id: body.customerId,
      p_description: body.description,
      p_amount_cents: body.amountCents,
      p_due_date: body.dueDate,
    }),
  pay: (id: string) => rpc<Invoice>('pay_invoice', { p_id: id }),
  cancel: (id: string) => rpc<Invoice>('cancel_invoice', { p_id: id }),

  notifications: async () =>
    unwrap(
      await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100).returns<Notification[]>(),
    ),
};
