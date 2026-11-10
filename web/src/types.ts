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
  phone: string | null;
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
  customers: { name: string; phone: string | null } | null;
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

export interface NewCustomer {
  name: string;
  document: string;
  email: string;
  phone: string;
}

export interface NewInvoice {
  customerId: string;
  description: string;
  amountCents: number;
  dueDate: string;
}

/** Everything the screens need from the back end. The real one talks to Supabase; the mock one is for previews. */
export interface Api {
  organization(): Promise<Organization | null>;
  refreshOverdue(): Promise<number>;
  summary(): Promise<Summary>;
  monthly(year: number): Promise<MonthlyTotal[]>;
  customers(): Promise<Customer[]>;
  createCustomer(body: NewCustomer): Promise<Customer>;
  invoices(): Promise<Invoice[]>;
  createInvoice(body: NewInvoice): Promise<Invoice>;
  pay(id: string): Promise<Invoice>;
  cancel(id: string): Promise<Invoice>;
  notifications(): Promise<Notification[]>;
}

export interface AuthSession {
  email: string;
}

export interface Auth {
  getSession(): Promise<AuthSession | null>;
  onChange(callback: (session: AuthSession | null) => void): () => void;
  /** Resolves to an error message, or null on success. */
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, password: string, company: string): Promise<{ error?: string; needsConfirmation?: boolean }>;
  signOut(): Promise<void>;
}
