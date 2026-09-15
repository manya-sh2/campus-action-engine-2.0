import { PriorityBadge, StatusBadge, EligibilityBadge } from './Badges';

function ClassificationBanner({ classification }) {
  if (!classification) return null;
  const isAction = classification === 'ACTION_REQUIRED';
  return (
    <div className={`classification-banner ${isAction ? 'banner-action' : 'banner-info'}`}>
      <span className="banner-icon">{isAction ? '⚡' : 'ℹ️'}</span>
      <span className="banner-text">
        {isAction
          ? 'Action Required — you need to do something about this'
          : 'Important Information — no action needed but do not miss this'}
      </span>
    </div>
  );
}

export function TaskDetailDrawer({ task, onClose, onUpdateStatus, busy }) {
  if (!task) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {/* Classification banner — prominent top placement */}
        <ClassificationBanner classification={task.classification} />

        <h2>{task.title}</h2>
        <div className="task-meta">
          <span className="task-category">{task.category}</span>
          {task.organization && <span className="task-org"> · {task.organization}</span>}
        </div>

        <div className="drawer-badges">
          <PriorityBadge level={task.priorityLevel} />
          <EligibilityBadge isEligible={task.isEligible} />
          <StatusBadge status={task.status} />
        </div>

        {/* Concise actionable summary extracted by the AI — NOT the raw email body */}
        {task.description && (
          <div className="drawer-section">
            <h3>Summary</h3>
            <p className="drawer-summary">{task.description}</p>
          </div>
        )}

        {task.deadline && (
          <p>
            <strong>Deadline:</strong> {new Date(task.deadline).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
          </p>
        )}

        <dl className="drawer-scores">
          <div>
            <dt>Importance</dt>
            <dd>{task.importanceScore} / 100</dd>
          </div>
          <div>
            <dt>Urgency</dt>
            <dd>{task.urgencyScore} / 100</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{task.priorityScore} / 100</dd>
          </div>
        </dl>

        {task.skills && task.skills.length > 0 && (
          <div className="drawer-section">
            <h3>Skills mentioned</h3>
            <div className="chip-row">
              {task.skills.map((s) => (
                <span key={s} className="chip">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {task.eligibilityReasons && task.eligibilityReasons.length > 0 && (
          <div className="drawer-section">
            <h3>Eligibility</h3>
            <ul>
              {task.eligibilityReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {task.priorityReasons && task.priorityReasons.length > 0 && (
          <div className="drawer-section">
            <h3>Why this priority</h3>
            <ul>
              {task.priorityReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="drawer-actions">
          {task.actionUrl && (
            <a className="btn btn-primary" href={task.actionUrl} target="_blank" rel="noreferrer">
              {task.actionRequired || 'Open'}
            </a>
          )}
          {task.sourceLink && task.sourceLink !== task.actionUrl && (
            <a className="btn btn-ghost" href={task.sourceLink} target="_blank" rel="noreferrer">
              View original
            </a>
          )}
          {task.status !== 'completed' && (
            <button type="button" className="btn btn-success" disabled={busy} onClick={() => onUpdateStatus(task._id, 'completed')}>
              Mark complete
            </button>
          )}
          {task.status !== 'pending' && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onUpdateStatus(task._id, 'pending')}>
              Reopen
            </button>
          )}
          {task.status !== 'dismissed' && task.status !== 'completed' && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onUpdateStatus(task._id, 'dismissed')}>
              Dismiss
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
