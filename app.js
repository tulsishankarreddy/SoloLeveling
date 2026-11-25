'use strict';
/* =========================================================
   The System — a Solo Leveling style life-leveling app.
   All progress is stored on the device (localStorage) and can
   be exported/imported as a backup file from Settings.
   ========================================================= */

const KEY = 'system.save.v1';
const PREV_KEY = 'system.save.prev';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------- dates (local time) ---------- */
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => dateKey(new Date());
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
const daysBetween = (a, b) => {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};
function timeLeft() {
  const now = new Date(), end = new Date(now); end.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((end - now) / 1000));
  const p = n => String(n).padStart(2, '0');
  return { s, text: `${p(Math.floor(s / 3600))}:${p(Math.floor(s % 3600 / 60))}:${p(s % 60)}` };
}

/* ---------- game data ---------- */
const STATS = ['STR', 'AGI', 'VIT', 'INT', 'PER'];
const STAT_NAMES = { STR: 'Strength', AGI: 'Agility', VIT: 'Vitality', INT: 'Intelligence', PER: 'Perception' };
const PRESETS = {
  beginner: { label: 'Beginner', desc: '20 push-ups, 20 sit-ups, 20 squats, 2 km run', v: [20, 20, 20, 2] },
  hunter:   { label: 'Hunter',   desc: '50 push-ups, 50 sit-ups, 50 squats, 5 km run', v: [50, 50, 50, 5] },
  jinwoo:   { label: 'Sung Jinwoo', desc: '100 push-ups, 100 sit-ups, 100 squats, 10 km run', v: [100, 100, 100, 10] },
};
const SIDE_RANKS = { E: { xp: 15, gold: 5 }, D: { xp: 30, gold: 10 }, C: { xp: 60, gold: 20 }, B: { xp: 100, gold: 40 }, A: { xp: 180, gold: 70 }, S: { xp: 300, gold: 120 } };
const RANKS = [{ r: 'E', min: 1 }, { r: 'D', min: 10 }, { r: 'C', min: 20 }, { r: 'B', min: 35 }, { r: 'A', min: 50 }, { r: 'S', min: 75 }];
const rankOf = l => RANKS.reduce((r, x) => (l >= x.min ? x.r : r), 'E');
const xpNeeded = l => 100 + (l - 1) * 40;

const ITEMS = {
  box:     { name: 'Random Box',       price: 50,  desc: 'Open it for a random reward: gold, XP or an item.' },
  potion:  { name: 'Elixir of Growth', price: 120, desc: 'Doubles the XP of your next Daily Quest reward.' },
  shield:  { name: 'Streak Shield',    price: 250, desc: 'Used automatically when you miss a day. Keeps your streak alive. The penalty still applies.' },
  crystal: { name: 'Stat Crystal',     price: 400, desc: 'Grants 1 stat point.' },
};

const TITLES = [
  { id: 'start',    name: 'The One Who Started',        desc: 'Complete your first Daily Quest.',  test: s => s.totalDays >= 1 },
  { id: 'wolf',     name: 'Wolf Slayer',                desc: 'Reach a 3-day streak. +5% XP',      test: s => s.best >= 3, bonus: .05 },
  { id: 'persist',  name: 'The One Who Persists',       desc: 'Reach a 7-day streak. +8% XP',      test: s => s.best >= 7, bonus: .08 },
  { id: 'overcame', name: 'One Who Overcame Adversity', desc: 'Survive a Penalty Quest. +5% XP',   test: s => s.penaltiesCleared >= 1, bonus: .05 },
  { id: 'errand',   name: 'Errand Runner',              desc: 'Complete 10 side quests. +5% XP',   test: s => s.sideDone >= 10, bonus: .05 },
  { id: 'iron',     name: 'Iron Will',                  desc: 'Reach a 30-day streak. +12% XP',    test: s => s.best >= 30, bonus: .12 },
  { id: 'crank',    name: 'Rising Hunter',              desc: 'Reach C-rank (level 20). +10% XP',  test: s => s.player.level >= 20, bonus: .10 },
  { id: 'arank',    name: 'Elite Hunter',               desc: 'Reach A-rank (level 50). +15% XP',  test: s => s.player.level >= 50, bonus: .15 },
  { id: 'monarch',  name: 'Shadow Monarch',             desc: 'Reach S-rank and a 100-day streak. +25% XP', test: s => s.player.level >= 75 && s.best >= 100, bonus: .25 },
];

function freshState(name = 'Player', preset = 'hunter') {
  const v = PRESETS[preset].v, t = today();
  return {
    version: 1, created: t, lastDay: t, savedAt: 0, lastBackup: 0,
    player: { name, level: 1, xp: 0, gold: 0, points: 0, stats: { STR: 10, AGI: 10, VIT: 10, INT: 10, PER: 10 }, title: null },
    questName: 'Preparation to become strong',
    quests: [
      { id: uid(), name: 'Push-ups', target: v[0], unit: 'reps', stat: 'STR' },
      { id: uid(), name: 'Sit-ups',  target: v[1], unit: 'reps', stat: 'VIT' },
      { id: uid(), name: 'Squats',   target: v[2], unit: 'reps', stat: 'AGI' },
      { id: uid(), name: 'Running',  target: v[3], unit: 'km',   stat: 'AGI' },
    ],
    progress: {}, claimed: false,
    side: [],
    streak: 0, best: 0, totalDays: 0, penaltiesCleared: 0, sideDone: 0,
    penalty: null,
    inv: {}, buffs: { potion: false },
    titles: [],
    rewards: [{ id: uid(), name: '1 hour of gaming', cost: 150 }, { id: uid(), name: 'Favourite snack', cost: 80 }],
    log: [],
    settings: { notify: false, times: ['20:00', '22:00', '23:00'], penaltyTask: 'Survive: 30 minutes of hard exercise (burpees, plank, sprints) without stopping.' },
    cal: { on: false, eventId: null, sig: null, done: [] },
    reminded: { d: null, n: 0 },
  };
}
const reminderTimes = () => [...new Set((S?.settings.times || []).filter(t => /^\d{2}:\d{2}$/.test(t)))].sort();

