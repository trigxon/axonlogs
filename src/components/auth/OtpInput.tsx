import React, { useEffect, useRef } from 'react';

/**
 * Six-box one-time-code input, Axon-styled.
 *
 * - Auto-advance on typing; backspace on an empty box moves back.
 * - Paste of a full code (with or without spaces/dashes) fills every box.
 * - Arrow keys move between boxes; Enter submits via the parent form.
 * - Submit-on-complete: fires onComplete when the last digit lands.
 * - Screen-reader friendly: one labelled input per digit with
 *   aria-label "Digit N of 6", plus a visually hidden live region.
 * - Touch-friendly: 44px+ tap targets via sizing classes.
 */
export const OtpInput: React.FC<{
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  length?: number;
  error?: boolean;
}> = ({ value, onChange, onComplete, disabled, length = 6, error }) => {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Focus the first empty box when the field mounts or resets.
    const idx = value.length < length ? value.length : length - 1;
    const el = refs.current[idx];
    if (el && document.activeElement !== el) el.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const digits = Array.from({ length }, (_, i) => value[i] || '');

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) {
      // Let React flush the value, then hand the finished code up.
      requestAnimationFrame(() => onComplete?.(clean));
    }
    return clean;
  };

  const handleChange = (i: number, raw: string) => {
    const chars = raw.replace(/\D/g, '');
    if (!chars) return;
    // Typed (1 char) or mobile autocorrect (several) — both work.
    const arr = [...digits];
    arr[i] = chars[chars.length - 1];
    commit(arr.join('').slice(0, length));
    if (i < length - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const arr = [...digits];
      if (arr[i]) {
        arr[i] = '';
        onChange(arr.join(''));
      } else if (i > 0) {
        arr[i - 1] = '';
        onChange(arr.join('').slice(0, length));
        refs.current[i - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); refs.current[i - 1]?.focus(); }
    if (e.key === 'ArrowRight' && i < length - 1) { e.preventDefault(); refs.current[i + 1]?.focus(); }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text') || '';
    const clean = text.replace(/\D/g, '').slice(0, length);
    if (!clean) return;
    commit(clean);
    refs.current[Math.min(clean.length, length - 1)]?.focus();
  };

  return (
    <div
      className="flex items-center justify-center gap-1.5 sm:gap-2.5"
      role="group"
      aria-label={`${length}-digit verification code`}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="\d*"
          maxLength={length}
          disabled={disabled}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.currentTarget.select()}
          aria-label={`Digit ${i + 1} of ${length}`}
          className={`w-10 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold text-white bg-black/40 border rounded-lg outline-none transition-colors focus:border-cyan-400/70 disabled:opacity-50 ${
            error ? 'border-red-500/60' : 'border-white/[0.09] hover:border-white/[0.18]'
          }`}
        />
      ))}
      <span className="sr-only" aria-live="polite">
        {value.length === length ? 'Code complete' : `${value.length} of ${length} digits entered`}
      </span>
    </div>
  );
};

export default OtpInput;
