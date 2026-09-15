import { useCallback, useEffect, useState } from 'react';
import { taskApi } from '../api/endpoints';

const DEFAULT_FILTERS = { status: 'pending', category: '', priorityLevel: '', sortBy: 'priorityScore', sortOrder: 'desc', page: 1, limit: 20 };

export function useTasks({ enabled, refreshSignal }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [tasks, setTasks] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [highPriority, setHighPriority] = useState([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const [listRes, highRes] = await Promise.all([taskApi.list(filters), taskApi.highPriority()]);
      setTasks(listRes.data.tasks);
      setPagination(listRes.data.pagination);
      setHighPriority(highRes.data);

      // "Upcoming deadlines" view: pending tasks with a deadline, soonest
      // first - reuses the same listTasks endpoint with different
      // sort/filter params rather than inventing new client-side logic.
      const deadlineRes = await taskApi.list({ status: 'pending', sortBy: 'deadline', sortOrder: 'asc', limit: 10 });
      setUpcomingDeadlines(deadlineRes.data.tasks.filter((t) => t.deadline));
    } catch (err) {
      setError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [enabled, filters]);

  useEffect(() => {
    loadAll();
  }, [loadAll, refreshSignal]);

  const updateStatus = useCallback(
    async (taskId, status) => {
      await taskApi.updateStatus(taskId, status);
      await loadAll();
    },
    [loadAll]
  );

  return {
    filters,
    setFilters: (patch) => setFilters((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 })),
    tasks,
    pagination,
    highPriority,
    upcomingDeadlines,
    loading,
    error,
    reload: loadAll,
    updateStatus,
  };
}