/* ---------- persistence ---------- */
let S = null;
function migrate(d) {
  const base = freshState(d?.player?.name);
  const out = { ...base, ...d };
  out.player = { ...base.player, ...d.player, stats: { ...base.player.stats, ...(d.player?.stats || {}) } };
  out.settings = { ...base.settings, ...(d.settings || {}) };
  out.buffs = { ...base.buffs, ...(d.buffs || {}) };
  out.cal = { ...base.cal, ...(d.cal || {}) };
  if (!Array.isArray(out.settings.times)) out.settings.times = base.settings.times;
  delete out.settings.remind; delete out.remindedOn; delete out.warnedOn;
  return out;
}
function load() {
  for (const k of [KEY, PREV_KEY]) {
    try { const raw = localStorage.getItem(k); if (raw) return migrate(JSON.parse(raw)); } catch (e) { /* try next */ }
  }
  return null;
}
/* save(true) = something you did (synced as a change); save(false) = automatic bookkeeping. */
function save(user = true) {
  if (!S) return;
  S.savedAt = Date.now();
  writeLocal();
  if (typeof onUserSave === 'function') user ? onUserSave() : onSystemSave();
}
function writeLocal() {
  const json = JSON.stringify(S);
  try {
    const cur = localStorage.getItem(KEY);
    if (cur) localStorage.setItem(PREV_KEY, cur);
    localStorage.setItem(KEY, json);
  } catch (e) { popup({ tone: 'red', kind: 'Warning', title: 'Progress could not be saved', lines: ['Your phone storage may be full. Export a backup from Settings.'] }); }
  writeStatus();
}
async function requestPersist() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch (e) {}
  return false;
}

