// screens.js — pure HTML builders. app.js owns state; these only turn state into markup.
import { t, getLang } from './i18n.js';
import { avatar, esc, fmt, ROLE_COLOR, bombHTML, manualHTML, gestureChip, sfx, icon, theme } from './ui.js';
import { MAX_STRIKES, ROLES, CAPS, remainingMs, everyonePicked } from './engine.js';

const roleName = (r) => t('role_' + r);
const modName = (m) => t('mod_' + m.type);
// the order the user thinks in: Blind (hands), Deaf (eyes + voice), Mute (manual)
export const ROLE_ORDER = ['blind', 'deaf', 'mute'];

// ---------------------------------------------------------------- small shared pieces
export const themeBtn = () => {
  const toLight = theme.get() === 'dark';
  const label = t(toLight ? 'themeToLight' : 'themeToDark');
  return `<button class="iconbtn" data-act="theme" aria-label="${label}" title="${label}">${icon(toLight ? 'sun' : 'moon')}</button>`;
};
export const sfxBtn = () => {
  const label = t(sfx.enabled ? 'sfxOn' : 'sfxOff');
  return `<button class="iconbtn" data-act="sfx" aria-label="${label}" title="${label}">${icon('note', { off: !sfx.enabled })}</button>`;
};
const leaveBtn = () => `<button class="btn small ghost" data-act="leave">${icon('back', { size: 18 })}<span>${t('leave')}</span></button>`;

// ---------------------------------------------------------------- boot (a saved room is being restored)
export function bootHTML() {
  return `<div class="home boot">
    <img class="logo" src="icons/icon.svg" alt="">
    <div class="spinner" role="status" aria-label="${t('reconnecting')}"></div>
    <p class="muted" style="text-align:center">${t('reconnecting')}</p>
    <button class="btn small ghost" data-act="skipboot">${t('skip')}</button>
  </div>`;
}

