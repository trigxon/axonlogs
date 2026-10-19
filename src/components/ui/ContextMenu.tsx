import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Instagram-style context menu — the one you get when you RIGHT-CLICK
 * (desktop) or LONG-PRESS (mobile) a chat row. Rendered in a portal at
 * the pointer position, flipped away from viewport edges, closed by any
 * click outside / Escape / scroll / resize.
 */

export type ContextMenuItem = {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
};

export const ContextMenu: React.FC<{
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + r.width + 8 > window.innerWidth) left = Math.max(8, window.innerWidth - r.width - 8);
    if (top + r.height + 8 > window.innerHeight) top = Math.max(8, window.innerHeight - r.height - 8);
    setPos({ left, top, ready: true });
  }, [x, y]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // capture scroll + resize so the menu never detaches from its row
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Chat options"
      className="fixed z-[9999] min-w-[200px] rounded-xl border border-white/[0.08] bg-[#0a0d14]/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.65)] py-1.5 animate-[ctxIn_120ms_ease-out]"
      style={{
        left: pos.left,
        top: pos.top,
        opacity: pos.ready ? 1 : 0,
        pointerEvents: pos.ready ? 'auto' : 'none',
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          role="menuitem"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-left transition-colors ${
            item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-zinc-200 hover:bg-white/[0.06]'
          }`}
        >
          {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
      <style>{`@keyframes ctxIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>,
    document.body
  );
};

/**
 * Long-press hook for mobile (Instagram opens the same menu on a held
 * row). Fires once after 480ms, with haptic feedback where available.
 */
export const useLongPress = (onLongPress: (x: number, y: number) => void) => {
  const timer = useRef<any>(null);
  const moved = useRef(false);

  const start = useCallback(
    (e: React.TouchEvent) => {
      moved.current = false;
      const t = e.touches[0];
      const x = t?.clientX ?? 0;
      const y = t?.clientY ?? 0;
      timer.current = setTimeout(() => {
        if (!moved.current) {
          try { navigator.vibrate?.(12); } catch { /* not supported */ }
          onLongPress(x, y);
        }
      }, 480);
    },
    [onLongPress]
  );

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const move = useCallback(() => {
    moved.current = true;
    cancel();
  }, [cancel]);

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: move,
    onTouchCancel: cancel,
  };
};
