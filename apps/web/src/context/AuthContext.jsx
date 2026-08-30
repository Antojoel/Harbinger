import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { api, getToken, setToken, clearToken } from "@/lib/api";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(true);
  const configFetched = useRef(false);
  const sessionResumed = useRef(false);

  // Guarded with a ref, not just an empty dep array - React StrictMode
  // double-invokes effects once in dev, and this must never turn into a
  // repeated fetch under any mount pattern.
  useEffect(() => {
    if (configFetched.current) return;
    configFetched.current = true;
    api.config().then((c) => setGoogleConfigured(!!c.google_login_configured)).catch(() => {});
  }, []);

  // Resume a session from a stored token on page load
  useEffect(() => {
    if (sessionResumed.current) return;
    sessionResumed.current = true;
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api.me()
      .then(({ user }) => setUser(user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const _applySession = ({ token, user, is_new_user }) => {
    setToken(token);
    setUser(user);
    if (is_new_user || !user.has_seen_onboarding) {
      setShowOnboarding(true);
    }
  };

  const loginWithGoogle = useCallback(async (idToken) => {
    const session = await api.googleLogin(idToken);
    _applySession(session);
  }, []);

  const loginAsGuest = useCallback(async () => {
    const session = await api.guestLogin();
    _applySession(session);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const completeOnboarding = useCallback(async () => {
    setShowOnboarding(false);
    try {
      await api.markOnboardingSeen();
    } catch (e) {
      // non-critical - the tour already closed for this session either way
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        googleConfigured,
        showOnboarding,
        loginWithGoogle,
        loginAsGuest,
        logout,
        completeOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
