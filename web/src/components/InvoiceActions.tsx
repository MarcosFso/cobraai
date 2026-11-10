import { Check, MessageCircle, X } from 'lucide-react';
import { useInvoiceActions } from '../hooks';
import type { Invoice } from '../types';
import { collectionMessage, whatsappLink } from '../whatsapp';

/** WhatsApp / pay / cancel buttons for one invoice. Paid and canceled invoices have no actions. */
export function InvoiceActions({ invoice, showCancel = true }: { invoice: Invoice; showCancel?: boolean }) {
  const { pay, cancel, busy } = useInvoiceActions();
  if (invoice.status !== 'OPEN' && invoice.status !== 'OVERDUE') return null;

  const phone = invoice.customers?.phone;
  return (
    <div className="actions">
      {phone ? (
        <a
          className="icon-btn wa"
          href={whatsappLink(phone, collectionMessage(invoice, invoice.customers?.name ?? ''))}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Cobrar pelo WhatsApp"
          title="Cobrar pelo WhatsApp: abre a conversa com a mensagem pronta"
        >
          <MessageCircle size={17} />
        </a>
      ) : (
        <span className="icon-btn wa disabled" title="Cliente sem telefone cadastrado" aria-label="Cliente sem telefone">
          <MessageCircle size={17} />
        </span>
      )}
      <button className="icon-btn ok" aria-label="Marcar como paga" title="Marcar como paga" disabled={busy} onClick={() => pay.mutate(invoice.id)}>
        <Check size={17} />
      </button>
      {showCancel && (
        <button
          className="icon-btn danger"
          aria-label="Cancelar cobrança"
          title="Cancelar cobrança"
          disabled={busy}
          onClick={() => window.confirm('Cancelar esta cobrança?') && cancel.mutate(invoice.id)}
        >
          <X size={17} />
        </button>
      )}
    </div>
  );
}
