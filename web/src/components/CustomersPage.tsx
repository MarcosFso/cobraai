import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Plus, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api';
import { formatBrl, formatDocument, formatPhone } from '../format';
import { whatsappLink } from '../whatsapp';
import { RiskBadge, riskDetail } from './RiskPanel';
import { Avatar, EmptyState, Skeleton } from './ui';

export function CustomersPage({ onNewCustomer }: { onNewCustomer: () => void }) {
  const [search, setSearch] = useState('');
  const customers = useQuery({ queryKey: ['customers'], queryFn: api.customers });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: api.invoices });
  const risk = useQuery({ queryKey: ['risk'], queryFn: api.risk, enabled: api.features.risk, refetchInterval: 5000 });
  const riskOf = new Map((risk.data ?? []).map((r) => [r.customer_id, r]));

  // How much each customer still owes (open + overdue)
  const owed = new Map<string, number>();
  for (const invoice of invoices.data ?? []) {
    if (invoice.status === 'OPEN' || invoice.status === 'OVERDUE') {
      owed.set(invoice.customer_id, (owed.get(invoice.customer_id) ?? 0) + invoice.amount_cents);
    }
  }

  const term = search.trim().toLowerCase();
  const visible = (customers.data ?? []).filter((c) => !term || `${c.name} ${c.email} ${c.document}`.toLowerCase().includes(term));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clientes</h1>
          <p className="muted">Quem recebe as suas cobranças.</p>
        </div>
        <button className="btn primary" onClick={onNewCustomer}><Plus size={18} /> Novo cliente</button>
      </div>

      <div className="toolbar solo">
        <label className="search">
          <Search size={16} />
          <input type="search" placeholder="Buscar por nome, e-mail ou documento" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {customers.isLoading && <Skeleton height={160} />}
      {customers.data && visible.length === 0 && (
        <section className="panel">
          <EmptyState
            icon={<Users size={28} />}
            title={customers.data.length === 0 ? 'Nenhum cliente ainda' : 'Nenhum cliente encontrado'}
            hint={customers.data.length === 0 ? 'Cadastre o primeiro cliente para poder emitir cobranças.' : undefined}
            action={customers.data.length === 0 ? <button className="btn primary" onClick={onNewCustomer}>Cadastrar cliente</button> : undefined}
          />
        </section>
      )}

      <div className="cards-grid">
        {visible.map((customer) => {
          const pending = owed.get(customer.id) ?? 0;
          const customerRisk = riskOf.get(customer.id);
          return (
            <article key={customer.id} className="customer">
              <Avatar name={customer.name} size={44} />
              <div className="grow">
                <strong>{customer.name}</strong>
                <span className="muted">{formatDocument(customer.document)}</span>
                <span className="muted ellipsis">{customer.email}</span>
                {customer.phone && <span className="muted">{formatPhone(customer.phone)}</span>}
                {customerRisk && (
                  <span className="risk-line"><RiskBadge risk={customerRisk} /><span className="muted small">{riskDetail(customerRisk)}</span></span>
                )}
              </div>
              <div className="right">
                <span className="muted small">A receber</span>
                <strong className={pending > 0 ? '' : 'muted'}>{formatBrl(pending)}</strong>
                {customer.phone && (
                  <a className="icon-btn wa" href={whatsappLink(customer.phone, `Olá, ${customer.name.split(' ')[0]}! Tudo bem?`)} target="_blank" rel="noopener noreferrer" aria-label={`Conversar com ${customer.name} no WhatsApp`}>
                    <MessageCircle size={17} />
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
