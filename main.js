import { createClient } from '@supabase/supabase-js';
import './style.css';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const configured = Boolean(URL && KEY && !URL.includes('YOUR-PROJECT') && !KEY.includes('YOUR_'));
const supabase = configured ? createClient(URL, KEY, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }) : null;

const app = document.getElementById('app');
const ICONS = {
  crown: '👑', police: '👮', dakat: '🏴‍☠️', chor: '🥷',
};
const TITLES = { babu:'The Babu', police:'The Police', dakat:'The Dakat', chor:'The Chor' };
const DESCS = {
  babu: 'You are the boss. Relax, look important, and collect 100 points.',
  police: 'You are the detective. Identify the Chor AND Dakat to earn 80 points.',
  dakat: 'Keep your identity hidden. Earn 60 points if Police fails to identify you.',
  chor: 'Blend in and bluff. Earn 40 points if Police fails to identify you.'
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const byId = id => app.querySelector(`#${id}`);
const playerName = (id) => game?.players.find(p => p.id === id)?.name || 'Unknown';
const inviteCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8);
const savedRoom = localStorage.getItem('cpdb-room') || '';
let roomCode = inviteCode && inviteCode !== savedRoom ? '' : savedRoom;
let game = null;
let loading = false;
let selectedChor = null;
let selectedDakat = null;
let selectionRound = 0;
let formMode = new URLSearchParams(location.search).get('room') ? 'join' : 'create';
let notice = '';
let toastTimeout = null;
let pollTimer = null;
let chatDraft = '';
let chatOpenMobile = false;
let activeFormName = localStorage.getItem('cpdb-name') || '';
const requestedRoom = inviteCode;

function logo() {
  return `<div class="brand"><div class="brand-icon"><span>👑</span><span>👮</span><span>🥷</span><span>🏴‍☠️</span></div><div class="brand-name">CHOR<span>•</span>POLICE<span>•</span><br>DAKAT<span>•</span>BABU</div></div>`;
}

