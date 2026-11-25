'use strict';
/* =========================================================
   Google Drive sync + Google Calendar reminders.
   - The phone keeps the main copy (fast, works offline).
   - A copy is saved in a hidden app folder in your Google Drive
     and pulled down when you open the app on another device.
   - Reminders: one repeating "Daily Quest pending" event in your
     Google Calendar. Claiming the day's reward deletes that day's
     event, so alerts only fire while the quest is still pending.
   Loaded before app.js; uses S, save(), popup(), render() from it.
   ========================================================= */

const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.appdata';
const SCOPE_CAL = 'https://www.googleapis.com/auth/calendar.events';
const G_SCOPES = `${SCOPE_DRIVE} ${SCOPE_CAL} openid email`;
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary';
const SAVE_FILE = 'system-save.json';
const SYNC_KEY = 'system.sync.v1';
const TOKEN_KEY = 'system.token.v1';

const clientId = () => (window.SYSTEM_CONFIG?.googleClientId || '').trim();
const blankSync = () => ({ connected: false, email: null, fileId: null, base: null, dirty: false, last: 0 });

let SYNC = (() => { try { return { ...blankSync(), ...JSON.parse(localStorage.getItem(SYNC_KEY) || '{}') }; } catch (e) { return blankSync(); } })();
const saveSync = () => localStorage.setItem(SYNC_KEY, JSON.stringify(SYNC));

/* ---------- sign-in (Google Identity Services) ---------- */
let tok = (() => { try { return JSON.parse(localStorage.getItem(TOKEN_KEY)) || null; } catch (e) { return null; } })();
const tokenValid = () => !!tok && tok.exp > Date.now() + 60000;
let tokenClient = null, gisPromise = null, pendingAuth = null;

function authErr(msg) { const e = new Error(msg); e.auth = true; return e; }

function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((res, rej) => {
    if (window.google?.accounts?.oauth2) return res();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res; s.onerror = () => { gisPromise = null; rej(new Error('Could not reach Google sign-in.')); };
    document.head.appendChild(s);
  }).then(() => {
    const oa = google.accounts.oauth2;
    tokenClient = oa.initTokenClient({
      client_id: clientId(), scope: G_SCOPES,
      callback: r => {
        const p = pendingAuth; pendingAuth = null;
        if (r.error) { p?.rej(authErr(r.error_description || r.error)); return; }
        if (!oa.hasGrantedAllScopes(r, SCOPE_DRIVE)) { p?.rej(authErr('Google Drive access was not allowed. Connect again and tick the Drive box.')); return; }
        tok = { token: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000, cal: oa.hasGrantedAllScopes(r, SCOPE_CAL) };
        localStorage.setItem(TOKEN_KEY, JSON.stringify(tok));
        p?.res(tok.token);
      },
      error_callback: e => {
        const p = pendingAuth; pendingAuth = null;
        p?.rej(authErr(e?.type === 'popup_closed' ? 'Sign-in was closed before it finished.' : 'Sign-in could not open. Allow pop-ups for this app and try again.'));
      },
    });
  });
  return gisPromise;
}

/* When interactive, call this directly inside a tap handler (before any await),
   otherwise the browser blocks the Google sign-in window. */
function getToken(interactive) {
  if (tokenValid()) return Promise.resolve(tok.token);
  if (!interactive) return Promise.reject(authErr('Tap to sync with Google Drive.'));
  if (!tokenClient) { loadGis().catch(() => {}); return Promise.reject(authErr('Google sign-in is still loading. Check your connection and tap again.')); }
  return new Promise((res, rej) => {
    pendingAuth?.rej(authErr('superseded'));
    pendingAuth = { res, rej };
    tokenClient.requestAccessToken({ prompt: SYNC.connected ? '' : 'consent', login_hint: SYNC.email || undefined });
  });
}

async function gfetch(url, opts = {}) {
  const t = await getToken(false);
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${t}`, ...(opts.headers || {}) } });
  if (r.status === 401) { tok = null; localStorage.removeItem(TOKEN_KEY); throw authErr('Tap to sync with Google Drive.'); }
  if (!r.ok) {
    const e = new Error(`Google returned error ${r.status}`); e.status = r.status;
    try { const j = await r.json(); if (j.error?.message) e.message = j.error.message; } catch (_) {}
    throw e;
  }
  if (r.status === 204) return null;
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

/* ---------- sync status pill ---------- */
let syncState = 'off';
function setSync(state, msg = '') {
  syncState = state;
  const p = document.getElementById('syncPill');
  if (!p) return;
  p.hidden = !SYNC.connected;
  const labels = { synced: 'Synced', syncing: 'Syncing…', auth: 'Tap to sync', offline: 'Offline', error: 'Sync failed' };
  p.textContent = labels[state] || 'Sync';
  p.dataset.state = state;
  p.setAttribute('aria-label', `Google Drive: ${labels[state] || 'Sync'}${msg ? '. ' + msg : ''}`);
  p.title = msg;
}

/* ---------- Drive ---------- */
async function readRemote() {
  let id = SYNC.fileId;
  if (!id) {
    const q = encodeURIComponent(`name='${SAVE_FILE}' and trashed=false`);
    const r = await gfetch(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);
    id = r.files?.[0]?.id || null;
  }
  if (!id) return { id: null, remote: null };
  try { return { id, remote: await gfetch(`${DRIVE}/files/${id}?alt=media`) }; }
  catch (e) { if (e.status === 404) { SYNC.fileId = null; return { id: null, remote: null }; } throw e; }
}

async function upload(id) {
  const body = JSON.stringify(S);
  if (id) {
    await gfetch(`${UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
  } else {
    const b = 'system' + uid();
    const multipart = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: SAVE_FILE, parents: ['appDataFolder'] })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
    const r = await gfetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: multipart });
    id = r.id;
  }
  SYNC.fileId = id; SYNC.base = S.savedAt; SYNC.dirty = false; saveSync();
}

