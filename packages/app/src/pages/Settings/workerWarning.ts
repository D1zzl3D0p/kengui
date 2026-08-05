import { HIGH_LOCAL_WORKER_WARNING_THRESHOLD } from './constants';

/**
 * Advisory only: high local worker counts use more RAM. Never warns for hosted
 * mode, where the cloud CPU budget is fixed infra the user cannot change.
 */
export function shouldWarnHighWorkers(serverMode: string, workers: number): boolean {
  if (serverMode !== 'local') return false;
  if (!Number.isFinite(workers)) return false;
  return workers > HIGH_LOCAL_WORKER_WARNING_THRESHOLD;
}

export { HIGH_LOCAL_WORKER_WARNING_THRESHOLD };
