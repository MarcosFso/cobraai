import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { formatBrl } from '../money';

export function MonthlyChart() {
  const year = new Date().getFullYear();
  const { data } = useQuery({ queryKey: ['monthly', year], queryFn: () => api.monthly(year), refetchInterval: 5000 });
  if (!data) return null;

  const rows = data.map((item) => ({
    month: item.month.slice(5),
    Emitido: item.issuedCents / 100,
    Recebido: item.receivedCents / 100,
  }));

  return (
    <section>
      <h2>Recebimentos por mês ({year})</h2>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => formatBrl(Number(value) * 100)} width={90} />
            <Tooltip formatter={(value) => formatBrl(Number(value) * 100)} />
            <Legend />
            <Bar dataKey="Emitido" fill="#94a3b8" />
            <Bar dataKey="Recebido" fill="#16a34a" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
