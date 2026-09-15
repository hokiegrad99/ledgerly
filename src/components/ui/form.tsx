import React from 'react';
import clsx from 'clsx';
import { parseMoney } from '../../lib/money';

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

/**
 * Amount input: parses and displays money; calls onChange with integer cents.
 *
 * The text in the field is the single source of truth while the user is
 * typing — it is never re-formatted mid-edit. (Reformatting on every
 * keystroke used to corrupt input: typing "12.5" became "1.00" interleaved
 * with typed digits, backspace resurrected the stripped digits, the caret
 * jumped to the end, and a cleared field silently replanted "0.00" on blur.)
 * Text is canonicalized to two decimals only on blur, and external `value`
 * changes are applied only when they are not echoes of our own onChange.
 */
export function AmountInput({
  value,
  onChange,
  placeholder,
  className,
  negative,
  ariaLabel,
}: {
  value: number | null;
  onChange: (cents: number | null) => void;
  placeholder?: string;
  className?: string;
  negative?: boolean;
  ariaLabel?: string;
}) {
  const format = (cents: number | null): string => (cents === null ? '' : (cents / 100).toFixed(2));
  const [text, setText] = React.useState<string>(() => format(value));
  // The last cents value we emitted (initially the incoming prop). Used to
  // tell our own echo (`value` changing because onChange updated the parent,
  // including the common `value={x ?? 0}` coercion of an emitted null) apart
  // from a genuine external change (modal reset, different record), and to
  // revert garbage input to the last committed amount on blur.
  const lastEmitted = React.useRef<number | null>(value);

  // Apply external value changes only.
  React.useEffect(() => {
    const emitted = lastEmitted.current;
    if (value === emitted || (emitted === null && value === 0)) return;
    lastEmitted.current = value;
    setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const toCents = (parsed: number): number => (negative && parsed > 0 ? -parsed : parsed);

  const commit = (raw: string): void => {
    if (raw.trim() === '') {
      lastEmitted.current = null;
      onChange(null);
      return;
    }
    const parsed = parseMoney(raw);
    if (parsed === null) return; // partial input ("-", "1.2.3"): keep last committed value
    const cents = toCents(parsed);
    lastEmitted.current = cents;
    onChange(cents);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={clsx('input text-right', className)}
      placeholder={placeholder ?? '0.00'}
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        commit(raw);
      }}
      onBlur={() => {
        const parsed = parseMoney(text);
        if (parsed === null) {
          // Empty or unparseable: revert to the last committed amount.
          // (Empty stays empty — never plant a silent "0.00".)
          setText(format(lastEmitted.current));
          return;
        }
        const cents = toCents(parsed);
        setText(format(cents));
        if (cents !== lastEmitted.current) {
          lastEmitted.current = cents;
          onChange(cents);
        }
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