function showToast(msg, isError=false) {
  notice = msg;
  let el = document.querySelector('.toast');
  if (el) el.remove();
  el = document.createElement('div');
  el.className = `toast ${isError ? 'toast-error' : ''}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { el.remove(); notice = ''; }, 4000);
}

function backToHome() {
  game = null;
  roomCode = '';
  localStorage.removeItem('cpdb-room');
  history.replaceState(null,'',location.pathname);
  clearInterval(pollTimer);
  pollTimer = null;
  render();
}

async function ensureAuth() {
  if (!supabase) throw new Error('Set up your Supabase credentials first (see README).');
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(error.message + ' Check that anonymous sign-ins are enabled in Supabase.');
}

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

async function act(work) {
  if (loading) return;
  loading = true;
  document.querySelectorAll('.busy-btn').forEach(b => { b.disabled = true; });
  try { await work(); }
  catch (err) { console.error(err); showToast(err.message || 'Something went wrong. Please try again.', true); }
  finally { loading = false; document.querySelectorAll('.busy-btn').forEach(b => { b.disabled = false; }); }
}

function applyGame(data) {
  if (!data) return;
  const before = JSON.stringify(game);
  game = data;
  if (selectionRound !== game.room.round) {
    selectedChor = null; selectedDakat = null; selectionRound = game.room.round;
  }
  if (JSON.stringify(game) !== before) {
    const chatScroller = document.querySelector('.chat-messages');
    const shouldScroll = !chatScroller || chatScroller.scrollHeight - chatScroller.scrollTop - chatScroller.clientHeight < 85;
    const focusedChat = document.activeElement?.id === 'chatInput';
    render();
    if (shouldScroll) {
      const updatedChat = document.querySelector('.chat-messages');
      if (updatedChat) updatedChat.scrollTop = updatedChat.scrollHeight;
    }
    if (focusedChat) { const el = byId('chatInput'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
  }
}

async function refresh(quiet=true) {
  if (!roomCode || !supabase) return;
  try { applyGame(await rpc('cpd_get_state', { p_code: roomCode })); }
  catch (err) { if (!quiet) showToast(err.message, true); }
}

function beginPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible' && !loading) refresh(); }, 2300);
}

async function openRoom(code) {
  roomCode = code;
  localStorage.setItem('cpdb-room',code);
  history.replaceState(null,'',`/?room=${encodeURIComponent(code)}`);
  await refresh(false);
  beginPolling();
}

async function submitRoomForm(event) {
  const form = event.target;
  const name = (form.elements.name?.value || '').trim();
  const code = (form.elements.code?.value || '').trim().toUpperCase();
  if (!name) return showToast('Enter your name to continue.', true);
  if (formMode === 'join' && !/^[A-F0-9]{8}$/.test(code)) return showToast('Enter an 8-character room code.', true);
  activeFormName = name;
  localStorage.setItem('cpdb-name',name);
  await act(async () => {
    await ensureAuth();
    const newCode = formMode === 'create'
      ? await rpc('cpd_create_room', { p_name: name })
      : await rpc('cpd_join_room', { p_code: code, p_name: name });
    await openRoom(newCode);
    showToast(formMode === 'create' ? 'Room created! Share your invite link.' : 'You joined the room!');
  });
}

function countLabel(n) { return `${n}/4 players`; }
function initials(name) { return esc((name || '?').split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase()); }
function avatar(p, idx = 0) { return `<div class="avatar avatar-${idx%4}">${initials(p.name)}</div>`; }
function scoreString(n) { return Number(n || 0).toLocaleString(); }

function renderHome() {
  app.innerHTML = `
    <div class="site-shell">
      <header class="topbar container">${logo()}<div class="topbar-right"><span class="online-dot"></span> THE CLASSIC, REIMAGINED</div></header>
      <main class="landing container">
        <section class="landing-left">
          <div class="eyebrow"><span class="eyebrow-spark">✦</span> THE ULTIMATE 4-PLAYER BLUFF GAME</div>
          <h1>Old-school fun.<br><span class="gradient-text">New-school<br>showdown.</span></h1>
          <p class="landing-copy">Four friends. Four secret identities. One detective. Bring the childhood classic online — no more folded paper required.</p>
          <div class="roles-display" aria-label="Four game roles">
            <div class="role-token token-babu"><div>👑</div><span>BABU</span></div>
            <div class="role-token token-police"><div>👮</div><span>POLICE</span></div>
            <div class="role-token token-dakat"><div>🏴‍☠️</div><span>DAKAT</span></div>
            <div class="role-token token-chor"><div>🥷</div><span>CHOR</span></div>
          </div>
          <div class="landing-facts"><span>✦ &nbsp; 4 REAL PLAYERS</span><span>✦ &nbsp; PRIVATE ROOMS</span><span>✦ &nbsp; FREE TO PLAY</span></div>
        </section>
        <section class="entry-card" aria-label="Create or join a game">
          <div class="card-topline"><span class="live-pill"><span class="online-dot"></span> MULTIPLAYER ONLINE</span><span>✦ NO ACCOUNT NEEDED</span></div>
          <div class="entry-heading">Ready to play<span class="accent-dot">?</span></div>
          <p class="entry-subheading">Your squad is only one room code away.</p>
          <div class="form-tabs"><button type="button" class="form-tab ${formMode === 'create' ? 'active' : ''}" data-action="mode-create">Create room</button><button type="button" class="form-tab ${formMode === 'join' ? 'active' : ''}" data-action="mode-join">Join room</button></div>
          <form id="roomForm" class="entry-form">
            <label for="roomName">YOUR PLAYER NAME</label>
            <input id="roomName" name="name" type="text" autocomplete="nickname" maxlength="20" required placeholder="e.g. Mystery Master" value="${esc(activeFormName)}" />
            ${formMode === 'join' ? `<label for="roomCode">8-CHARACTER ROOM CODE</label><input id="roomCode" name="code" maxlength="8" minlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false" required placeholder="e.g. A1B2C3D4" value="${esc(requestedRoom)}" />` : ''}
            <button type="submit" class="primary-btn busy-btn">${formMode === 'create' ? 'Create a room' : 'Join the squad'} <span>↗</span></button>
          </form>
          ${!configured ? `<div class="setup-note"><strong>Setup required:</strong> Add Supabase URL/key and run the SQL file to enable live multiplayer. See README.md.</div>` : ''}
          <div class="entry-footer"><span>🔒</span><span>Secret roles • Private links • Endless rounds</span></div>
        </section>
      </main>
      <div class="howto container"><div><span class="howto-num">01</span><strong>Create a room</strong><p>Start a private lobby.</p></div><div><span class="howto-num">02</span><strong>Invite 3 friends</strong><p>Send your room link.</p></div><div><span class="howto-num">03</span><strong>Play & bluff</strong><p>Keep your role a secret.</p></div></div>
      <footer class="footer container">MADE FOR GAME NIGHTS, GROUP CHATS & OLD MEMORIES <span>✦</span> CHOR • POLICE • DAKAT • BABU</footer>
    </div>`;
}

function roleView(role) {
  if (!role) return '';
  return `<div class="secret-role role-${role}">
    <div class="secret-upper"><span>✦ YOUR SECRET IDENTITY</span><span>ROUND ${game.room.round.toString().padStart(2,'0')}</span></div>
    <div class="big-role-icon">${ICONS[role]}</div><div class="big-role-name">${TITLES[role]}</div>
    <div class="role-description">${DESCS[role]}</div>
    <div class="secret-keep">🔒 &nbsp; Shhh... only you can see this card.</div>
  </div>`;
}

function renderLobbyMain() {
  const host = game.room.host_id === game.me.id;
  return `<div class="main-heading"><div><span class="section-kicker">THE WAITING ROOM</span><h2>Get the gang <span class="gradient-text">together.</span></h2><p>Send your invite link. The fun starts when all four players join.</p></div><div class="status-chip"><span class="online-dot"></span> WAITING FOR PLAYERS</div></div>
  <div class="room-code-panel"><div><div class="mini-label">YOUR ROOM CODE</div><div class="room-code">${esc(game.room.code)}</div><div class="code-hint">Share this code with your friends</div></div><button class="outlined-btn" data-action="share">↗ &nbsp; Share invite</button></div>
  <div class="panel lobby-panel"><div class="panel-heading"><div><span class="panel-icon">◉</span> The squad</div><span class="pill-light">${countLabel(game.players.length)}</span></div>
  <div class="player-slots">${[0,1,2,3].map(i => {
    const p = game.players[i];
    return p ? `<div class="player-slot filled">${avatar(p,i)}<div class="slot-copy"><strong>${esc(p.name)} ${p.id === game.me.id ? '<span class="you-indicator">(you)</span>' : ''}</strong><span>${p.id === game.room.host_id ? 'Room host' : 'Ready to play'}</span></div><div class="ready-marker">✓ READY</div></div>`
    : `<div class="player-slot empty"><div class="avatar avatar-empty">+</div><div class="slot-copy"><strong>Waiting for player ${i+1}</strong><span>Invite a friend to join</span></div><span class="waiting-dots">···</span></div>`;
  }).join('')}</div>
  <div class="lobby-actions">${host ? `<button class="primary-btn busy-btn" data-action="start" ${game.players.length !== 4 ? 'disabled' : ''}>${game.players.length === 4 ? 'Deal the cards' : `Waiting for ${4-game.players.length} player${4-game.players.length===1 ? '' : 's'}...`} <span>→</span></button>` : '<div class="waiting-host">✦ &nbsp; Your host will start the round when everyone is here.</div>'}<p>All 4 players are required to play.</p></div></div>
  <div class="rule-strip"><span>HOW IT WORKS</span> Private roles → Police guesses Chor & Dakat → Everyone reveals → Points are awarded.</div>`;
}

function guessView() {
  const role = game.me.role;
  const police = playerName(game.room.police_id);
  const isPolice = role === 'police';
  const selectable = game.players.filter(p => p.id !== game.me.id);
  return `<div class="main-heading"><div><span class="section-kicker">ROUND ${game.room.round.toString().padStart(2,'0')} • THE HUNT</span><h2>Who can you <span class="gradient-text">trust?</span></h2><p>Roles have been dealt. The detective is on the case.</p></div><div class="status-chip purple"><span class="pulse-dot"></span> ROUND IN PROGRESS</div></div>
  <div class="role-and-mission">${roleView(role)}
    <div class="mission panel"><div class="panel-heading"><div><span class="panel-icon">◎</span> The mission</div><span class="pill-light">LIVE</span></div>
      ${isPolice ? `<div class="mission-intro">You're the detective! Identify <b>both</b> the Chor and Dakat. Each suspect can only be selected once.</div>
       <div class="guess-label">① &nbsp; WHO IS THE CHOR?</div><div class="suspect-grid">${selectable.map((p,i) => suspectButton(p,i,'chor')).join('')}</div>
       <div class="guess-label">② &nbsp; WHO IS THE DAKAT?</div><div class="suspect-grid">${selectable.map((p,i) => suspectButton(p,i,'dakat')).join('')}</div>
       <button class="primary-btn busy-btn confirm-guess" data-action="guess" ${!selectedChor || !selectedDakat ? 'disabled' : ''}>Lock in my guesses <span>↗</span></button>`
       : `<div class="waiting-visual">🔎</div><h3>Detective at work</h3><p><b>${esc(police)}</b> is choosing who they think the Chor and Dakat are. Keep your poker face on!</p><div class="wait-loader"><i></i><i></i><i></i></div>`}
    </div>
  </div><div class="rule-strip">🎯 &nbsp; Police earns 80 points only by catching <b>both</b>. Uncaught Chor and Dakat earn 40 and 60 points; Babu always earns 100.</div>`;
}

function suspectButton(p,i,type) {
  const selected = type==='chor' ? selectedChor : selectedDakat;
  const other = type==='chor' ? selectedDakat : selectedChor;
  const isChosen = p.id === selected;
  return `<button class="suspect ${isChosen ? 'is-selected' : ''}" data-action="select-${type}" data-id="${esc(p.id)}" ${p.id === other ? 'disabled' : ''}>
    ${avatar(p,i)}<span>${esc(p.name)}</span><span class="suspect-radio">${isChosen ? '✓' : ''}</span></button>`;
}

function revealView() {
  const result = game.reveal;
  const chor = result.find(r => r.role === 'chor');
  const dakat = result.find(r => r.role === 'dakat');
  const bothCaught = game.room.guessed_chor === chor?.id && game.room.guessed_dakat === dakat?.id;
  const host = game.room.host_id === game.me.id;
  const isPolice = game.me.role === 'police';
  return `<div class="main-heading"><div><span class="section-kicker">ROUND ${game.room.round.toString().padStart(2,'0')} • THE REVEAL</span><h2>The truth is <span class="gradient-text">out.</span></h2><p>Every identity has been revealed. Check out how the round went.</p></div><div class="status-chip">✦ ROUND COMPLETE</div></div>
  <div class="result-hero ${bothCaught ? 'success' : 'escape'}"><div class="result-art">${bothCaught ? '🚨' : '💨'}</div><div><span class="section-kicker">${bothCaught ? 'DOUBLE ARREST!' : 'THE SUSPECTS STRIKE BACK'}</span><h3>${bothCaught ? 'Police got them both!' : 'Someone got away!'}</h3><p>${bothCaught ? `${esc(playerName(game.room.police_id))} correctly identified Chor and Dakat.` : 'The Police did not identify both roles. Any uncaught suspect gets away with points.'}</p></div></div>
  <div class="panel reveal-panel"><div class="panel-heading"><div><span class="panel-icon">✦</span> Cards revealed</div><span class="pill-light">ROUND ${game.room.round}</span></div>
    <div class="reveal-grid">${result.map(r => `<div class="reveal-card reveal-${esc(r.role)}"><div class="reveal-emoji">${ICONS[r.role]}</div><span class="reveal-role">${esc(r.role.toUpperCase())}</span><strong>${esc(playerName(r.id))}</strong><span class="reveal-earned">+${r.earned} PTS</span></div>`).join('')}</div>
    <div class="guess-summary">👮 Police guessed <b>${esc(playerName(game.room.guessed_chor))}</b> as Chor and <b>${esc(playerName(game.room.guessed_dakat))}</b> as Dakat.</div>
    <div class="result-action">${host ? `<button class="primary-btn busy-btn" data-action="start">Deal next round <span>→</span></button>` : `<span class="waiting-host">✦ &nbsp; Waiting for the host to deal the next round...</span>`}</div>
  </div>`;
}

function renderSidebar() {
  return `<aside class="sidebar"><section class="panel scores-panel"><div class="panel-heading"><div><span class="panel-icon">🏆</span> Leaderboard</div><span class="pill-light">LIVE</span></div>
    <div class="leaderboard">${game.players.map((p,i) => `<div class="leader-row"><div class="ranking ${i===0?'ranking-top':''}">${i === 0 ? '♛' : `${i+1}`}</div>${avatar(p,i)}<div class="leader-name"><strong>${esc(p.name)}</strong><span>${p.id === game.me.id ? 'YOU' : (p.id === game.room.host_id ? 'HOST' : 'PLAYER')}</span></div><div class="leader-score">${scoreString(p.score)}<span>PTS</span></div></div>`).join('')}</div>
    <div class="leader-foot">Highest score takes the crown 👑</div></section>
    <section class="panel chat-panel ${chatOpenMobile ? 'chat-open-mobile' : ''}"><div class="panel-heading"><div><span class="panel-icon">💬</span> Squad chat</div><span class="pill-light">${game.players.length} ONLINE*</span></div>
      <div class="chat-messages">${game.chat.length ? game.chat.map(m => `<div class="chat-message ${m.sender_id === game.me.id ? 'from-me' : ''}"><div class="message-meta">${esc(m.name)} ${m.sender_id === game.me.id ? '(you)' : ''}</div><div class="message-bubble">${esc(m.body)}</div></div>`).join('') : `<div class="chat-empty"><div>💬</div><p>Quiet in here...<br>Say hi to the squad!</p></div>`}</div>
      <form id="chatForm" class="chat-form"><input id="chatInput" name="message" placeholder="Type a message..." autocomplete="off" maxlength="160" value="${esc(chatDraft)}" aria-label="Type chat message"/><button type="submit" aria-label="Send message">➤</button></form>
      <div class="chat-note">*Room members, not a live presence count</div>
    </section>
    <div class="mobile-chat-toggle"><button data-action="toggle-chat">${chatOpenMobile ? 'Hide chat ✕' : 'Open squad chat 💬'}</button></div>
  </aside>`;
}

function renderGame() {
  const host = game.room.host_id === game.me.id;
  app.innerHTML = `<div class="site-shell game-shell"><header class="topbar container game-topbar">${logo()}<div class="header-actions"><div class="header-room"><span>ROOM</span><b>${esc(game.room.code)}</b></div><button class="header-btn" data-action="share" title="Copy invite link">↗ <span>Invite</span></button><button class="header-btn header-leave" data-action="leave" title="Leave room">↪ <span>Leave</span></button></div></header>
  <main class="container game-layout"><section class="game-main">${game.room.stage === 'lobby' ? renderLobbyMain() : game.room.stage === 'guessing' ? guessView() : revealView()}</section>${renderSidebar()}</main>
  <footer class="footer container">${host ? 'YOU ARE THE HOST' : 'PLAYING WITH FRIENDS'} <span>✦</span> KEEP YOUR SECRETS SAFE</footer></div>`;
}

function render() { if (game) renderGame(); else renderHome(); }

app.addEventListener('input', event => {
  if (event.target.id === 'chatInput') chatDraft = event.target.value;
  if (event.target.id === 'roomName') activeFormName = event.target.value;
});

app.addEventListener('submit', async event => {
  event.preventDefault();
  if (event.target.id === 'roomForm') return submitRoomForm(event);
  if (event.target.id === 'chatForm') {
    const body = chatDraft.trim();
    if (!body || !roomCode) return;
    chatDraft = '';
    const input = byId('chatInput');
    if (input) input.value = '';
    await act(async () => { await rpc('cpd_send_chat', { p_code:roomCode, p_body:body }); await refresh(); });
  }
});

app.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'mode-create' || action === 'mode-join') {
    formMode = action === 'mode-create' ? 'create' : 'join';
    render();
  }
  else if (action === 'share') {
    if (!roomCode) return;
    const link = `${location.origin}/?room=${encodeURIComponent(roomCode)}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Play Chor Police Dakat Babu!', text: `Join my 4-player room! Code: ${roomCode}`, url: link }); }
      catch (error) { if (error.name !== 'AbortError') showToast('Could not share.', true); }
    } else {
      try { await navigator.clipboard.writeText(link); showToast('Invite link copied! Send it to 3 friends.'); }
      catch { showToast(`Share this link: ${link}`); }
    }
  }
  else if (action === 'start') {
    await act(async () => { await rpc('cpd_start_round', { p_code: roomCode }); await refresh(); showToast('The cards have been dealt!'); });
  }
  else if (action === 'select-chor') {
    selectedChor = button.dataset.id; render();
  }
  else if (action === 'select-dakat') {
    selectedDakat = button.dataset.id; render();
  }
  else if (action === 'guess') {
    if (!selectedChor || !selectedDakat) return showToast('Choose both the Chor and Dakat!', true);
    await act(async () => { await rpc('cpd_submit_guess', { p_code: roomCode, p_chor:selectedChor, p_dakat:selectedDakat }); await refresh(); });
  }
  else if (action === 'toggle-chat') { chatOpenMobile = !chatOpenMobile; render(); }
  else if (action === 'leave') {
    if (!confirm('Leave this room? You can rejoin an active game from the same browser using its invite link.')) return;
    await act(async () => {
      if (game.room.stage === 'lobby') await rpc('cpd_leave_lobby', { p_code:roomCode });
      backToHome();
      showToast('You left the room.');
    });
  }
});

window.addEventListener('focus', () => { if (roomCode) refresh(); });

autoRestore();
async function autoRestore() {
  render();
  if (!configured || !roomCode) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { localStorage.removeItem('cpdb-room'); return; }
    const original = roomCode;
    await refresh();
    if (!game && original === roomCode) {
      // No longer a member or room deleted: fall back to the landing screen.
      backToHome();
      return;
    }
    beginPolling();
  } catch { backToHome(); }
}
