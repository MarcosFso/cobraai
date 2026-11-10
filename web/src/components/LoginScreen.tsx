import { BarChart3, Lock, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { auth } from '../api';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../supabase';

type Mode = 'login' | 'signup';

const FEATURES = [
  { icon: <Sparkles size={20} />, title: 'Cobranças em poucos cliques', text: 'Emita, acompanhe e dê baixa sem planilha.' },
  { icon: <MessageCircle size={20} />, title: 'Cobre pelo WhatsApp', text: 'A mensagem já sai pronta, é só enviar.' },
  { icon: <BarChart3 size={20} />, title: 'Painel com números reais', text: 'Recebido, em aberto, atrasado e inadimplência.' },
  { icon: <ShieldCheck size={20} />, title: 'Dados separados por empresa', text: 'Cada empresa vê apenas o que é seu.' },
];

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({ email: '', password: '', company: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const signIn = async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    const failure = await auth.signIn(email, password);
    if (failure) setError(failure);
    setBusy(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'login') return signIn(form.email, form.password);
    setBusy(true);
    setError(null);
    const result = await auth.signUp(form.email, form.password, form.company);
    setBusy(false);
    if (result.error) return setError(result.error);
    if (result.needsConfirmation) setNotice('Conta criada! Confirme o e-mail que enviamos para poder entrar.');
  };

  return (
    <div className="login">
      <aside className="hero">
        <div className="hero-inner">
          <div className="brand light"><span className="logo">₢</span> Cobranças</div>
          <h1>Cobranças sem planilha, <em>pagamentos sem susto.</em></h1>
          <p>Uma plataforma simples para pequenas empresas emitirem cobranças, acompanharem pagamentos e avisarem clientes.</p>
          <ul>
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                <span className="feature-icon">{feature.icon}</span>
                <div><strong>{feature.title}</strong><span>{feature.text}</span></div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="login-side">
        <div className="login-card">
          <h2>{mode === 'login' ? 'Bem-vindo de volta' : 'Crie a conta da sua empresa'}</h2>
          <p className="muted">{mode === 'login' ? 'Entre para ver as suas cobranças.' : 'Leva menos de um minuto.'}</p>

          <button className="btn demo wide" disabled={busy} onClick={() => void signIn(DEMO_EMAIL, DEMO_PASSWORD)}>
            <Sparkles size={18} /> Entrar como visitante
          </button>
          <p className="muted small center-text">Sem cadastro. Dados fictícios, restaurados toda madrugada.</p>

          <div className="divider">ou use a sua empresa</div>

          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Entrar</button>
            <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Criar conta</button>
          </div>

          <form onSubmit={(event) => void submit(event)}>
            {mode === 'signup' && (
              <label>Nome da empresa<input required maxLength={120} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
            )}
            <label>E-mail<input required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>Senha
              <input required type="password" minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
            <button className="btn primary wide" disabled={busy}>{mode === 'login' ? 'Entrar' : 'Criar conta da empresa'}</button>
          </form>
          {error && <p className="error" role="alert">{error}</p>}
          {notice && <p className="ok">{notice}</p>}
          <p className="muted small center-text"><Lock size={12} /> Cada empresa tem os seus próprios dados, invisíveis para as outras.</p>
        </div>
      </main>
    </div>
  );
}