/* ---------- pop-up System windows ---------- */
const layer = $('#layer');
const queue = [];
let showing = false;
function popup(o) { queue.push(o); if (!showing) nextPopup(); }
function nextPopup() {
  const o = queue.shift();
  if (!o) { showing = false; layer.hidden = true; layer.innerHTML = ''; return; }
  showing = true; layer.hidden = false;
  const lines = (o.lines || []).filter(Boolean).map(l => `<p class="line">${esc(l)}</p>`).join('');
  const buttons = o.buttons || [{ label: 'OK' }];
  layer.innerHTML = `<section class="win sys tone-${o.tone || 'blue'}" role="dialog" aria-modal="true" aria-labelledby="sysTitle">
      <div class="sys-head"><span class="sys-bang" aria-hidden="true">!</span><span>${esc(o.kind || 'Notification')}</span></div>
      <h2 id="sysTitle">${esc(o.title)}</h2>
      ${o.big ? `<div class="big">${esc(o.big)}</div>` : ''}
      ${lines}${o.html || ''}
      <div class="btn-row">${buttons.map((b, i) => `<button class="btn ${b.ghost ? 'ghost' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
    </section>`;
  layer.querySelectorAll('[data-i]').forEach(btn => btn.addEventListener('click', () => {
    const b = buttons[+btn.dataset.i];
    if (b.onClick && b.onClick(layer) === false) return; // returning false keeps the window open
    nextPopup();
  }));
  (layer.querySelector('input') || layer.querySelector('.btn')).focus();
}

/* ---------- progression ---------- */
let pendingLevels = [];
const titleBonus = () => TITLES.find(t => t.id === S.player.title)?.bonus || 0;
function gainXP(n) {
  n = Math.round(n * (1 + titleBonus()));
  const p = S.player; p.xp += n;
  while (p.xp >= xpNeeded(p.level)) {
    p.xp -= xpNeeded(p.level);
    const before = rankOf(p.level);
    p.level++; p.points += 5;
    pendingLevels.push({ level: p.level, rankUp: rankOf(p.level) !== before ? rankOf(p.level) : null });
  }
  return n;
}
function afterGain() {
  for (const l of pendingLevels) {
    popup({ kind: 'Notification', title: 'Level up!', big: `Lv. ${l.level}`, lines: ['You have gained 5 stat points.'] });
    if (l.rankUp) popup({ tone: 'gold', kind: 'Rank up', title: `You are now a ${l.rankUp}-rank Hunter`, big: l.rankUp });
  }
  pendingLevels = [];
  checkTitles();
}
function checkTitles() {
  for (const t of TITLES) {
    if (!S.titles.includes(t.id) && t.test(S)) {
      S.titles.push(t.id);
      popup({ tone: 'gold', kind: 'Title acquired', title: `[${t.name}]`, lines: [t.desc, 'Equip it from your Inventory.'] });
    }
  }
}
const addItem = (id, n = 1) => { S.inv[id] = (S.inv[id] || 0) + n; };
const allDone = () => S.quests.length > 0 && S.quests.every(q => (S.progress[q.id] || 0) >= q.target);

function claimDaily() {
  if (S.claimed || !allDone()) return;
  S.claimed = true;
  let xp = 100 + S.player.level * 10;
  const potion = S.buffs.potion; if (potion) { xp *= 2; S.buffs.potion = false; }
  const gold = 50 + S.player.level * 2;
  S.player.gold += gold;
  S.streak++; S.best = Math.max(S.best, S.streak); S.totalDays++;
  const got = gainXP(xp);
  const box = Math.random() < 0.3; if (box) addItem('box');
  popup({
    kind: 'Quest complete', title: `[Daily Quest: ${S.questName}] complete`,
    lines: ['Rewards:', `+${got} XP${potion ? ' (Elixir of Growth)' : ''}`, `+${gold} gold`, box ? '+1 Random Box' : null, `Streak: ${S.streak} day${S.streak === 1 ? '' : 's'}`],
  });
  afterGain(); save(); render();
}

/* Day change: checks yesterday (and any skipped days) and applies the penalty. */
function rollover() {
  const t = today();
  if (!S || S.lastDay === t) return false;
  const gap = daysBetween(S.lastDay, t);
  if (gap < 0) { S.lastDay = t; save(false); return false; } // phone clock moved back
  const firstDay = S.lastDay === S.created;
  S.log.push({ d: S.lastDay, ok: S.claimed });
  for (let i = 1; i < gap; i++) S.log.push({ d: addDays(S.lastDay, i), ok: false });
  S.log = S.log.slice(-60);
  let missed = (S.claimed ? 0 : 1) + Math.max(0, gap - 1);
  if (firstDay && !S.claimed) missed--; // grace for the day you joined
  if (missed > 0) {
    let shieldUsed = false;
    if ((S.inv.shield || 0) > 0) { S.inv.shield--; shieldUsed = true; } else S.streak = 0;
    const loss = Math.min(S.player.xp, Math.round(xpNeeded(S.player.level) * 0.15 * missed));
    S.player.xp -= loss;
    S.penalty = { task: S.settings.penaltyTask, since: t, missed, loss, shieldUsed };
  }
  S.lastDay = t; S.progress = {}; S.claimed = false;
  S.side = S.side.filter(q => !q.done);
  save(false);
  return true;
}

/* ---------- reminders ---------- */
async function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { const reg = await navigator.serviceWorker?.ready; reg ? reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'daily-quest' }) : new Notification(title, { body }); } catch (e) {}
}
function reminderTick() {
  if (!S || !S.settings.notify || S.claimed) return;
  const now = new Date(), t = today(), times = reminderTimes();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (!S.reminded || S.reminded.d !== t) S.reminded = { d: t, n: 0 };
  const due = times.filter(x => { const [h, m] = x.split(':').map(Number); return h * 60 + m <= mins; }).length;
  if (due > S.reminded.n) {
    S.reminded.n = due; save(false);
    const last = due === times.length;
    notify(last ? '[Warning] Final reminder' : '[Daily Quest] Not complete', `Time remaining ${timeLeft().text}. Failing will result in a penalty.`);
  }
}
/* A tiny status file the service worker can read for background reminders. */
function writeStatus() {
  if (!('caches' in window) || !S) return;
  caches.open('system-status').then(c => c.put('status.json', new Response(JSON.stringify({ date: S.lastDay, done: S.claimed, notify: S.settings.notify, times: reminderTimes() }), { headers: { 'Content-Type': 'application/json' } }))).catch(() => {});
}
async function registerPeriodic() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return;
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state === 'granted') await reg.periodicSync.register('quest-check', { minInterval: 60 * 60 * 1000 });
  } catch (e) {}
}

/* ---------- views ---------- */
let view = 'status';
let onboardPreset = 'hunter';
const app = $('#app'), main = $('#view');

function render() {
  app.classList.toggle('locked', !S || !!S.penalty);
  document.querySelectorAll('.tabs [data-act="view"], .topbar [data-act="view"]').forEach(b => b.dataset.view === view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  if (!S) { main.innerHTML = viewOnboard(); return; }
  if (S.penalty) { main.innerHTML = viewPenalty(); bindHold(); return; }
  main.innerHTML = ({ status: viewStatus, quests: viewQuests, shop: viewShop, bag: viewBag, settings: viewSettings })[view]();
}

function viewOnboard() {
  return `<section class="win">
    <span class="win-title">Player registration</span>
    <p class="win-sub">The System will track your daily training and reward your growth.</p>
    <form id="onboard">
      <label class="field-label" for="pname">Player name</label>
      <input class="field-input" id="pname" name="pname" maxlength="24" required placeholder="Sung Jinwoo" autocomplete="nickname">
      <p class="field-label">Daily Quest difficulty (you can change it later)</p>
      ${Object.entries(PRESETS).map(([k, p]) => `<button type="button" class="preset" data-act="preset" data-k="${k}" aria-pressed="${k === onboardPreset}"><b>${p.label}</b><span class="muted small">${p.desc}</span></button>`).join('')}
      <button class="btn" type="submit">Become a Player</button>
    </form>
    ${clientId() ? `<button class="btn ghost" data-act="gconnect">${SYNC.connected ? 'Connected to Google Drive. Create your player above.' : 'Continue my save from Google Drive'}</button>` : ''}
  </section>`;
}

function viewStatus() {
  const p = S.player, need = xpNeeded(p.level), rank = rankOf(p.level);
  const title = TITLES.find(t => t.id === p.title);
  const hp = p.stats.VIT * 10 + p.level * 20, mp = p.stats.INT * 10 + p.level * 5;
  const hist = [...S.log.slice(-13).map(l => `<span class="${l.ok ? 'ok' : 'miss'}" title="${l.d}"></span>`), `<span class="today ${S.claimed ? 'ok' : ''}" title="Today"></span>`].join('');
  const backupDays = S.lastBackup ? Math.floor((Date.now() - S.lastBackup) / 86400000) : null;
  const nudge = backupDays === null || backupDays >= 7;
  return `<section class="win">
    <span class="win-title">Status</span>
    <div class="status-head">
      <div class="name">${esc(p.name)}</div>
      <div class="lvl"><b>${p.level}</b><span>Level</span></div>
      <dl class="kv"><dt>Rank</dt><dd class="rank-${rank}">${rank}-rank Hunter</dd></dl>
      <dl class="kv"><dt>Title</dt><dd>${title ? esc(title.name) : 'None'}</dd></dl>
    </div>
    <div class="bar" role="progressbar" aria-label="Experience" aria-valuemin="0" aria-valuemax="${need}" aria-valuenow="${p.xp}"><i style="width:${Math.min(100, p.xp / need * 100)}%"></i></div>
    <div class="bar-label"><span>XP</span><span>${p.xp} / ${need}</span></div>
    <div class="vitals">
      <div><b>${hp}</b><small>HP</small></div>
      <div><b>${mp}</b><small>MP</small></div>
      <div><b class="gold">${p.gold}</b><small>Gold</small></div>
    </div>
  </section>
  <section class="win">
    <span class="win-title">Stats</span>
    <div class="stats">
      ${STATS.map(k => `<div class="stat"><abbr title="${STAT_NAMES[k]}">${k}</abbr><b>${p.stats[k]}</b>${p.points > 0 ? `<button class="plus" data-act="stat" data-k="${k}" aria-label="Add a point to ${STAT_NAMES[k]}">+</button>` : ''}</div>`).join('')}
    </div>
    <p class="points">Available points: <span class="${p.points ? 'gold' : ''}">${p.points}</span></p>
  </section>
  <section class="win">
    <span class="win-title">Record</span>
    <p class="center">Streak <b>${S.streak}</b> day${S.streak === 1 ? '' : 's'}. Best ${S.best}. Quests cleared ${S.totalDays}.</p>
    <div class="history" aria-label="Last 14 days">${hist}</div>
    ${S.claimed ? '' : `<button class="btn" data-act="view" data-view="quests">Open today's Daily Quest</button>`}
  </section>
  ${nudge ? `<section class="win tone-gold"><p class="center">${backupDays === null ? 'You have not backed up your progress yet.' : `Your last backup was ${backupDays} days ago.`} Save a copy so a phone reset can't erase it.</p><button class="btn ghost" data-act="export">Save backup file</button></section>` : ''}`;
}

function viewQuests() {
  const tl = timeLeft();
  const rows = S.quests.map(q => {
    const v = S.progress[q.id] || 0, done = v >= q.target;
    const step = q.unit === 'km' ? 0.5 : 1, big = q.unit === 'km' ? 1 : 10;
    return `<div class="goal ${done ? 'done' : ''}">
      <div class="goal-top"><span class="goal-name">${esc(q.name)}</span><span class="goal-count">[${v}/${q.target} ${esc(q.unit)}]</span></div>
      ${S.claimed ? '' : `<div class="goal-ctrl">
        <button class="chip" data-act="inc" data-id="${q.id}" data-n="${-step}" aria-label="Remove ${step}">−${step}</button>
        <input type="number" inputmode="decimal" min="0" step="any" value="${v}" data-act="set" data-id="${q.id}" aria-label="${esc(q.name)} done">
        <button class="chip" data-act="inc" data-id="${q.id}" data-n="${step}">+${step}</button>
        <button class="chip" data-act="inc" data-id="${q.id}" data-n="${big}">+${big}</button>
        <button class="chip" data-act="fill" data-id="${q.id}" aria-label="Mark ${esc(q.name)} complete">Done</button>
      </div>`}
    </div>`;
  }).join('');
  const sides = S.side.filter(q => !q.done);
  return `<section class="win">
    <span class="win-title">Daily Quest</span>
    <p class="win-sub">${esc(S.questName)}</p>
    <div class="timer ${tl.s < 3 * 3600 && !S.claimed ? 'urgent' : ''}">Time remaining <b id="clock">${tl.text}</b></div>
    ${rows || '<p class="muted center">No goals yet. Add some in Settings.</p>'}
    ${S.claimed
      ? '<p class="center" style="margin-top:14px">Reward claimed. The next Daily Quest arrives at midnight.</p>'
      : `<button class="btn ${allDone() ? 'ready' : ''}" data-act="claim" ${allDone() ? '' : 'disabled'}>Claim reward</button>
         <p class="caution">Caution: failing to complete the Daily Quest will result in an appropriate penalty.</p>`}
  </section>
  <section class="win">
    <span class="win-title">Side quests</span>
    <p class="win-sub">One-off tasks: study, chores, reading. Harder rank, bigger reward.</p>
    ${sides.map(q => `<div class="list-item"><span class="badge ${q.rank}">${q.rank}</span><span class="grow"><b>${esc(q.name)}</b><span class="muted small">+${SIDE_RANKS[q.rank].xp} XP, +${SIDE_RANKS[q.rank].gold} gold</span></span>
      <button class="chip" data-act="side-done" data-id="${q.id}">Complete</button><button class="chip x" data-act="side-del" data-id="${q.id}" aria-label="Delete ${esc(q.name)}">✕</button></div>`).join('') || '<p class="muted center small">No side quests. Add one below.</p>'}
    <form class="inline" id="sideForm">
      <input type="text" name="name" maxlength="60" placeholder="Read 20 pages" required aria-label="Side quest name">
      <select name="rank" aria-label="Rank">${Object.keys(SIDE_RANKS).map(r => `<option ${r === 'D' ? 'selected' : ''}>${r}</option>`).join('')}</select>
      <button class="chip" type="submit">Add</button>
    </form>
  </section>`;
}

function viewShop() {
  const g = S.player.gold;
  return `<section class="win">
    <span class="win-title">Shop</span>
    <p class="win-sub">Gold: <span class="gold">${g}</span></p>
    ${Object.entries(ITEMS).map(([id, it]) => `<div class="list-item"><span class="grow"><b>${it.name}</b><span class="muted small">${it.desc}</span></span>
      <button class="chip" data-act="buy" data-id="${id}" ${g < it.price ? 'disabled' : ''}><span class="gold">${it.price}</span></button></div>`).join('')}
  </section>
  <section class="win">
    <span class="win-title">Real-life rewards</span>
    <p class="win-sub">Spend gold on treats you set for yourself.</p>
    ${S.rewards.map(r => `<div class="list-item"><span class="grow"><b>${esc(r.name)}</b></span>
      <button class="chip" data-act="redeem" data-id="${r.id}" ${g < r.cost ? 'disabled' : ''}><span class="gold">${r.cost}</span></button>
      <button class="chip x" data-act="reward-del" data-id="${r.id}" aria-label="Delete ${esc(r.name)}">✕</button></div>`).join('') || '<p class="muted center small">Add a reward you want to earn.</p>'}
    <form class="inline" id="rewardForm">
      <input type="text" name="name" maxlength="50" placeholder="Movie night" required aria-label="Reward name">
      <input type="number" name="cost" min="1" max="99999" placeholder="Gold" required aria-label="Cost in gold" style="flex:0 0 80px">
      <button class="chip" type="submit">Add</button>
    </form>
  </section>`;
}

function viewBag() {
  const items = Object.entries(S.inv).filter(([, n]) => n > 0);
  return `<section class="win">
    <span class="win-title">Inventory</span>
    ${S.buffs.potion ? '<p class="center gold small">Elixir of Growth is active for your next Daily Quest.</p>' : ''}
    ${items.map(([id, n]) => `<div class="list-item"><span class="badge">${n}</span><span class="grow"><b>${ITEMS[id].name}</b><span class="muted small">${ITEMS[id].desc}</span></span>
      ${id === 'shield' ? '<span class="muted small">Passive</span>' : `<button class="chip" data-act="use" data-id="${id}">Use</button>`}</div>`).join('') || '<p class="muted center">Empty. Complete quests and visit the Shop.</p>'}
  </section>
  <section class="win">
    <span class="win-title">Titles</span>
    ${TITLES.map(t => {
      const has = S.titles.includes(t.id), on = S.player.title === t.id;
      return `<div class="list-item title-row ${has ? '' : 'locked'}"><span class="grow"><b>${has ? esc(t.name) : '???'}</b><span class="muted small">${t.desc}</span></span>
        ${has ? (on ? `<button class="chip" data-act="title" data-id="">Unequip</button>` : `<button class="chip" data-act="title" data-id="${t.id}">Equip</button>`) : '<span class="muted small">Locked</span>'}</div>`;
    }).join('')}
  </section>`;
}

function viewSettings() {
  const notifSupported = 'Notification' in window;
  return `<section class="win">
    <span class="win-title">Player</span>
    <label class="field-label" for="setName">Name</label>
    <input class="field-input" id="setName" data-act="setting" data-k="name" maxlength="24" value="${esc(S.player.name)}">
  </section>
  <section class="win">
    <span class="win-title">Daily Quest goals</span>
    <label class="field-label" for="qname">Quest name</label>
    <input class="field-input" id="qname" data-act="setting" data-k="questName" maxlength="50" value="${esc(S.questName)}">
    <p class="field-label">Goal, target, unit, stat</p>
    ${S.quests.map(q => `<div class="editor-row" data-id="${q.id}">
      <input data-act="qedit" data-f="name" value="${esc(q.name)}" maxlength="30" aria-label="Goal name">
      <input data-act="qedit" data-f="target" type="number" min="0.5" step="any" value="${q.target}" aria-label="Target">
      <input data-act="qedit" data-f="unit" value="${esc(q.unit)}" maxlength="8" aria-label="Unit">
      <select data-act="qedit" data-f="stat" aria-label="Stat">${STATS.map(s => `<option ${s === q.stat ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <button class="x" data-act="qdel" data-id="${q.id}" aria-label="Delete ${esc(q.name)}">✕</button>
    </div>`).join('')}
    <button class="btn ghost" data-act="qadd">Add goal</button>
    <label class="field-label" for="ptask">Penalty Quest (what you must do after missing a day)</label>
    <textarea class="field-input" id="ptask" rows="3" data-act="setting" data-k="penaltyTask" maxlength="200">${esc(S.settings.penaltyTask)}</textarea>
  </section>
  <section class="win">
    <span class="win-title">Google Drive</span>
    ${!clientId() ? '<p class="small">Sync between devices is not set up yet. Add your Google Client ID to config.js (see the README), then reopen the app.</p>'
      : SYNC.connected ? `<p class="small">Connected${SYNC.email ? ` as <b>${esc(SYNC.email)}</b>` : ''}. Changes save to your Drive automatically.</p>
        <p class="small muted">Last synced: ${SYNC.last ? new Date(SYNC.last).toLocaleString() : 'not yet'}</p>
        <div class="btn-row"><button class="btn" data-act="sync">Sync now</button><button class="btn ghost" data-act="gdisconnect">Disconnect</button></div>`
      : `<p class="small">Save your progress to Google Drive and continue on any device.</p><button class="btn" data-act="gconnect">Connect Google account</button>`}
  </section>
  <section class="win">
    <span class="win-title">Reminders</span>
    <p class="small">Remind me while the Daily Quest is still pending at:</p>
    <div class="times">${[0, 1, 2].map(i => `<input type="time" class="field" data-act="time" data-i="${i}" value="${S.settings.times[i] || ''}" aria-label="Reminder ${i + 1}">`).join('')}</div>
    <p class="muted small">Clear a box to use fewer reminders.</p>
    <label class="toggle"><span>Google Calendar alerts<br><span class="muted small">Most reliable. Skipped automatically on days you finish.</span></span><input type="checkbox" data-act="calendar" ${S.cal.on ? 'checked' : ''} ${clientId() ? '' : 'disabled'}></label>
    ${notifSupported ? `<label class="toggle"><span>App notifications<br><span class="muted small">Only while the app is running. Leave off if you use Calendar alerts.</span></span><input type="checkbox" data-act="notify" ${S.settings.notify ? 'checked' : ''}></label>` : ''}
    ${S.cal.on && !SYNC.connected ? '<p class="warn small">Connect Google above so the Calendar alerts can be updated.</p>' : ''}
  </section>
  <section class="win">
    <span class="win-title">Backup</span>
    <p class="small">Your progress is saved on this phone automatically. Save a backup file now and then, so you can restore it after a reset or on a new phone.</p>
    <p class="small muted" id="persistInfo">Last backup: ${S.lastBackup ? new Date(S.lastBackup).toLocaleString() : 'never'}</p>
    <div class="btn-row"><button class="btn" data-act="export">Save backup file</button><button class="btn ghost" data-act="import">Restore from file</button></div>
  </section>
  <section class="win">
    <span class="win-title">Danger zone</span>
    <button class="btn danger" data-act="reset">Delete all progress</button>
  </section>`;
}

function viewPenalty() {
  const pz = S.penalty;
  return `<div class="penalty-zone"><section class="win tone-red">
    <div class="sys-head" style="display:flex;justify-content:center;gap:10px;width:fit-content;margin:-4px auto 14px;padding:4px 16px;border:1px solid var(--line);font:600 17px var(--display)"><span class="sys-bang">!</span><span>Penalty Quest</span></div>
    <h2 class="center">You failed to complete the Daily Quest.</h2>
    <p class="center">You have been moved to the Penalty Zone.</p>
    <p class="center muted small">${pz.missed} day${pz.missed > 1 ? 's' : ''} missed. XP lost: ${pz.loss}. ${pz.shieldUsed ? 'Streak Shield used, streak kept.' : 'Streak reset to 0.'}</p>
    <div class="win" style="margin-top:18px"><p class="center" style="font-size:19px">${esc(pz.task)}</p></div>
    <button class="hold" id="hold"><i></i><span>Press and hold when you have survived</span></button>
    ${SYNC.connected && syncState !== 'synced' ? '<p class="center small" style="margin-top:14px">Finished the quest on another device?</p><button class="btn ghost" data-act="sync">Sync with Google Drive first</button>' : ''}
  </section></div>`;
}
function bindHold() {
  const el = $('#hold'); if (!el) return;
  const fill = el.querySelector('i'); let start = 0, raf = 0;
  const DUR = 2000;
  const tick = () => {
    const p = Math.min(1, (performance.now() - start) / DUR); fill.style.width = p * 100 + '%';
    if (p >= 1) { stop(); clearPenalty(); return; }
    raf = requestAnimationFrame(tick);
  };
  const begin = e => { if (e.type === 'keydown' && !(e.key === ' ' || e.key === 'Enter')) return; if (raf) return; e.preventDefault(); start = performance.now(); raf = requestAnimationFrame(tick); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; fill.style.width = '0'; };
  el.addEventListener('pointerdown', begin); el.addEventListener('keydown', begin);
  ['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur'].forEach(ev => el.addEventListener(ev, stop));
  el.addEventListener('contextmenu', e => e.preventDefault());
}
function clearPenalty() {
  S.penalty = null; S.penaltiesCleared++;
  popup({ kind: 'Notification', title: 'You have survived the Penalty Zone.', lines: ['Today\'s Daily Quest has arrived.'] });
  checkTitles(); save(); view = 'quests'; render();
}

/* ---------- actions ---------- */
function setProgress(id, v) {
  const q = S.quests.find(x => x.id === id); if (!q || S.claimed) return;
  S.progress[id] = Math.max(0, Math.round((Number(v) || 0) * 100) / 100);
  save(); render();
}

app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT' || b.tagName === 'TEXTAREA') return;
  const { act, id } = b.dataset;
  switch (act) {
    case 'view': view = b.dataset.view; render(); main.focus(); window.scrollTo(0, 0); break;
    case 'preset': onboardPreset = b.dataset.k; document.querySelectorAll('.preset').forEach(x => x.setAttribute('aria-pressed', x === b)); break;
    case 'inc': setProgress(id, (S.progress[id] || 0) + Number(b.dataset.n)); break;
    case 'fill': setProgress(id, S.quests.find(q => q.id === id).target); break;
    case 'claim': claimDaily(); if (SYNC.connected) runSync(!!S.cal.on); break;
    case 'sync': runSync(true); break;
    case 'gconnect': if (!SYNC.connected) connectGoogle(); break;
    case 'gdisconnect': disconnectGoogle(); break;
    case 'stat': if (S.player.points > 0) { S.player.points--; S.player.stats[b.dataset.k]++; save(); render(); } break;
    case 'side-done': {
      const q = S.side.find(x => x.id === id); if (!q) break;
      q.done = true; S.sideDone++;
      const r = SIDE_RANKS[q.rank]; S.player.gold += r.gold; const got = gainXP(r.xp);
      popup({ kind: 'Quest complete', title: `[${q.name}] complete`, lines: [`+${got} XP`, `+${r.gold} gold`] });
      S.side = S.side.filter(x => !x.done); afterGain(); save(); render(); break;
    }
    case 'side-del': S.side = S.side.filter(x => x.id !== id); save(); render(); break;
    case 'buy': {
      const it = ITEMS[id]; if (S.player.gold < it.price) break;
      S.player.gold -= it.price; addItem(id); save(); render();
      popup({ kind: 'Shop', title: `Purchased: ${it.name}`, lines: ['Added to your Inventory.'] }); break;
    }
    case 'redeem': {
      const r = S.rewards.find(x => x.id === id); if (!r || S.player.gold < r.cost) break;
      popup({ kind: 'Shop', title: `Redeem "${r.name}"?`, lines: [`Costs ${r.cost} gold.`], buttons: [
        { label: 'Redeem', onClick: () => { S.player.gold -= r.cost; save(); render(); queue.unshift({ tone: 'gold', kind: 'Reward', title: `Enjoy: ${r.name}`, lines: ['You earned it.'] }); } },
        { label: 'Cancel', ghost: true }] });
      break;
    }
    case 'reward-del': S.rewards = S.rewards.filter(x => x.id !== id); save(); render(); break;
    case 'use': useItem(id); break;
    case 'title': S.player.title = id || null; save(); render(); break;
    case 'qadd': S.quests.push({ id: uid(), name: 'New goal', target: 10, unit: 'reps', stat: 'STR' }); save(); render(); break;
    case 'qdel': S.quests = S.quests.filter(q => q.id !== id); delete S.progress[id]; save(); render(); break;
    case 'export': exportSave(); break;
    case 'import': $('#importFile').click(); break;
    case 'reset':
      popup({ tone: 'red', kind: 'Warning', title: 'Delete all progress?', lines: ['This cannot be undone. Type DELETE to confirm.'], html: '<input class="field-input" id="confirmDel" autocomplete="off" aria-label="Type DELETE">', buttons: [
        { label: 'Delete', onClick: l => { if ($('#confirmDel', l).value.trim().toUpperCase() !== 'DELETE') return false; localStorage.removeItem(KEY); localStorage.removeItem(PREV_KEY); S = null; view = 'status'; render(); } },
        { label: 'Cancel', ghost: true }] });
      break;
  }
});

app.addEventListener('change', e => {
  const el = e.target, act = el.dataset.act; if (!act || !S) return;
  if (act === 'set') setProgress(el.dataset.id, el.value);
  if (act === 'setting') {
    const k = el.dataset.k, v = el.value.trim();
    if (k === 'name') S.player.name = v || S.player.name;
    else if (k === 'questName') S.questName = v || S.questName;
    else if (k === 'penaltyTask') S.settings.penaltyTask = v || S.settings.penaltyTask;
    save();
  }
  if (act === 'qedit') {
    const q = S.quests.find(x => x.id === el.closest('[data-id]').dataset.id); if (!q) return;
    const f = el.dataset.f;
    q[f] = f === 'target' ? Math.max(0.5, Number(el.value) || 1) : (el.value.trim() || q[f]);
    save();
  }
  if (act === 'notify') toggleNotify(el);
  if (act === 'time') {
    const times = [0, 1, 2].map(i => S.settings.times[i] || '');
    times[+el.dataset.i] = el.value;
    if (!times.some(Boolean)) { el.value = S.settings.times[+el.dataset.i] || '20:00'; return; }
    S.settings.times = times; S.reminded = { d: null, n: 0 };
    save(); writeStatus();
  }
  if (act === 'calendar') {
    if (el.checked && !SYNC.connected) {
      el.checked = false;
      popup({ kind: 'Reminders', title: 'Connect Google first', lines: ['Calendar alerts use your Google account. Connect it in the Google Drive section, then turn this on.'] });
      return;
    }
    S.cal.on = el.checked; save();
    runSync(true).then(() => {
      if (S.cal.on && S.cal.eventId) popup({ kind: 'Reminders', title: 'Calendar alerts on', lines: [`Alerts at ${reminderTimes().join(', ')} on days the quest is pending.`, 'Make sure notifications are on for the Google Calendar app.'] });
    });
    render();
  }
});

app.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, data = new FormData(f);
  if (f.id === 'onboard') {
    S = freshState(String(data.get('pname')).trim() || 'Player', onboardPreset);
    save(); requestPersist(); view = 'quests'; render();
    popup({ kind: 'Notification', title: `Welcome, Player ${S.player.name}.`, lines: [`[Daily Quest: ${S.questName}] has arrived.`, 'Complete every goal before midnight.'] });
  }
  if (f.id === 'sideForm') { S.side.push({ id: uid(), name: String(data.get('name')).trim(), rank: data.get('rank'), done: false }); save(); render(); }
  if (f.id === 'rewardForm') { S.rewards.push({ id: uid(), name: String(data.get('name')).trim(), cost: Math.max(1, Math.round(Number(data.get('cost')))) }); save(); render(); }
});

