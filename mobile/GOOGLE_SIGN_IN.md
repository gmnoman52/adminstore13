# Google sign-in

## Firebase web configuration

The provided Firebase project united-super-store-e6131 is configured through the public variables in `.env.example`. Its runtime integration is in src/lib/firebase.web.ts. Web sign-in uses Firebase Authentication's Google popup, extracts the Google credential, then exchanges Google's ID token for a Supabase session. A Firebase user token is not passed to Supabase as a Google token. Firebase's intermediate session is in memory and signed out after the exchange. Analytics is not initialised by this authentication integration.

Public Firebase checks confirmed Google is enabled and localhost is authorised. Its Google OAuth web client ID is:

594020358252-2d41p2qa5sugb7qt91gq8do03619a0d5.apps.googleusercontent.com

Enable Supabase's Google provider with this client ID (and the matching client secret from Firebase's Google Web SDK configuration for the Android browser flow). Add https://cforjvxhxduyasgllfhj.supabase.co/auth/v1/callback to that client's authorised redirect URIs in Google Cloud for the native browser flow. Save the secret only in Supabase's provider settings.

Firebase Google is already enabled and localhost is authorised. Add 127.0.0.1 only if you use that host. The Google OAuth web client used by Firebase must also be enabled/allowed in Supabase's Google provider so its token audience can be verified. The Firebase apiKey is not a Google OAuth client ID or client secret. The configuration snippet alone cannot enable these server-side settings.

This Firebase popup is web-only. Installed Android builds continue to use the system-browser Supabase OAuth flow described below; an HTML script tag cannot run inside a native React Native screen.

The customer login and signup screens include Continue with Google. Web uses the Firebase popup; installed Android builds use the system authentication browser and return to unitedsuperstore://account. PKCE binds the Android callback code to the device that started sign-in. The existing email/password flow and separate passcode admin remain available.

## Provider setup required

Public Auth settings now confirm Google is enabled. No Google client secret is embedded in the app. For another installation, configure the provider as follows:

1. In Google Cloud / Google Auth Platform, create or select the store project and configure its consent screen, audience and support contact. If the app is in testing, add the real testing accounts.
2. Create an OAuth client of type Web application for this Supabase-hosted browser OAuth flow. Add the relevant website origins, including http://localhost:8081 during development.
3. Add this exact Google authorised redirect URI:
   https://cforjvxhxduyasgllfhj.supabase.co/auth/v1/callback
4. In Supabase Authentication > Sign In / Providers > Google, enable Google and save the OAuth client ID and client secret there. Never place the secret in EXPO_PUBLIC variables, Git, browser source or chat.
5. In Supabase Authentication URL Configuration, allow unitedsuperstore://account for Android and http://localhost:8081/account for web development. If using 127.0.0.1, also allow http://127.0.0.1:8081/account. Add the real HTTPS customer app origin and callback before production.

Use an installed development/preview Android build for the custom-scheme flow, not Expo Go. No Android native Google SDK or SHA fingerprint is required for this browser-based integration; native Google SDK integration would require its own OAuth client setup.

## Behaviour and checks

- Requests Google's standard sign-in identity, not Gmail or Drive permissions.
- A disabled provider produces an inline message and leaves email sign-in available.
- Cancellation, provider errors and invalid callbacks are handled without claiming a successful login.
- Android's browser return and deep-link listener share callback completion so a one-use PKCE code is not exchanged twice.
- Real Google consent, account selection and return-to-app require the provider setup and a real account. They cannot be verified while Google is disabled.

Official references:
https://supabase.com/docs/guides/auth/social-sign-in/auth-google
https://supabase.com/docs/guides/auth/native-mobile-deep-linking
https://docs.expo.dev/versions/v58.0.0/sdk/webbrowser/

The Google G asset is from https://developers.google.com/identity/images/g-logo.png.
