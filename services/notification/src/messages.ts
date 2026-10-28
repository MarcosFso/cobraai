import type { InvoiceEvent } from './events.js';

export interface Message {
  subject: string;
  text: string;
}

/** amountCents is always an integer number of cents; only here it becomes "R$ 1.500,00". */
export function formatBrl(amountCents: number): string {
  return (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/** Returns null for event types that do not notify the customer. */
export function buildMessage(event: InvoiceEvent): Message | null {
  const amount = formatBrl(event.amountCents);
  const due = formatDate(event.dueDate);
  switch (event.type) {
    case 'invoice.created':
      return {
        subject: `Nova cobrança de ${amount}`,
        text: `Olá!\n\nFoi emitida uma cobrança de ${amount} com vencimento em ${due}.\n\nReferência: ${event.invoiceId}`,
      };
    case 'invoice.paid':
      return {
        subject: `Pagamento confirmado: ${amount}`,
        text: `Olá!\n\nRecebemos o pagamento de ${amount} (vencimento ${due}). Obrigado!\n\nReferência: ${event.invoiceId}`,
      };
    case 'invoice.overdue':
      return {
        subject: `Cobrança vencida: ${amount}`,
        text: `Olá!\n\nA cobrança de ${amount} venceu em ${due} e ainda está em aberto.\n\nReferência: ${event.invoiceId}`,
      };
    default:
      return null;
  }
}
