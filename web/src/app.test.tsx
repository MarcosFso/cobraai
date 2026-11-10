import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// The whole app running on the in-memory sample data (same rules and messages as the database functions).
vi.stubEnv('VITE_MOCK', 'true');

beforeAll(() => {
  // jsdom has no ResizeObserver (charts) and no <dialog>.showModal (modals)
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
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
});
