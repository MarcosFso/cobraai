import { formatBrl, formatDate } from './format';
import type { Invoice } from './types';

/** A polite collection message; the tone changes when the invoice is already overdue. */
export function collectionMessage(invoice: Pick<Invoice, 'description' | 'amount_cents' | 'due_date' | 'status'>, customerName: string): string {
  const first = customerName.trim().split(/\s+/)[0] || 'tudo bem';
  const amount = formatBrl(invoice.amount_cents);
  const due = formatDate(invoice.due_date);
  if (invoice.status === 'OVERDUE') {
    return (
      `Olá, ${first}! Tudo bem? Aqui é do financeiro. Identificamos que a cobrança "${invoice.description}" ` +
      `no valor de ${amount}, que venceu em ${due}, ainda consta em aberto. Pode nos confirmar a previsão de pagamento? Obrigado!`
    );
  }
  return (
    `Olá, ${first}! Tudo bem? Passando para lembrar da cobrança "${invoice.description}" ` +
    `no valor de ${amount}, com vencimento em ${due}. Qualquer dúvida é só chamar. Obrigado!`
  );
}

/** "Click to chat" link: opens WhatsApp with the message ready, and the person only has to press send. Free, no API. */
export function whatsappLink(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}
