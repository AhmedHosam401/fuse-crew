// screens.js — pure HTML builders. app.js owns state; these only turn state into markup.
import { t, getLang } from './i18n.js';
import { avatar, esc, fmt, ROLE_COLOR, gestureChip, sfx, icon, theme } from './ui.js';
import { bombHTML, controlsHTML, bookHTML } from './senses.js';
import { MAX_STRIKES, ROLES, CAPS, LEVEL_COUNT, levelDef, timeFor, remainingMs, everyonePicked } from './engine.js';

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
// how this player sees the game: the plain interface, an illustrated 2D scene or a 3D diorama (each player chooses for themself)
export const viewBtn = (view) => {
  const label = t('viewBtn');
  return `<button class="btn small ghost viewbtn" data-act="viewcycle" aria-label="${label}" title="${label}">${icon('view' + (view === 'ui' ? 'ui' : view), { size: 18 })}<span>${t('view_' + view)}</span></button>`;
};
export function viewCardHTML(view, no3d) {
  const opt = (v) => `<button class="segbtn${view === v ? ' on' : ''}" data-act="view" data-v="${v}" aria-pressed="${view === v}"${v === '3d' && no3d ? ' disabled' : ''}>${icon('view' + v, { size: 18 })}<span>${t('view_' + v)}</span></button>`;
  return `<div class="card viewcard"><h3 class="sect">${t('viewTitle')}</h3>
    <div class="seg" role="group" aria-label="${t('viewTitle')}">${opt('ui')}${opt('2d')}${opt('3d')}</div>
    <p class="muted">${t('viewDesc_' + view)}${no3d && view !== '3d' ? `<br>${t('view3dNo')}` : ''}</p>
    <p class="muted tip">${t('viewTip')}</p></div>`;
}
// the picture above the controls: the 2D svg, or the host the 3D canvas is added to
export const sceneWrapHTML = (role, inner, kind) =>
  `<div class="scene ${kind}" style="--c:${ROLE_COLOR[role]}"${kind === 's3d' ? ' id="sc3dhost"' : ''}>${inner}<span class="sc-tag">${avatar(role, 20)}${roleName(role)}</span></div>`;

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
      ${h.account ? accountCardHTML(h.account) : `<input id="name" class="input" maxlength="14" autocomplete="nickname" placeholder="${t('namePh')}" value="${esc(h.name)}" aria-label="${t('yourName')}">
      <button class="btn small ghost" data-act="auth">${icon('user', { size: 18 })}<span>${t('acctOpen')}</span></button>`}
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

// the ten levels: a grid (locked ones can't be chosen) and what the chosen level is made of
export function levelsHTML(room, isHost, practice) {
  const unlocked = Math.min(LEVEL_COUNT, Math.max(1, room.unlocked || 1));
  const sel = Math.min(unlocked, Math.max(1, room.level || unlocked));
  const def = levelDef(sel);
  const counts = {};
  def.mods.forEach((m) => { counts[m] = (counts[m] || 0) + 1; });
  const chips = Object.entries(counts).map(([m, n]) => `<span class="chip">${t('mod_' + m)}${n > 1 ? ` ×${n}` : ''}</span>`).join('');
  const mins = Math.round(timeFor(sel) / 60000 * 10) / 10;
  const grid = Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1).map((n) => {
    const lock = n > unlocked;
    return `<button class="lvl${n === sel ? ' on' : ''}${lock ? ' locked' : ''}" data-act="level" data-v="${n}" ${isHost && !lock ? '' : 'disabled'} aria-pressed="${n === sel}" aria-label="${t('level', { n })}${lock ? ' · ' + t('lvlLocked') : ''}">${lock ? icon('lock2', { size: 16 }) : n}</button>`;
  }).join('');
  return `<div class="card levels"><h3 class="sect">${t('levelsTitle')}</h3>
    <div class="lvlgrid">${grid}</div>
    <div class="lvlinfo"><b>${t('level', { n: sel })}${def.tag ? ` · ${t('lvl_' + def.tag)}` : ''}</b>
      <div class="chips">${chips}</div>
      <p class="muted">${def.tag ? `${t('lvlDesc_' + def.tag)}<br>` : ''}${t('lvlMeta', { m: mins, s: def.strikes || MAX_STRIKES })}</p></div>
    ${practice ? `<p class="muted tip">${t('lvlPractice')}</p>` : unlocked < LEVEL_COUNT ? `<p class="muted tip">${t('lvlHowUnlock')}</p>` : `<p class="muted tip">${t('lvlAllOpen')}</p>`}
    ${isHost ? '' : `<p class="muted">${t('hostPicksLevel')}</p>`}</div>`;
}

