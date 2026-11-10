import { useState, type FormEvent } from 'react';
import { DEMO_EMAIL, DEMO_PASSWORD, supabase } from '../supabase';

type Mode = 'login' | 'signup';

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({ email: '', password: '', company: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const signIn = async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase.auth.signInWithPassword({ email, password });
    if (failure) setError(failure.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : failure.message);
    setBusy(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'login') return signIn(form.email, form.password);

    setBusy(true);
    setError(null);
    const { data, error: failure } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { company: form.company } },
    });
    setBusy(false);
    if (failure) return setError(failure.message);
    if (!data.session) setNotice('Conta criada! Confirme o e-mail que enviamos para entrar.');
  };

  return (
    <main className="center">
      <div className="card narrow">
        <h1>Plataforma de Cobranças</h1>
        <p className="muted">Emita cobranças, acompanhe pagamentos e avise seus clientes.</p>

        <button className="primary wide" disabled={busy} onClick={() => void signIn(DEMO_EMAIL, DEMO_PASSWORD)}>
          Entrar como visitante (demonstração)
        </button>
        <p className="muted small">Dados fictícios e restaurados toda madrugada. Não precisa de cadastro.</p>

        <div className="divider">ou use a sua empresa</div>

        <div className="segmented" role="tablist">
          <button role="tab" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Entrar
          </button>
          <button role="tab" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            Criar conta
          </button>
        </div>

        <form onSubmit={(event) => void submit(event)}>
          {mode === 'signup' && (
            <label>
              Nome da empresa
              <input required maxLength={120} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </label>
          )}
          <label>
            E-mail
            <input required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>
            Senha
            <input
              required
              type="password"
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <button className="primary wide" disabled={busy}>
            {mode === 'login' ? 'Entrar' : 'Criar conta da empresa'}
          </button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="ok">{notice}</p>}
        {mode === 'signup' && <p className="muted small">Cada empresa tem os seus próprios dados, invisíveis para as outras.</p>}
      </div>
    </main>
  );
}
