// voice.js — peer-to-peer voice (WebRTC mesh, max 3 players = 3 links).
// Signaling (offer/answer/ICE) travels through the same net layer as the game: rooms/CODE/rtc/<toUid>/<pushId>.
// The game decides per round who may speak / hear through setRules(); it is enforced on BOTH ends of every link:
//   speak=false -> the local mic track is disabled (silence is sent)
//   hear=false  -> every incoming <audio> element is muted
// On top of that the player has two switches of their own (setUserMuted / setUserDeaf); both start ON (mic and audio open).
import { ICE_SERVERS } from '../rtc-config.js';

export const voiceSupported = () => typeof RTCPeerConnection !== 'undefined';

export function createVoice(net, code, uid, onChange) {
  const base = `rooms/${code}/rtc`;
  const peers = new Map();            // remoteUid -> { pc, cid, audio, pending, outbox, ready, created }
  const early = new Map();            // "uid:cid" -> ICE messages that arrived before their offer
  const seen = new Set();
  let stream = null; let track = null;
  let joined = false; let micOk = false; let userMuted = false; let userDeaf = false; let blocked = false;
  let rules = { speak: true, hear: true };
  let lastPlayers = {}; let unsub = null; let timer = null; let chain = Promise.resolve();

  // `speak` / `hear` are what the game's rules allow; `userMuted` / `userDeaf` are the player's own on/off switches.
  // A sense is live only when the game allows it AND the player did not switch it off.
  const status = () => ({
    joined, micOk, userMuted, userDeaf, blocked, speak: rules.speak, hear: rules.hear,
    micLive: micOk && rules.speak && !userMuted, earLive: rules.hear && !userDeaf,
    total: peers.size, connected: [...peers.values()].filter((p) => p.pc.connectionState === 'connected').length,
  });
  const emit = () => { if (onChange) onChange(status()); };

  function applyRules(silent) {
    if (track) track.enabled = rules.speak && !userMuted;
    for (const p of peers.values()) if (p.audio) p.audio.muted = !rules.hear || userDeaf;
    if (!silent) emit();
  }

  const send = (to, msg) => net.push(`${base}/${to}`, { from: uid, t: net.now(), ...msg });

  function flush(id, peer) {
    peer.ready = true;
    peer.outbox.splice(0).forEach((m) => send(id, m));
  }

  function makePeer(id, cid) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = { pc, cid, audio: null, pending: [], outbox: [], ready: false, created: Date.now() };
    if (track) pc.addTrack(track, stream); else pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const m = { type: 'ice', cid, c: JSON.stringify(e.candidate.toJSON()) };
      if (peer.ready) send(id, m); else peer.outbox.push(m);
    };
    pc.ontrack = (e) => {
      const a = peer.audio || new Audio();
      a.autoplay = true; a.playsInline = true;
      a.srcObject = e.streams[0] || new MediaStream([e.track]);
      a.muted = !rules.hear || userDeaf;
      peer.audio = a;
      a.play().then(() => { if (blocked) { blocked = false; emit(); } }).catch(() => { blocked = true; emit(); });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') close(id, pc);
      else emit();
    };
    peers.set(id, peer);
    (early.get(`${id}:${cid}`) || []).forEach((c) => peer.pending.push(c));
    early.delete(`${id}:${cid}`);
    emit();
    return peer;
  }

  function close(id, onlyIfPc) {
    const p = peers.get(id);
    if (!p || (onlyIfPc && p.pc !== onlyIfPc)) return;
    peers.delete(id);
    try { p.pc.onconnectionstatechange = null; p.pc.close(); } catch (e) { /* already closed */ }
    if (p.audio) { p.audio.srcObject = null; }
    emit();
  }

  async function startCall(id) {
    const peer = makePeer(id, Math.random().toString(36).slice(2, 8));
    try {
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      send(id, { type: 'offer', cid: peer.cid, sdp: JSON.stringify(peer.pc.localDescription) });
      flush(id, peer);
    } catch (e) { console.warn('voice offer failed', e); close(id); }
  }

  async function addPendingIce(peer) {
    for (const c of peer.pending.splice(0)) { try { await peer.pc.addIceCandidate(JSON.parse(c)); } catch (e) { /* stale candidate */ } }
  }

  async function handle(m) {
    const { from, type, cid } = m;
    try {
      if (type === 'offer') {
        close(from);                                   // a fresh offer replaces any old link
        const peer = makePeer(from, cid);
        await peer.pc.setRemoteDescription(JSON.parse(m.sdp));
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        send(from, { type: 'answer', cid, sdp: JSON.stringify(peer.pc.localDescription) });
        flush(from, peer);
        await addPendingIce(peer);
      } else if (type === 'answer') {
        const peer = peers.get(from);
        if (!peer || peer.cid !== cid || peer.pc.signalingState !== 'have-local-offer') return;
        await peer.pc.setRemoteDescription(JSON.parse(m.sdp));
        await addPendingIce(peer);
      } else if (type === 'ice') {
        const peer = peers.get(from);
        if (!peer || peer.cid !== cid) { const k = `${from}:${cid}`; early.set(k, (early.get(k) || []).concat(m.c)); return; }
        if (peer.pc.remoteDescription) { try { await peer.pc.addIceCandidate(JSON.parse(m.c)); } catch (e) { /* stale */ } } else peer.pending.push(m.c);
      }
    } catch (e) { console.warn('voice signal failed', type, e); }
  }

  function onInbox(box) {
    if (!box) return;
    const keys = Object.keys(box).filter((k) => !seen.has(k)).sort((a, b) => (box[a].t - box[b].t) || (a < b ? -1 : 1));
    // offers first, so ICE that raced ahead of its offer is simply replayed from `early`
    keys.sort((a, b) => (box[a].type === 'offer' ? -1 : 0) - (box[b].type === 'offer' ? -1 : 0));
    for (const k of keys) {
      seen.add(k);
      chain = chain.then(() => handle(box[k])).then(() => net.remove(`${base}/${uid}/${k}`));
    }
  }

  function sync(players) {
    lastPlayers = players || {};
    if (!joined) return;
    const want = new Set(Object.keys(lastPlayers).filter((id) => id !== uid && lastPlayers[id].voice === true));
    for (const id of want) if (!peers.has(id) && uid < id) startCall(id);       // the smaller uid always makes the offer
    for (const [id, p] of [...peers]) {
      if (!want.has(id)) close(id);
      else if (p.pc.connectionState !== 'connected' && Date.now() - p.created > 12000) close(id); // stuck: retry
    }
  }

  return {
    async join() {
      if (joined) return status();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        track = stream.getAudioTracks()[0]; micOk = !!track;
      } catch (e) { micOk = false; stream = null; track = null; }
      await net.remove(`${base}/${uid}`);
      unsub = net.on(`${base}/${uid}`, onInbox);
      timer = setInterval(() => sync(lastPlayers), 3000);
      joined = true;
      applyRules(true); emit();
      return status();
    },
    sync,
    setRules(r) {
      if (r.speak === rules.speak && r.hear === rules.hear) return;
      rules = { speak: r.speak, hear: r.hear };
      applyRules();
    },
    setUserMuted(v) { userMuted = !!v; applyRules(); },
    setUserDeaf(v) { userDeaf = !!v; applyRules(); },
    resumeAudio() { peers.forEach((p) => p.audio && p.audio.play().then(() => { blocked = false; emit(); }).catch(() => {})); },
    async leave() {
      if (!joined) return;
      joined = false;
      clearInterval(timer); if (unsub) unsub();
      [...peers.keys()].forEach((id) => close(id));
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null; track = null; micOk = false; blocked = false;
      try { await net.remove(`${base}/${uid}`); } catch (e) { /* room may be gone */ }
      emit();
    },
    status,
    _peers: peers,       // exposed for tests
  };
}
