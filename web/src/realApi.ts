import { supabase } from './supabase';
import type { Api, Auth, Customer, Invoice, MonthlyTotal, Notification, Organization, Summary } from './types';

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

export const realApi: Api = {
  organization: async () =>
    unwrap(await supabase.from('organizations').select('id, name, is_demo').limit(1).maybeSingle<Organization>()),

  refreshOverdue: () => rpc<number>('refresh_overdue'),
  summary: () => rpc<Summary>('report_summary'),
  monthly: (year) => rpc<MonthlyTotal[]>('report_monthly', { p_year: year }),

  customers: async () => unwrap(await supabase.from('customers').select('*').order('name').returns<Customer[]>()),
  createCustomer: (body) =>
    rpc<Customer>('create_customer', {
      p_name: body.name,
      p_document: body.document,
      p_email: body.email,
      p_phone: body.phone || null,
    }),

  invoices: async () =>
    unwrap(
      await supabase
        .from('invoices')
        .select('*, customers(name, phone)')
        .order('due_date', { ascending: false })
        .limit(1000)
        .returns<Invoice[]>(),
    ),
  createInvoice: (body) =>
    rpc<Invoice>('create_invoice', {
      p_customer_id: body.customerId,
      p_description: body.description,
      p_amount_cents: body.amountCents,
      p_due_date: body.dueDate,
    }),
  pay: (id) => rpc<Invoice>('pay_invoice', { p_id: id }),
  cancel: (id) => rpc<Invoice>('cancel_invoice', { p_id: id }),

  notifications: async () =>
    unwrap(
      await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100).returns<Notification[]>(),
    ),
};

export const realAuth: Auth = {
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session ? { email: data.session.user.email ?? '' } : null;
  },
  onChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      callback(session ? { email: session.user.email ?? '' } : null),
    );
    return () => data.subscription.unsubscribe();
  },
  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return null;
    return error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message;
  },
  async signUp(email, password, company) {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { company } } });
    if (error) return { error: error.message };
    return { needsConfirmation: !data.session };
  },
  async signOut() {
    await supabase.auth.signOut();
  },
};
