import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserPopupRedirectResolver, getAuth, initializeAuth, inMemoryPersistence } from 'firebase/auth';

// Firebase web configuration is public project identification, not an admin credential.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
// Supabase owns the application session; Firebase only obtains the Google credential.
// Initialise only when the browser starts sign-in, never during static page rendering.
export function getFirebaseAuth() {
  if (Object.values(firebaseConfig).some(value => !value)) throw new Error('Google sign-in is not configured. Please use email sign-in');
  const name = 'united-google';
  const existing = getApps().some(app => app.name === name);
  const app = existing ? getApp(name) : initializeApp(firebaseConfig, name);
  return existing ? getAuth(app) : initializeAuth(app, {
    persistence: inMemoryPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
}
