export type InvoiceStatus = 'OPEN' | 'PAID' | 'OVERDUE' | 'CANCELED';

export interface Organization {
  id: string;
  name: string;
  is_demo: boolean;
  /** ADMIN can manage the people of the company. Null where the back end has no teams. */
  role?: Role | null;
}

export type Role = 'ADMIN' | 'MEMBER';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'NO_DATA';

/** Default risk of one customer, from how late they paid before and what is overdue now (0 = safe, 100 = very risky). */
export interface CustomerRisk {
  customer_id: string;
  customer_name: string;
  score: number;
  level: RiskLevel;
  avg_delay_days: number;
  late_rate: number;
  /** Fewer than 3 payments so far: the score is only a hint. */
  limited_data: boolean;
  paid_count: number;
  overdue_count: number;
  oldest_overdue_days: number;
  unpaid_cents: number;
}

/** Cash for one month: what is due, what is expected given each customer's habits, and what already came in. */
export interface ForecastMonth {
  month: string;
  received_cents: number;
  nominal_cents: number;
  expected_cents: number;
}

export interface Member {
  id: string;
  email: string;
  role: Role;
  you: boolean;
}

/** A monthly charge: the next invoice is issued automatically a few days before its due date. */
export interface Recurring {
  id: string;
  customer_id: string;
  customer_name: string | null;
  description: string;
  amount_cents: number;
  day_of_month: number;
  next_due_date: string;
  active: boolean;
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
  /** Issued by a monthly charge. */
  recurring?: boolean;
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
  /** Which optional features this back end has (the Supabase version has neither teams nor monthly charges). */
  features: { team: boolean; recurring: boolean; risk: boolean };
  risk(): Promise<CustomerRisk[]>;
  forecast(): Promise<ForecastMonth[]>;
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

  /** Starts a monthly charge; resolves to its first invoice, issued right away. */
  createRecurring(body: NewInvoice): Promise<Invoice>;
  recurring(): Promise<Recurring[]>;
  stopRecurring(id: string): Promise<Recurring>;

  team(): Promise<Member[]>;
  addMember(email: string, role: Role): Promise<Member>;
  changeRole(id: string, role: Role): Promise<Member>;
  removeMember(id: string): Promise<void>;
}

export interface AuthSession {
  email: string;
  /** Account created without a company: waits for an administrator to add it. */
  pending?: boolean;
}

export interface Auth {
  getSession(): Promise<AuthSession | null>;
  onChange(callback: (session: AuthSession | null) => void): () => void;
  /** Resolves to an error message, or null on success. */
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, password: string, company: string | null): Promise<{ error?: string; needsConfirmation?: boolean }>;
  /** Asks the server for the current state (for example, after an administrator added this account to a company). */
  refresh?(): Promise<AuthSession | null>;
  signOut(): Promise<void>;
}
