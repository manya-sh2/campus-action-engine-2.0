const LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function PriorityBadge({ level }) {
  return <span className={`badge badge-priority-${level}`}>{LABELS[level] || level}</span>;
}

export function StatusBadge({ status }) {
  return <span className={`badge badge-status-${status}`}>{status.replace('_', ' ')}</span>;
}

export function EligibilityBadge({ isEligible }) {
  return (
    <span className={`badge ${isEligible ? 'badge-eligible' : 'badge-ineligible'}`}>
      {isEligible ? 'Eligible' : 'Not eligible'}
    </span>
  );
}
