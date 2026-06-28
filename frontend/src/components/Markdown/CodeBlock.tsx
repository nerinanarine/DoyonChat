import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy } from 'lucide-react';

// Workaround for react-syntax-highlighter type incompatibility with React 18
const SH = SyntaxHighlighter as any;

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ inline, className, children }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');

  if (inline) {
    return (
      <code className="bg-gray-100 text-red-600 px-1 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    );
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-white/80 hover:bg-white border border-gray-200 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
        title="コピー"
      >
        {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
      </button>
      {language ? (
        <SH style={oneLight} language={language} PreTag="div" className="rounded-lg text-sm">
          {codeString}
        </SH>
      ) : (
        <pre className="bg-gray-50 p-3 rounded-lg overflow-x-auto text-sm">
          <code>{children}</code>
        </pre>
      )}
    </div>
  );
};

export default CodeBlock;
