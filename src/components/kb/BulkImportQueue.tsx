/**
 * BulkImportQueue — displays import queue with per-item stage progress,
 * retry failed, and error report export.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Download,
  Trash2,
  Square,
  FileText,
  Globe,
  ClipboardPaste,
  FileJson,
} from 'lucide-react';
import {
  type QueueItem,
  type ImportStage,
  STAGE_ORDER,
} from '@/hooks/useBulkImport';

// ── Stage labels ─────────────────────────────────────────────────────

const STAGE_LABELS: Record<ImportStage, string> = {
  queued: '\u041e\u0447\u0435\u0440\u0435\u0434\u044c',
  parsed: '\u041f\u0430\u0440\u0441\u0438\u043d\u0433',
  normalized: '\u041d\u043e\u0440\u043c\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f',
  chunked: '\u0427\u0430\u043d\u043a\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435',
  jsonl: 'JSONL',
  inserted: '\u0412\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043e',
  error: '\u041e\u0448\u0438\u0431\u043a\u0430',
};

const SOURCE_ICONS = {
  file: FileText,
  url: Globe,
  text: ClipboardPaste,
  jsonl_record: FileJson,
};

function stageProgress(stage: ImportStage): number {
  if (stage === 'error') return 0;
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0) return 0;
  return Math.round((idx / (STAGE_ORDER.length - 1)) * 100);
}

function stageBadgeVariant(stage: ImportStage): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (stage === 'inserted') return 'default';
  if (stage === 'error') return 'destructive';
  if (stage === 'queued') return 'outline';
  return 'secondary';
}

// ── Component ────────────────────────────────────────────────────────

interface BulkImportQueueProps {
  items: QueueItem[];
  isRunning: boolean;
  completed: number;
  failed: number;
  total: number;
  onRetryFailed: () => void;
  onAbort: () => void;
  onClearCompleted: () => void;
  onDownloadErrors: () => void;
}

export const BulkImportQueue = React.forwardRef<HTMLDivElement, BulkImportQueueProps>(function BulkImportQueue({
  items,
  isRunning,
  completed,
  failed,
  total,
  onRetryFailed,
  onAbort,
  onClearCompleted,
  onDownloadErrors,
}, ref) {
  const overallProgress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const processing = items.find(it =>
    it.stage !== 'queued' && it.stage !== 'inserted' && it.stage !== 'error'
  );

  return (
    <div ref={ref} className="space-y-4">
      {/* Overall progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {isRunning ? '\u041e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430...' : '\u041e\u0447\u0435\u0440\u0435\u0434\u044c \u0438\u043c\u043f\u043e\u0440\u0442\u0430'}
          </span>
          <span className="text-muted-foreground">
            {completed}/{total}
            {failed > 0 && (
              <span className="text-destructive ml-1">({failed} {'\u043e\u0448.'})</span>
            )}
          </span>
        </div>
        <Progress value={overallProgress} className="h-2" />
      </div>

      {/* Stage pipeline for current item */}
      {processing && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium truncate">{processing.label}</p>
          <div className="flex gap-1">
            {STAGE_ORDER.map((stage, i) => {
              const currentIdx = STAGE_ORDER.indexOf(processing.stage);
              const isActive = i === currentIdx;
              const isDone = i < currentIdx;
              return (
                <div
                  key={stage}
                  className={`flex-1 h-1.5 rounded-full transition-colors ${
                    isDone
                      ? 'bg-primary'
                      : isActive
                      ? 'bg-primary animate-pulse'
                      : 'bg-muted-foreground/20'
                  }`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            {STAGE_ORDER.map(stage => (
              <span key={stage} className="truncate">{STAGE_LABELS[stage]}</span>
            ))}
          </div>
        </div>
      )}

      {/* Item list */}
      <ScrollArea className="max-h-[40vh]">
        <div className="space-y-1.5">
          {items.map(item => {
            const Icon = SOURCE_ICONS[item.source];
            return (
              <div
                key={item.id}
                className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${
                  item.stage === 'error'
                    ? 'border-destructive/30 bg-destructive/5'
                    : item.stage === 'inserted'
                    ? 'border-primary/20 bg-primary/5'
                    : ''
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1 text-xs" title={item.label}>{item.label}</span>

                {/* Stage badge */}
                <Badge variant={stageBadgeVariant(item.stage)} className="text-[10px] shrink-0">
                  {item.stage === 'inserted' && <CheckCircle className="h-2.5 w-2.5 mr-0.5" />}
                  {item.stage === 'error' && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                  {!['queued', 'inserted', 'error'].includes(item.stage) && (
                    <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />
                  )}
                  {STAGE_LABELS[item.stage]}
                </Badge>

                {/* Result info */}
                {item.result?.deduplicated && (
                  <Badge variant="outline" className="text-[10px] shrink-0">{'\u0434\u0443\u0431\u043b\u044c'}</Badge>
                )}
                {item.result?.chunksInserted !== undefined && !item.result.deduplicated && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {item.result.chunksInserted} {'\u0447\u0430\u043d\u043a\u043e\u0432'}
                  </Badge>
                )}

                {/* Retry count */}
                {item.retryCount > 0 && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {'\u00d7'}{item.retryCount}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Error detail for failed items */}
      {failed > 0 && !isRunning && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
          <p className="text-xs font-medium text-destructive">
            {failed} {'\u044d\u043b\u0435\u043c\u0435\u043d\u0442(\u043e\u0432) \u0441 \u043e\u0448\u0438\u0431\u043a\u0430\u043c\u0438'}
          </p>
          <ScrollArea className="max-h-[30vh]">
            <div className="space-y-1">
              {items.filter(it => it.stage === 'error').map(it => (
                <p key={it.id} className="text-[10px] text-destructive/80 whitespace-normal break-all">
                  <strong>{it.label}:</strong> {it.error}
                </p>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {isRunning && (
          <Button variant="destructive" size="sm" onClick={onAbort}>
            <Square className="h-3.5 w-3.5 mr-1" />
            {'\u0421\u0442\u043e\u043f'}
          </Button>
        )}
        {!isRunning && failed > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={onRetryFailed}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              {'\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u043e\u0448\u0438\u0431\u043a\u0438'}
            </Button>
            <Button variant="outline" size="sm" onClick={onDownloadErrors}>
              <Download className="h-3.5 w-3.5 mr-1" />
              {'\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u043e\u0448\u0438\u0431\u043e\u043a'}
            </Button>
          </>
        )}
        {!isRunning && completed > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearCompleted}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {'\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c'}
          </Button>
        )}
      </div>
    </div>
  );
});