function useItem(id) {
  if (!S.inv[id]) return;
  if (id === 'potion') {
    if (S.buffs.potion) { popup({ kind: 'Inventory', title: 'An Elixir is already active.' }); return; }
    S.inv.potion--; S.buffs.potion = true;
    popup({ kind: 'Inventory', title: 'Elixir of Growth used', lines: ['Your next Daily Quest reward gives double XP.'] });
  } else if (id === 'crystal') {
    S.inv.crystal--; S.player.points++;
    popup({ kind: 'Inventory', title: 'Stat Crystal used', lines: ['+1 stat point. Assign it on the Status screen.'] });
  } else if (id === 'box') {
    S.inv.box--;
    const r = Math.random();
    if (r < 0.4) { const g = 40 + Math.floor(Math.random() * 120); S.player.gold += g; popup({ tone: 'gold', kind: 'Random Box', title: 'The box contained gold', big: `+${g}` }); }
    else if (r < 0.75) { const got = gainXP(50 + S.player.level * 5); popup({ tone: 'gold', kind: 'Random Box', title: 'The box contained experience', big: `+${got} XP` }); afterGain(); }
    else if (r < 0.9) { addItem('potion'); popup({ tone: 'gold', kind: 'Random Box', title: 'You obtained: Elixir of Growth' }); }
    else if (r < 0.97) { addItem('shield'); popup({ tone: 'gold', kind: 'Random Box', title: 'You obtained: Streak Shield' }); }
    else { addItem('crystal'); popup({ tone: 'gold', kind: 'Random Box', title: 'Rare drop: Stat Crystal' }); }
  }
  if (S.inv[id] <= 0) delete S.inv[id];
  save(); render();
}

