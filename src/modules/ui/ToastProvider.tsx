import { createContext, type PropsWithChildren, use, useCallback, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextState {
  notify: (input: { type?: ToastType; message: string; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextState | null>(null);

const ICON_MAP = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const STYLE_MAP = {
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-white",
  error:
    "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/25 dark:bg-rose-500/15 dark:text-white",
  info: "border-slate-200 bg-white text-slate-900 dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-white",
} as const;

export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const removeItem = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (input: { type?: ToastType; message: string; duration?: number }) => {
      const toastId = Date.now() + Math.floor(Math.random() * 1000);
      const type = input.type ?? "info";
      const duration = input.duration ?? 2600;

      setItems((current) => [...current, { id: toastId, type, message: input.message }]);

      window.setTimeout(() => {
        removeItem(toastId);
      }, duration);
    },
    [removeItem],
  );

  const value = useMemo<ToastContextState>(() => ({ notify }), [notify]);

  return (
    <ToastContext value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[120] flex w-full max-w-sm flex-col gap-2"
        role="status"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {items.map((item) => {
          const Icon = ICON_MAP[item.type];
          return (
            <div
              key={item.id}
              className={`pointer-events-auto flex items-start gap-2 rounded-2xl border px-3 py-2 text-sm shadow-sm backdrop-blur ${STYLE_MAP[item.type]}`}
            >
              <Icon size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1">{item.message}</span>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="rounded p-0.5 opacity-75 transition hover:opacity-100"
                aria-label="关闭提示"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

export const useToast = (): ToastContextState => {
  const context = use(ToastContext);
  if (!context) {
    throw new Error("useToast 必须在 ToastProvider 内使用");
  }
  return context;
};
