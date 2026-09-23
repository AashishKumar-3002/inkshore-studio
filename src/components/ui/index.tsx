/**
 * Inkshore Studio's UI kit.
 *
 * Minimal and dense: quiet 1px borders, soft shadows for depth, 8–12px
 * radii, and a near-black primary action so the indigo accent stays rare
 * enough to mean something.
 */
"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

export { cn };

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

/** The centred measure every screen sits in. */
export function Container({
  narrow,
  className,
  children,
}: {
  narrow?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(narrow ? "container-narrow" : "container-app", className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-solid text-solid-ink border-transparent shadow-xs hover:bg-solid-hover disabled:hover:bg-solid",
  secondary:
    "bg-surface text-ink border-line shadow-xs hover:bg-surface-2 hover:border-line-strong disabled:hover:bg-surface",
  ghost:
    "bg-transparent text-ink-muted border-transparent hover:bg-surface-2 hover:text-ink",
  danger:
    "bg-danger text-white border-transparent shadow-xs hover:opacity-90 disabled:hover:opacity-100",
  subtle:
    "bg-surface-2 text-ink border-transparent hover:bg-surface-3",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-[13px] gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-[13px] gap-1.5 rounded-lg",
  lg: "h-11 px-5 text-sm gap-2 rounded-lg",
  icon: "h-8 w-8 justify-center rounded-md",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading, disabled, children, ...props },
    ref
  ) => (
    <button
      ref={ref}
      // Stays focusable while busy so a screen reader user isn't dropped
      // out of the tab order mid-action.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap border font-medium",
        "transition-[background-color,border-color,opacity,box-shadow] duration-150",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />}
      {children}
    </button>
  )
);
Button.displayName = "Button";

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

const FIELD_BASE =
  "w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink shadow-xs " +
  "placeholder:text-ink-subtle transition-[border-color,box-shadow] duration-150 " +
  "hover:border-line-strong " +
  "focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-muted";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(FIELD_BASE, "h-9", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(FIELD_BASE, "min-h-[88px] resize-y py-2 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(FIELD_BASE, "h-9 pr-8", className)} {...props} />
));
Select.displayName = "Select";

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      className={cn("mb-1.5 block text-[13px] font-medium text-ink", className)}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-danger" aria-label="required">
          *
        </span>
      )}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Type                                                                */
/* ------------------------------------------------------------------ */

export function Kicker({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={cn("kicker", className)}>{children}</span>;
}

export function Lbl({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("lbl", className)} {...props}>
      {children}
    </span>
  );
}

/**
 * Page/section display heading. `size` is the desktop pixel size; it scales
 * down fluidly so a long title never overflows a phone.
 */
export function Display({
  as: Tag = "h1",
  size = 30,
  className,
  children,
}: {
  as?: "h1" | "h2" | "h3";
  size?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag
      className={cn("disp", className)}
      style={{ fontSize: `clamp(${Math.min(size, 26)}px, 4.2vw, ${size}px)` }}
    >
      {children}
    </Tag>
  );
}

export function Rule({ className }: { className?: string }) {
  return <hr className={cn("h-px border-0 bg-line", className)} />;
}

export function Hair({ className }: { className?: string }) {
  return <hr className={cn("h-px border-0 bg-hair", className)} />;
}

/* ------------------------------------------------------------------ */
/* Page furniture                                                      */
/* ------------------------------------------------------------------ */

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  size = 28,
  className,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {kicker && <Kicker className="mb-1.5">{kicker}</Kicker>}
        <Display size={size}>{title}</Display>
        {description && (
          <p className="mt-2 max-w-[62ch] text-ink-muted">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
      )}
    </div>
  );
}

/**
 * A row in a list. Rows sit inside a bordered panel and are separated by
 * hairlines, so a list reads as one object rather than as a stack of cards.
 */
export function RuledRow({
  index,
  children,
  highlighted,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  index?: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors",
        "border-b border-hair last:border-b-0",
        "grid-cols-[minmax(0,1fr)] sm:grid-cols-[28px_minmax(0,1fr)]",
        highlighted ? "bg-accent-soft" : "hover:bg-surface-2",
        className
      )}
      {...props}
    >
      {index !== undefined && (
        <span className="tnum hidden text-xs text-ink-subtle sm:block">{index}</span>
      )}
      {children}
    </div>
  );
}

/** The bordered panel that list rows live in. */
export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-line bg-surface shadow-card",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Compact metric tiles. Numbers first, label under, no giant type. */
export function StatBand({
  stats,
  className,
}: {
  stats: { value: React.ReactNode; label: React.ReactNode }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-4",
        className
      )}
    >
      {stats.map((s, i) => (
        <div
          key={i}
          className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-xs"
        >
          <p className="tnum disp text-2xl text-ink">{s.value}</p>
          <span className="mt-1 block text-xs text-ink-muted">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

type BadgeTone = "neutral" | "accent" | "outline" | "success" | "warning" | "danger";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-ink-muted border-line",
  accent: "bg-accent-soft text-accent border-accent-border",
  outline: "bg-transparent text-ink-muted border-line-strong",
  success: "bg-success-soft text-success border-success-border",
  warning: "bg-warning-soft text-warning border-warning-border",
  danger: "bg-danger-soft text-danger border-danger-border",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        BADGE_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

export function Chip({
  selected,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors",
        selected
          ? "border-accent bg-accent-soft font-medium text-accent"
          : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Segmented control — a single inset track with a raised active pill. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  name,
  className,
  ariaLabel,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  name: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5",
        className
      )}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <label
            key={opt.value}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[13px] transition-colors",
              active
                ? "bg-surface font-medium text-ink shadow-xs"
                : "text-ink-muted hover:text-ink",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent"
            )}
          >
            <input
              type="radio"
              name={name}
              checked={active}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

/** Slim determinate progress bar. */
export function Ticks({
  value,
  className,
}: {
  value: number;
  total?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div
      className={cn("h-1 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface shadow-card",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-hair px-4 py-3",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2 className={cn("h-4 w-4 animate-spin text-ink-subtle", className)} aria-hidden />
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-14 text-[13px] text-ink-muted"
      role="status"
    >
      <Spinner />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function EmptyState({
  kicker,
  icon,
  title,
  description,
  action,
  className,
}: {
  kicker?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-3.5 grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-ink-muted shadow-xs">
          {icon}
        </div>
      )}
      {kicker && <Kicker className="mb-1.5">{kicker}</Kicker>}
      <h3 className="max-w-[26ch] text-base font-semibold">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-[46ch] text-[13px] text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-[13px] text-danger"
      role="alert"
    >
      <p className="font-medium">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

export function Dialog({
  open,
  onClose,
  kicker,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  kicker?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    // Stop the page behind the modal scrolling under it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgb(10_10_14/0.45)] p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-in w-full max-w-[440px] rounded-xl border border-line bg-surface p-5 shadow-overlay outline-none"
      >
        {kicker && <Kicker className="mb-1">{kicker}</Kicker>}
        <h2 className="text-lg font-semibold">{title}</h2>
        {children && <div className="mt-2 text-[13px] text-ink-muted">{children}</div>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}