async function toggleNotify(el) {
  if (el.checked) {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      el.checked = false;
      popup({ tone: 'red', kind: 'Reminders', title: 'Notifications are blocked', lines: ['Allow notifications for this app in your phone settings, then turn this on again.'] });
      return;
    }
    S.settings.notify = true; registerPeriodic();
    popup({ kind: 'Reminders', title: 'Reminders on', lines: [`While the app is running, it reminds you at ${reminderTimes().join(', ')} if the Daily Quest isn't done.`] });
  } else S.settings.notify = false;
  save();
}

/* ---------- backup ---------- */
async function exportSave() {
  S.lastBackup = Date.now(); save();
  const name = `system-backup-${today()}.json`;
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'System backup' }); render(); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  render();
  popup({ kind: 'Backup', title: 'Backup saved', lines: [`${name} is in your Downloads. Keep a copy in Google Drive or send it to yourself.`] });
}
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d.player || !Array.isArray(d.quests)) throw new Error('bad');
    popup({ kind: 'Backup', title: `Restore ${d.player.name}, level ${d.player.level}?`, lines: ['This replaces the progress currently on this phone.'], buttons: [
      { label: 'Restore', onClick: () => { S = migrate(d); rollover(); save(); view = 'status'; render(); queue.unshift({ kind: 'Backup', title: 'Progress restored' }); } },
      { label: 'Cancel', ghost: true }] });
  } catch (err) {
    popup({ tone: 'red', kind: 'Backup', title: 'That file is not a System backup', lines: ['Choose a file named system-backup-….json'] });
  }
});

/* ---------- boot ---------- */
function boot() {
  S = load();
  if (S) { rollover(); afterGain(); }
  render();
  if (!S) {
    popup({ kind: 'Notification', title: 'You have acquired the qualifications to be a Player. Will you accept?', buttons: [
      { label: 'Accept' },
      { label: 'Decline', ghost: true, onClick: () => { queue.unshift({ tone: 'red', kind: 'Warning', title: 'The System does not accept refusals.', lines: ['Your heart will stop in 0.02 seconds if you decline.'], buttons: [{ label: 'Accept' }] }); } }] });
  }
  setInterval(() => {
    if (!S) return;
    if (rollover()) render();
    const c = $('#clock'); if (c) { const t = timeLeft(); c.textContent = t.text; }
    reminderTick();
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S && rollover()) render(); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(() => { if (S?.settings.notify) registerPeriodic(); }).catch(() => {});
  }
  writeStatus();
  initCloud();
}
boot();
