import { useCallback, useId, useRef, useState, type ReactNode } from "react";

type TooltipPlacement = "top" | "right" | "bottom" | "left";

const PLACEMENT_CLASS: Record<TooltipPlacement, string> = {
  top: "left-1/2 -translate-x-1/2 bottom-full mb-2",
  bottom: "left-1/2 -translate-x-1/2 top-full mt-2",
  right: "left-full ml-2 top-1/2 -translate-y-1/2",
  left: "right-full mr-2 top-1/2 -translate-y-1/2",
};

function TooltipBubble({
  id,
  open,
  content,
  placement,
}: {
  id: string;
  open: boolean;
  content: string;
  placement: TooltipPlacement;
}) {
  return (
    <span
      id={id}
      role="tooltip"
      aria-hidden={!open}
      className={[
        "pointer-events-none absolute z-[300] w-max max-w-[calc(100vw-2rem)] rounded-2xl border px-3 py-2 text-sm shadow-lg backdrop-blur sm:max-w-80",
        "border-slate-200 bg-white/95 text-slate-900 dark:border-neutral-800 dark:bg-neutral-950/90 dark:text-white",
        "motion-reduce:transition-none motion-safe:transition motion-safe:duration-150",
        open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[-2px]",
        PLACEMENT_CLASS[placement],
      ].join(" ")}
    >
      <span className="block break-words">{content}</span>
    </span>
  );
}

export function HoverTooltip({
  content,
  children,
  className,
  disabled = false,
  placement = "top",
}: {
  content: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  placement?: TooltipPlacement;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    if (disabled) return;
    if (!content.trim()) return;
    setOpen(true);
  }, [content, disabled]);

  const hide = useCallback(() => setOpen(false), []);

  return (
    <span
      className={["relative inline-flex", className].filter(Boolean).join(" ")}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={id}
    >
      {children}
      <TooltipBubble id={id} open={open} content={content} placement={placement} />
    </span>
  );
}

export function OverflowTooltip({
  content,
  children,
  className,
  placement = "top",
}: {
  content: string;
  children: ReactNode;
  className?: string;
  placement?: TooltipPlacement;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  const tryShow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (!content.trim()) return;
    const isOverflowing = el.scrollWidth > el.clientWidth;
    if (!isOverflowing) return;
    setOpen(true);
  }, [content]);

  const hide = useCallback(() => setOpen(false), []);

  return (
    <span
      ref={ref}
      className={["relative", className].filter(Boolean).join(" ")}
      onMouseEnter={tryShow}
      onMouseLeave={hide}
      onFocus={tryShow}
      onBlur={hide}
      aria-describedby={id}
    >
      {children}
      <TooltipBubble id={id} open={open} content={content} placement={placement} />
    </span>
  );
}
