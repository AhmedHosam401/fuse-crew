// screens.js — pure HTML builders. app.js owns state; these only turn state into markup.
import { t, getLang } from './i18n.js';
import { avatar, esc, fmt, ROLE_COLOR, bombHTML, manualHTML, gestureChip, sfx } from './ui.js';
import { MAX_STRIKES, ROLES, CAPS, remainingMs } from './engine.js';

const roleName = (r) => t('role_' + r);
const modName = (m) => t('mod_' + m.type);

// ---------------------------------------------------------------- home
export function homeHTML(h) {
  const lang = getLang();
  return `<div class="home">
    <div class="topline">
      <button class="btn small ghost" data-act="lang">${lang === 'ar' ? 'English' : 'العربية'}</button>
      <span class="badge ${h.mode === 'firebase' ? 'ok' : ''}">${h.mode === 'firebase' ? t('fbBanner') : 'Demo'}</span>
      <button class="btn small ghost" data-act="sfx" aria-label="sound">${sfx.enabled ? '🔊' : '🔇'}</button>
    </div>
    <img class="logo" src="icons/icon.svg" alt="">
    <h1 class="title">${t('appName')}<small>${t('appSub')}</small></h1>
    <p class="muted tagline">${t('tagline')}</p>
    <input id="name" class="input" maxlength="14" autocomplete="nickname" placeholder="${t('namePh')}" value="${esc(h.name)}" aria-label="${t('yourName')}">
    <button class="btn primary" data-act="create">${t('createRoom')}</button>
    <div class="row">
      <input id="code" class="input code" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="${t('codePh')}" value="${esc(h.code)}" aria-label="${t('roomCode')}">
      <button class="btn" data-act="join" style="flex:none">${t('join')}</button>
    </div>
    <div class="err" id="err" role="alert">${esc(h.err || '')}</div>
    <button class="btn ghost" data-act="local">${t('localPlay')}</button>
    <div class="row">
      <button class="btn small ghost" data-act="how">${t('howTo')}</button>
      ${h.canInstall ? `<button class="btn small ghost" data-act="install">⬇ ${t('install')}</button>` : ''}
    </div>
    ${h.ios ? `<p class="muted">${t('installIos')}</p>` : ''}
    ${h.mode === 'demo' ? `<p class="muted card">${t('demoBanner')}</p>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- lobby
export function lobbyHTML(room, code, uid, soloLocal, voice) {
  const ids = Object.keys(room.players || {}).sort((a, b) => room.players[a].joinedAt - room.players[b].joinedAt);
  const slots = [0, 1, 2].map((i) => {
    const id = ids[i];
    if (!id) return `<div class="slot empty"><span class="nm">${t('emptySlot')}</span></div>`;
    const p = room.players[id];
    return `<div class="slot">${avatar('none', 44)}<span class="nm">${esc(p.name)}</span>
      ${p.voice ? '<span title="voice">🎤</span>' : ''}${id === room.host ? `<span class="badge">${t('host')}</span>` : ''}${id === uid ? `<span class="badge ok">${t('you')}</span>` : ''}
      <i class="dot ${p.online === false ? 'off' : ''}"></i></div>`;
  }).join('');
  const isHost = room.host === uid;
  const n = ids.length;
  const startLabel = n === 3 ? t('start') : n === 1 ? t('startSolo') : t('startFew', { n });
  return `<div class="topline"><button class="btn small ghost" data-act="leave">← ${t('leave')}</button><span class="badge">${t('lobby')}</span></div>
    <div class="card"><div class="muted" style="text-align:center">${t('roomCode')}</div>
      <div class="roomcode">${esc(code)}</div>
      ${soloLocal ? '' : `<div style="text-align:center;margin-top:6px"><button class="btn small ghost" data-act="copy">${t('shareRoom')}</button></div>`}
    </div>
    <div><h3 class="muted" style="margin-bottom:8px">${t('players')} ${n}/3</h3><div class="slots">${slots}</div></div>
    ${soloLocal ? '' : voiceBarHTML(voice, null, false)}
    ${isHost ? `<button class="btn primary" data-act="start">${startLabel}</button>` : `<p class="muted" style="text-align:center">${t('waitHost')}</p>`}
    <p class="muted">${t('voiceTip')}</p>`;
}

// ---------------------------------------------------------------- play: skeleton + regions
export const playSkeleton = () => `<div id="r-top"></div><div id="r-role"></div><div id="r-voice"></div><div id="r-main"></div>
  <div id="r-pal"></div><div id="r-gest"></div><div id="r-log"></div><div id="r-say"></div>
  <div class="spacer"></div>
  <div class="row" style="flex:none"><button class="btn small ghost" data-act="leave">← ${t('leave')}</button>
  <button class="btn small ghost" data-act="sfx">${sfx.enabled ? '🔊' : '🔇'}</button></div>
  <div id="r-over"></div>`;

export function topHTML(game, round, bomb, now, shaking) {
  const rem = Math.max(0, remainingMs(game, Math.max(now, game.startedAt)));
  const pct = Math.max(0, Math.min(100, (rem / bomb.durationMs) * 100));
  const strikes = [0, 1, 2].map((i) => `<i class="${i < game.strikes ? 'on' : ''}">💥</i>`).join('');
  return `<div class="topbar${shaking ? ' shake' : ''}">
    <div class="strikes" title="${t('strikesUsed')}">${strikes}</div>
    <div class="timer${rem <= 15000 ? ' low' : ''}" id="timer">${fmt(rem)}</div>
    <div class="meta">${t('level', { n: round.level })}<br>${t('module', { a: Math.min(game.cur + 1, bomb.modules.length), b: bomb.modules.length })}</div>
    <div class="bar"><b id="barfill" style="width:${pct}%"></b></div></div>`;
}

export function roleHTML(myRoles, active) {
  const c = ROLE_COLOR[active];
  const tabs = myRoles.length > 1
    ? `<div class="tabs">${myRoles.map((r) => `<button class="tab${r === active ? ' on' : ''}" style="--c:${ROLE_COLOR[r]}" data-act="role" data-v="${r}">${avatar(r, 26)}${roleName(r)}</button>`).join('')}</div>` : '';
  return `${tabs}<div class="rolehead" style="--c:${c}">${avatar(active, 52)}<div><div class="rn">${roleName(active)}</div><div class="rd">${t('desc_' + active)}</div></div></div>`;
}

export function mainHTML(role, bomb, game, mpage) {
  const mod = bomb.modules[Math.min(game.cur, bomb.modules.length - 1)];
  if (role === 'deaf') {
    return `<div class="stage"><div class="cap">${t('bombView')} · ${modName(mod)}</div>${bombHTML(mod)}</div>`;
  }
  if (role === 'mute') {
    const tabs = ['wires', 'symbols', 'code'].map((k) => `<button class="mtab${k === mpage ? ' on' : ''}" data-act="mpage" data-v="${k}">${t('mod_' + k)}</button>`).join('');
    return `<div class="card"><div class="mtabs" style="margin-bottom:10px">${tabs}</div>${manualHTML(bomb.manual, mpage)}</div>`;
  }
  return `<div class="stage"><div class="cap">${t('controls')} · ${modName(mod)}</div>${controlsHTML(mod, game)}</div>`;
}

function controlsHTML(mod, game) {
  if (mod.type === 'wires') {
    const cut = game.x ? game.x.split(',').map(Number) : [];
    return `<div class="ctl">${mod.data.wires.map((_, i) =>
      `<button class="cutbtn${cut.includes(i) ? ' cut' : ''}" data-act="cut" data-i="${i}">${t('wire', { n: i + 1 })}</button>`).join('')}</div>`;
  }
  if (mod.type === 'symbols') {
    const done = mod.solution.slice(0, game.p);
    return `<div class="padgrid">${[0, 1, 2, 3].map((i) =>
      `<button class="pad${done.includes(i) ? ' done' : ''}" data-act="pad" data-i="${i}">${i + 1}</button>`).join('')}</div>`;
  }
  const n = mod.solution.length;
  const boxes = Array.from({ length: n }, (_, i) => `<b class="${i < game.e.length ? 'f' : ''}">${game.e[i] ?? ''}</b>`).join('');
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => `<button class="key${d === 0 ? ' keys0' : ''}" data-act="key" data-d="${d}">${d}</button>`).join('');
  return `<div class="ctl"><div class="cap" style="text-align:center">${t('codeNeeds', { n })}</div><div class="entered">${boxes}</div><div class="keypad">${keys}</div></div>`;
}

