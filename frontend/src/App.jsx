import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { useTaskSocket } from './hooks/useTaskSocket';
import { useTasks } from './hooks/useTasks';
import { LoginScreen } from './components/LoginScreen';
import { DashboardPage } from './components/DashboardPage';
import { ProfilePanel } from './components/ProfilePanel';
import { DrivePanel } from './components/DrivePanel';
import { NotificationFeed } from './components/NotificationFeed';
import { Spinner } from './components/Feedback';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'profile', label: 'Profile' },
  { id: 'drive', label: 'Drive' },
];

export default function App() {
  const { user, loading, oauthNotice, clearOauthNotice, logout, updateUserLocal } = useAuth();
  const [tab, setTab] = useState('dashboard');

  const { notifications, connected, refreshSignal, markTaskCompleteViaSocket, dismissNotification } = useTaskSocket(Boolean(user));
  const tasksState = useTasks({ enabled: Boolean(user), refreshSignal });

  if (loading) {
    return (
      <div className="app-loading">
        <Spinner label="Checking your session…" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen notice={oauthNotice} onDismissNotice={clearOauthNotice} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-brand">
          <span className="app-title">Campus Action Engine</span>
          <span className={`socket-indicator ${connected ? 'socket-connected' : 'socket-disconnected'}`}>
            {connected ? '● Live' : '○ Offline'}
          </span>
        </div>

        <nav className="app-tabs">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'app-tab active' : 'app-tab'} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="app-header-user">
          <span className="user-name">{user.name}</span>
          <button type="button" className="btn btn-ghost btn-small" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <NotificationFeed notifications={notifications} onDismiss={dismissNotification} />

      <main className="app-main">
        {tab === 'dashboard' && <DashboardPage tasksState={tasksState} markTaskCompleteViaSocket={markTaskCompleteViaSocket} />}
        {tab === 'profile' && <ProfilePanel user={user} onUpdated={updateUserLocal} />}
        {tab === 'drive' && <DrivePanel />}
      </main>
    </div>
  );
}
