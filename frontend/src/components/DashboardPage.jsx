import { useState } from 'react';
import { TaskList } from './TaskList';
import { TaskFilters } from './TaskFilters';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { SyncPanel } from './SyncPanel';
import { Banner } from './Feedback';

export function DashboardPage({ tasksState }) {
  const { filters, setFilters, tasks, pagination, highPriority, upcomingDeadlines, loading, error, reload, updateStatus } = tasksState;
  const [selectedTask, setSelectedTask] = useState(null);
  const [busyTaskId, setBusyTaskId] = useState(null);

  const handleUpdateStatus = async (taskId, status) => {
    setBusyTaskId(taskId);
    try {
      await updateStatus(taskId, status);
      setSelectedTask((prev) => (prev && prev._id === taskId ? { ...prev, status } : prev));
    } finally {
      setBusyTaskId(null);
    }
  };

  return (
    <div className="dashboard">
      <SyncPanel onSynced={reload} />

      {error && <Banner type="error">{error}</Banner>}

      <section className="dashboard-section">
        <h2>Critical / High Priority</h2>
        <p className="section-hint">Tasks requiring immediate attention.</p>
        <TaskList
          tasks={highPriority}
          loading={loading && highPriority.length === 0}
          emptyTitle="Nothing urgent right now"
          emptyHint="Sync Gmail & Classroom, or check back later."
          onSelect={setSelectedTask}
          onUpdateStatus={handleUpdateStatus}
          busyTaskId={busyTaskId}
        />
      </section>

      <section className="dashboard-section">
        <h2>Upcoming Deadlines</h2>
        <p className="section-hint">Pending tasks, soonest deadline first.</p>
        <TaskList
          tasks={upcomingDeadlines}
          loading={loading && upcomingDeadlines.length === 0}
          emptyTitle="No upcoming deadlines"
          onSelect={setSelectedTask}
          onUpdateStatus={handleUpdateStatus}
          busyTaskId={busyTaskId}
        />
      </section>

      <section className="dashboard-section">
        <h2>All Tasks</h2>
        <TaskFilters filters={filters} onChange={setFilters} />
        <TaskList
          tasks={tasks}
          loading={loading}
          emptyTitle="No tasks match these filters"
          emptyHint="Try clearing filters or syncing Gmail & Classroom."
          onSelect={setSelectedTask}
          onUpdateStatus={handleUpdateStatus}
          busyTaskId={busyTaskId}
        />
        {pagination && pagination.totalPages > 1 && (
          <div className="pagination">
            <button type="button" disabled={filters.page <= 1} onClick={() => setFilters({ page: filters.page - 1 })}>
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={filters.page >= pagination.totalPages}
              onClick={() => setFilters({ page: filters.page + 1 })}
            >
              Next
            </button>
          </div>
        )}
      </section>

      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdateStatus={handleUpdateStatus}
        busy={selectedTask && busyTaskId === selectedTask._id}
      />
    </div>
  );
}
