import { PriorityBadge, StatusBadge, EligibilityBadge } from './Badges';

function formatDeadline(deadline) {
  if (!deadline) return 'No deadline';
  const d = new Date(deadline);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  const formatted = d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  if (diffHours < 0) return `${formatted} (overdue)`;
  if (diffHours < 24) return `${formatted} (in ${Math.round(diffHours)}h)`;
  return `${formatted} (in ${Math.round(diffHours / 24)}d)`;
}

function ClassificationChip({ classification }) {
  if (!classification) return null;
  const isAction = classification === 'ACTION_REQUIRED';
  return (
    <span
      className={`classification-chip ${isAction ? 'classification-action' : 'classification-info'}`}
      title={isAction ? 'This item requires your action' : 'Important information you should not miss'}
    >
      {isAction ? '⚡ Action Required' : 'ℹ️ Important'}
    </span>
  );
}

export function TaskCard({ task, onSelect, onUpdateStatus, busy }) {
  return (
    <article className={`task-card priority-${task.priorityLevel}`}>
      <header className="task-card-header">
        <div className="task-card-titles">
          <button type="button" className="task-title-btn" onClick={() => onSelect(task)}>
            {task.title}
          </button>
          <div className="task-meta">
            <span className="task-category">{task.category}</span>
            {task.organization && <span className="task-org"> · {task.organization}</span>}
            <ClassificationChip classification={task.classification} />
          </div>
        </div>
        <PriorityBadge level={task.priorityLevel} />
      </header>

      {/* Concise extracted summary — never the raw email body */}
      {task.description && (
        <p className="task-card-summary">{task.description}</p>
      )}

      <div className="task-card-scores">
        <span title="Importance score">Importance {task.importanceScore}</span>
        <span title="Urgency score">Urgency {task.urgencyScore}</span>
        <span title="Priority score">Priority {task.priorityScore}</span>
      </div>

      <div className="task-card-row">
        <span className="task-deadline">{formatDeadline(task.deadline)}</span>
        <EligibilityBadge isEligible={task.isEligible} />
        <StatusBadge status={task.status} />
      </div>

      {task.priorityReasons && task.priorityReasons.length > 0 && (
        <ul className="task-reasons">
          {task.priorityReasons.slice(0, 3).map((reason, i) => (
            <li key={i}>{reason.replace(/^\[(Importance|Urgency)\]\s*/, '')}</li>
          ))}
        </ul>
      )}

      <footer className="task-card-actions">
        <button type="button" className="btn btn-link" onClick={() => onSelect(task)}>
          View details
        </button>
        {task.status !== 'completed' && (
          <button
            type="button"
            className="btn btn-small btn-success"
            disabled={busy}
            onClick={() => onUpdateStatus(task._id, 'completed')}
          >
            Mark complete
          </button>
        )}
        {task.status !== 'dismissed' && task.status !== 'completed' && (
          <button
            type="button"
            className="btn btn-small btn-ghost"
            disabled={busy}
            onClick={() => onUpdateStatus(task._id, 'dismissed')}
          >
            Dismiss
          </button>
        )}
      </footer>
    </article>
  );
}
