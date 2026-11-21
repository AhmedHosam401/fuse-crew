// social.js — accounts' data and friends, over the same tiny database API as the game (net.js).
// No screen code here: app.js calls these and draws the results.
//
// Database layout (rules in database.rules.json):
//   users/<uid>            { name, key, progress, created }     the profile; progress = highest unlocked level (1..10)
//   usernames/<key>        <uid>                                 find a player by name (the key comes from account.js)
//   friends/<uid>/<other>  { name, t }                           my friends (written on both sides when a request is accepted)
//   friendReqs/<to>/<from> { name, t }                           a pending request, read only by the receiver
//   invites/<to>/<id>      { from, name, room, t }               "come to my room", read only by the receiver
import { cleanName, nameKey } from './account.js';

export const LEVELS_MAX = 10;
export const INVITE_TTL = 10 * 60 * 1000;           // an invitation is good for ten minutes

const clampLevel = (n) => Math.min(LEVELS_MAX, Math.max(1, Math.floor(+n) || 1));

// make sure the profile exists (first sign-in after sign-up, or a sign-up that was cut short); returns it
export async function ensureProfile(net, acct, typedName, startProgress = 1) {
  const path = `users/${acct.uid}`;
  let p = await net.get(path);
  const idx = await net.get(`usernames/${acct.key}`);
  if (!p) {
    p = { name: cleanName(typedName), key: acct.key, progress: clampLevel(startProgress), created: net.now() };
    await net.update('', { [path]: p, [`usernames/${acct.key}`]: acct.uid });
  } else if (!idx) {
    await net.set(`usernames/${acct.key}`, acct.uid);          // repair the lookup entry
  }
  return p;
}
export const watchProfile = (net, uid, cb) => net.on(`users/${uid}`, cb);

// progress only ever goes up
export async function saveProgress(net, uid, level, current) {
  const n = clampLevel(level);
  if (n <= (current || 1)) return false;
  await net.set(`users/${uid}/progress`, n);
  return true;
}

// ---------------------------------------------------------------- friends
export async function findUser(net, name) {
  const n = cleanName(name); if (!n) return null;
  const uid = await net.get(`usernames/${nameKey(n)}`);
  if (!uid) return null;
  const profile = await net.get(`users/${uid}`);
  return profile ? { uid, name: profile.name, progress: profile.progress } : null;
}

// 'self' | 'already' | 'accepted' (they had asked me first) | 'sent'
export async function sendRequest(net, me, target) {
  if (target.uid === me.uid) return 'self';
  if (await net.get(`friends/${me.uid}/${target.uid}`)) return 'already';
  if (await net.get(`friendReqs/${me.uid}/${target.uid}`)) { await acceptRequest(net, me, target.uid); return 'accepted'; }
  await net.set(`friendReqs/${target.uid}/${me.uid}`, { name: me.name, t: net.now() });
  return 'sent';
}
export async function acceptRequest(net, me, fromUid) {
  const name = await net.get(`users/${fromUid}/name`);
  if (!name) { await net.remove(`friendReqs/${me.uid}/${fromUid}`); return false; }
  const t = net.now();
  await net.update('', {
    [`friends/${me.uid}/${fromUid}`]: { name, t },
    [`friends/${fromUid}/${me.uid}`]: { name: me.name, t },
    [`friendReqs/${me.uid}/${fromUid}`]: null,
  });
  return true;
}
export const declineRequest = (net, me, fromUid) => net.remove(`friendReqs/${me.uid}/${fromUid}`);
export function removeFriend(net, me, fUid) {
  return net.update('', { [`friends/${me.uid}/${fUid}`]: null, [`friends/${fUid}/${me.uid}`]: null });
}
export const watchFriends = (net, uid, cb) => net.on(`friends/${uid}`, (v) => cb(Object.entries(v || {}).map(([id, f]) => ({ id, ...f })).sort((a, b) => a.name.localeCompare(b.name))));
export const watchRequests = (net, uid, cb) => net.on(`friendReqs/${uid}`, (v) => cb(Object.entries(v || {}).map(([id, r]) => ({ id, ...r })).sort((a, b) => a.t - b.t)));

// ---------------------------------------------------------------- invitations
export const sendInvite = (net, me, friendUid, room) => net.push(`invites/${friendUid}`, { from: me.uid, name: me.name, room, t: net.now() });
export const dismissInvite = (net, meUid, id) => net.remove(`invites/${meUid}/${id}`);
// only fresh invitations count; the newest first
export const watchInvites = (net, uid, cb) => net.on(`invites/${uid}`, (v) => {
  const now = net.now();
  const all = Object.entries(v || {}).map(([id, i]) => ({ id, ...i }));
  const fresh = all.filter((i) => now - i.t < INVITE_TTL).sort((a, b) => b.t - a.t);
  all.filter((i) => now - i.t >= INVITE_TTL).forEach((i) => net.remove(`invites/${uid}/${i.id}`).catch(() => {}));
  cb(fresh);
});
