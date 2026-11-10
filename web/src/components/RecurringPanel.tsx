import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Repeat, StopCircle } from 'lucide-react';
import { api } from '../api';
import { formatBrl, formatDate } from '../format';
import { Avatar, EmptyState, Skeleton, useToast } from './ui';

/** The monthly charges: what repeats, for whom, and when the next invoice is due. */
export function RecurringPanel({ onNewInvoice }: { onNewInvoice: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['recurring'], queryFn: api.recurring });
  const stop = useMutation({
    mutationFn: (id: string) => api.stopRecurring(id),
    onSuccess: () => {
      toast.success('Cobrança mensal parada. As já emitidas continuam.');
      void queryClient.invalidateQueries({ queryKey: ['recurring'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = list.data ?? [];
  return (
    <section className="panel">
      <header>
        <h3>Cobranças mensais</h3>
        <button className="btn primary" onClick={onNewInvoice}><Plus size={16} /> Nova cobrança</button>
      </header>
      <p className="muted small">
        Mensalidades e honorários que se repetem. A cada mês a próxima cobrança é emitida sozinha, 5 dias antes do vencimento.
      </p>

      {list.isError && <p className="error">Não foi possível carregar as cobranças mensais.</p>}
      {list.isLoading && <Skeleton height={140} />}
      {list.data && rows.length === 0 && (
        <EmptyState
          icon={<Repeat size={28} />}
          title="Nenhuma cobrança mensal"
          hint="Ao criar uma cobrança, escolha “Todo mês” para ela se repetir sozinha."
          action={<button className="btn primary" onClick={onNewInvoice}>Criar cobrança mensal</button>}
        />
      )}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="responsive">
            <thead>
              <tr><th>Cliente</th><th>Valor</th><th>Todo dia</th><th>Próxima cobrança</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.active ? '' : 'inactive'}>
                  <td data-label="Cliente">
                    <div className="who-cell">
                      <Avatar name={row.customer_name ?? '?'} />
                      <div><strong>{row.customer_name ?? '—'}</strong><span className="muted">{row.description}</span></div>
                    </div>
                  </td>
                  <td data-label="Valor"><strong>{formatBrl(row.amount_cents)}</strong></td>
                  <td data-label="Todo dia">{row.day_of_month}</td>
                  <td data-label="Próxima">{row.active ? formatDate(row.next_due_date) : <span className="pill CANCELED"><i aria-hidden /> Parada</span>}</td>
                  <td>
                    {row.active && (
                      <button
                        className="btn ghost small-btn"
                        disabled={stop.isPending}
                        onClick={() => window.confirm('Parar esta cobrança mensal? As cobranças já emitidas continuam.') && stop.mutate(row.id)}
                      >
                        <StopCircle size={15} /> Parar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
