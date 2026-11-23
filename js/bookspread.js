// bookspread.js — the manual as a REAL open book (used in the 3D world): two pages side by side, each with its printed number, no
// scrolling. The text is cut into pages by measuring it, so it fits any screen; a page is turned by swiping across the book (or by
// tapping the corner of a page); a long press on the book is reported (the Mute puts the book down on the desk).
//
//   Arabic: the book opens like an Arabic book, the first page on the right and the next ones to the left; English: the other way round.
//   A spread is pages (2i, 2i+1): page "A" (the first of the two) is on the reading-start side, page "B" on the other side.
//   Turning forward lifts page B (its back is the next page A) over the spine; turning back lifts page A (its back is the previous B).
import { chapterBlocks } from './senses.js';
import { t } from './i18n.js';

const LONG_MS = 650;
const FLIP_MS = 520;
const blk = (html, keep = false) => ({ html, keep });

export function createSpread(el, { onLongPress = () => {} } = {}) {
  el.classList.add('bk3d');
  el.innerHTML = '<div class="bk-sp"><div class="bk-slot" data-s="a"></div><div class="bk-slot" data-s="b"></div></div><div class="pg measure" aria-hidden="true"><div class="pg-in"></div></div>';
  const sp = el.querySelector('.bk-sp');
  const slots = { a: sp.querySelector('[data-s=a]'), b: sp.querySelector('[data-s=b]') };
  const measure = el.querySelector('.measure'); const pgIn = measure.querySelector('.pg-in');
  let bomb = null; let bombKey = ''; let W = 0; let H = 0; let lang = '';
  let pages = []; let pageChapter = []; let spread = 0; let busy = false; let tocPages = 1; let rtl = false; let flips = 0;

  // the text is measured, so it is cut again once the page font has really loaded (before that a plainer font is measured)
  const onFonts = () => { if (bomb) layout(); };
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', onFonts);
  const over = () => pgIn.scrollHeight > pgIn.clientHeight + 1;
  function paginate(blocks, cont) {
    const out = []; let cur = [];
    const put = () => { pgIn.innerHTML = cur.map((b) => b.html).join(''); };
    for (const b of blocks) {
      cur.push(b); put();
      if (cur.length > 1 && over()) {
        cur.pop();
        const carry = [];
        while (cur.length > 1 && cur[cur.length - 1].keep) carry.unshift(cur.pop());       // a heading is never left alone at the foot of a page
        out.push(cur);
        cur = [...(cont ? [blk(`<div class="bk-cont">${cont}</div>`, true)] : []), ...carry, b]; put();
      }
    }
    if (cur.length) out.push(cur);
    return out.map((list) => list.map((b) => b.html).join(''));
  }
  function tocBlocks(chapters, starts) {
    return [blk(`<div class="bk-head"><h3>${t('bookToc')}</h3></div>`, true), blk(`<p class="lead">${t('bookTocHint3d')}</p>`, true),
      ...chapters.map((ch, i) => blk(`<button class="toc-r" data-goto="${starts[ch.id]}"><span class="toc-n">${i + 1}</span><span class="toc-t"><b>${ch.title}</b><small>${t('tocWhen_' + ch.id)}</small></span><span class="toc-p">${starts[ch.id]}</span></button>`))];
  }

  let pending = false; let fontPx = 0;
  function layout() {
    if (!bomb || W < 80 || H < 80) return;
    if (!el.isConnected) { pending = true; return; }                  // text can only be measured once the book is in the page (the 3D layer adds it on its first frame)
    pending = false;
    rtl = document.documentElement.dir === 'rtl'; lang = document.documentElement.lang || '';
    const pw = Math.floor(W / 2);
    el.classList.toggle('tiny', H < 300);
    sp.style.perspective = `${Math.round(pw * 3.2)}px`;
    measure.style.width = `${pw}px`; measure.style.height = `${H}px`;
    const before = pageChapter[spread * 2] || 'toc';
    const chapters = bomb.types.map((k) => ({ id: k, title: t('mod_' + k), blocks: chapterBlocks(k, bomb) }));
    const cut = () => {
      let body = []; let bodyCh = []; let toc = [];
      tocPages = 1;
      for (let iter = 0; iter < 3; iter++) {
        body = []; bodyCh = []; const starts = {};
        for (const ch of chapters) {
          starts[ch.id] = tocPages + body.length + 1;
          const ps = paginate(ch.blocks, `${ch.title} · ${t('bookCont')}`);
          body.push(...ps); bodyCh.push(...ps.map(() => ch.id));
        }
        toc = paginate(tocBlocks(chapters, starts), `${t('bookToc')} · ${t('bookCont')}`);
        if (toc.length === tocPages) break;
        tocPages = toc.length;
      }
      pages = [...toc, ...body]; pageChapter = [...toc.map(() => 'toc'), ...bodyCh];
    };
    // a block is never cut in the middle, so on a small screen the writing gets smaller until every page fits
    let fs = Math.max(11.5, Math.min(15.5, pw * 0.067));
    for (let k = 0; k < 9; k++) {
      el.style.setProperty('--bk-fs', `${fs.toFixed(2)}px`);
      cut();
      if (pages.every((h) => { pgIn.innerHTML = h; return !over(); }) || fs <= 8.6) break;
      fs -= 0.6;
    }
    fontPx = fs;
    const at = pageChapter.indexOf(before);
    spread = Math.max(0, Math.min(Math.ceil(pages.length / 2) - 1, at < 0 ? 0 : Math.floor(at / 2)));
    sp.dataset.dir = rtl ? 'rtl' : 'ltr';
    renderSlots();
  }

  const pageHTML = (i, ph) => (i >= 0 && i < pages.length ? `<section class="pg ${ph}" data-n="${i + 1}"><div class="pg-in">${pages[i]}</div><span class="pg-no">${i + 1}</span></section>` : `<section class="pg blank ${ph}"></section>`);
  const spreads = () => Math.max(1, Math.ceil(pages.length / 2));
  const phys = (side) => ((side === 'a') === rtl ? 'r' : 'l');                            // the physical side a slot is on
  function slotHTML(side, i, withCorner) {
    const next = side === 'b'; const ok = next ? spread < spreads() - 1 : spread > 0;
    return pageHTML(i, phys(side)) + (withCorner && ok ? `<button class="bk-corner" data-flip="${next ? 'next' : 'prev'}" aria-label="${t(next ? 'bookNext' : 'bookPrev')}"></button>` : '');
  }
  function renderSlots() {
    slots.a.innerHTML = slotHTML('a', spread * 2, true); slots.b.innerHTML = slotHTML('b', spread * 2 + 1, true);
    slots.a.classList.toggle('right', rtl); slots.b.classList.toggle('right', !rtl);
  }

  // ---- turning pages
  function flipTo(target) {
    target = Math.max(0, Math.min(spreads() - 1, target));
    if (busy || target === spread || !pages.length) return false;
    busy = true; flips += 1;
    const fwd = target > spread;
    const leafSide = fwd ? 'b' : 'a';                                                    // the page that gets lifted
    const onRight = leafSide === 'a' ? rtl : !rtl;                                       // physical side of that page
    const front = fwd ? spread * 2 + 1 : spread * 2; const back = fwd ? target * 2 : target * 2 + 1;
    const under = fwd ? target * 2 + 1 : target * 2;
    slots[leafSide].innerHTML = pageHTML(under, phys(leafSide));                                          // what appears as the leaf goes
    const leaf = document.createElement('div'); leaf.className = 'bk-leaf';
    leaf.style.left = onRight ? '50%' : '0'; leaf.style.transformOrigin = onRight ? 'left center' : 'right center';
    leaf.innerHTML = `<div class="lf f">${pageHTML(front, onRight ? 'r' : 'l')}</div><div class="lf b">${pageHTML(back, onRight ? 'l' : 'r')}</div>`;
    sp.appendChild(leaf);
    const done = () => { spread = target; renderSlots(); leaf.remove(); busy = false; };
    if (typeof leaf.animate !== 'function') { done(); return true; }
    const a = leaf.animate([{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${onRight ? -180 : 180}deg)` }], { duration: FLIP_MS, easing: 'ease-in-out', fill: 'forwards' });
    a.onfinish = done; a.oncancel = done;
    return true;
  }
  const step = (d) => flipTo(spread + d);

  // ---- touch: swipe across the book turns a page, a tap on a contents line jumps, a long press is reported
  let g = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    if (g) clearTimeout(g.timer);
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, long: false, target: e.target, timer: setTimeout(() => { if (g && !g.moved) { g.long = true; onLongPress(); } }, LONG_MS) };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10) { g.moved = true; clearTimeout(g.timer); }
  });
  el.addEventListener('pointerup', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const s = g; g = null; clearTimeout(s.timer);
    if (s.long) return;
    const dx = e.clientX - s.x; const dy = e.clientY - s.y;
    if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy) * 1.3) { step(dx * (rtl ? 1 : -1) > 0 ? 1 : -1); return; }       // Arabic: a swipe to the right goes on
    if (s.moved) return;
    const tg = s.target && s.target.closest ? s.target.closest('[data-goto],[data-flip]') : null;
    if (!tg) return;
    if (tg.dataset.goto) flipTo(Math.floor((Number(tg.dataset.goto) - 1) / 2));
    else step(tg.dataset.flip === 'next' ? 1 : -1);
  });
  el.addEventListener('pointercancel', () => { if (g) clearTimeout(g.timer); g = null; });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    // the manual of this round (a new key starts at the contents page); the same key again does nothing
    setManual(b, key) {
      const k = `${key}|${document.documentElement.lang}`;
      if (k === bombKey && bomb) return;
      const newRound = !bomb || !bombKey.startsWith(`${key}|`);
      bomb = b; bombKey = k; if (newRound) { spread = 0; pageChapter = []; }
      layout();
    },
    fit(w, h) { if (Math.abs(w - W) < 2 && Math.abs(h - H) < 2) return; W = w; H = h; layout(); },
    setStrikes(n) { el.dataset.strikes = String(Math.min(2, n)); },
    next: () => step(1), prev: () => step(-1), goto: (n) => flipTo(Math.floor((n - 1) / 2)),
    relayout: layout, ready() { if (pending && el.isConnected) layout(); },
    info: () => ({ fontPx: +fontPx.toFixed(1), pages: pages.length, spreads: spreads(), spread, tocPages, busy, flips, rtl, shown: [...el.querySelectorAll('.bk-slot > .pg[data-n]')].map((p) => Number(p.dataset.n)), chapters: pageChapter.slice() }),
    // every page measured again on its own: the numbers of the pages whose text does not fit (the tests use it)
    audit() { const bad = []; pages.forEach((h, i) => { pgIn.innerHTML = h; if (over()) bad.push(i + 1); }); pgIn.innerHTML = ''; return bad; },
    pageText: (i) => (pages[i] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    destroy() { if (g) clearTimeout(g.timer); if (document.fonts && document.fonts.removeEventListener) document.fonts.removeEventListener('loadingdone', onFonts); },
  };
}
