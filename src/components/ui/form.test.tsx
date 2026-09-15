import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmountInput } from './form';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function renderElement(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(el);
  });
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return {
    input: container.querySelector('input') as HTMLInputElement,
    rerender: (next: React.ReactElement) => {
      act(() => {
        root.render(next);
      });
    },
  };
}

function renderInput(onChange: (cents: number | null) => void, value: number | null = null, negative = false) {
  const h = renderElement(<AmountInput value={value} onChange={onChange} negative={negative} />);
  return { ...h, rerenderValue: (v: number | null) => h.rerender(<AmountInput value={v} onChange={onChange} negative={negative} />) };
}

async function typeInto(input: HTMLInputElement, text: string) {
  await act(async () => {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function blur(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(new FocusEvent('blur'));
  });
}

describe('AmountInput', () => {
  it('never reformats while typing: "12.5" stays "12.5" character by character', async () => {
    const onChange = vi.fn();
    const { input } = renderInput(onChange);
    await typeInto(input, '1');
    expect(input.value).toBe('1');
    await typeInto(input, '12');
    expect(input.value).toBe('12');
    await typeInto(input, '12.5');
    expect(input.value).toBe('12.5');
    expect(onChange).toHaveBeenLastCalledWith(1250);
  });

  it('keeps partial decimal input ("0.") visible and reports 0', async () => {
    const onChange = vi.fn();
    const { input } = renderInput(onChange);
    await typeInto(input, '0.');
    expect(input.value).toBe('0.');
    expect(onChange).toHaveBeenLastCalledWith(0);
    blur(input);
    expect(input.value).toBe('0.00');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('clearing emits null and does not replant "0.00" on blur', async () => {
    const onChange = vi.fn();
    const { input } = renderInput(onChange, 1250);
    expect(input.value).toBe('12.50');
    await typeInto(input, '');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input.value).toBe('');
    blur(input);
    expect(input.value).toBe('');
  });

  it('canonicalizes to two decimals on blur without an extra onChange', async () => {
    const onChange = vi.fn();
    const { input } = renderInput(onChange);
    await typeInto(input, '12.5');
    expect(onChange).toHaveBeenCalledTimes(1);
    blur(input);
    expect(input.value).toBe('12.50');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(1250);
  });

  it('reverts garbage input to the last committed value on blur', async () => {
    const onChange = vi.fn();
    const { input } = renderInput(onChange);
    await typeInto(input, '45');
    expect(onChange).toHaveBeenLastCalledWith(4500);
    await typeInto(input, 'abc');
    expect(onChange).toHaveBeenCalledTimes(1);
    blur(input);
    expect(input.value).toBe('45.00');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores external echoes of an emitted null (parent stores value ?? 0)', async () => {
    const onChange = vi.fn();
    function Harness() {
      const [v, setV] = React.useState<number | null>(0);
      return <AmountInput value={v ?? 0} onChange={(c) => { setV(c); onChange(c); }} />;
    }
    const { input } = renderElement(<Harness />);
    await typeInto(input, '12.5');
    expect(input.value).toBe('12.5');
    expect(onChange).toHaveBeenLastCalledWith(1250);
    await typeInto(input, '');
    expect(onChange).toHaveBeenLastCalledWith(null);
    // The parent re-renders with value=0 (null coerced) — the field must stay empty.
    expect(input.value).toBe('');
    blur(input);
    expect(input.value).toBe('');
  });

  it('applies genuine external value changes', async () => {
    const onChange = vi.fn();
    const { input, rerenderValue } = renderInput(onChange, 1000);
    expect(input.value).toBe('10.00');
    rerenderValue(2000);
    expect(input.value).toBe('20.00');
    rerenderValue(null);
    expect(input.value).toBe('');
  });

  it('coerces positive entries to negative cents when negative is set', async () => {
    const onChange = vi.fn();
    const { input } = renderInput(onChange, null, true);
    await typeInto(input, '5');
    expect(onChange).toHaveBeenLastCalledWith(-500);
  });
});
