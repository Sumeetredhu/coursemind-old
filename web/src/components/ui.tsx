import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
};

const variants = {
  primary: "bg-teal-700 text-white hover:bg-teal-800 disabled:bg-teal-700/50",
  secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50 disabled:text-stone-400",
  ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-900 disabled:text-stone-300",
  danger: "text-red-600 hover:bg-red-50 disabled:text-red-300",
};

export function Button({ variant = "primary", busy, className = "", children, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {busy && <LoaderCircle size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-stone-500">
      <LoaderCircle size={16} className="animate-spin" />
      {label}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
      <h3 className="text-base font-semibold text-stone-800">{title}</h3>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-stone-500">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

const statusStyles = {
  queued: "bg-stone-100 text-stone-600",
  processing: "bg-sky-50 text-sky-700",
  ready: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

const statusText = { queued: "Waiting", processing: "Reading…", ready: "Ready", failed: "Failed" };

export function StatusBadge({ status }: { status: keyof typeof statusStyles }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status]}`}>{statusText[status]}</span>
  );
}

export const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15";
