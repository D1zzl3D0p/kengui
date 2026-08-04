import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStore } from '../store/connection';
import { fetchTask } from './tasks';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  useConnectionStore.setState({
    serverUrl: 'http://localhost:45365',
    serverMode: 'local',
    connectionStatus: 'connected',
  });
  mockFetch.mockReset();
});

describe('tasks api', () => {
  it('fetches a task by id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          task_id: 'task-1',
          type: 'full_analysis',
          status: 'completed',
          progress: 100,
          message: 'Done',
          result: {},
          error: null,
        }),
    });

    await fetchTask('task-1');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/v1/tasks/task-1',
      expect.any(Object)
    );
  });
});
