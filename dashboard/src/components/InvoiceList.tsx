import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type InvoiceStatus } from '../api';
import { formatBrl } from '../money';

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  OPEN: 'Em aberto',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELED: 'Cancelada',
};

export function InvoiceList() {
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const queryClient = useQueryClient();
  const invoices = useQuery({
    queryKey: ['invoices', status],
    queryFn: () => api.invoices(status || undefined),
    refetchInterval: 5000,
  });
  const customers = useQuery({ queryKey: ['customers'], queryFn: api.customers });
  const names = new Map(customers.data?.map((customer) => [customer.id, customer.name]));

  // Totals change a moment later (the report service reacts to the Kafka event), so refresh them too.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['summary'] }), 1500);
  };
  const pay = useMutation({ mutationFn: api.pay, onSuccess: refresh });
  const cancel = useMutation({ mutationFn: api.cancel, onSuccess: refresh });
  const error = (pay.error ?? cancel.error) as Error | null;

  return (
    <section>
      <h2>Cobranças</h2>
      <label>
        Status{' '}
        <select value={status} onChange={(event) => setStatus(event.target.value as InvoiceStatus | '')}>
          <option value="">Todas</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error.message}</p>}
      {invoices.isError && <p className="error">Não foi possível carregar as cobranças (serviço de cobranças).</p>}
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
              <td>{names.get(invoice.customerId) ?? '—'}</td>
              <td>{invoice.description}</td>
              <td>{formatBrl(invoice.amountCents)}</td>
              <td>{invoice.dueDate.split('-').reverse().join('/')}</td>
              <td>
                <span className={`badge ${invoice.status}`}>{STATUS_LABEL[invoice.status]}</span>
              </td>
              <td>
                {(invoice.status === 'OPEN' || invoice.status === 'OVERDUE') && (
                  <>
                    <button onClick={() => pay.mutate(invoice.id)}>Marcar como paga</button>{' '}
                    <button className="secondary" onClick={() => cancel.mutate(invoice.id)}>
                      Cancelar
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {invoices.data?.length === 0 && <p>Nenhuma cobrança por aqui ainda.</p>}
    </section>
  );
}
