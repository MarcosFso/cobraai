import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { parseReaisToCents } from '../money';

const empty = { customerId: '', description: '', amount: '', dueDate: '' };

export function InvoiceForm() {
  const [form, setForm] = useState(empty);
  const [localError, setLocalError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const customers = useQuery({ queryKey: ['customers'], queryFn: api.customers });
  const create = useMutation({
    mutationFn: api.createInvoice,
    onSuccess: () => {
      setForm(empty);
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['summary'] }), 1500);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amountCents = parseReaisToCents(form.amount);
    if (amountCents === null) {
      setLocalError('Informe um valor maior que zero, por exemplo 1.500,00');
      return;
    }
    setLocalError(null);
    create.mutate({ customerId: form.customerId, description: form.description, amountCents, dueDate: form.dueDate });
  };

  return (
    <form onSubmit={submit}>
      <h2>Nova cobrança</h2>
      <label>
        Cliente
        <select required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
          <option value="">Selecione…</option>
          {customers.data?.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Descrição
        <input
          required
          maxLength={200}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <label>
        Valor (R$)
        <input required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      </label>
      <label>
        Vencimento
        <input required type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
      </label>
      <button disabled={create.isPending}>Emitir cobrança</button>
      {localError && <p className="error">{localError}</p>}
      {create.isError && <p className="error">{(create.error as Error).message}</p>}
      {create.isSuccess && <p className="ok">Cobrança emitida.</p>}
    </form>
  );
}
