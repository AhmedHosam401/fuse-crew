// account.js — everything about "who am I" that does not touch the screen: name rules, the hidden e-mail Firebase needs,
// error codes, and the fingerprint (WebAuthn) lock.
//
// An account is a NAME and a CODE. Firebase Authentication wants an e-mail + password, so the name is turned into a
// private address (name -> hex -> "<hex>@players.fuse-crew.app"; nothing is ever sent there) and the code is the password.
// The same name always gives the same address, so two players cannot register the same name.

export const NAME_MIN = 2;
export const NAME_MAX = 14;
export const CODE_MIN = 6;      // Firebase Authentication's own minimum password length
export const CODE_MAX = 32;
export const EMAIL_DOMAIN = 'players.fuse-crew.app';

// what the player typed, tidied: one script/width, single spaces
export const cleanName = (raw) => String(raw == null ? '' : raw).normalize('NFKC').replace(/\s+/g, ' ').trim();
export const validName = (n) => n.length >= NAME_MIN && n.length <= NAME_MAX && /^[\p{L}\p{N}\p{M} _-]+$/u.test(n);
export const validCode = (c) => typeof c === 'string' && c.length >= CODE_MIN && c.length <= CODE_MAX;

// the key of a name: case and Arabic marks (tashkeel, tatweel) do not matter, so "Ahmed" and "ahmed" are the same player
export function nameKey(raw) {
  const n = cleanName(raw).toLowerCase().replace(/[ً-ٰٟـ]/g, '');
  return Array.from(new TextEncoder().encode(n), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const emailFor = (name) => `${nameKey(name)}@${EMAIL_DOMAIN}`;
export const keyFromEmail = (email) => String(email || '').split('@')[0];
export function nameFromKey(key) {         // only used when a profile is missing: the lower-cased name back from its key
  try { const b = (String(key).match(/../g) || []).map((h) => parseInt(h, 16)); return new TextDecoder().decode(new Uint8Array(b)); } catch (e) { return ''; }
}

// Firebase / demo errors -> the i18n key of the message to show
export function authErrorKey(code) {
  const c = String(code || '');
  if (/email-already-in-use|already-taken|taken/.test(c)) return 'errTaken';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login|bad-login/.test(c)) return 'errLogin';
  if (/weak-password/.test(c)) return 'errWeakCode';
  if (/operation-not-allowed|admin-restricted/.test(c)) return 'errAuthOff';
  if (/too-many-requests/.test(c)) return 'errBusy';
  return 'errNet';
}
export const authError = (code) => { const e = new Error(authErrorKey(code)); e.key = e.message; return e; };

// ---------------------------------------------------------------- fingerprint lock (WebAuthn, platform authenticator)
// This is a lock on THIS device: the saved sign-in only opens after the phone's own fingerprint / face / screen lock says yes.
// (To sign in on another phone, the name + code are still needed.)
const b64 = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
};
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

export async function bioAvailable() {
  try {
    return !!(window.isSecureContext && window.PublicKeyCredential && navigator.credentials
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch (e) { return false; }
}
// register a fingerprint credential for this account; returns its id (to be remembered on this device) or null
export async function bioEnroll(uid, name) {
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: rand(32),
        rp: { name: 'Fuse Crew' },
        user: { id: new TextEncoder().encode(String(uid).slice(0, 64)), name: name, displayName: name },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60000,
      },
    });
    return cred ? b64.enc(cred.rawId) : null;
  } catch (e) { return null; }
}
// ask the phone for the fingerprint; true only if it was given
export async function bioVerify(credId) {
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: rand(32),
        allowCredentials: [{ type: 'public-key', id: b64.dec(credId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!got;
  } catch (e) { return false; }
}
