import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/endpoints';

const AuthContext = createContext(null);

/**
 * Reads ?googleConnected=true / ?googleAuthError=... left in the URL by
 * the backend's OAuth callback redirect, then strips them so a refresh
 * doesn't re-show the banner. Returns whichever one was present, if any.
 */
function consumeOAuthRedirectParams() {
  const params = new URLSearchParams(window.location.search);
  const connected = params.get('googleConnected');
  const error = params.get('googleAuthError');

  if (connected || error) {
    params.delete('googleConnected');
    params.delete('googleAuthError');
    const rest = params.toString();
    const newUrl = `${window.location.pathname}${rest ? `?${rest}` : ''}`;
    window.history.replaceState({}, '', newUrl);
  }

  return { connected: Boolean(connected), error };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [oauthNotice, setOauthNotice] = useState(null);

  const refreshUser = useCallback(async () => {
    try {
      const res = await authApi.me();
      setUser(res.data);
      return res.data;
    } catch (err) {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const { connected, error } = consumeOAuthRedirectParams();
    if (connected) setOauthNotice({ type: 'success', message: 'Google account connected successfully.' });
    if (error) setOauthNotice({ type: 'error', message: `Google sign-in failed: ${error}` });

    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const updateUserLocal = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, oauthNotice, clearOauthNotice: () => setOauthNotice(null), refreshUser, logout, updateUserLocal }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
