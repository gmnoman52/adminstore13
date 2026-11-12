import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { completeAuthFromUrl } from './lib/oauth';

type Auth = { session: Session | null; loading: boolean; recovery: boolean; finishRecovery: () => void; authError: string; clearAuthError: () => void };
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const [authError, setAuthError] = useState('');
  useEffect(() => {
    if (!supabase) { queueMicrotask(() => setLoading(false)); return; }
    let mounted = true;
    const client = supabase;
    client.auth.getSession().then(({ data }) => { if (mounted) { setSession(data.session); setLoading(false); } }).catch(() => { if (mounted) setLoading(false); });
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      setSession(next); setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    const link = async (url: string | null) => {
      if (!url) return;
      const fragment = new URLSearchParams(url.split('#')[1] ?? '');
      const query = new URLSearchParams(url.split('?')[1]?.split('#')[0] ?? '');
      const error = query.get('error_description') || fragment.get('error_description') || query.get('error') || fragment.get('error');
      if (error) throw new Error(error);
      if (Platform.OS === 'web') return;
      if (!query.has('code') && !fragment.has('access_token')) return;
      await completeAuthFromUrl(url);
      if (mounted && (query.get('type') || fragment.get('type')) === 'recovery') setRecovery(true);
    };
    const reportError = (error: unknown) => { if (mounted) setAuthError(error instanceof Error ? error.message : 'Couldn’t complete sign-in. Please try again'); };
    void Linking.getInitialURL().then(link).catch(reportError);
    const links = Linking.addEventListener('url', event => { void link(event.url).catch(reportError); });
    if (Platform.OS !== 'web' && AppState.currentState === 'active') client.auth.startAutoRefresh();
    const state = AppState.addEventListener('change', next => {
      if (Platform.OS !== 'web') { if (next === 'active') client.auth.startAutoRefresh(); else client.auth.stopAutoRefresh(); }
    });
    return () => { mounted = false; subscription.unsubscribe(); links.remove(); state.remove(); if (Platform.OS !== 'web') client.auth.stopAutoRefresh(); };
  }, []);
  return <Context.Provider value={{ session, loading, recovery, finishRecovery: () => setRecovery(false), authError, clearAuthError: () => setAuthError('') }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('AuthProvider required'); return value; }
