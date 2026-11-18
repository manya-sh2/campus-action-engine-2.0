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
      // Earlier items may already have been saved before a later Gemini
      // quota error. Refresh the task list even after a failed sync.
      onSynced?.();
      setError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="sync-panel">
      <p className="sync-hint">Jobs, internships, placement updates, semester exams, and assignments from the last 30 days. Events and passed deadlines are hidden.</p>
      <button type="button" className="btn btn-primary" onClick={runSync} disabled={syncing}>
        {syncing ? 'Syncing Gmail & Classroom…' : 'Sync Gmail & Classroom'}
      </button>

      {syncing && (
        <p className="sync-hint" role="status">
          Checking the most recent items in small batches. The free-tier safety limits may defer some items to another sync.
        </p>
      )}

      {error && <div className="banner banner-error">{error}</div>}
      {summary?.stoppedReason && (
        <div className="banner banner-error" role="alert">
          <strong>Sync paused:</strong> {summary.stoppedReason}
          <div>Tasks already saved remain available. Unprocessed items can be picked up on your next sync.</div>
        </div>
      )}

      {summary && (
        <div className="sync-summary">
          <span>Fetched {summary.fetched} recent source items</span>
          <span>{summary.processed || 0} checked by AI</span>
          <span className="sync-summary-created">+{summary.created} new</span>
          <span>{summary.duplicates} already processed/tracked</span>
          {summary.deferred > 0 && (
            <span>{summary.deferred} left for a later sync (not deleted)</span>
          )}
          {summary.quota && (
            <span>Local Gemini request budget: {summary.quota.remaining} of {summary.quota.budget} remaining today</span>
          )}
          {summary.expired > 0 && <span>{summary.expired} expired skipped</span>}
          {summary.ignored > 0 && <span>{summary.ignored} irrelevant or unverified items skipped</span>}
          {summary.outOfWindow > 0 && <span>{summary.outOfWindow} older skipped</span>}
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