// ---------------------------------------------------------------- home
export function homeHTML(h) {
  const lang = getLang();
  return `<div class="home">
    <div class="topline">
      <button class="btn small ghost" data-act="lang">${icon('globe', { size: 18 })}<span>${lang === 'ar' ? 'English' : 'العربية'}</span></button>
      <span class="badge ${h.mode === 'firebase' ? 'ok' : ''}">${h.mode === 'firebase' ? t('fbBanner') : 'Demo'}</span>
      <span class="tools">${themeBtn()}${sfxBtn()}</span>
    </div>
    <div class="hero">
      <img class="logo" src="icons/icon.svg" alt="">
      <h1 class="title">${t('appName')}<small>${t('appSub')}</small></h1>
      <p class="muted tagline">${t('tagline')}</p>
    </div>
    <div class="card form">
      <input id="name" class="input" maxlength="14" autocomplete="nickname" placeholder="${t('namePh')}" value="${esc(h.name)}" aria-label="${t('yourName')}">
      <button class="btn primary" data-act="create">${t('createRoom')}</button>
      <div class="or"><span>${t('joinRoom')}</span></div>
      <div class="row">
        <input id="code" class="input code" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="${t('codePh')}" value="${esc(h.code)}" aria-label="${t('roomCode')}">
        <button class="btn" data-act="join" style="flex:none">${t('join')}</button>
      </div>
      <div class="err" id="err" role="alert">${esc(h.err || '')}</div>
    </div>
    <button class="btn ghost" data-act="local">${t('localPlay')}</button>
    <div class="row">
      <button class="btn small ghost" data-act="how">${icon('help', { size: 18 })}<span>${t('howTo')}</span></button>
      ${h.canInstall ? `<button class="btn small ghost" data-act="install">${icon('download', { size: 18 })}<span>${t('install')}</span></button>` : ''}
    </div>
    ${h.ios ? `<p class="muted">${t('installIos')}</p>` : ''}
    ${h.mode === 'demo' ? `<p class="muted card">${t('demoBanner')}</p>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- lobby
// roles held by each player, from the room's picks (only players who are still in the room count)
export function pickedMap(room) {
  const out = {};
  for (const r of ROLES) {
    const id = room.picks && room.picks[r];
    if (id && room.players && room.players[id]) out[r] = id;
  }
  return out;
}

export function lobbyHTML(room, code, uid, soloLocal, voice) {
  const ids = Object.keys(room.players || {}).sort((a, b) => room.players[a].joinedAt - room.players[b].joinedAt);
  const isHost = room.host === uid;
  const mode = room.roleMode === 'pick' ? 'pick' : 'random';
  const picked = pickedMap(room);
  const roleOf = (id) => ROLES.find((r) => picked[r] === id);
  const n = ids.length;

  const slots = [0, 1, 2].map((i) => {
    const id = ids[i];
    if (!id) return `<div class="slot empty"><span class="nm">${t('emptySlot')}</span></div>`;
    const p = room.players[id];
    const r = mode === 'pick' ? roleOf(id) : null;
    return `<div class="slot">${avatar(r || 'none', 44)}
      <span class="nm">${esc(p.name)}${r ? `<small style="color:${ROLE_COLOR[r]}">${roleName(r)}</small>` : ''}</span>
      ${p.voice ? `<span class="vdot" title="voice">${icon('mic', { size: 16 })}</span>` : ''}${id === room.host ? `<span class="badge">${t('host')}</span>` : ''}${id === uid ? `<span class="badge ok">${t('you')}</span>` : ''}
      <i class="dot ${p.online === false ? 'off' : ''}"></i></div>`;
  }).join('');

  const modeCard = soloLocal ? '' : `<div class="card">
    <h3 class="sect">${t('roleMode')}</h3>
    <div class="seg" role="group" aria-label="${t('roleMode')}">
      <button class="segbtn${mode === 'random' ? ' on' : ''}" data-act="rolemode" data-v="random" ${isHost ? '' : 'disabled'}>${icon('shuffle', { size: 18 })}<span>${t('rmRandom')}</span></button>
      <button class="segbtn${mode === 'pick' ? ' on' : ''}" data-act="rolemode" data-v="pick" ${isHost ? '' : 'disabled'}>${icon('pick', { size: 18 })}<span>${t('rmPick')}</span></button>
    </div>
    <p class="muted">${t(mode === 'pick' ? 'rmPickDesc' : 'rmRandomDesc')}${isHost ? '' : `<br>${t('hostChooses')}`}</p>
  </div>`;

  const picker = mode === 'pick' && !soloLocal ? `<div><h3 class="sect">${t('pickTitle')}</h3><div class="picker">${ROLE_ORDER.map((r) => {
    const holder = picked[r];
    const mine = holder === uid;
    const who = holder ? (mine ? t('pickYou') : esc(room.players[holder].name)) : t('pickFree');
    return `<button class="pick${mine ? ' mine' : ''}${holder && !mine ? ' taken' : ''}" style="--c:${ROLE_COLOR[r]}" data-act="pick" data-v="${r}" aria-pressed="${mine}">
      ${avatar(r, 52)}<span class="ptx"><b>${roleName(r)}</b><small>${t('desc_' + r)}</small></span>
      <span class="who${holder ? ' held' : ''}">${mine ? icon('check', { size: 16 }) : ''}${who}</span></button>`;
  }).join('')}</div></div>` : '';

  const canStart = mode !== 'pick' || soloLocal || everyonePicked(ids, picked);
  const startLabel = n === 3 ? t('start') : n === 1 ? t('startSolo') : t('startFew', { n });
  const startBlock = isHost
    ? `<button class="btn primary" data-act="start" ${canStart ? '' : 'disabled'}>${startLabel}</button>${canStart ? '' : `<p class="muted" style="text-align:center">${t('pickNeed')}</p>`}`
    : `<p class="muted" style="text-align:center">${t('waitHost')}</p>`;

  return `<div class="topline">${leaveBtn()}<span class="badge">${t('lobby')}</span><span class="tools">${themeBtn()}${sfxBtn()}</span></div>
    <div class="card roomcard"><div class="muted" style="text-align:center">${t('roomCode')}</div>
      <div class="roomcode">${esc(code)}</div>
      ${soloLocal ? '' : `<div style="text-align:center;margin-top:8px"><button class="btn small ghost" data-act="copy">${icon('copy', { size: 18 })}<span>${t('shareRoom')}</span></button></div>`}
    </div>
    <div><h3 class="sect">${t('players')} ${n}/3</h3><div class="slots">${slots}</div></div>
    ${modeCard}
    ${picker}
    ${soloLocal ? '' : voiceBarHTML(voice, null, false)}
    ${startBlock}
    ${soloLocal ? '' : `<p class="muted tip">${t('voiceTip')}</p>`}`;
}

// ---------------------------------------------------------------- play: skeleton + regions
export const playSkeleton = () => `<div class="topline playtools">${leaveBtn()}<span class="tools">${themeBtn()}${sfxBtn()}</span></div>
  <div id="r-head" class="head"><div id="r-top"></div><div id="r-voice"></div></div>
  <div id="r-role"></div><div id="r-main"></div>
  <div id="r-pal"></div><div id="r-gest"></div><div id="r-log"></div><div id="r-say"></div>
  <div class="spacer"></div>
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
    // one phone holding all three roles (practice): smaller cards so the whole deal fits on the screen
    const compact = o.roles.length > 1;
    return `<div class="overlay instant"><div class="sheet">
      <div class="muted">${t('youAre')}</div>
      ${o.roles.map((r) => `<div class="deal${compact ? ' compact' : ''}" style="color:${ROLE_COLOR[r]}">${avatar(r, compact ? 56 : 96)}<div class="dtx"><h2>${roleName(r)}</h2><p class="muted">${t('desc_' + r)}</p></div></div>`).join('')}
      <div class="timer" id="cd">${o.count}</div><div class="muted">${t('ready')}</div></div></div>`;
  }
  const g = o.game;
  if (g.status === 'playing') return '';
  const won = g.status === 'won';
  const left = remainingMs(g, g.endedAt);
  const next = o.isHost
    ? `<button class="btn primary" data-act="next">${won ? t('nextLevel') : t('retry')}</button>
       ${o.canRoom ? `<button class="btn" data-act="toroom">${t('backToRoom')}</button>` : ''}`
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

// confirmation dialog (used for "leave the game / room?" — also reachable with the system back button)
export function dialogHTML(d) {
  return `<div class="overlay" data-act="dlg-cancel"><div class="sheet dlg" data-stop="1" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
    <h2 id="dlg-title">${esc(d.title)}</h2><p class="muted">${esc(d.body)}</p>
    <div class="row dlgbtns"><button class="btn" data-act="dlg-cancel">${esc(d.cancel)}</button><button class="btn danger" data-act="dlg-ok">${esc(d.ok)}</button></div>
  </div></div>`;
}
export { ROLES };
export const fmtTime = fmt;

// ---------------------------------------------------------------- voice controls
// Two switches: the microphone and the headphones. Both start ON. A press turns it off, another press turns it on.
// While a round is being played the game switches the Mute's mic and the Deaf's headphones off for good ("locked").
// `restricted` = a round is being played, so the role's senses apply.
export function voiceBarHTML(v, role, restricted) {
  if (!v || !v.supported) return `<div class="muted">${t('voiceUnsupported')}</div>`;
  if (!v.joined) {
    return v.connecting
      ? `<div class="voicebar"><span class="muted">${t('voiceConnecting')}</span></div>`
      : `<div class="voicebar"><button class="btn small" data-act="voicejoin">${icon('mic', { size: 18 })}<span>${t('voiceJoin')}</span></button></div>`;
  }
  const cap = CAPS[role] || { speaks: true, hears: true };
  const noSpeak = restricted && !cap.speaks;
  const noHear = restricted && !cap.hears;

  let mic = { st: 'on', label: t('micOn'), off: false };
  if (noSpeak) mic = { st: 'locked', label: t('micLocked'), off: true };
  else if (!v.micOk) mic = { st: 'none', label: t('micNone'), off: true };
  else if (v.userMuted) mic = { st: 'off', label: t('micOff'), off: true };

  let ear = { st: 'on', label: t('earOn'), off: false };
  if (noHear) ear = { st: 'locked', label: t('earLocked'), off: true };
  else if (v.userDeaf) ear = { st: 'off', label: t('earOff'), off: true };

  const btn = (act, ico, title, s) => `<button class="vbtn ${s.st}" data-act="${act}" aria-pressed="${!s.off}" aria-label="${title}: ${s.label}" ${s.st === 'locked' ? 'aria-disabled="true"' : ''}>
      <span class="vico">${icon(ico, { size: 22, off: s.off && s.st !== 'locked' })}${s.st === 'locked' ? `<span class="vlock">${icon('lock', { size: 12 })}</span>` : ''}</span>
      <span class="vtxt"><b>${title}</b><small>${s.label}</small></span></button>`;

  return `<div class="voicebar">
    ${btn('micmute', 'mic', t('micTitle'), mic)}${btn('earmute', 'headphones', t('earTitle'), ear)}
    ${v.total > 0 ? `<span class="vlinks" title="links">${icon('link', { size: 14 })}${v.connected}/${v.total}</span>` : ''}
    ${v.blocked ? `<button class="btn small" data-act="audioplay">${t('voiceTapPlay')}</button>` : ''}</div>`;
}
