import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { formatDateTime } from '../format';

export function NotificationsPage() {
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: api.notifications, refetchInterval: 10000 });
  return (
    <>
      <h1>Avisos aos clientes</h1>
      <p className="muted">
        Cada cobrança criada, paga ou vencida gera um aviso. Nesta versão online os e-mails são simulados: ficam
        registrados aqui e nenhuma mensagem real é enviada.
      </p>
      <section className="card">
        {notifications.data?.length === 0 && <p className="muted">Nenhum aviso ainda. Emita uma cobrança para ver o primeiro.</p>}
        <ul className="mails">
          {notifications.data?.map((mail) => (
            <li key={mail.id}>
              <div className="row">
                <strong>{mail.subject}</strong>
                <span className="muted small">{formatDateTime(mail.created_at)}</span>
              </div>
              <div className="muted small">Para: {mail.to_email}</div>
              <p>{mail.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
