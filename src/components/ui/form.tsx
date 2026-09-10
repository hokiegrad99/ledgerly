import React from 'react';
import clsx from 'clsx';

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx('input', props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx('input min-h-[80px]', props.className)} />;
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={clsx('input cursor-pointer appearance-none pr-8', props.className)}>
      {children}
    </select>
  );
}

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800" {...props} />
      {label}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-brand-600 dark:bg-brand-500' : 'bg-slate-300 dark:bg-slate-600',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className={clsx('inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-[3px]')} />
    </button>
  );
}

/** Amount input: parses and displays money; calls onChange with integer cents. */
export function AmountInput({
  value,
  onChange,
  placeholder,
  className,
  negative,
}: {
  value: number | null;
  onChange: (cents: number | null) => void;
  placeholder?: string;
  className?: string;
  negative?: boolean;
}) {
  const [text, setText] = React.useState<string>(value === null ? '' : (value / 100).toFixed(2));

  // Sync external value changes.
  React.useEffect(() => {
    const expected = value === null ? '' : (value / 100).toFixed(2);
    setText((prev) => (prev.trim() === '' && expected === '' ? prev : expected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className={clsx('input text-right', className)}
      placeholder={placeholder ?? '0.00'}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const clean = raw.replace(/[^0-9.\-]/g, '');
        const num = Number(clean);
        if (raw.trim() === '') {
          onChange(null);
        } else if (Number.isFinite(num)) {
          let cents = Math.round(num * 100);
          if (negative && cents > 0) cents = -cents;
          onChange(cents);
        }
      }}
      onBlur={() => {
        const num = Number(text.replace(/[^0-9.\-]/g, ''));
        if (Number.isFinite(num)) setText(num.toFixed(2));
      }}
    />
  );
}

export function SearchBox({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
      </svg>
      <input
        type="search"
        className="input pl-9"
        placeholder={placeholder ?? 'Search…'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder ?? 'Search'}
      />
    </div>
  );
}