import { useQuery } from '@tanstack/react-query';
import { Bell, Info, Mail } from 'lucide-react';
import { api } from '../api';
import { formatDateTime } from '../format';
import { EmptyState, Skeleton } from './ui';

export function NotificationsPage() {
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: api.notifications, refetchInterval: 10000 });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Avisos aos clientes</h1>
          <p className="muted">Cada cobrança criada, paga ou vencida gera um aviso por e-mail.</p>
        </div>
      </div>
      <div className="note">
        <Info size={18} />
        <span>
          Nesta versão online os e-mails são <b>simulados</b>: ficam registrados aqui e nenhuma mensagem real é enviada. Para
          cobrar de verdade, use o botão de WhatsApp nas cobranças: ele abre a conversa com a mensagem pronta.
        </span>
      </div>

      <section className="panel">
        {notifications.isLoading && <Skeleton height={180} />}
        {notifications.data?.length === 0 && (
          <EmptyState icon={<Bell size={28} />} title="Nenhum aviso ainda" hint="Emita uma cobrança para ver o primeiro aviso." />
        )}
        <ul className="timeline">
          {notifications.data?.map((mail) => (
            <li key={mail.id}>
              <div className="timeline-icon"><Mail size={16} /></div>
              <div className="grow">
                <div className="row-between">
                  <strong>{mail.subject}</strong>
                  <span className="muted small">{formatDateTime(mail.created_at)}</span>
                </div>
                <span className="muted small">Para: {mail.to_email}</span>
                <p>{mail.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