function adopt(remote, id) {
  S = migrate(remote);
  writeLocal();
  SYNC.fileId = id; SYNC.base = remote.savedAt; SYNC.dirty = false; saveSync();
  rollover(); render();
}

/* Merge rule:
   - Only Drive changed  -> take Drive's copy.
   - Only this device changed -> upload.
   - Both changed (e.g. two devices offline) -> the newest save wins.
   A device that was simply opened after a while (no taps yet) never
   overwrites newer progress from another device. */
async function syncDrive() {
  if (!S) return;
  const { id, remote } = await readRemote();
  if (!remote || !remote.player) { await upload(id); return; }
  const remoteChanged = remote.savedAt !== SYNC.base;
  if (remoteChanged && (!SYNC.dirty || (remote.savedAt || 0) > (S.savedAt || 0))) adopt(remote, id);
  else if (SYNC.dirty || remote.savedAt !== S.savedAt) await upload(id);
  else { SYNC.fileId = id; saveSync(); }
}

/* ---------- Calendar ---------- */
function localISO(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`; }
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

async function calCreate() {
  const times = reminderTimes(); if (!times.length) return;
  const last = times[times.length - 1];
  const start = parseKey(S.lastDay); start.setHours(...last.split(':').map(Number), 0, 0);
  const end = new Date(start.getTime() + 15 * 60000);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ev = await gfetch(`${CAL}/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: `[Daily Quest] ${S.questName}: pending`,
      description: `Complete today's Daily Quest in The System before midnight. This reminder disappears automatically once you claim the reward.\n\n${location.origin}${location.pathname}`,
      start: { dateTime: localISO(start), timeZone: tz }, end: { dateTime: localISO(end), timeZone: tz },
      recurrence: ['RRULE:FREQ=DAILY'], transparency: 'transparent', colorId: '9',
      reminders: { useDefault: false, overrides: times.map(t => ({ method: 'popup', minutes: toMin(last) - toMin(t) })) },
    }),
  });
  S.cal.eventId = ev.id; S.cal.sig = reminderTimes().join(','); S.cal.done = [];
}
async function calDelete() {
  if (!S.cal.eventId) return;
  try { await gfetch(`${CAL}/events/${encodeURIComponent(S.cal.eventId)}`, { method: 'DELETE' }); }
  catch (e) { if (![404, 410].includes(e.status)) throw e; }
  S.cal.eventId = null; S.cal.sig = null; S.cal.done = [];
}
async function calCancelDay(day) {
  const a = parseKey(day), b = parseKey(addDays(day, 1));
  const r = await gfetch(`${CAL}/events/${encodeURIComponent(S.cal.eventId)}/instances?timeMin=${encodeURIComponent(a.toISOString())}&timeMax=${encodeURIComponent(b.toISOString())}`);
  for (const it of r.items || []) {
    if (it.status === 'cancelled') continue;
    try { await gfetch(`${CAL}/events/${encodeURIComponent(it.id)}`, { method: 'DELETE' }); }
    catch (e) { if (![404, 410].includes(e.status)) throw e; }
  }
}
/* Brings Google Calendar in line with the app. Returns true if S changed. */
async function flushCalendar() {
  if (!S) return false;
  const c = S.cal;
  if (!c.on) { if (c.eventId) { await calDelete(); return true; } return false; }
  if (tok && tok.cal === false) throw new Error('Google Calendar access was not allowed. Disconnect, connect again and tick the Calendar box.');
  let changed = false;
  if (c.eventId && c.sig !== reminderTimes().join(',')) { await calDelete(); changed = true; }
  if (!c.eventId) { await calCreate(); changed = true; }
  if (S.claimed && c.eventId && !c.done.includes(S.lastDay)) {
    try { await calCancelDay(S.lastDay); }
    catch (e) {
      if (![404, 410].includes(e.status)) throw e;
      S.cal.eventId = null; await calCreate(); await calCancelDay(S.lastDay); // event was deleted by hand: recreate it
    }
    S.cal.done = [...S.cal.done, S.lastDay].slice(-10); changed = true;
  }
  return changed;
}