export function gestHTML(role, list) {
  const label = role === 'mute' ? t('sentLabel') : t('gotLabel');
  const chips = list.length
    ? list.slice(-12).map((g, i, a) => gestureChip(g.g, i === a.length - 1)).join('')
    : `<span class="empty" style="flex:1">${t('noGestures')}</span>`;
  return `<div class="muted" style="margin-bottom:4px">${label}</div><div class="gstrip">${chips}</div>`;
}

export function logHTML(list, players) {
  if (!list.length) return `<div class="log"><div class="empty">${t('noChat')}</div></div>`;
  return `<div class="log" id="logbox">${list.slice(-30).map((m) =>
    `<div class="msg">${avatar(m.role, 26)}<div><span class="who">${esc((players[m.from] && players[m.from].name) || '?')} · ${roleName(m.role)}</span>${esc(m.text)}</div></div>`).join('')}</div>`;
}
export const deafHTML = () => `<div class="log"><div class="deafbox">${t('cantHear')}</div></div>`;
export const muteHTML = () => `<div class="deafbox">${t('muteNote')}</div>`;
export const sayHTML = () => `<div class="say"><input id="say" class="input" maxlength="140" autocomplete="off" placeholder="${t('sayPh')}"><button class="btn primary" data-act="say">${t('send')}</button></div>`;

