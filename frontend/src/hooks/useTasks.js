import { useCallback, useEffect, useRef, useState } from 'react';
import { taskApi } from '../api/endpoints';
import { isTaskVisible } from '../utils/taskVisibility';

const DEFAULT_FILTERS = { status: 'active', category: '', priorityLevel: '', sortBy: 'priorityScore', sortOrder: 'desc', page: 1, limit: 20 };

export function useTasks({ enabled, refreshSignal }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [tasks, setTasks] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [highPriority, setHighPriority] = useState([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now);
  const requestVersion = useRef(0);

  const loadAll = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) return;
    const version = ++requestVersion.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [listRes, highRes, deadlineRes] = await Promise.all([
        taskApi.list(filters), taskApi.highPriority(),
        taskApi.list({ status: 'active', hasDeadline: true, sortBy: 'deadline', sortOrder: 'asc', limit: 10 }),
      ]);
      if (version !== requestVersion.current) return;
      setTasks(listRes.data.tasks);
      setPagination(listRes.data.pagination);
      setHighPriority(highRes.data);

      setUpcomingDeadlines(deadlineRes.data.tasks);
    } catch (err) {
      if (version === requestVersion.current) setError(err.message || 'Failed to load tasks');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [enabled, filters]);

  useEffect(() => {
    if (enabled) loadAll();
    else {
      setTasks([]);
      setHighPriority([]);
      setUpcomingDeadlines([]);
      setPagination(null);
      setLoading(false);
      setError(null);
    }
    return () => { requestVersion.current += 1; };
  }, [enabled, loadAll, refreshSignal]);

  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);

  // Re-query the backend periodically while the dashboard is open so a
  // deadline that has *just* expired disappears without a manual refresh.
  // Silent refresh avoids flashing the loading spinner every minute.
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => loadAll({ silent: true }), 60 * 1000);
    return () => clearInterval(timer);
  }, [enabled, loadAll]);

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
    tasks: tasks.filter((task) => isTaskVisible(task, now)),
    pagination,
    highPriority: highPriority.filter((task) => isTaskVisible(task, now) && ['pending', 'in_progress'].includes(task.status)),
    upcomingDeadlines: upcomingDeadlines.filter((task) => isTaskVisible(task, now) && task.deadline && ['pending', 'in_progress'].includes(task.status)),
    now,
    loading,
    error,
    reload: loadAll,
    updateStatus,
  };
}
