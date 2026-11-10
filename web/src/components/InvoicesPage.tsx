import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, Repeat, Search } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api';
import { dueLabel, formatBrl, formatDate } from '../format';
import type { InvoiceStatus } from '../types';
import { InvoiceActions } from './InvoiceActions';
import { RecurringPanel } from './RecurringPanel';
import { Avatar, EmptyState, Skeleton, STATUS_LABEL, StatusBadge } from './ui';

export function InvoicesPage({ onNewInvoice }: { onNewInvoice: () => void }) {
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'invoices' | 'recurring'>('invoices');
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: api.invoices });
  const all = invoices.data ?? [];

  const term = search.trim().toLowerCase();
  const visible = all.filter(
    (invoice) =>
      (!status || invoice.status === status) &&
      (!term || `${invoice.customers?.name ?? ''} ${invoice.description}`.toLowerCase().includes(term)),
  );
  const count = (value: InvoiceStatus | '') => (value ? all.filter((i) => i.status === value).length : all.length);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cobranças</h1>
          <p className="muted">Emita, acompanhe e cobre os seus clientes.</p>
        </div>
        <button className="btn primary" onClick={onNewInvoice}><Plus size={18} /> Nova cobrança</button>
      </div>

      {api.features.recurring && (
        <div className="segmented view-switch" role="group" aria-label="Tipo de cobrança">
          <button className={view === 'invoices' ? 'active' : ''} aria-pressed={view === 'invoices'} onClick={() => setView('invoices')}>Todas as cobranças</button>
          <button className={view === 'recurring' ? 'active' : ''} aria-pressed={view === 'recurring'} onClick={() => setView('recurring')}><Repeat size={14} /> Mensais</button>
        </div>
      )}

      {view === 'recurring' ? <RecurringPanel onNewInvoice={onNewInvoice} /> : (
      <section className="panel">
        <div className="toolbar">
          <div className="chips" role="group" aria-label="Filtrar por status">
            {(['', 'OPEN', 'OVERDUE', 'PAID', 'CANCELED'] as const).map((value) => (
              <button key={value || 'all'} className={`chip${status === value ? ' active' : ''}`} onClick={() => setStatus(value)}>
                {value ? STATUS_LABEL[value] : 'Todas'} <b>{count(value)}</b>
              </button>
            ))}
          </div>
          <label className="search">
            <Search size={16} />
            <input type="search" placeholder="Buscar cliente ou descrição" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>

        {invoices.isError && <p className="error">Não foi possível carregar as cobranças.</p>}
        {invoices.isLoading && <Skeleton height={220} />}
        {invoices.data && visible.length === 0 && (
          <EmptyState
            icon={<FileText size={28} />}
            title={all.length === 0 ? 'Nenhuma cobrança ainda' : 'Nada encontrado com esse filtro'}
            hint={all.length === 0 ? 'Emita a primeira cobrança e acompanhe o pagamento por aqui.' : undefined}
            action={all.length === 0 ? <button className="btn primary" onClick={onNewInvoice}>Emitir cobrança</button> : undefined}
          />
        )}

        {visible.length > 0 && (
          <div className="table-wrap">
            <table className="responsive">
              <thead>
                <tr><th>Cliente</th><th>Valor</th><th>Vencimento</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {visible.map((invoice) => (
                  <tr key={invoice.id}>
                    <td data-label="Cliente">
                      <div className="who-cell">
                        <Avatar name={invoice.customers?.name ?? '?'} />
                        <div>
                          <strong>{invoice.customers?.name ?? '—'}</strong>
                          <span className="muted">{invoice.recurring && <Repeat size={12} aria-label="Cobrança mensal" />} {invoice.description}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Valor"><strong>{formatBrl(invoice.amount_cents)}</strong></td>
                    <td data-label="Vencimento">
                      {formatDate(invoice.due_date)}
                      {(invoice.status === 'OPEN' || invoice.status === 'OVERDUE') && (
                        <span className={invoice.status === 'OVERDUE' ? 'late small' : 'muted small'}> · {dueLabel(invoice.due_date)}</span>
                      )}
                    </td>
                    <td data-label="Status"><StatusBadge status={invoice.status} /></td>
                    <td><InvoiceActions invoice={invoice} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}
    </>
  );
}
