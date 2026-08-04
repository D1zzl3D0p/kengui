import { apiRequest } from './client';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TaskResponse<T = Record<string, unknown>> {
  task_id: string;
  type: string;
  status: TaskStatus;
  progress: number;
  message: string;
  result: T | null;
  error: string | null;
}

export const fetchTask = <T = Record<string, unknown>>(taskId: string) =>
  apiRequest<TaskResponse<T>>(`/tasks/${taskId}`);
