import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Role } from '../types';
import { Avatar, EmptyState, Skeleton, useToast } from './ui';

const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Administrador', MEMBER: 'Funcionário' };

/** The people of the company. Anyone sees the list; only administrators add, promote or remove. */
export function TeamPage({ isAdmin, isDemo }: { isAdmin: boolean; isDemo: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [problem, setProblem] = useState<string | null>(null);
  const team = useQuery({ queryKey: ['team'], queryFn: api.team, enabled: !isDemo });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['team'] });

  const add = useMutation({
    mutationFn: () => api.addMember(email, role),
    onSuccess: () => {
      toast.success('Pessoa adicionada. Ela já pode entrar e ver os dados da empresa.');
      setEmail('');
      setProblem(null);
      void refresh();
    },
    onError: (error: Error) => setProblem(error.message),
  });
  const change = useMutation({
    mutationFn: ({ id, next }: { id: string; next: Role }) => api.changeRole(id, next),
    onSuccess: () => void refresh(),
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.removeMember(id),
    onSuccess: () => {
      toast.success('Pessoa removida. Ela perdeu o acesso agora.');
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isDemo) {
    return (
      <>
        <div className="page-head"><div><h1>Equipe</h1><p className="muted">As pessoas que usam a empresa.</p></div></div>
        <section className="panel">
          <EmptyState
            icon={<ShieldCheck size={28} />}
            title="A equipe não está disponível na demonstração"
            hint="Crie a conta da sua empresa para adicionar funcionários, que passam a ver as mesmas cobranças e clientes."
          />
        </section>
      </>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    add.mutate();
  };

  const members = team.data ?? [];
  return (
    <>
      <div className="page-head">
        <div><h1>Equipe</h1><p className="muted">Quem tem acesso aos dados da empresa.</p></div>
      </div>

      {isAdmin && (
        <section className="panel">
          <header><h3>Adicionar pessoa</h3></header>
          <ol className="steps muted small">
            <li>A pessoa cria uma conta em “Criar conta” → <b>Entrar numa empresa existente</b> (sem nome de empresa).</li>
            <li>Você digita o e-mail dela aqui. Pronto: ela passa a ver os lançamentos da empresa.</li>
          </ol>
          <form className="team-form" onSubmit={submit}>
            <label>E-mail da pessoa
              <input required type="email" maxLength={160} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="funcionario@empresa.com" />
            </label>
            <label>Permissão
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="MEMBER">Funcionário (vê e edita cobranças e clientes)</option>
                <option value="ADMIN">Administrador (também gerencia a equipe)</option>
              </select>
            </label>
            <button className="btn primary" disabled={add.isPending}><UserPlus size={16} /> {add.isPending ? 'Adicionando…' : 'Adicionar'}</button>
          </form>
          {problem && <p className="error" role="alert">{problem}</p>}
        </section>
      )}

      <section className="panel">
        <header><h3>Pessoas ({members.length})</h3></header>
        {team.isLoading && <Skeleton height={120} />}
        {team.isError && <p className="error">Não foi possível carregar a equipe.</p>}
        <ul className="team-list">
          {members.map((member) => (
            <li key={member.id}>
              <Avatar name={member.email} />
              <div className="grow">
                <strong>{member.email}{member.you && <span className="you">você</span>}</strong>
                <span className="muted small">{ROLE_LABEL[member.role]}</span>
              </div>
              {isAdmin && !member.you && (
                <div className="actions">
                  <button
                    className="btn ghost small-btn"
                    disabled={change.isPending}
                    onClick={() => change.mutate({ id: member.id, next: member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN' })}
                  >
                    {member.role === 'ADMIN' ? 'Tornar funcionário' : 'Tornar administrador'}
                  </button>
                  <button
                    className="icon-btn danger"
                    aria-label={`Remover ${member.email}`}
                    title="Remover da empresa"
                    disabled={remove.isPending}
                    onClick={() => window.confirm(`Remover ${member.email}? A pessoa perde o acesso agora.`) && remove.mutate(member.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
