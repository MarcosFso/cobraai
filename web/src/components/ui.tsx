import { AlertTriangle, Check, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { initials } from '../format';
import type { InvoiceStatus } from '../types';

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  OPEN: 'Em aberto',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELED: 'Cancelada',
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`pill ${status}`}>
      <i aria-hidden /> {STATUS_LABEL[status]}
    </span>
  );
}

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38, background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ height = 20, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden />;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose(); // click on the backdrop
      }}
    >
      {open && (
        <div className="modal-body">
          <header>
            <h2>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}>
              <X size={18} />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Toasts

interface Toast {
  id: number;
  kind: 'success' | 'error';
  text: string;
}
interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
}

const ToastContext = createContext<ToastApi>({ success: () => undefined, error: () => undefined });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = (counter.current += 1);
    setToasts((current) => [...current, { id, kind, text }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);

  const api: ToastApi = { success: (text) => push('success', text), error: (text) => push('error', text) };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            {toast.kind === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
            <span>{toast.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
