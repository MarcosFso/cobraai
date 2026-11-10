import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type Summary } from '../api';
import { formatBrl, formatDate } from '../format';

export function SummaryCardsView({ summary }: { summary: Summary }) {
  const cards = [
    { label: 'Recebido no mês', value: formatBrl(summary.receivedCents), tone: 'good' },
    { label: 'Emitido no mês', value: formatBrl(summary.issuedCents) },
    { label: 'Em aberto', value: formatBrl(summary.openCents) },
    { label: 'Atrasado', value: formatBrl(summary.overdueCents), tone: summary.overdueCents > 0 ? 'bad' : undefined },
    { label: 'Inadimplência', value: `${summary.delinquencyRate.toFixed(1).replace('.', ',')}%` },
  ];
  return (
    <section className="cards" aria-label="Totais">
      {cards.map((card) => (
        <div key={card.label} className={`stat ${card.tone ?? ''}`}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </section>
  );
}

function SummaryCards() {
  const { data, isLoading, error } = useQuery({ queryKey: ['summary'], queryFn: api.summary });
  if (isLoading) return <p className="muted">Carregando totais…</p>;
  if (error || !data) return <p className="error">Não foi possível carregar os totais.</p>;
  return <SummaryCardsView summary={data} />;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function MonthlyChart() {
  const year = new Date().getFullYear();
  const { data } = useQuery({ queryKey: ['monthly', year], queryFn: () => api.monthly(year) });
  if (!data) return null;
  const rows = data.map((item, index) => ({
    month: MONTHS[index],
    Emitido: item.issuedCents / 100,
    Recebido: item.receivedCents / 100,
  }));
  return (
    <section className="card">
      <h2>Emitido e recebido por mês ({year})</h2>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => formatBrl(Number(value) * 100)} width={96} />
            <Tooltip formatter={(value) => formatBrl(Number(value) * 100)} />
            <Legend />
            <Bar dataKey="Emitido" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Recebido" fill="#16a34a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function OverdueList() {
  const queryClient = useQueryClient();
  const overdue = useQuery({ queryKey: ['invoices', 'OVERDUE'], queryFn: () => api.invoices('OVERDUE') });
  const pay = useMutation({
    mutationFn: api.pay,
    onSuccess: () => void queryClient.invalidateQueries(),
  });
  if (!overdue.data?.length) return null;
  return (
    <section className="card">
      <h2>Cobranças atrasadas</h2>
      {pay.isError && <p className="error">{(pay.error as Error).message}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Venceu em</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {overdue.data.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.customers?.name ?? '—'}</td>
                <td>{invoice.description}</td>
                <td>{formatBrl(invoice.amount_cents)}</td>
                <td>{formatDate(invoice.due_date)}</td>
                <td>
                  <button onClick={() => pay.mutate(invoice.id)} disabled={pay.isPending}>
                    Marcar como paga
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Dashboard() {
  return (
    <>
      <h1>Painel</h1>
      <SummaryCards />
      <MonthlyChart />
      <OverdueList />
    </>
  );
}
