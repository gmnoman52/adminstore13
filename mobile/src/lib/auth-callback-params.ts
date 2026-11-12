export function parseAuthCallback(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'unitedsuperstore:' || parsed.hostname !== 'account' || !['','/'].includes(parsed.pathname) || parsed.username || parsed.password || parsed.port) throw new Error('Unexpected sign-in callback');
  const fragment = new URLSearchParams(parsed.hash.slice(1));
  const get = (name: string) => parsed.searchParams.get(name) ?? fragment.get(name);
  const error = get('error_description') || get('error');
  if (error) throw new Error(error);
  const code = get('code');
  if (code) return { code, type: get('type') };
  throw new Error('Sign-in did not return a complete session. Please try again');
}
