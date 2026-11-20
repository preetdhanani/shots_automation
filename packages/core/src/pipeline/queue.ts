import { EventEmitter } from 'node:events';
import type {
  PipelineLogEntry,
  PipelineRunRecord,
  PipelineRunStatus,
  PipelineTrigger,
  Store,
  WorkerSource,
} from '../db/store.js';
import { formatApiErrorMessage } from '../generation/geminiClient.js';

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
  onCancel?: () => void;
}

export class PipelineQueue {
  private readonly store: Store;
  private readonly maxConcurrentRenders: number;
  private readonly emitter = new EventEmitter();
  private readonly controllers = new Map<string, AbortController>();
  private readonly cancelHandlers = new Map<string, () => void>();
  private readonly slotReleasers = new Map<string, () => void>();
  private readonly renderQueue: QueuedRenderJob[] = [];
  private readonly runSeqs = new Map<string, number>();
  private readonly lastDbSyncMs = new Map<string, number>();
  private activeRenderCount = 0;

  constructor(store: Store, opts?: { maxConcurrentRenders?: number }) {
    this.store = store;
    this.maxConcurrentRenders = Math.max(1, Math.min(8, opts?.maxConcurrentRenders ?? 3));
    this.emitter.setMaxListeners(100);
  }

  getMaxConcurrency(): number {
    return this.maxConcurrentRenders;
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
    onCancel?: () => void;
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
    if (opts.onCancel) {
      this.cancelHandlers.set(run.id, opts.onCancel);
    }

    this.renderQueue.push({
      runId: run.id,
      controller,
      execute: (signal) => opts.execute(run.id, signal),
      onCancel: opts.onCancel,
    });

    this.emitSnapshot(run.id, 'snapshot');
    this.drainRenderQueue();
    return run;
  }

  runIndependentAsync(opts: {
    reelId: string | null;
    trigger: PipelineTrigger;
    workerSource: WorkerSource;
    initialStep: string;
    execute: (runId: string, signal: AbortSignal) => Promise<void>;
    onCancel?: () => void;
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
    if (opts.onCancel) {
      this.cancelHandlers.set(run.id, opts.onCancel);
    }
    this.emitSnapshot(run.id, 'snapshot');

    void (async () => {
      try {
        await opts.execute(run.id, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) {
          this.finishRun(run.id, 'CANCELLED', 'cancelled', 'Run cancelled by user.');
        } else {
          const msg = formatApiErrorMessage(err);
          this.finishRun(run.id, 'FAILED', 'error', msg);
        }
      } finally {
        this.controllers.delete(run.id);
        this.cancelHandlers.delete(run.id);
      }
    })();

    return run;
  }

  private drainRenderQueue(): void {
    while (this.activeRenderCount < this.maxConcurrentRenders && this.renderQueue.length > 0) {
      const job = this.renderQueue.shift()!;
      if (job.controller.signal.aborted) {
        this.finishRun(job.runId, 'CANCELLED', 'cancelled', 'Queued job cancelled before start.');
        this.controllers.delete(job.runId);
        this.cancelHandlers.delete(job.runId);
        continue;
      }

      this.activeRenderCount++;
      let slotReleased = false;
      const releaseSlot = () => {
        if (slotReleased) return;
        slotReleased = true;
        this.activeRenderCount = Math.max(0, this.activeRenderCount - 1);
        this.slotReleasers.delete(job.runId);
        this.drainRenderQueue();
      };
      this.slotReleasers.set(job.runId, releaseSlot);

      this.store.updatePipelineRun(job.runId, { status: 'RUNNING', progressPct: 2 });
      this.emitSnapshot(job.runId, 'progress');

      void (async () => {
        try {
          await job.execute(job.controller.signal);
        } catch (err) {
          if (job.controller.signal.aborted) {
            this.finishRun(job.runId, 'CANCELLED', 'cancelled', 'Run cancelled by user.');
          } else {
            const msg = formatApiErrorMessage(err);
            this.finishRun(job.runId, 'FAILED', 'error', msg);
          }
        } finally {
          this.controllers.delete(job.runId);
          this.cancelHandlers.delete(job.runId);
          this.lastDbSyncMs.delete(job.runId);
          releaseSlot();
        }
      })();
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
    const existing = this.store.getPipelineRun(runId);
    if (
      existing &&
      (existing.status === 'DONE' || existing.status === 'FAILED' || existing.status === 'CANCELLED')
    ) {
      return existing;
    }
    const effectiveStep =
      (status === 'FAILED' && step === 'error' && existing?.currentStep) ||
      (status === 'CANCELLED' && step === 'cancelled' && existing?.currentStep)
        ? existing.currentStep
        : step;

    const log: PipelineLogEntry = {
      ts: new Date().toISOString(),
      step: effectiveStep,
      message,
      level: status === 'DONE' ? 'info' : status === 'CANCELLED' ? 'warn' : 'error',
    };

    const updated = this.store.updatePipelineRun(
      runId,
      {
        status,
        currentStep: effectiveStep,
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

    // Remove from pending queue if still queued
    const queueIdx = this.renderQueue.findIndex((j) => j.runId === runId);
    if (queueIdx >= 0) {
      this.renderQueue.splice(queueIdx, 1);
    }

    const controller = this.controllers.get(runId);
    if (controller) {
      controller.abort();
      this.controllers.delete(runId);
    }

    const onCancel = this.cancelHandlers.get(runId);
    if (onCancel) {
      this.cancelHandlers.delete(runId);
      try {
        onCancel();
      } catch {
        // Ignore cleanup errors during cancel
      }
    }

    // Immediately mark CANCELLED and emit SSE so UI updates instantaneously
    this.finishRun(runId, 'CANCELLED', 'cancelled', 'Run cancelled by user.');

    // Immediately free concurrency slot so queued jobs can proceed without waiting for a stuck call
    const releaseSlot = this.slotReleasers.get(runId);
    if (releaseSlot) {
      releaseSlot();
    }
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
