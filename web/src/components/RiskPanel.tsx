import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { formatBrl } from '../format';
import { LEVEL_LABEL } from '../risk';
import type { CustomerRisk } from '../types';
import { Avatar, EmptyState, Skeleton } from './ui';

const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthName = (key: string) => MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? key;
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)', boxShadow: 'var(--shadow)' };

/** "costuma pagar 9 dias depois", "1 em atraso há 12 dias"... in plain words. */
export function riskDetail(risk: CustomerRisk, compact = false): string {
  const parts: string[] = [];
  if (risk.paid_count > 0) {
    const days = Math.round(risk.avg_delay_days);
    parts.push(days >= 1 ? `costuma pagar ${days} ${days === 1 ? 'dia' : 'dias'} depois` : 'costuma pagar em dia');
  }
  if (risk.overdue_count > 0) {
    parts.push(compact ? `${risk.overdue_count} em atraso` : `${risk.overdue_count} em atraso (a mais antiga há ${risk.oldest_overdue_days} ${risk.oldest_overdue_days === 1 ? 'dia' : 'dias'})`);
  }
  if (!compact && risk.level !== 'NO_DATA' && risk.limited_data) parts.push('poucos pagamentos até agora');
  return parts.join(' · ') || 'Ainda sem pagamentos para avaliar';
}

export function RiskBadge({ risk }: { risk: CustomerRisk }) {
  return (
    <span className={`risk ${risk.level}`} title={risk.level === 'NO_DATA' ? riskDetail(risk) : `Pontuação ${risk.score} de 100. ${riskDetail(risk)}`}>
      <i aria-hidden /> {LEVEL_LABEL[risk.level]}
    </span>
  );
}

/** Cash expected over the next months, weighing each unpaid invoice by how its customer usually pays. */
export function ForecastPanel() {
  const { data } = useQuery({ queryKey: ['forecast'], queryFn: api.forecast, refetchInterval: 5000 });
  const current = data?.[0];
  const rows = (data ?? []).map((m) => ({
    month: monthName(m.month).slice(0, 3),
    Recebido: m.received_cents / 100,
    'Previsto': m.expected_cents / 100,
    'Se todos pagassem em dia': m.nominal_cents / 100,
  }));
  return (
    <section className="panel">
      <header><h2>Previsão de caixa</h2></header>
      {!current ? <Skeleton height={230} /> : (
        <>
          <p className="forecast-lead">
            Em {monthName(current.month)} você deve ter em caixa cerca de{' '}
            <strong>{formatBrl(current.received_cents + current.expected_cents)}</strong>
            <span className="muted"> ({formatBrl(current.received_cents)} já recebidos + {formatBrl(current.expected_cents)} previstos)</span>
          </p>
          <div className="chart small-chart">
            <ResponsiveContainer>
              <BarChart data={rows} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} stroke="var(--muted)" />
                <YAxis tickFormatter={(value) => `R$ ${Number(value) >= 1000 ? `${Math.round(Number(value) / 1000)} mil` : value}`} width={72} tickLine={false} axisLine={false} stroke="var(--muted)" />
                <Tooltip formatter={(value) => formatBrl(Number(value) * 100)} contentStyle={tooltipStyle} cursor={{ fill: 'var(--hover)' }} />
                <Legend iconType="circle" />
                <Bar dataKey="Recebido" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                <Bar dataKey="Previsto" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                <Bar dataKey="Se todos pagassem em dia" fill="#cbd5e1" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="muted small">
            Cada cobrança em aberto entra com o peso da chance de ser paga, e na data em que aquele cliente costuma pagar. É uma estimativa, não uma promessa.
          </p>
        </>
      )}
    </section>
  );
}

/** The customers most likely to pay late, so the user knows who to talk to first. */
export function RiskList() {
  const { data } = useQuery({ queryKey: ['risk'], queryFn: api.risk, refetchInterval: 5000 });
  const top = (data ?? []).filter((r) => r.level === 'HIGH' || r.level === 'MEDIUM').slice(0, 5);
  return (
    <section className="panel">
      <header><h2>Clientes que merecem atenção</h2></header>
      {!data ? <Skeleton height={160} /> : top.length === 0 ? (
        <EmptyState icon={<TrendingUp size={26} />} title="Nenhum cliente com risco médio ou alto" />
      ) : (
        <ul className="rows risk-rows">
          {top.map((risk) => (
            <li key={risk.customer_id}>
              <Avatar name={risk.customer_name} />
              <div className="grow">
                <strong>{risk.customer_name}</strong>
                <span className="muted">{riskDetail(risk, true)}</span>
              </div>
              <div className="right">
                <RiskBadge risk={risk} />
                <span className="muted small">{formatBrl(risk.unpaid_cents)} a receber</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small risk-note"><ShieldAlert size={13} /> A pontuação vem do histórico de pagamentos de cada cliente.</p>
    </section>
  );
}
