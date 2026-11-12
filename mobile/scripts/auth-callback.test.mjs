import assert from 'node:assert/strict';
import { parseAuthCallback } from '../src/lib/auth-callback-params.ts';

assert.deepEqual(parseAuthCallback('unitedsuperstore://account?code=one-use-code'), { code: 'one-use-code', type: null });
assert.throws(() => parseAuthCallback('unitedsuperstore://account#access_token=test-access&refresh_token=test-refresh&type=recovery'), /complete session/);
assert.deepEqual(parseAuthCallback('unitedsuperstore://account?code=recovery-code&type=recovery'), {code:'recovery-code',type:'recovery'});
assert.throws(() => parseAuthCallback('unitedsuperstore://account?error=access_denied&error_description=Sign-in+cancelled'), /Sign-in cancelled/);
assert.throws(() => parseAuthCallback('unitedsuperstore://account#access_token=incomplete'), /complete session/);
assert.throws(() => parseAuthCallback('https://localhost:8081/account?code=stolen'), /Unexpected/);
assert.throws(() => parseAuthCallback('unitedsuperstore://wrong?code=stolen'), /Unexpected/);
console.log('Passed PKCE, recovery, callback-origin and session-fixation checks');