export function lobbyHTML(room, code, uid, soloLocal, voice, canInvite, view, no3d) {
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

  return `<div class="topline">${leaveBtn()}<span class="badge">${soloLocal ? t('practice') : t('lobby')}</span><span class="tools">${themeBtn()}${sfxBtn()}</span></div>
    ${soloLocal ? '' : `<div class="card roomcard"><div class="muted" style="text-align:center">${t('roomCode')}</div>
      <div class="roomcode">${esc(code)}</div>
      <div style="text-align:center;margin-top:8px"><button class="btn small ghost" data-act="copy">${icon('copy', { size: 18 })}<span>${t('shareRoom')}</span></button></div>
    </div>
    <div><h3 class="sect">${t('players')} ${n}/3</h3><div class="slots">${slots}</div></div>
    ${canInvite && n < 3 ? `<button class="btn" data-act="friends">${icon('users', { size: 20 })}<span>${t('inviteFriend')}</span></button>` : ''}`}
    ${levelsHTML(room, isHost, soloLocal)}
    ${viewCardHTML(view || 'ui', !!no3d)}
    ${modeCard}
    ${picker}
    ${soloLocal ? '' : voiceBarHTML(voice, null, false)}
    ${startBlock}
    ${soloLocal ? '' : `<p class="muted tip">${t('voiceTip')}</p>`}`;
}

// ---------------------------------------------------------------- play: skeleton + regions
export const playSkeleton = (view) => `<div class="topline playtools">${leaveBtn()}<span class="tools">${viewBtn(view || 'ui')}${themeBtn()}${sfxBtn()}</span></div>
  <div id="r-head" class="head"><div id="r-top"></div><div id="r-voice"></div></div>
  <div id="r-role"></div><div id="r-scene"></div><div id="r-main"></div>
  <div id="r-dock"><div id="r-gest"></div><div id="r-pal"></div></div><div id="r-log"></div><div id="r-say"></div>
  <div class="spacer"></div>
  <div id="r-over"></div>`;

// The Blind sees nothing: no clock, no bar (the others call out the time). He still feels the mistakes.
export function topHTML(game, round, bomb, now, shaking, role) {
  const rem = Math.max(0, remainingMs(game, Math.max(now, game.startedAt)));
  const pct = Math.max(0, Math.min(100, (rem / bomb.durationMs) * 100));
  const max = game.maxStrikes || MAX_STRIKES;
  const strikes = Array.from({ length: max }, (_, i) => `<i class="${i < game.strikes ? 'on' : ''}">💥</i>`).join('');
  const blind = role === 'blind';
  return `<div class="topbar${shaking ? ' shake' : ''}">
    <div class="strikes" title="${t('strikesUsed')}">${strikes}</div>
    ${blind ? `<div class="timer hide" id="timer" data-clock="1" role="timer" aria-label="${t('clockHold')}">--:--</div>` : `<div class="timer${rem <= 15000 ? ' low' : ''}" id="timer">${fmt(rem)}</div>`}
    <div class="meta">${t('level', { n: round.level })}<br>${t('module', { a: Math.min(game.cur + 1, bomb.modules.length), b: bomb.modules.length })}</div>
    ${blind ? '' : `<div class="bar"><b id="barfill" style="width:${pct}%"></b></div>`}</div>`;
}

export function roleHTML(myRoles, active) {
  const c = ROLE_COLOR[active];
  const tabs = myRoles.length > 1
    ? `<div class="tabs">${myRoles.map((r) => `<button class="tab${r === active ? ' on' : ''}" style="--c:${ROLE_COLOR[r]}" data-act="role" data-v="${r}">${avatar(r, 26)}${roleName(r)}</button>`).join('')}</div>` : '';
  return `${tabs}<div class="rolehead" style="--c:${c}">${avatar(active, 52)}<div><div class="rn">${roleName(active)}</div><div class="rd">${t('desc_' + active)}</div></div></div>`;
}

