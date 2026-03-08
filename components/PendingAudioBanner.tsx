'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Watch, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';

interface PendingItem {
  id: string;
  mode?: string;
  sheetName?: string;
  rowIndex?: number;
  createdAt: string;
}

interface Props {
  onProcessed?: () => void; // callback to refresh patient list
}

export function PendingAudioBanner({ onProcessed }: Props) {
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const autoProcessing = useRef(false);

  const checkQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/shortcuts/process-queue');
      if (!res.ok) return;
      const data = await res.json();
      setPending(data.items || []);
      return data.items?.length || 0;
    } catch {
      return 0;
    }
  }, []);

  const processOne = useCallback(async () => {
    if (processing) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch('/api/shortcuts/process-queue', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Processing failed');
      } else if (data.processed > 0) {
        const mode = data.result?.mode;
        const label = mode === 'full' ? 'Note generated' :
                      mode === 'analyze' ? 'Analysis complete' :
                      mode === 'quick' ? 'Encounter created' :
                      'Transcription complete';
        setLastResult(label);
        onProcessed?.();
        setTimeout(() => setLastResult(null), 4000);
      }
      // Re-check queue
      await checkQueue();
    } catch (e: any) {
      setError(e.message || 'Processing failed');
    } finally {
      setProcessing(false);
    }
  }, [processing, checkQueue, onProcessed]);

  // Poll for pending items every 10 seconds
  useEffect(() => {
    checkQueue();
    pollRef.current = setInterval(checkQueue, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkQueue]);

  // Auto-process when items are found
  useEffect(() => {
    if (pending.length > 0 && !processing && !autoProcessing.current) {
      autoProcessing.current = true;
      setDismissed(false);
      processOne().finally(() => {
        autoProcessing.current = false;
      });
    }
  }, [pending, processing, processOne]);

  // Nothing to show
  if (pending.length === 0 && !processing && !lastResult && !error) return null;
  if (dismissed && !processing) return null;

  const modeLabel = (mode?: string) => {
    switch (mode) {
      case 'full': return 'Generate Note';
      case 'analyze': return 'Analyze';
      case 'quick': return 'Quick Record';
      default: return 'Transcribe';
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4">
      <div className="mt-2 rounded-lg overflow-hidden" style={{
        background: 'var(--dash-card-bg)',
        border: '1px solid var(--dash-card-border)',
      }}>
        <div className="flex items-center gap-2.5 px-3 py-2">
          {processing ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400 flex-shrink-0" />
          ) : lastResult ? (
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
          ) : error ? (
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          ) : (
            <Watch className="w-4 h-4 text-purple-400 flex-shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            {processing ? (
              <span className="text-xs" style={{ color: 'var(--dash-text-sub)' }}>
                Processing watch recording...
              </span>
            ) : lastResult ? (
              <span className="text-xs text-green-400">{lastResult}</span>
            ) : error ? (
              <span className="text-xs text-red-400">{error}</span>
            ) : (
              <span className="text-xs" style={{ color: 'var(--dash-text-sub)' }}>
                {pending.length} watch recording{pending.length !== 1 ? 's' : ''} pending
                {pending.length > 0 && ` (${modeLabel(pending[0].mode)})`}
              </span>
            )}
          </div>

          {!processing && (pending.length > 0 || error) && (
            <button
              onClick={() => { setError(null); processOne(); }}
              className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
            >
              {error ? 'Retry' : 'Process'}
            </button>
          )}

          {!processing && (
            <button
              onClick={() => { setDismissed(true); setLastResult(null); setError(null); }}
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
              style={{ color: 'var(--dash-text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
