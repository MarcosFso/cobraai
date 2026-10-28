import { useQuery } from '@tanstack/react-query';
import { api, type Summary } from '../api';
import { formatBrl } from '../money';

export function SummaryCardsView({ summary }: { summary: Summary }) {
  const cards = [
    { label: 'Recebido no mês', value: formatBrl(summary.receivedCents) },
    { label: 'Em aberto', value: formatBrl(summary.openCents) },
    { label: 'Atrasado', value: formatBrl(summary.overdueCents), alert: summary.overdueCents > 0 },
    { label: 'Inadimplência', value: `${summary.delinquencyRate.toFixed(1).replace('.', ',')}%` },
  ];
  return (
    <section className="cards" aria-label="Totais">
      {cards.map((card) => (
        <div key={card.label} className={`card${card.alert ? ' alert' : ''}`}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </section>
  );
}

export function SummaryCards() {
  const { data, isLoading, error } = useQuery({ queryKey: ['summary'], queryFn: api.summary, refetchInterval: 5000 });
  if (isLoading) return <p>Carregando totais…</p>;
  if (error || !data) return <p className="error">Não foi possível carregar os totais (serviço de relatórios).</p>;
  return <SummaryCardsView summary={data} />;
}