export function mainHTML(role, bomb, game, mpage, flip) {
  const idx = Math.min(game.cur, bomb.modules.length - 1);
  const mod = bomb.modules[idx];
  if (role === 'deaf') {
    const ctx = { strikes: game.strikes, max: game.maxStrikes || MAX_STRIKES, idx: idx + 1, total: bomb.modules.length, fog: bomb.fog };
    return `<div class="stage deaf"><div class="cap">${t('bombView')} · ${modName(mod)}</div>${bombHTML(mod, ctx)}</div>`;
  }
  if (role === 'mute') return bookHTML(bomb, game, mpage, flip);
  return `<div class="stage blindstage"><div class="cap">${t('controls')} · ${modName(mod)}</div>${controlsHTML(mod, game)}</div>`;
}

// o.flagged = the Mute just changed the signals: the box is highlighted for the others
export function gestHTML(role, list, o = {}) {
  const mute = role === 'mute';
  if (mute) {
    // the Mute's dock: the signals sent so far (a tap removes one) with undo / clear beside them, all on one compact row
    const chips = list.length
      ? list.slice(-30).map((g, i, a) => gestureChip(g.g, i === a.length - 1, g.k)).join('')
      : `<span class="empty">${t('noGesturesMute')}</span>`;
    const tools = list.length ? `<span class="gtools"><button class="iconbtn" data-act="gundo" aria-label="${t('gUndo')}" title="${t('gUndo')}">${icon('eraser', { size: 20 })}</button><button class="iconbtn" data-act="gclear" aria-label="${t('gClear')}" title="${t('gClear')}">${icon('trash', { size: 20 })}</button></span>` : '';
    return `<div class="gdock"><div class="gstrip" id="gstrip">${chips}</div>${tools}</div>`;
  }
  const label = mute ? t('sentLabel') : t('gotLabel');
  const chips = list.length
    ? list.slice(-12).map((g, i, a) => gestureChip(g.g, i === a.length - 1, mute ? g.k : null)).join('')
    : `<span class="empty" style="flex:1">${t('noGestures')}</span>`;
  const tools = mute && list.length ? `<span class="gtools"><button class="btn small ghost" data-act="gundo">${icon('eraser', { size: 16 })}<span>${t('gUndo')}</span></button><button class="btn small ghost" data-act="gclear">${icon('trash', { size: 16 })}<span>${t('gClear')}</span></button></span>` : '';
  const flag = o.flagged ? `<span class="gflag" role="status">${icon('eraser', { size: 14 })}${t('gChanged')}</span>` : '';
  return `<div class="ghead"><span class="muted">${label}</span>${flag}${tools}</div><div class="gstrip${o.flagged ? ' flagged' : ''}" ${o.flagged ? 'data-act="gseen"' : ''}>${chips}</div>`;
}

