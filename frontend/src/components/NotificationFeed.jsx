export function NotificationFeed({ notifications, onDismiss }) {
  if (!notifications || notifications.length === 0) return null;

  return (
    <div className="notification-feed">
      {notifications.map((n) => (
        <div key={n.id} className={`notification notification-${n.type}`}>
          <span>{n.message}</span>
          <button type="button" onClick={() => onDismiss(n.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
