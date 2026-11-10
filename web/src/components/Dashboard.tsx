import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Clock, Percent, Plus, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { dueLabel, formatBrl, greeting } from '../format';
import type { Invoice, InvoiceStatus, Summary } from '../types';
import { InvoiceActions } from './InvoiceActions';
import { ForecastPanel, RiskList } from './RiskPanel';
import { Avatar, EmptyState, Skeleton, STATUS_LABEL } from './ui';

interface Kpi {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone: 'green' | 'indigo' | 'rose' | 'amber';
}

export function SummaryCardsView({ summary, overdueCount = 0, openCount = 0 }: { summary: Summary; overdueCount?: number; openCount?: number }) {
  const cards: Kpi[] = [
    { label: 'Recebido no mês', value: formatBrl(summary.receivedCents), hint: `${formatBrl(summary.issuedCents)} emitidos no mês`, icon: <Wallet size={20} />, tone: 'green' },
    { label: 'Em aberto', value: formatBrl(summary.openCents), hint: `${openCount} ${openCount === 1 ? 'cobrança' : 'cobranças'} no prazo`, icon: <Clock size={20} />, tone: 'indigo' },
    { label: 'Atrasado', value: formatBrl(summary.overdueCents), hint: `${overdueCount} ${overdueCount === 1 ? 'cobrança vencida' : 'cobranças vencidas'}`, icon: <AlertTriangle size={20} />, tone: 'rose' },
    { label: 'Inadimplência', value: `${summary.delinquencyRate.toFixed(1).replace('.', ',')}%`, hint: 'atrasado sobre o total válido', icon: <Percent size={20} />, tone: 'amber' },
  ];
  return (
    <section className="kpis" aria-label="Totais">
      {cards.map((card) => (
        <article key={card.label} className={`kpi ${card.tone}`}>
          <div className="kpi-icon">{card.icon}</div>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <small>{card.hint}</small>
        </article>
      ))}
    </section>
  );
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const STATUS_COLOR: Record<InvoiceStatus, string> = { OPEN: '#6366f1', PAID: '#10b981', OVERDUE: '#f43f5e', CANCELED: '#94a3b8' };
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)', boxShadow: 'var(--shadow)' };

function MonthlyChart() {
  const year = new Date().getFullYear();
  // Totals are rebuilt from events (Kafka), so they can lag a few seconds behind an action: keep them fresh
  const { data } = useQuery({ queryKey: ['monthly', year], queryFn: () => api.monthly(year), refetchInterval: 5000 });
  const rows = (data ?? []).map((item, index) => ({ month: MONTHS[index], Emitido: item.issuedCents / 100, Recebido: item.receivedCents / 100 }));
  return (
    <section className="panel">
      <header><h2>Emitido e recebido por mês</h2><span className="muted">{year}</span></header>
      {!data ? <Skeleton height={260} /> : (
        <div className="chart">
          <ResponsiveContainer>
            <BarChart data={rows} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} stroke="var(--muted)" />
              <YAxis tickFormatter={(value) => `R$ ${Number(value) >= 1000 ? `${Math.round(Number(value) / 1000)} mil` : value}`} width={72} tickLine={false} axisLine={false} stroke="var(--muted)" />
              <Tooltip formatter={(value) => formatBrl(Number(value) * 100)} contentStyle={tooltipStyle} cursor={{ fill: 'var(--hover)' }} />
              <Legend iconType="circle" />
              <Bar dataKey="Emitido" fill="#a5b4fc" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              <Bar dataKey="Recebido" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function StatusDonut({ invoices }: { invoices: Invoice[] }) {
  const data = (Object.keys(STATUS_LABEL) as InvoiceStatus[])
    .map((status) => ({ status, name: STATUS_LABEL[status], value: invoices.filter((i) => i.status === status).length }))
    .filter((item) => item.value > 0);
  return (
    <section className="panel">
      <header><h2>Cobranças por status</h2></header>
      {data.length === 0 ? <p className="muted">Sem cobranças ainda.</p> : (
        <>
          <div className="donut">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={3} stroke="none" isAnimationActive={false}>
                  {data.map((item) => <Cell key={item.status} fill={STATUS_COLOR[item.status]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center"><strong>{invoices.length}</strong><span>cobranças</span></div>
          </div>
          <ul className="legend">
            {data.map((item) => (
              <li key={item.status}><i style={{ background: STATUS_COLOR[item.status] }} /> {item.name}<b>{item.value}</b></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function InvoiceList({ title, icon, invoices, empty }: { title: string; icon: ReactNode; invoices: Invoice[]; empty: string }) {
  return (
    <section className="panel">
      <header><h2>{title}</h2></header>
      {invoices.length === 0 ? (
        <EmptyState icon={icon} title={empty} />
      ) : (
        <ul className="rows">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Avatar name={invoice.customers?.name ?? '?'} />
              <div className="grow">
                <strong>{invoice.customers?.name ?? '—'}</strong>
                <span className="muted">{invoice.description}</span>
              </div>
              <div className="right">
                <strong>{formatBrl(invoice.amount_cents)}</strong>
                <span className={invoice.status === 'OVERDUE' ? 'late' : 'muted'}>{dueLabel(invoice.due_date)}</span>
              </div>
              <InvoiceActions invoice={invoice} showCancel={false} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Dashboard({ onNewInvoice }: { onNewInvoice: () => void }) {
  const summary = useQuery({ queryKey: ['summary'], queryFn: api.summary, refetchInterval: 5000 });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: api.invoices, refetchInterval: 15000 });
  const all = invoices.data ?? [];
  const open = all.filter((i) => i.status === 'OPEN').sort((a, b) => a.due_date.localeCompare(b.due_date));
  const overdue = all.filter((i) => i.status === 'OVERDUE').sort((a, b) => a.due_date.localeCompare(b.due_date));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting()}! 👋</h1>
          <p className="muted">Veja como estão as suas cobranças hoje.</p>
        </div>
        <button className="btn primary" onClick={onNewInvoice}><Plus size={18} /> Nova cobrança</button>
      </div>

      {summary.isLoading && <div className="kpis">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={132} />)}</div>}
      {summary.isError && <p className="error">Não foi possível carregar os totais.</p>}
      {summary.data && <SummaryCardsView summary={summary.data} overdueCount={overdue.length} openCount={open.length} />}

      <div className="grid-main">
        <MonthlyChart />
        <StatusDonut invoices={all} />
      </div>

      {api.features.risk && (
        <div className="grid-2">
          <ForecastPanel />
          <RiskList />
        </div>
      )}

      <div className="grid-2">
        <InvoiceList title="Próximos vencimentos" icon={<CalendarClock size={26} />} invoices={open.slice(0, 5)} empty="Nenhuma cobrança a vencer" />
        <InvoiceList title="Atrasadas" icon={<Wallet size={26} />} invoices={overdue.slice(0, 5)} empty="Tudo em dia, nenhuma atrasada" />
      </div>
    </>
  );
}
