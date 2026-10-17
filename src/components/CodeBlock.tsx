import React, { lazy, Suspense, useState } from 'react';

// The syntax highlighter (all languages + prism styles) is heavy — it only
// loads when a message actually contains a fenced code block.
const LazyHighlight = lazy(async () => {
  const [{ Prism }, { vscDarkPlus }] = await Promise.all([
    import('react-syntax-highlighter'),
    import('react-syntax-highlighter/dist/esm/styles/prism'),
  ]);
  return { default: (props: any) => <Prism style={vscDarkPlus} {...props} /> };
});

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: any;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ inline, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '');
  const codeString = String(children).replace(/\n$/, '');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    return (
      <div className="relative mt-2 mb-4 group font-mono">
        <div className="flex justify-between items-center bg-[#1e1e1e] px-4 py-1 border border-zinc-800 border-b-0">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">{match[1]}</span>
          <button
            onClick={handleCopy}
            className="text-[10px] text-cyan-500 hover:text-cyan-400 uppercase tracking-widest font-bold"
          >
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
        <Suspense fallback={<pre className="border border-zinc-800 !m-0 !bg-[#0a0a0f] text-xs p-4 overflow-x-auto text-zinc-400">{codeString}</pre>}>
          <LazyHighlight
            language={match[1]}
            PreTag="div"
            className="border border-zinc-800 !m-0 !bg-[#0a0a0f] text-xs"
            {...props}
          >
            {codeString}
          </LazyHighlight>
        </Suspense>
      </div>
    );
  }
  return (
    <code className="bg-zinc-800 text-cyan-300 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
      {children}
    </code>
  );
};

export default CodeBlock;
