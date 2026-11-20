import { EventEmitter } from 'node:events';
import type {
  PipelineLogEntry,
  PipelineRunRecord,
  PipelineRunStatus,
  PipelineTrigger,
  Store,
  WorkerSource,
} from '../db/store.js';

export interface RunStreamEvent {
  seq: number;
  event: 'snapshot' | 'progress' | 'log' | 'done' | 'failed' | 'cancelled';
  run: PipelineRunRecord;
  log?: PipelineLogEntry;
}

interface QueuedRenderJob {
  runId: string;
  controller: AbortController;
  execute: (signal: AbortSignal) => Promise<void>;
}

export class PipelineQueue {
  private readonly store: Store;
  private readonly emitter = new EventEmitter();
  private readonly controllers = new Map<string, AbortController>();
  private readonly renderQueue: QueuedRenderJob[] = [];
  private readonly runSeqs = new Map<string, number>();
  private readonly lastDbSyncMs = new Map<string, number>();
  private renderWorkerActive = false;

  constructor(store: Store) {
    this.store = store;
    this.emitter.setMaxListeners(100);
  }

  private nextSeq(runId: string): number {
    const cur = (this.runSeqs.get(runId) ?? 0) + 1;
    this.runSeqs.set(runId, cur);
    return cur;
  }

  createAndEnqueueRender(opts: {
    reelId: string | null;
    trigger: PipelineTrigger;
    workerSource: WorkerSource;
    initialStep: string;
    execute: (runId: string, signal: AbortSignal) => Promise<void>;
  }): PipelineRunRecord {
    const run = this.store.createPipelineRun({
      reelId: opts.reelId,
      trigger: opts.trigger,
      workerSource: opts.workerSource,
      workerPid: process.pid,
      currentStep: opts.initialStep,
      status: 'QUEUED',
    });

    const controller = new AbortController();
    this.controllers.set(run.id, controller);

    this.renderQueue.push({
      runId: run.id,
      controller,
      execute: (signal) => opts.execute(run.id, signal),
    });

    this.emitSnapshot(run.id, 'snapshot');
    void this.drainRenderQueue();
    return run;
  }

  runIndependentAsync(opts: {
    reelId: string | null;
    trigger: PipelineTrigger;
    workerSource: WorkerSource;
    initialStep: string;
    execute: (runId: string, signal: AbortSignal) => Promise<void>;
  }): PipelineRunRecord {
    const run = this.store.createPipelineRun({
      reelId: opts.reelId,
      trigger: opts.trigger,
      workerSource: opts.workerSource,
      workerPid: process.pid,
      currentStep: opts.initialStep,
      status: 'RUNNING',
    });

    const controller = new AbortController();
    this.controllers.set(run.id, controller);
    this.emitSnapshot(run.id, 'snapshot');

    void (async () => {
      try {
        await opts.execute(run.id, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) {
          this.finishRun(run.id, 'CANCELLED', 'cancelled', 'Run cancelled by user.');
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          this.finishRun(run.id, 'FAILED', 'error', msg);
        }
      } finally {
        this.controllers.delete(run.id);
      }
    })();

    return run;
  }

  private async drainRenderQueue(): Promise<void> {
    if (this.renderWorkerActive) return;
    this.renderWorkerActive = true;

    try {
      while (this.renderQueue.length > 0) {
        const job = this.renderQueue.shift()!;
        if (job.controller.signal.aborted) {
          this.finishRun(job.runId, 'CANCELLED', 'cancelled', 'Queued job cancelled before start.');
          this.controllers.delete(job.runId);
          continue;
        }

        this.store.updatePipelineRun(job.runId, { status: 'RUNNING', progressPct: 2 });
        this.emitSnapshot(job.runId, 'progress');

        try {
          await job.execute(job.controller.signal);
        } catch (err) {
          if (job.controller.signal.aborted) {
            this.finishRun(job.runId, 'CANCELLED', 'cancelled', 'Cancelled by user.');
          } else {
            const msg = err instanceof Error ? err.message : String(err);
            this.finishRun(job.runId, 'FAILED', 'error', msg);
          }
        } finally {
          this.controllers.delete(job.runId);
          this.lastDbSyncMs.delete(job.runId);
        }
      }
    } finally {
      this.renderWorkerActive = false;
    }
  }