/* ---------- running a sync ---------- */
let syncing = false, syncAgain = false, syncTimer = 0;
async function doSync() {
  if (syncing) { syncAgain = true; return; }
  syncing = true; setSync('syncing');
  try {
    await syncDrive();
    if (await flushCalendar()) { save(); clearTimeout(syncTimer); await syncDrive(); }
    SYNC.last = Date.now(); saveSync(); setSync('synced');
    if (view === 'settings') render();
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; setTimeout(() => runSync(false), 300); }
  }
}
function runSync(interactive = false) {
  if (!SYNC.connected) return Promise.resolve();
  if (!navigator.onLine) { setSync('offline'); return Promise.resolve(); }
  return getToken(interactive).then(doSync).catch(e => {
    if (e.message === 'superseded') return;
    setSync(e.auth ? 'auth' : 'error', e.message);
    if (interactive) popup({ tone: 'red', kind: 'Google Drive', title: e.auth ? 'Not signed in' : 'Sync failed', lines: [e.message] });
  });
}
function scheduleSync() {
  if (!SYNC.connected) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => runSync(false), 2500);
}
/* Hooks called by save() in app.js */
function onUserSave() { SYNC.dirty = true; saveSync(); scheduleSync(); }
function onSystemSave() { scheduleSync(); }

/* ---------- connect / disconnect (call from a tap) ---------- */
function connectGoogle() {
  if (!clientId()) {
    popup({ kind: 'Google Drive', title: 'Google sign-in is not set up yet', lines: ['Paste your Google Client ID into config.js. The README walks you through it (about 10 minutes, one time).'] });
    return;
  }
  getToken(true).then(firstConnect).catch(e => {
    if (e.message === 'superseded') return;
    popup({ tone: 'red', kind: 'Google Drive', title: 'Could not connect', lines: [e.message] });
  });
}
async function firstConnect() {
  try { const u = await gfetch('https://www.googleapis.com/oauth2/v3/userinfo'); SYNC.email = u?.email || null; } catch (e) {}
  SYNC.connected = true; SYNC.fileId = null; SYNC.base = null; saveSync(); setSync('syncing');
  const { id, remote } = await readRemote();
  if (!S) {
    if (remote?.player) {
      adopt(remote, id); view = 'status'; render(); setSync('synced');
      popup({ kind: 'Google Drive', title: `Welcome back, ${S.player.name}.`, lines: [`Level ${S.player.level} progress restored from Google Drive.`] });
    } else {
      setSync('synced'); render();
      popup({ kind: 'Google Drive', title: 'No save found on Google Drive', lines: ['Create your player below. Progress will save to Drive from now on.'] });
    }
    return;
  }
  if (remote?.player) {
    const r = remote.player, l = S.player;
    popup({
      kind: 'Google Drive', title: 'A save already exists on Google Drive',
      lines: [`Drive: ${r.name}, level ${r.level}`, `This device: ${l.name}, level ${l.level}`, 'Which one should be kept? The other is replaced.'],
      buttons: [
        { label: 'Use Drive save', onClick: () => { adopt(remote, id); afterConnect(); } },
        { label: 'Keep this device', ghost: true, onClick: () => { upload(id).then(afterConnect).catch(e => setSync('error', e.message)); } },
      ],
    });
    return;
  }
  await upload(id); afterConnect();
}
function afterConnect() {
  SYNC.last = Date.now(); saveSync(); setSync('synced'); render();
  popup({ kind: 'Google Drive', title: 'Google Drive connected', lines: [SYNC.email ? `Progress now saves to ${SYNC.email}.` : 'Progress now saves to Google Drive.', 'On another device, open the app and choose Connect to continue there.'] });
  if (S?.cal?.on) runSync(false);
}
function disconnectGoogle() {
  const hasCal = !!S?.cal?.on;
  popup({
    kind: 'Google Drive', title: 'Disconnect Google?',
    lines: ['Your progress stays on this device and on Drive, but this device stops syncing.', hasCal ? 'The Daily Quest reminders are removed from Google Calendar.' : null],
    buttons: [
      { label: 'Disconnect', onClick: () => {
        const done = () => {
          try { if (tok?.token) google.accounts.oauth2.revoke(tok.token, () => {}); } catch (e) {}
          tok = null; localStorage.removeItem(TOKEN_KEY);
          SYNC = blankSync(); saveSync(); setSync('off'); render();
        };
        if (hasCal) { S.cal.on = false; getToken(true).then(() => calDelete()).then(() => save(false)).catch(() => {}).finally(done); }
        else done();
      } },
      { label: 'Cancel', ghost: true },
    ],
  });
}

function initCloud() {
  if (clientId() && navigator.onLine) loadGis().catch(() => {});
  setSync(SYNC.connected ? (tokenValid() ? 'syncing' : 'auth') : 'off');
  if (SYNC.connected) runSync(false);
  window.addEventListener('online', () => { if (clientId()) loadGis().catch(() => {}); runSync(false); });
  window.addEventListener('offline', () => SYNC.connected && setSync('offline'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) runSync(false); });
}
