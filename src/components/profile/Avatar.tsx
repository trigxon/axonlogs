import React from 'react';
import { avatarGradient, initialsOf } from '../../utils/chatMeta';

export interface AvatarProps {
  seed: string;          // unique id for gradient (chat id / device id)
  name: string;          // for initials
  size?: number;         // px
  online?: boolean;      // presence dot
  ring?: 'none' | 'story' | 'seen' | 'locked'; // Instagram-style ring
  gradient?: string;     // override gradient (own avatar choice)
  onClick?: () => void;
  className?: string;
}

/**
 * Instagram-style avatar in the Axon theme: rounded-full, gradient fill,
 * initials, optional story ring (cyan→emerald), optional presence dot.
 */
export const Avatar: React.FC<AvatarProps> = ({
  seed,
  name,
  size = 44,
  online = false,
  ring = 'none',
  gradient,
  onClick,
  className = '',
}) => {
  const ringPad = ring !== 'none' ? 3 : 0;
  const outer = size + ringPad * 2 + (ring !== 'none' ? 4 : 0);

  const ringBg =
    ring === 'story'
      ? 'linear-gradient(135deg, #22d3ee 0%, #34d399 55%, #818cf8 100%)'
      : ring === 'locked'
        ? 'linear-gradient(135deg, #fbbf24 0%, #92400e 100%)'
        : ring === 'seen'
          ? 'transparent'
          : undefined;

  const inner = (
    <div
      className="flex items-center justify-center shrink-0 select-none"
      style={{
        width: size,
        height: size,
        borderRadius: '9999px',
        background: gradient || avatarGradient(seed),
        boxShadow: ring === 'seen' ? '0 0 0 2px rgba(34,211,238,0.35)' : undefined,
      }}
    >
      <span
        className="font-bold text-black/85 tracking-wider"
        style={{ fontSize: Math.max(10, size * 0.34) }}
      >
        {initialsOf(name)}
      </span>
    </div>
  );

  const wrapped = ring !== 'none' ? (
    <div
      className={`shrink-0 ${className}`}
      style={{
        width: outer,
        height: outer,
        borderRadius: '9999px',
        padding: ringPad + 2,
        background: ringBg || 'transparent',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ borderRadius: '9999px', padding: 0, background: '#04050a', display: 'inline-flex' }}>
        {inner}
      </div>
    </div>
  ) : (
    <div className={`shrink-0 ${className}`} style={{ borderRadius: '9999px', display: 'inline-flex' }}>
      {inner}
    </div>
  );

  return (
    <div className="relative inline-flex shrink-0" onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined }}>
      {wrapped}
      {online && (
        <span
          className="absolute rounded-full bg-emerald-400 dot-live text-emerald-400 border-2 border-[#04050a]"
          style={{
            width: Math.max(9, size * 0.24),
            height: Math.max(9, size * 0.24),
            right: ring !== 'none' ? 2 : 0,
            bottom: ring !== 'none' ? 2 : 0,
          }}
        />
      )}
    </div>
  );
};

export default Avatar;