  updateProgress(
    runId: string,
    step: string,
    progressPct: number,
    message?: string,
    opts?: { forcePersist?: boolean; level?: PipelineLogEntry['level'] },
  ): void {
    const now = Date.now();
    const lastSync = this.lastDbSyncMs.get(runId) ?? 0;
    const current = this.store.getPipelineRun(runId);
    if (!current || current.status === 'CANCELLED' || current.status === 'FAILED' || current.status === 'DONE') {
      return;
    }

    const stepChanged = current.currentStep !== step;
    const shouldPersist = opts?.forcePersist || stepChanged || Boolean(message) || now - lastSync >= 500;

    let logEntry: PipelineLogEntry | undefined;
    if (message) {
      logEntry = {
        ts: new Date().toISOString(),
        step,
        message,
        level: opts?.level ?? 'info',
      };
    }

    let updated: PipelineRunRecord;
    if (shouldPersist) {
      this.lastDbSyncMs.set(runId, now);
      updated =
        this.store.updatePipelineRun(
          runId,
          { currentStep: step, progressPct, status: 'RUNNING' },
          logEntry,
        ) ?? current;
    } else {
      updated = {
        ...current,
        currentStep: step,
        progressPct: Math.max(0, Math.min(100, Math.round(progressPct))),
      };
    }

    this.emitter.emit(`run:${runId}`, {
      seq: this.nextSeq(runId),
      event: logEntry ? 'log' : 'progress',
      run: updated,
      log: logEntry,
    } satisfies RunStreamEvent);
  }

  finishRun(
    runId: string,
    status: Extract<PipelineRunStatus, 'DONE' | 'FAILED' | 'CANCELLED'>,
    step: string,
    message: string,
  ): PipelineRunRecord | null {
    const log: PipelineLogEntry = {
      ts: new Date().toISOString(),
      step,
      message,
      level: status === 'DONE' ? 'info' : status === 'CANCELLED' ? 'warn' : 'error',
    };

    const updated = this.store.updatePipelineRun(
      runId,
      {
        status,
        currentStep: step,
        progressPct: status === 'DONE' ? 100 : undefined,
        finishedAt: new Date().toISOString(),
      },
      log,
    );

    if (updated) {
      const eventName =
        status === 'DONE' ? 'done' : status === 'CANCELLED' ? 'cancelled' : 'failed';
      this.emitter.emit(`run:${runId}`, {
        seq: this.nextSeq(runId),
        event: eventName,
        run: updated,
        log,
      } satisfies RunStreamEvent);
    }
    return updated;
  }

  cancelRun(runId: string): boolean {
    const run = this.store.getPipelineRun(runId);
    if (!run || (run.status !== 'QUEUED' && run.status !== 'RUNNING')) {
      return false;
    }

    const controller = this.controllers.get(runId);
    if (controller) {
      controller.abort();
      if (run.status === 'QUEUED') {
        this.finishRun(runId, 'CANCELLED', 'cancelled', 'Queued run cancelled before execution.');
      }
      return true;
    }

    // Orphaned DB row with no live controller
    this.finishRun(runId, 'CANCELLED', 'cancelled', 'Run marked cancelled.');
    return true;
  }

  subscribe(runId: string, listener: (evt: RunStreamEvent) => void): () => void {
    const channel = `run:${runId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }

  private emitSnapshot(runId: string, event: RunStreamEvent['event']): void {
    const run = this.store.getPipelineRun(runId);
    if (!run) return;
    this.emitter.emit(`run:${runId}`, {
      seq: this.nextSeq(runId),
      event,
      run,
    } satisfies RunStreamEvent);
  }
}
