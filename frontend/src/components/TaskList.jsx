import { TaskCard } from './TaskCard';
import { Spinner, EmptyState } from './Feedback';

export function TaskList({ tasks, loading, emptyTitle, emptyHint, onSelect, onUpdateStatus, busyTaskId }) {
  if (loading) return <Spinner label="Loading tasks…" />;
  if (!tasks || tasks.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <TaskCard
          key={task._id}
          task={task}
          onSelect={onSelect}
          onUpdateStatus={onUpdateStatus}
          busy={busyTaskId === task._id}
        />
      ))}
    </div>
  );
}
