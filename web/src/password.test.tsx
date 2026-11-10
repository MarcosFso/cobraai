import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('VITE_MOCK', 'true');

async function renderScreen() {
  const [{ ChangePasswordScreen }, { ToastProvider }] = await Promise.all([import('./components/ChangePassword'), import('./components/ui')]);
  render(<ToastProvider><ChangePasswordScreen email="func@empresa.example" /></ToastProvider>);
}

const fill = (current: string, next: string, again: string) => {
  fireEvent.change(screen.getByLabelText(/Senha temporária/), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('Senha nova'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Repita a senha nova'), { target: { value: again } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar senha nova' }));
};

describe('forced password change', () => {
  it('tells the person that the administrator changed the password', async () => {
    await renderScreen();
    expect(screen.getByText(/O administrador mudou a senha da conta/)).toBeTruthy();
    expect(screen.getByText('func@empresa.example')).toBeTruthy();
  });

  it('refuses two different new passwords', async () => {
    await renderScreen();
    fill('Temporaria12', 'nova-senha-forte', 'outra-senha-forte');
    expect(await screen.findByText('As duas senhas novas não são iguais.')).toBeTruthy();
  });

  it('refuses a new password equal to the temporary one', async () => {
    await renderScreen();
    fill('mesma-senha-123', 'mesma-senha-123', 'mesma-senha-123');
    expect(await screen.findByText('A nova senha precisa ser diferente da atual')).toBeTruthy();
  });

  it('accepts a valid new password', async () => {
    await renderScreen();
    fill('Temporaria12', 'nova-senha-forte', 'nova-senha-forte');
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar senha nova' })).toBeTruthy());
  });
});
