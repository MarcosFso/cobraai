import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// The whole app running on the in-memory sample data (same rules and messages as the database functions).
vi.stubEnv('VITE_MOCK', 'true');

beforeAll(() => {
  // jsdom has no ResizeObserver (charts) and no <dialog>.showModal (modals)
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});

async function renderApp() {
  const [{ App }, { ToastProvider }] = await Promise.all([import('./App'), import('./components/ui')]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('App on sample data', () => {
  it('logs in as visitor and shows the dashboard, the invoices and the customers', async () => {
    await renderApp();

    fireEvent.click(await screen.findByRole('button', { name: /entrar como visitante/i }));

    expect(await screen.findByText('Recebido no mês')).toBeTruthy();
    expect(await screen.findByText('Empresa Demonstração')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cobranças' }));
    expect(await screen.findByText('Planejamento tributário')).toBeTruthy();
    // overdue invoices got the WhatsApp action
    await waitFor(() => expect(screen.getAllByLabelText('Cobrar pelo WhatsApp').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'Clientes' }));
    expect(await screen.findByText('Padaria Pão Quente Ltda')).toBeTruthy();
    expect(screen.getByText('11.222.333/0001-81')).toBeTruthy();
  });
  it('shows the monthly charges and the team screen', async () => {
    await renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Cobranças' }));
    fireEvent.click(await screen.findByRole('button', { name: /Mensais/ }));
    expect(await screen.findByText('Honorários mensais')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Parar/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Equipe' }));
    expect(await screen.findByText(/A equipe não está disponível na demonstração/)).toBeTruthy();
  });

  it('lets a new invoice repeat every month', async () => {
    await renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Cobranças' }));
    fireEvent.click((await screen.findAllByRole('button', { name: /Nova cobrança/ }))[0]);
    expect(await screen.findByRole('button', { name: 'Todo mês' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Todo mês' }));
    expect(screen.getByText('Primeiro vencimento')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Criar cobrança mensal' })).toBeTruthy();
  });

  it('keeps an account without a company on the waiting screen until it is released', async () => {
    await renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Criar conta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Entrar numa empresa' }));
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'funcionario@empresa.example' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-forte-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta e aguardar liberação' }));

    expect(await screen.findByText('Aguardando liberação')).toBeTruthy();
    expect(screen.getByText('funcionario@empresa.example')).toBeTruthy();

    // the administrator adds the e-mail: the next checks find the account released
    fireEvent.click(screen.getByRole('button', { name: 'Verificar agora' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Verificando…' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Verificar agora' }));
    expect(await screen.findByText('Recebido no mês')).toBeTruthy();
  });
});
