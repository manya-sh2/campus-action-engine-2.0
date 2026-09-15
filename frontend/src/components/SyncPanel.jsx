import { useState } from 'react';
import { taskApi } from '../api/endpoints';

export function SyncPanel({ onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const runSync = async () => {
    setSyncing(true);
    setError(null);
    setSummary(null);
    try {
      const res = await taskApi.sync();
      setSummary(res.data);
      onSynced();
    } catch (err) {
      setError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="sync-panel">
      <button type="button" className="btn btn-primary" onClick={runSync} disabled={syncing}>
        {syncing ? 'Syncing Gmail & Classroom…' : 'Sync Gmail & Classroom'}
      </button>

      {error && <div className="banner banner-error">{error}</div>}

      {summary && (
        <div className="sync-summary">
          <span>Fetched {summary.fetched}</span>
          <span className="sync-summary-created">+{summary.created} new</span>
          <span>{summary.duplicates} already tracked</span>
          {summary.failed > 0 && <span className="sync-summary-failed">{summary.failed} failed</span>}
          {summary.errors && summary.errors.length > 0 && (
            <details>
              <summary>View {summary.errors.length} error(s)</summary>
              <ul>
                {summary.errors.map((e, i) => (
                  <li key={i}>
                    {e.title || e.source}: {e.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
