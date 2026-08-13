import React, { useId, useState } from 'react';
import { Brain, ChevronDown } from 'lucide-react';
import MarkdownRenderer from '../Markdown/MarkdownRenderer';

interface CollapsibleReasoningProps {
  reasoning: string;
}

const CollapsibleReasoning: React.FC<CollapsibleReasoningProps> = ({ reasoning }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = `reasoning-${useId().replace(/:/g, '')}`;

  if (!reasoning) return null;

  const characterCount = Array.from(reasoning).length;

  return (
    <div className="mb-3 rounded-md bg-slate-50 border-l-2 border-slate-300 pl-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 py-2 pr-3 text-left text-sm font-medium text-slate-600"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <Brain size={16} aria-hidden="true" />
        <span>🤔 思考プロセス（{characterCount}文字）</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>
      {isExpanded && (
        <div
          id={contentId}
          className="border-t border-slate-200 pb-3 pr-3 pt-2 text-sm text-slate-600"
        >
          <MarkdownRenderer content={reasoning} />
        </div>
      )}
    </div>
  );
};

export default CollapsibleReasoning;
