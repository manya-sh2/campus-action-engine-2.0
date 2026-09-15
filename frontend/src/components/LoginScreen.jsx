import { authApi } from '../api/endpoints';

export function LoginScreen({ notice, onDismissNotice }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Campus Action Engine</h1>
        <p className="login-subtitle">
          Turns your Gmail and Google Classroom into a personalized, prioritized action feed.
        </p>

        {notice && (
          <div className={`banner banner-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
            <span>{notice.message}</span>
            <button type="button" className="banner-dismiss" onClick={onDismissNotice} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <button type="button" className="btn btn-google" onClick={authApi.startGoogleLogin}>
          Sign in with Google
        </button>

        <p className="login-footnote">
          You'll be redirected to Google to grant read-only Gmail/Classroom access and Drive file access. Your
          credentials are never seen by this app.
        </p>
      </div>
    </div>
  );
}
