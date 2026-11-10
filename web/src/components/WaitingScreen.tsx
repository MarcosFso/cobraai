import { Hourglass } from 'lucide-react';
import { useEffect, useState } from 'react';
import { auth } from '../api';
import type { AuthSession } from '../types';

/** Shown to an account that has no company yet: it checks by itself until an administrator adds it. */
export function WaitingScreen({ email, onSession }: { email: string; onSession: (session: AuthSession | null) => void }) {
  const [checking, setChecking] = useState(false);

  const check = async () => {
    if (!auth.refresh) return;
    setChecking(true);
    try {
      onSession(await auth.refresh());
    } catch {
      /* a network failure: the next check tries again */
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => void check(), 8000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="center">
      <div className="login-card waiting">
        <div className="empty-icon"><Hourglass size={28} /></div>
        <h2>Aguardando liberação</h2>
        <p>
          Sua conta <b>{email}</b> foi criada, mas ainda não está ligada a nenhuma empresa.
        </p>
        <p className="muted">
          Peça ao administrador da empresa para abrir <b>Equipe</b> e adicionar o seu e-mail. Esta tela confere sozinha de tempos em tempos.
        </p>
        <button className="btn primary wide" disabled={checking} onClick={() => void check()}>{checking ? 'Verificando…' : 'Verificar agora'}</button>
        <button className="btn ghost wide" onClick={() => void auth.signOut()}>Sair</button>
      </div>
    </main>
  );
}
