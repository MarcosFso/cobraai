import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, FileText, LayoutDashboard, LogOut, Moon, ShieldCheck, Sun, Users } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api, auth } from './api';
import { CustomersPage } from './components/CustomersPage';
import { Dashboard } from './components/Dashboard';
import { InvoicesPage } from './components/InvoicesPage';
import { LoginScreen } from './components/LoginScreen';
import { CustomerModal, InvoiceModal } from './components/Modals';
import { NotificationsPage } from './components/NotificationsPage';
import { TeamPage } from './components/TeamPage';
import { WaitingScreen } from './components/WaitingScreen';
import { Avatar } from './components/ui';
import { DEMO_NOTE, isConfigured } from './supabase';
import { useTheme } from './theme';
import type { AuthSession } from './types';

const TABS: { id: string; label: string; icon: ReactNode }[] = [
  { id: 'dashboard', label: 'Painel', icon: <LayoutDashboard size={19} /> },
  { id: 'invoices', label: 'Cobranças', icon: <FileText size={19} /> },
  { id: 'customers', label: 'Clientes', icon: <Users size={19} /> },
  { id: 'notifications', label: 'Avisos', icon: <Bell size={19} /> },
  { id: 'team', label: 'Equipe', icon: <ShieldCheck size={19} /> },
];

export function App() {
  const [theme, toggleTheme] = useTheme(); // applies the saved or system theme as soon as the app starts
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined); // undefined = still loading

  useEffect(() => {
    if (!isConfigured) return;
    void auth.getSession().then(setSession);
    return auth.onChange(setSession);
  }, []);

  if (!isConfigured) {
    return (
      <main className="center">
        <div className="login-card">
          <h2>Configuração pendente</h2>
          <p>Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja <code>.env.example</code>).</p>
        </div>
      </main>
    );
  }
  if (session === undefined) return <main className="center"><div className="spinner" aria-label="Carregando" /></main>;
  if (!session) return <LoginScreen />;
  if (session.pending) return <WaitingScreen email={session.email} onSession={setSession} />;
  return <Workspace email={session.email} dark={theme === 'dark'} toggleTheme={toggleTheme} />;
}

function Workspace({ email, dark, toggleTheme }: { email: string; dark: boolean; toggleTheme: () => void }) {
  const [tab, setTab] = useState('dashboard');
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [customerModal, setCustomerModal] = useState(false);
  const queryClient = useQueryClient();
  const organization = useQuery({ queryKey: ['organization'], queryFn: api.organization });

  // Invoices past their due date become OVERDUE; the database also does it every night.
  useEffect(() => {
    void api.refreshOverdue().then((changed) => {
      if (changed > 0) void queryClient.invalidateQueries();
    });
  }, [queryClient]);

  const org = organization.data;
  const tabs = TABS.filter((item) => item.id !== 'team' || api.features.team);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="logo">₢</span> Cobranças</div>
        <nav aria-label="Seções">
          {tabs.map((item) => (
            <button key={item.id} className={`nav-item${tab === item.id ? ' active' : ''}`} onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-footer">
          <div className="org">
            <Avatar name={org?.name ?? '…'} size={38} />
            <div>
              <strong>{org?.name ?? '…'}</strong>
              <span title={email}>{org?.is_demo ? 'Demonstração' : email}</span>
            </div>
          </div>
          <div className="side-buttons">
            <button className="icon-btn light" onClick={toggleTheme} aria-label="Alternar tema claro e escuro" title="Alternar tema">
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="icon-btn light" onClick={() => void auth.signOut()} aria-label="Sair" title="Sair">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="content">
        {org?.is_demo && (
          <div className="banner">Modo demonstração: {DEMO_NOTE} Pode mexer à vontade.</div>
        )}
        <main>
          {tab === 'dashboard' && <Dashboard onNewInvoice={() => setInvoiceModal(true)} />}
          {tab === 'invoices' && <InvoicesPage onNewInvoice={() => setInvoiceModal(true)} />}
          {tab === 'customers' && <CustomersPage onNewCustomer={() => setCustomerModal(true)} />}
          {tab === 'notifications' && <NotificationsPage />}
          {tab === 'team' && <TeamPage isAdmin={org?.role === 'ADMIN'} isDemo={Boolean(org?.is_demo)} />}
        </main>
      </div>

      <InvoiceModal open={invoiceModal} onClose={() => setInvoiceModal(false)} onNeedCustomer={() => setCustomerModal(true)} />
      <CustomerModal open={customerModal} onClose={() => setCustomerModal(false)} />
    </div>
  );
}
