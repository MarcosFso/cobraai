import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { api } from './api';
import { CustomersPage } from './components/CustomersPage';
import { Dashboard } from './components/Dashboard';
import { InvoicesPage } from './components/InvoicesPage';
import { LoginScreen } from './components/LoginScreen';
import { NotificationsPage } from './components/NotificationsPage';
import { isConfigured, supabase } from './supabase';

const TABS = [
  { id: 'dashboard', label: 'Painel' },
  { id: 'invoices', label: 'Cobranças' },
  { id: 'customers', label: 'Clientes' },
  { id: 'notifications', label: 'Avisos' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = still loading

  useEffect(() => {
    if (!isConfigured) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <main className="center">
        <div className="card narrow">
          <h1>Configuração pendente</h1>
          <p>
            Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja <code>.env.example</code>).
          </p>
        </div>
      </main>
    );
  }
  if (session === undefined) return <main className="center">Carregando…</main>;
  if (!session) return <LoginScreen />;
  return <Workspace email={session.user.email ?? ''} />;
}

function Workspace({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const queryClient = useQueryClient();
  const organization = useQuery({ queryKey: ['organization'], queryFn: api.organization });

  // Invoices past their due date become OVERDUE; the database also does it every night.
  useEffect(() => {
    void api.refreshOverdue().then((changed) => {
      if (changed > 0) void queryClient.invalidateQueries();
    });
  }, [queryClient]);

  const org = organization.data;
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="logo">₢</span> Cobranças
        </div>
        <nav aria-label="Seções">
          {TABS.map((item) => (
            <button key={item.id} className={`tab${tab === item.id ? ' active' : ''}`} onClick={() => setTab(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="who">
          <span title={email}>{org?.name ?? '…'}</span>
          <button className="ghost" onClick={() => void supabase.auth.signOut()}>
            Sair
          </button>
        </div>
      </header>
      {org?.is_demo && (
        <div className="banner">
          Modo demonstração: os dados são fictícios e restaurados toda madrugada. Pode mexer à vontade.
        </div>
      )}
      <main>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'invoices' && <InvoicesPage />}
        {tab === 'customers' && <CustomersPage />}
        {tab === 'notifications' && <NotificationsPage />}
      </main>
    </>
  );
}
