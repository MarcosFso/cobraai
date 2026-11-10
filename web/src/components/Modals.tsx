import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { isValidDocument, normalizePhone } from '../document';
import { formatPhone, parseReaisToCents, todayIso } from '../format';
import { Modal, useToast } from './ui';

export function CustomerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Novo cliente">
      <CustomerForm onDone={onClose} />
    </Modal>
  );
}

function CustomerForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: '', document: '', email: '', phone: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: api.createCustomer,
    onSuccess: () => {
      toast.success('Cliente cadastrado');
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      onDone();
    },
    onError: (error: Error) => setProblem(error.message),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!isValidDocument(form.document)) return setProblem('CPF/CNPJ inválido. Confira os números.');
    if (form.phone.trim() && !normalizePhone(form.phone)) return setProblem('Telefone inválido. Use o DDD e o número.');
    setProblem(null);
    create.mutate(form);
  };

  return (
    <form onSubmit={submit}>
      <label>
        Nome ou razão social
        <input required autoFocus maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <div className="two">
        <label>
          CPF ou CNPJ
          <input required inputMode="numeric" placeholder="000.000.000-00" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
        </label>
        <label>
          WhatsApp (opcional)
          <input inputMode="tel" placeholder="(11) 91234-5678" value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} />
        </label>
      </div>
      <label>
        E-mail
        <input required type="email" maxLength={160} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </label>
      {problem && <p className="error" role="alert">{problem}</p>}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onDone}>Cancelar</button>
        <button className="btn primary" disabled={create.isPending}>{create.isPending ? 'Salvando…' : 'Cadastrar cliente'}</button>
      </div>
    </form>
  );
}

export function InvoiceModal({ open, onClose, onNeedCustomer }: { open: boolean; onClose: () => void; onNeedCustomer?: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Nova cobrança">
      <InvoiceForm onDone={onClose} onNeedCustomer={onNeedCustomer} />
    </Modal>
  );
}

function InvoiceForm({ onDone, onNeedCustomer }: { onDone: () => void; onNeedCustomer?: () => void }) {
  const [form, setForm] = useState({ customerId: '', description: '', amount: '', dueDate: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const customers = useQuery({ queryKey: ['customers'], queryFn: api.customers });
  const create = useMutation({
    mutationFn: api.createInvoice,
    onSuccess: () => {
      toast.success('Cobrança emitida. O aviso ao cliente está na aba Avisos.');
      void queryClient.invalidateQueries();
      onDone();
    },
    onError: (error: Error) => setProblem(error.message),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amountCents = parseReaisToCents(form.amount);
    if (amountCents === null) return setProblem('Informe um valor maior que zero, por exemplo 1.500,00');
    setProblem(null);
    create.mutate({ customerId: form.customerId, description: form.description, amountCents, dueDate: form.dueDate });
  };

  if (customers.data?.length === 0) {
    return (
      <div className="empty-form">
        <p>Para emitir uma cobrança, cadastre primeiro um cliente.</p>
        <button className="btn primary" onClick={() => { onDone(); onNeedCustomer?.(); }}>Cadastrar cliente</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <label>
        Cliente
        <select required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
          <option value="">Selecione…</option>
          {customers.data?.map((customer) => (
            <option key={customer.id} value={customer.id}>{customer.name}</option>
          ))}
        </select>
      </label>
      <label>
        Descrição
        <input required maxLength={200} placeholder="Honorários de novembro" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>
      <div className="two">
        <label>
          Valor (R$)
          <input required inputMode="decimal" placeholder="1.500,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </label>
        <label>
          Vencimento
          <input required type="date" min={todayIso()} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </label>
      </div>
      {problem && <p className="error" role="alert">{problem}</p>}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onDone}>Cancelar</button>
        <button className="btn primary" disabled={create.isPending}>{create.isPending ? 'Emitindo…' : 'Emitir cobrança'}</button>
      </div>
    </form>
  );
}
