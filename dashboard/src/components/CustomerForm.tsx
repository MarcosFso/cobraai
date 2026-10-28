import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';

export function CustomerForm() {
  const [form, setForm] = useState({ name: '', document: '', email: '' });
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: api.createCustomer,
    onSuccess: () => {
      setForm({ name: '', document: '', email: '' });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(form);
  };

  return (
    <form onSubmit={submit}>
      <h2>Novo cliente</h2>
      <label>
        Nome
        <input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label>
        CPF ou CNPJ
        <input required value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
      </label>
      <label>
        E-mail
        <input
          required
          type="email"
          maxLength={160}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </label>
      <button disabled={create.isPending}>Cadastrar</button>
      {create.isError && <p className="error">{(create.error as Error).message}</p>}
      {create.isSuccess && <p className="ok">Cliente cadastrado.</p>}
    </form>
  );
}
