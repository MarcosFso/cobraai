import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { formatDocument } from '../format';

export function CustomersPage() {
  const [form, setForm] = useState({ name: '', document: '', email: '' });
  const queryClient = useQueryClient();
  const customers = useQuery({ queryKey: ['customers'], queryFn: api.customers });
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
    <>
      <h1>Clientes</h1>
      <form className="card" onSubmit={submit}>
        <h2>Novo cliente</h2>
        <div className="grid">
          <label>
            Nome
            <input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            CPF ou CNPJ
            <input required inputMode="numeric" placeholder="529.982.247-25" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
          </label>
          <label>
            E-mail
            <input required type="email" maxLength={160} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
        </div>
        <button className="primary" disabled={create.isPending}>
          Cadastrar
        </button>
        {create.isError && <p className="error">{(create.error as Error).message}</p>}
        {create.isSuccess && <p className="ok">Cliente cadastrado.</p>}
      </form>

      <section className="card">
        <h2>Lista</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF/CNPJ</th>
                <th>E-mail</th>
              </tr>
            </thead>
            <tbody>
              {customers.data?.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.name}</td>
                  <td>{formatDocument(customer.document)}</td>
                  <td>{customer.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {customers.data?.length === 0 && <p className="muted">Nenhum cliente ainda.</p>}
      </section>
    </>
  );
}
