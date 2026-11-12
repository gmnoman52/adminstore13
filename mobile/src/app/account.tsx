import { metadataFor } from '../components/page-metadata';
import { validateNewPassword } from '../lib/password';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { useAuth } from '../auth';
import { requireSupabase } from '../lib/supabase';
import { useStore } from '../store';
import { Screen, Heading, Button, s } from '../components/ui';
import { authRedirectUrl, signInWithGoogle } from '../lib/oauth';
import { Field, Notice } from '../components/form';
import { colors as c } from '../theme';

export default function Account() {
  const { session, loading, recovery, finishRecovery, authError, clearAuthError } = useAuth();
  const { clearCart } = useStore();
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  function switchMode(next: typeof mode) { setMode(next); setMessage(''); setPassword(''); setConfirmation(''); }
  async function googleLogin() {
    if (busy) return;
    setBusy(true); setFailed(false); setMessage(''); clearAuthError();
    try { if (!await signInWithGoogle()) setMessage('Google sign-in cancelled. You can try again'); }
    catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Couldn’t sign in with Google. Please try again'); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (busy) return;
    setMessage(''); setFailed(false); clearAuthError();
    try {
      const client = requireSupabase();
      if (!recovery && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter a valid email address');
      if (recovery || mode === 'signup') validateNewPassword(password);
      if (!recovery && mode === 'login' && !password) throw new Error('Enter your password');
      if ((recovery || mode === 'signup') && password !== confirmation) throw new Error('Passwords do not match');
      if (mode === 'signup' && !name.trim()) throw new Error('Enter your name');
      setBusy(true);
      const redirectTo = authRedirectUrl();
      if (recovery) {
        const { error } = await client.auth.updateUser({ password }); if (error) throw error;
        setPassword(''); setConfirmation(''); finishRecovery(); setMessage('Your password has been updated');
      } else if (mode === 'reset') {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo }); if (error) throw error;
        setMessage('If this email has an account, a password reset link has been sent');
      } else if (mode === 'signup') {
        const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() }, emailRedirectTo: redirectTo } }); if (error) throw error;
        setPassword(''); setConfirmation(''); setMessage(data.session ? 'Your account is ready' : 'Check your email to confirm your account, then log in');
      } else {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error;
        setPassword(''); setMessage('');
      }
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Something went wrong. Try again'); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setMessage('');
    try { const { error } = await requireSupabase().auth.signOut(); if (error) throw error; clearCart(); setMode('login'); }
    catch { setFailed(true); setMessage('Couldn’t log out. Check your connection and try again'); }
    finally { setBusy(false); }
  }
  if (loading) return <Screen><ActivityIndicator color={c.brand} accessibilityLabel="Restoring your account"/></Screen>;
  if (session && !recovery) return <Screen><Heading title="Your account" subtitle={session.user.email ?? ''}/><Notice text="You’re signed in successfully"/><Text style={{ color: c.textPrimary, fontSize: 18 }}>{session.user.user_metadata.full_name || 'United Super Store customer'}</Text><Notice text={message} error={failed}/><Button title={busy ? 'Logging out…' : 'Log out'} onPress={logout} disabled={busy} quiet/></Screen>;
  return <Screen><Heading title={recovery ? 'Choose a new password' : mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Log in'} subtitle="Your account at United Super Store"/>
    {!recovery && mode !== 'reset' && <View><Pressable accessibilityRole="button" accessibilityLabel="Continue with Google" disabled={busy} accessibilityState={{ disabled: busy }} onPress={() => void googleLogin()} style={({pressed}) => [s.button, s.quiet, { marginTop: 0, flexDirection: 'row', gap: 12 }, (pressed || busy) && s.pressed]}><Image source={require('../../assets/google-logo-small.png')} style={{ width: 20, height: 20 }} accessibilityElementsHidden importantForAccessibility="no"/><Text style={[s.buttonText, { color: c.textPrimary }]}>Continue with Google</Text></Pressable><Text style={{ color: c.textMuted, textAlign: 'center', marginTop: 24 }}>Or use your email</Text></View>}
    {mode === 'signup' && !recovery && <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" maxLength={160}/>}
    {!recovery && <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" maxLength={254}/>}
    {(mode !== 'reset' || recovery) && <Field label={recovery ? 'New password' : 'Password'} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'signup' || recovery ? 'new-password' : 'current-password'}/>}
    {(mode === 'signup' || recovery) && <Field label="Confirm password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoComplete="new-password"/>}
    <Notice text={message || authError} error={failed || Boolean(authError)}/><Button title={busy ? 'Please wait…' : recovery ? 'Update password' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Log in'} onPress={submit} disabled={busy}/>
    {!recovery && <><Button title={mode === 'login' ? 'Create an account' : 'Back to login'} onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')} quiet disabled={busy}/>{mode === 'login' && <Button title="Forgot password?" onPress={() => switchMode('reset')} quiet disabled={busy}/>}</>}
  </Screen>;
}

export function generateMetadata() { return metadataFor('/account'); }