// ---------------------------------------------------------------- overlays
export function overHTML(o) {
  if (o.count > 0) {
    return `<div class="overlay"><div class="sheet">
      <div class="muted">${t('youAre')}</div>
      ${o.roles.map((r) => `<div style="color:${ROLE_COLOR[r]}">${avatar(r, 96)}<h2>${roleName(r)}</h2><p class="muted">${t('desc_' + r)}</p></div>`).join('')}
      <div class="timer">${o.count}</div><div class="muted">${t('ready')}</div></div></div>`;
  }
  const g = o.game;
  if (g.status === 'playing') return '';
  const won = g.status === 'won';
  const left = remainingMs(g, g.endedAt);
  const next = o.isHost
    ? `<button class="btn primary" data-act="next">${won ? t('nextLevel') : t('retry')}</button>`
    : `<p class="muted">${t('waitNext')}</p>`;
  return `<div class="overlay"><div class="sheet ${won ? 'win' : 'lose'}">
    <h2>${won ? t('won') : t('lost')}</h2>
    ${won ? '' : `<p class="muted">${t('reason_' + (g.reason || 'time'))}</p>`}
    <div class="stats">
      <div><span class="muted">${t('timeLeft')}</span><b>${won ? fmt(left) : '0:00'}</b></div>
      <div><span class="muted">${t('strikesUsed')}</span><b>${g.strikes}/${MAX_STRIKES}</b></div>
      <div><span class="muted">${t('level', { n: '' }).trim()}</span><b>${o.level}</b></div>
    </div>${next}
    <button class="btn ghost" data-act="leave">${t('toHome')}</button></div></div>`;
}

export function howHTML() {
  return `<div class="overlay" data-act="closemodal"><div class="sheet how" data-stop="1">
    <h2 style="font-size:24px">${t('howTo')}</h2>${t('howBody').map((l) => `<p>${l}</p>`).join('')}
    <button class="btn primary" data-act="closemodal">${t('close')}</button></div></div>`;
}
export { ROLES };
export const fmtTime = fmt;

// voice status bar. `restricted` = a round is being played, so the role's senses apply
export function voiceBarHTML(v, role, restricted) {
  if (!v || !v.supported) return `<div class="muted">${t('voiceUnsupported')}</div>`;
  if (!v.joined) return `<div class="voicebar"><button class="btn small" data-act="voicejoin">${t('voiceJoin')}</button></div>`;
  const cap = CAPS[role] || { speaks: true, hears: true };
  const noSpeak = restricted && !cap.speaks;
  const noHear = restricted && !cap.hears;
  const mic = !v.micOk ? ['bad', t('voiceNoMic')] : noSpeak ? ['bad', t('voiceMicBlocked')] : v.userMuted ? ['bad', t('voiceMicMuted')] : ['ok', t('voiceMicOn')];
  const ear = noHear ? ['bad', t('voiceEarBlocked')] : ['ok', t('voiceEarOn')];
  return `<div class="voicebar"><span class="vchip ${mic[0]}">${mic[1]}</span><span class="vchip ${ear[0]}">${ear[1]}</span>
    <span class="vchip" title="links">🔗 ${v.connected}/${v.total}</span>
    ${v.micOk && !noSpeak ? `<button class="btn small ghost" data-act="micmute">${v.userMuted ? t('voiceUnmute') : t('voiceMute')}</button>` : ''}
    ${v.blocked ? `<button class="btn small" data-act="audioplay">${t('voiceTapPlay')}</button>` : ''}
    <button class="btn small ghost" data-act="voiceleave">${t('voiceLeave')}</button></div>`;
}
