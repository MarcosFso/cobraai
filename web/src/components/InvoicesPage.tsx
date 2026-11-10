import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, type InvoiceStatus } from '../api';
import { formatBrl, formatDate, parseReaisToCents, todayIso } from '../format';

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  OPEN: 'Em aberto',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELED: 'Cancelada',
};

const empty = { customerId: '', description: '', amount: '', dueDate: '' };

function InvoiceForm() {
  const [form, setForm] = useState(empty);
  const [localError, setLocalError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const customers = useQuery({ queryKey: ['customers'], queryFn: api.customers });
  const create = useMutation({
    mutationFn: api.createInvoice,
    onSuccess: () => {
      setForm(empty);
      void queryClient.invalidateQueries();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amountCents = parseReaisToCents(form.amount);
    if (amountCents === null) {
      setLocalError('Informe um valor maior que zero, por exemplo 1.500,00');
      return;
    }
    setLocalError(null);
    create.mutate({ customerId: form.customerId, description: form.description, amountCents, dueDate: form.dueDate });
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Nova cobrança</h2>
      {customers.data?.length === 0 && <p className="muted">Cadastre um cliente primeiro, na aba Clientes.</p>}
      <div className="grid">
        <label>
          Cliente
          <select required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
            <option value="">Selecione…</option>
            {customers.data?.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Descrição
          <input required maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label>
          Valor (R$)
          <input required inputMode="decimal" placeholder="1.500,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </label>
        <label>
          Vencimento
          <input required type="date" min={todayIso()} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </label>
      </div>
      <button className="primary" disabled={create.isPending}>
        Emitir cobrança
      </button>
      {localError && <p className="error">{localError}</p>}
      {create.isError && <p className="error">{(create.error as Error).message}</p>}
      {create.isSuccess && <p className="ok">Cobrança emitida. O aviso ao cliente aparece na aba Avisos.</p>}
    </form>
  );
}

export function InvoicesPage() {
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const queryClient = useQueryClient();
  const invoices = useQuery({ queryKey: ['invoices', status], queryFn: () => api.invoices(status || undefined) });
  const done = () => void queryClient.invalidateQueries();
  const pay = useMutation({ mutationFn: api.pay, onSuccess: done });
  const cancel = useMutation({ mutationFn: api.cancel, onSuccess: done });
  const error = (pay.error ?? cancel.error) as Error | null;

  return (
    <>
      <h1>Cobranças</h1>
      <InvoiceForm />
      <section className="card">
        <div className="row">
          <h2>Lista</h2>
          <label className="inline">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus | '')}>
              <option value="">Todas</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="error">{error.message}</p>}
        {invoices.isError && <p className="error">Não foi possível carregar as cobranças.</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.data?.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.customers?.name ?? '—'}</td>
                  <td>{invoice.description}</td>
                  <td>{formatBrl(invoice.amount_cents)}</td>
                  <td>{formatDate(invoice.due_date)}</td>
                  <td>
                    <span className={`badge ${invoice.status}`}>{STATUS_LABEL[invoice.status]}</span>
                  </td>
                  <td className="actions">
                    {(invoice.status === 'OPEN' || invoice.status === 'OVERDUE') && (
                      <>
                        <button onClick={() => pay.mutate(invoice.id)} disabled={pay.isPending || cancel.isPending}>
                          Marcar como paga
                        </button>
                        <button className="ghost" onClick={() => cancel.mutate(invoice.id)} disabled={pay.isPending || cancel.isPending}>
                          Cancelar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {invoices.data?.length === 0 && <p className="muted">Nenhuma cobrança por aqui ainda.</p>}
      </section>
    </>
  );
}