export function logHTML(list, players) {
  if (!list.length) return `<div class="log"><div class="empty">${t('noChat')}</div></div>`;
  return `<div class="log" id="logbox">${list.slice(-30).map((m) =>
    `<div class="msg">${avatar(m.role, 26)}<div><span class="who">${esc((players[m.from] && players[m.from].name) || '?')} · ${roleName(m.role)}</span>${esc(m.text)}</div></div>`).join('')}</div>`;
}
export const deafHTML = () => `<div class="log"><div class="deafbox">${t('cantHear')}</div></div>`;
export const muteHTML = () => `<div class="deafbox">${t('muteNote')}</div>`;
export const speakHTML = () => `<div class="deafbox speakhint">${icon('mic', { size: 18 })}<span>${t('speakHint')}</span></div>`;
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
  const max = g.maxStrikes || MAX_STRIKES;
  const atEnd = won && o.level >= LEVEL_COUNT;       // level 10 has no "next"
  const last = atEnd && !o.local;                    // the trophy is for the real game, not for practice
  const next = o.isHost
    ? `${atEnd ? '' : `<button class="btn primary" data-act="next">${won ? t('nextLevel') : t('retry')}</button>`}
       <button class="btn${atEnd ? ' primary' : ''}" data-act="toroom">${t(o.local ? 'backToLevels' : 'backToRoom')}</button>`
    : `<p class="muted">${t('waitNext')}</p>`;
  return `<div class="overlay"><div class="sheet ${won ? 'win' : 'lose'}">
    <h2>${last ? t('wonAll') : won ? t('won') : t('lost')}</h2>
    ${won ? (last ? `<p class="muted">${t('wonAllDesc')}</p>` : o.local ? '' : `<p class="unlock">${icon('check', { size: 18 })}${t('levelOpen', { n: o.level + 1 })}</p>`) : `<p class="muted">${t('reason_' + (g.reason || 'time'), { n: max })}</p>`}
    <div class="stats">
      <div><span class="muted">${t('timeLeft')}</span><b>${won ? fmt(left) : '0:00'}</b></div>
      <div><span class="muted">${t('strikesUsed')}</span><b>${g.strikes}/${max}</b></div>
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

// ---------------------------------------------------------------- accounts, friends, invitations
const initial = (name) => esc([...String(name || '?')][0] || '?');
export function accountCardHTML(a) {
  return `<div class="acct"><span class="av" aria-hidden="true">${initial(a.name)}</span>
    <div class="ainfo"><b>${esc(a.name)}</b><small>${t('acctLevel', { n: a.level })}</small></div>
    <button class="iconbtn lg" data-act="friends" aria-label="${t('friends')}" title="${t('friends')}">${icon('users', { size: 22 })}${a.badge ? `<i class="nbadge">${a.badge}</i>` : ''}</button>
    <button class="iconbtn lg" data-act="account" aria-label="${t('acctTitle')}" title="${t('acctTitle')}">${icon('user', { size: 22 })}</button></div>`;
}

// sign in / create account
export function authSheetHTML(o) {
  const up = o.tab === 'up';
  return `<div class="overlay" data-act="closemodal"><form class="sheet auth" data-stop="1" data-form="auth" novalidate>
    <h2>${t(up ? 'acctSignUp' : 'acctSignIn')}</h2>
    <div class="seg" role="tablist"><button type="button" class="segbtn${up ? '' : ' on'}" data-act="authtab" data-v="in">${t('acctSignIn')}</button><button type="button" class="segbtn${up ? ' on' : ''}" data-act="authtab" data-v="up">${t('acctSignUp')}</button></div>
    <input id="a-name" class="input" maxlength="14" autocomplete="username" autocapitalize="off" placeholder="${t('acctName')}" value="${esc(o.name || '')}" aria-label="${t('acctName')}">
    <input id="a-code" class="input" type="password" maxlength="32" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="${t(up ? 'acctCodeNew' : 'acctCode')}" aria-label="${t('acctCode')}">
    ${up ? `<p class="muted small">${t('acctUpNote')}</p>` : ''}
    <div class="err" id="a-err" role="alert">${esc(o.err || '')}</div>
    <button type="submit" class="btn primary" data-act="authgo" ${o.busy ? 'disabled' : ''}>${o.busy ? t('connecting') : t(up ? 'acctSignUp' : 'acctSignIn')}</button>
    <p class="muted small">${t('acctGuestNote')}</p>
    <button type="button" class="btn ghost" data-act="closemodal">${t('close')}</button>
  </form></div>`;
}

// the account sheet: who I am, the fingerprint lock, sign out
export function accountSheetHTML(o) {
  return `<div class="overlay" data-act="closemodal"><div class="sheet acctsheet" data-stop="1">
    <div class="acct big"><span class="av" aria-hidden="true">${initial(o.name)}</span><div class="ainfo"><b>${esc(o.name)}</b><small>${t('acctLevel', { n: o.level })}</small></div></div>
    <button class="btn" data-act="friends">${icon('users', { size: 20 })}<span>${t('friends')}${o.badge ? ` (${o.badge})` : ''}</span></button>
    ${o.bioAvail ? `<div class="card biocard"><h3 class="sect">${icon('finger', { size: 20 })} ${t('bioTitle')}</h3><p class="muted small">${t('bioDesc')}</p>
      <button class="btn${o.bioOn ? '' : ' primary'}" data-act="${o.bioOn ? 'biooff' : 'bioon'}">${t(o.bioOn ? 'bioDisable' : 'bioEnable')}</button>${o.bioMsg ? `<div class="err" role="status">${esc(o.bioMsg)}</div>` : ''}</div>` : ''}
    <button class="btn danger" data-act="signout">${icon('logout', { size: 20 })}<span>${t('acctSignOut')}</span></button>
    <button class="btn ghost" data-act="closemodal">${t('close')}</button>
  </div></div>`;
}

// friends: requests to answer, add a friend by name, my friends (with "invite" when I am in a room)
export function friendsSheetHTML(o) {
  const reqs = o.reqs.map((r) => `<div class="frow"><span class="av sm" aria-hidden="true">${initial(r.name)}</span><span class="fnm">${esc(r.name)}</span>
      <button class="btn small primary" data-act="freqok" data-id="${esc(r.id)}">${t('accept')}</button><button class="iconbtn" data-act="freqno" data-id="${esc(r.id)}" aria-label="${t('decline')}">${icon('x', { size: 18 })}</button></div>`).join('');
  const list = o.friends.map((f) => {
    const sent = o.invited && o.invited[f.id];
    const act = o.room ? `<button class="btn small${sent ? '' : ' primary'}" data-act="finvite" data-id="${esc(f.id)}" ${sent ? 'disabled' : ''}>${sent ? t('invSent') : icon('send', { size: 16 }) + '<span>' + t('invite') + '</span>'}</button>` : '';
    return `<div class="frow"><span class="av sm" aria-hidden="true">${initial(f.name)}</span><span class="fnm">${esc(f.name)}</span>${act}
      ${o.confirmDel === f.id
    ? `<button class="btn small danger" data-act="fdel" data-id="${esc(f.id)}">${t('unfriend')}</button>`
    : `<button class="iconbtn" data-act="fdel" data-id="${esc(f.id)}" aria-label="${t('unfriend')}" title="${t('unfriend')}">${icon('trash', { size: 18 })}</button>`}</div>`;
  }).join('');
  return `<div class="overlay" data-act="closemodal"><div class="sheet friendsheet" data-stop="1">
    <h2>${t('friends')}</h2>
    ${o.room ? `<p class="muted small">${t('inviteHint', { code: esc(o.room) })}</p>` : ''}
    ${reqs ? `<div class="fsec"><h3 class="sect">${t('friendReqs')}</h3>${reqs}</div>` : ''}
    <div class="fsec"><h3 class="sect">${t('addFriend')}</h3>
      <div class="row"><input id="f-name" class="input" maxlength="14" autocomplete="off" autocapitalize="off" placeholder="${t('friendNamePh')}" value="${esc(o.fname || '')}" aria-label="${t('friendNamePh')}"><button class="btn primary" data-act="fadd" style="flex:none" ${o.busy ? 'disabled' : ''}>${icon('plus', { size: 18 })}<span>${t('add')}</span></button></div>
      <div class="err${o.ok ? ' good' : ''}" id="f-msg" role="status">${esc(o.msg || '')}</div></div>
    <div class="fsec"><h3 class="sect">${t('myFriends')} (${o.friends.length})</h3>${list || `<p class="muted">${t('noFriends')}</p>`}</div>
    <button class="btn ghost" data-act="closemodal">${t('close')}</button>
  </div></div>`;
}

// a banner at the top: an invitation to a room or a friend request
export function noticeHTML(n) {
  if (n.kind === 'invite') {
    return `<div class="notice" role="alert"><span class="av sm" aria-hidden="true">${initial(n.name)}</span><span class="ntx">${t('invNotice', { name: esc(n.name), code: esc(n.room) })}</span>
      <button class="btn small primary" data-act="invjoin" data-id="${esc(n.id)}">${t('join')}</button><button class="iconbtn" data-act="invno" data-id="${esc(n.id)}" aria-label="${t('later')}">${icon('x', { size: 18 })}</button></div>`;
  }
  return `<div class="notice" role="alert"><span class="av sm" aria-hidden="true">${initial(n.name)}</span><span class="ntx">${t('reqNotice', { name: esc(n.name) })}</span>
    <button class="btn small primary" data-act="friends">${t('open')}</button><button class="iconbtn" data-act="noticeoff" aria-label="${t('later')}">${icon('x', { size: 18 })}</button></div>`;
}

// the fingerprint lock screen
export function lockHTML(o) {
  return `<div class="lockscreen"><div class="lockico">${icon('finger', { size: 72 })}</div>
    <h1>${t('lockTitle')}</h1><p class="muted">${t('lockDesc', { name: esc(o.name || '') })}</p>
    <button class="btn primary" data-act="unlock">${icon('finger', { size: 20 })}<span>${t('lockBtn')}</span></button>
    ${o.err ? `<div class="err" role="alert">${esc(o.err)}</div>` : ''}
    <button class="btn ghost" data-act="lockcode">${t('lockUseCode')}</button></div>`;
}
