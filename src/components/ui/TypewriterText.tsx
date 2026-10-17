import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from '../CodeBlock';

interface TypewriterTextProps {
  text: string;
  speed?: number;
  /** When false, renders the full text immediately (no animation). */
  animate?: boolean;
  onComplete?: () => void;
}

/**
 * Types out text character-by-character with a blinking terminal cursor.
 * - `onComplete` is kept in a ref so a changing callback identity never
 *   restarts the animation (parents re-render every second via the clock).
 * - When `animate` is false the full markdown renders instantly.
 */
const TypewriterText: React.FC<TypewriterTextProps> = ({ text, speed = 12, animate = true, onComplete }) => {
  const [displayedLength, setDisplayedLength] = useState(animate ? 0 : text.length);
  const [isComplete, setIsComplete] = useState(!animate);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const indexRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!animate || !text) {
      setDisplayedLength(text.length);
      setIsComplete(true);
      onCompleteRef.current?.();
      return;
    }

    // Skip animation for very short messages
    if (text.length <= 6) {
      setDisplayedLength(text.length);
      setIsComplete(true);
      onCompleteRef.current?.();
      return;
    }

    indexRef.current = 0;
    lastTimeRef.current = 0;
    setDisplayedLength(0);
    setIsComplete(false);

    const charsPerFrame = Math.max(1, Math.ceil(text.length / 120));

    const tick = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const elapsed = timestamp - lastTimeRef.current;

      if (elapsed >= speed) {
        lastTimeRef.current = timestamp;
        indexRef.current = Math.min(indexRef.current + charsPerFrame, text.length);
        setDisplayedLength(indexRef.current);

        if (indexRef.current >= text.length) {
          setIsComplete(true);
          onCompleteRef.current?.();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [text, speed, animate]);

  if (isComplete) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          p({ children }) { return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>; },
          a({ href, children }) { return <a href={href} className="text-cyan-500 hover:underline" target="_blank" rel="noreferrer">{children}</a>; },
          ul({ children }) { return <ul className="list-disc pl-4 mb-2">{children}</ul>; },
          ol({ children }) { return <ol className="list-decimal pl-4 mb-2">{children}</ol>; },
          li({ children }) { return <li className="mb-1">{children}</li>; },
          blockquote({ children }) { return <blockquote className="border-l-2 border-zinc-700 pl-3 italic text-zinc-400">{children}</blockquote>; }
        }}
      >
        {text}
      </ReactMarkdown>
    );
  }

  // During animation: show plain text with cursor
  const partial = text.slice(0, displayedLength);
  return (
    <span className="leading-relaxed">
      {partial}
      <span className="inline-block w-[2px] h-[1em] bg-cyan-400 align-middle ml-[1px] animate-[cursor-blink_0.6s_step-end_infinite]" />
    </span>
  );
};

export default TypewriterText;
