import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useToast } from './components/ui';

/** Pay and cancel with feedback: a toast on success or failure, then everything on screen is refreshed. */
export function useInvoiceActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const done = (message: string) => () => {
    toast.success(message);
    void queryClient.invalidateQueries();
  };
  const fail = (error: Error) => toast.error(error.message);

  const pay = useMutation({ mutationFn: (id: string) => api.pay(id), onSuccess: done('Cobrança marcada como paga'), onError: fail });
  const cancel = useMutation({ mutationFn: (id: string) => api.cancel(id), onSuccess: done('Cobrança cancelada'), onError: fail });
  return { pay, cancel, busy: pay.isPending || cancel.isPending };
}
