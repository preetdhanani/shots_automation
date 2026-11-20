import { spawn } from 'node:child_process';

export interface SubprocessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  onStderrLine?: (line: string) => void;
}

export interface SubprocessResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class SubprocessCancelledError extends Error {
  constructor(message = 'Subprocess was cancelled') {
    super(message);
    this.name = 'SubprocessCancelledError';
  }
}

export async function runSubprocess(
  command: string,
  args: string[],
  options: SubprocessOptions = {},
): Promise<SubprocessResult> {
  if (options.signal?.aborted) {
    throw new SubprocessCancelledError();
  }

  return new Promise<SubprocessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let totalBytes = 0;
    const maxLogBytes = 4 * 1024 * 1024;
    let stderrLineBuffer = '';
    let settled = false;
    let aborted = false;
    let timedOut = false;
    let killEscalationTimer: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;

    const killProcessGroup = () => {
      if (!child.pid) return;
      try {
        if (process.platform !== 'win32') {
          process.kill(-child.pid, 'SIGTERM');
        } else {
          child.kill('SIGTERM');
        }
      } catch {
        // Process already exited
      }
      killEscalationTimer = setTimeout(() => {
        if (!child.pid) return;
        try {
          if (process.platform !== 'win32') {
            process.kill(-child.pid, 'SIGKILL');
          } else {
            child.kill('SIGKILL');
          }
        } catch {
          // Process already exited
        }
      }, 3000);
    };

    const onAbort = () => {
      aborted = true;
      killProcessGroup();
    };

    if (options.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    if (options.timeoutMs && options.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        killProcessGroup();
      }, options.timeoutMs);
    }

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killEscalationTimer) clearTimeout(killEscalationTimer);
      if (options.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      if (totalBytes + chunk.byteLength <= maxLogBytes) {
        stdoutChunks.push(chunk);
        totalBytes += chunk.byteLength;
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (totalBytes + chunk.byteLength <= maxLogBytes) {
        stderrChunks.push(chunk);
        totalBytes += chunk.byteLength;
      }
      if (options.onStderrLine) {
        stderrLineBuffer += chunk.toString('utf8');
        const parts = stderrLineBuffer.split(/\r?\n|\r/);
        stderrLineBuffer = parts.pop() ?? '';
        for (const line of parts) {
          if (line.trim()) options.onStderrLine(line.trim());
        }
      }
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();

      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');

      if (aborted) {
        reject(new SubprocessCancelledError(`${command} aborted`));
        return;
      }
      if (timedOut) {
        reject(new Error(`${command} timed out after ${options.timeoutMs}ms`));
        return;
      }
      if (code !== 0) {
        const err = new Error(
          `${command} exited with code ${code ?? 'null'}: ${stderr.slice(-800) || stdout.slice(-400)}`,
        );
        reject(err);
        return;
      }

      resolve({
        code: code ?? 0,
        stdout,
        stderr,
      });
    });
  });
}
