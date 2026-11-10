import { KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { auth } from '../api';
import { useToast } from './ui';

/** Current password + new password twice. Used on the forced screen and in "Minha senha" on the team page. */
export function PasswordForm({ currentLabel = 'Senha atual', onDone }: { currentLabel?: string; onDone?: () => void }) {
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const toast = useToast();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.next !== form.again) return setProblem('As duas senhas novas não são iguais.');
    if (form.next.length < 8) return setProblem('A senha nova precisa ter pelo menos 8 caracteres.');
    setBusy(true);
    setProblem(null);
    const failure = await auth.changePassword?.(form.current, form.next);
    setBusy(false);
    if (failure) return setProblem(failure);
    toast.success('Senha alterada');
    setForm({ current: '', next: '', again: '' });
    onDone?.();
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <label>{currentLabel}
        <input required type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
      </label>
      <label>Senha nova
        <input required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
      </label>
      <label>Repita a senha nova
        <input required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={form.again} onChange={(e) => setForm({ ...form, again: e.target.value })} />
      </label>
      {problem && <p className="error" role="alert">{problem}</p>}
      <button className="btn primary wide" disabled={busy}>{busy ? 'Salvando…' : 'Salvar senha nova'}</button>
    </form>
  );
}

/** Shown after login when an administrator reset the password: nothing else opens until a new one is chosen. */
export function ChangePasswordScreen({ email }: { email: string }) {
  return (
    <main className="center">
      <div className="login-card">
        <div className="notice-icon"><KeyRound size={26} /></div>
        <h2>Escolha uma nova senha</h2>
        <p className="notice" role="status">
          O administrador mudou a senha da conta <b>{email}</b>. Por segurança, escolha uma nova agora.
        </p>
        <PasswordForm currentLabel="Senha temporária (a que o administrador passou)" />
        <button className="btn ghost wide" onClick={() => void auth.signOut()}>Sair</button>
      </div>
    </main>
  );
}
