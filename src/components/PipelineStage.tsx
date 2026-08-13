import React from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  error?: string;
  onRetry?: () => void;
}

export function PipelineStage({ name, status, error, onRetry }: Props) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded bg-[#171719] border border-[#262626]">
      <div className="w-5 h-5 flex items-center justify-center shrink-0">
        {status === 'pending' && <div className="w-2 h-2 rounded-full bg-[#737373]" />}
        {status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-[#3B82F6]" />}
        {status === 'success' && <CheckCircle2 className="w-5 h-5 text-[#10B981]" />}
        {status === 'error' && <XCircle className="w-5 h-5 text-[#F87171]" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold text-white uppercase tracking-wider">{name}</div>
        {error && <div className="text-xs text-[#F87171] truncate mt-0.5">{error}</div>}
      </div>
      {status === 'error' && onRetry && (
        <button
          onClick={onRetry}
          className="px-2 py-1 text-[9px] font-bold bg-[#262626] hover:bg-[#404040] text-white rounded transition-colors uppercase"
        >
          Retry
        </button>
      )}
    </div>
  );
}
