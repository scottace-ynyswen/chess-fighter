/* ════════════════════════════════════════════════
   CHESS FIGHTER — Frontend App
   Requires chess.js 0.10.3 loaded as global Chess
════════════════════════════════════════════════ */

/* ══════════════════════════
   STATE
══════════════════════════ */
const S = {
  user:          null,   // logged-in user object
  opponent:      null,   // opponent user object or AI profile
  gameMode:      'ai',   // 'ai' | 'hotseat'
  aiDepth:       3,
  chess:         null,   // Chess instance
  playerColor:   'w',    // which color the logged-in user plays
  boardFlipped:  false,
  selectedSq:    null,
  legalMoves:    [],
  lastMove:      null,
  captureLog:    { w: [], b: [] }, // pieces captured BY white / BY black
  gameOver:      false,
  gameResult:    null,   // 'white' | 'black' | 'draw'
  gameHow:       '',
  timerInterval: null,
  gameSeconds:   0,
  round:         1,
  selectedColor: 'white',
  selectedOppId: null,
};

const MAX_MAT = 39; // Q9 + 2R10 + 2B6 + 2N6 + 8P8
const PIECE_WT = { p:1, n:3, b:3, r:5, q:9 };
const UNICODE  = {
  w: { k:'♔', q:'♕', r:'♖', b:'♗', n:'♘', p:'♙' },
  b: { k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟' },
};

/* ══════════════════════════
   UTILITY
══════════════════════════ */
const $  = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);
const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const avatarUrl = path => path ? path : null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

/* ══════════════════════════
   API HELPERS
══════════════════════════ */
async function api(method, path, body) {
  const opts = { method, headers: {}, credentials: 'include' };
  if (body) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(path, opts);
  return r.json();
}
const GET  = path       => api('GET',  path);
const POST = (path, b)  => api('POST', path, b);

/* ══════════════════════════
   AUTH
══════════════════════════ */
function setupAuth() {
  // Tab toggle
  document.querySelectorAll('#authTabs .nav-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('#authTabs .nav-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      $('tab-login').style.display    = t.dataset.tab === 'login'    ? '' : 'none';
      $('tab-register').style.display = t.dataset.tab === 'register' ? '' : 'none';
    });
  });

  $('loginBtn').addEventListener('click', async () => {
    const username = $('loginUser').value.trim();
    const password = $('loginPass').value;
    if (!username || !password) return;
    const res = await POST('/api/auth/login', { username, password });
    if (res.error) { showErr('loginErr', res.error); return; }
    S.user = res.user;
    enterLobby();
  });

  $('loginUser').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginPass').focus(); });
  $('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginBtn').click(); });

  $('registerBtn').addEventListener('click', async () => {
    const username = $('regUser').value.trim();
    const password = $('regPass').value;
    const confirm  = $('regConfirm').value;
    if (!username || !password) return showErr('registerErr', 'All fields required');
    if (password !== confirm)   return showErr('registerErr', 'Passwords do not match');
    const res = await POST('/api/auth/register', { username, password });
    if (res.error) { showErr('registerErr', res.error); return; }
    S.user = res.user;
    enterLobby();
  });
}

function showErr(id, msg) {
  const el = $(id); el.textContent = msg; el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}

/* ══════════════════════════
   LOBBY
══════════════════════════ */
async function enterLobby() {
  showScreen('screen-lobby');
  renderLobbyWidget();
  await loadLeaderboard();
}

function renderLobbyWidget() {
  const w = $('lobbyPlayerWidget');
  w.innerHTML = '';
  if (!S.user) return;
  const av = document.createElement('div');
  av.className = 'lobby-avatar';
  av.innerHTML = S.user.avatar_path
    ? `<img src="${S.user.avatar_path}" />`
    : `<div class="lobby-avatar-default">👤</div>`;
  const info = document.createElement('div');
  info.innerHTML = `
    <div class="lobby-player-name">${S.user.username}</div>
    <div class="lobby-player-elo">ELO ${S.user.elo}</div>`;
  w.appendChild(av); w.appendChild(info);
}

async function loadLeaderboard() {
  const res = await GET('/api/leaderboard');
  const tbody = $('leaderboardBody');
  if (!res.leaderboard?.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#444;padding:40px;font-family:'Press Start 2P',monospace;font-size:.5rem">NO FIGHTERS YET — BE THE FIRST!</td></tr>`;
    return;
  }
  tbody.innerHTML = res.leaderboard.map((u, i) => {
    const rank = i + 1;
    const badge = rank <= 3
      ? `<span class="rank-badge rank-${rank}">${rank}</span>`
      : `<span class="rank-badge rank-other">${rank}</span>`;
    const av = u.avatar_path
      ? `<img class="avatar-sm" src="${u.avatar_path}" />`
      : `<span style="font-size:1.2rem;margin-right:8px">👤</span>`;
    const isMe = S.user && u.id === S.user.id;
    return `<tr style="${isMe ? 'background:#1a0f0a' : ''}">
      <td class="rank-cell">${badge}</td>
      <td>${av}<strong style="${isMe ? 'color:var(--col-gold)' : ''}">${u.username}${isMe ? ' ★' : ''}</strong></td>
      <td><span class="elo-val">${u.elo}</span></td>
      <td><span class="win-val">${u.wins}</span></td>
      <td><span class="loss-val">${u.losses}</span></td>
      <td><span class="draw-val">${u.draws}</span></td>
      <td><span class="pct-val">${u.win_pct}%</span></td>
      <td>${u.total_games}</td>
      <td>${u.avg_moves || '—'}</td>
    </tr>`;
  }).join('');
}

$('logoutBtn').addEventListener('click', async () => {
  await POST('/api/auth/logout');
  S.user = null;
  showScreen('screen-auth');
});

$('profileBtn').addEventListener('click', () => openProfile());
$('newGameBtn').addEventListener('click', () => openNewGameModal());
$('backFromProfileBtn').addEventListener('click', () => enterLobby());

/* ══════════════════════════
   PROFILE
══════════════════════════ */
let pendingAvatarFile = null;

function openProfile() {
  showScreen('screen-profile');
  pendingAvatarFile = null;
  renderProfileAvatar();
  renderProfileStats();
}

function renderProfileAvatar() {
  if (S.user?.avatar_path) {
    $('avatarLargeDefault').style.display = 'none';
    $('avatarLargeImg').src = S.user.avatar_path;
    $('avatarLargeImg').style.display = '';
  } else {
    $('avatarLargeDefault').style.display = '';
    $('avatarLargeImg').style.display = 'none';
  }
}

function renderProfileStats() {
  const u = S.user;
  if (!u) return;
  const total   = u.wins + u.losses + u.draws;
  const winPct  = total ? ((u.wins / total) * 100).toFixed(1) : 0;
  $('profileStats').innerHTML = [
    ['ELO RATING', u.elo],
    ['WINS',       `<span style="color:#44dd88">${u.wins}</span>`],
    ['LOSSES',     `<span style="color:var(--col-p2)">${u.losses}</span>`],
    ['WIN RATE',   `<span style="color:var(--col-gold)">${winPct}%</span>`],
  ].map(([l, v]) => `
    <div class="stat-card">
      <div class="stat-label">${l}</div>
      <div class="stat-value">${v}</div>
    </div>`).join('');
}

$('avatarDropZone').addEventListener('click', () => $('avatarFile').click());
$('avatarDropZone').addEventListener('dragover', e => { e.preventDefault(); $('avatarDropZone').style.borderColor = 'var(--col-gold)'; });
$('avatarDropZone').addEventListener('dragleave', () => { $('avatarDropZone').style.borderColor = '#333'; });
$('avatarDropZone').addEventListener('drop', e => {
  e.preventDefault();
  $('avatarDropZone').style.borderColor = '#333';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) previewAvatar(file);
});
$('avatarFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) previewAvatar(file);
});

function previewAvatar(file) {
  pendingAvatarFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    $('avatarLargeDefault').style.display = 'none';
    $('avatarLargeImg').src = ev.target.result;
    $('avatarLargeImg').style.display = '';
  };
  reader.readAsDataURL(file);
}

$('saveAvatarBtn').addEventListener('click', async () => {
  if (!pendingAvatarFile) return;
  const fd = new FormData();
  fd.append('avatar', pendingAvatarFile);
  const r = await fetch('/api/users/avatar', { method: 'POST', body: fd, credentials: 'include' });
  const res = await r.json();
  if (res.error) { showErr('profileErr', res.error); return; }
  S.user.avatar_path = res.avatar_path;
  pendingAvatarFile = null;
  $('profileOk').style.display = 'block';
  setTimeout(() => $('profileOk').style.display = 'none', 3000);
  renderLobbyWidget();
});

/* ══════════════════════════
   NEW GAME MODAL
══════════════════════════ */
function openNewGameModal() {
  $('newGameModal').classList.add('open');
  S.selectedColor = 'white';
  S.selectedOppId = null;
  S.gameMode      = 'ai';

  // Reset mode buttons
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === 'ai');
    b.classList.toggle('sf-btn-outline', b.dataset.mode !== 'ai');
  });
  $('aiOptions').style.display       = '';
  $('hotseatOptions').style.display  = 'none';

  // Reset color buttons
  document.querySelectorAll('.color-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.color === 'white');
    b.classList.toggle('sf-btn-outline', b.dataset.color !== 'white');
  });
}

// Mode toggle
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    S.gameMode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.classList.toggle('sf-btn-outline', b !== btn);
    });
    $('aiOptions').style.display      = S.gameMode === 'ai'       ? '' : 'none';
    $('hotseatOptions').style.display = S.gameMode === 'hotseat' ? '' : 'none';
    if (S.gameMode === 'hotseat') loadOpponentList();
  });
});

// Color toggle
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    S.selectedColor = btn.dataset.color;
    document.querySelectorAll('.color-btn').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.classList.toggle('sf-btn-outline', b !== btn);
    });
  });
});

async function loadOpponentList() {
  $('opponentList').innerHTML = `<div style="color:#444;padding:20px;text-align:center;font-family:'Press Start 2P',monospace;font-size:.5rem">LOADING...</div>`;
  const res = await GET('/api/users');
  if (!res.users?.length) {
    $('opponentList').innerHTML = `<div style="color:#444;padding:20px;text-align:center;font-family:'Press Start 2P',monospace;font-size:.5rem">NO OTHER FIGHTERS REGISTERED</div>`;
    return;
  }
  $('opponentList').innerHTML = res.users.map(u => `
    <div class="user-pick" data-id="${u.id}">
      <div class="user-pick-avatar">
        ${u.avatar_path ? `<img src="${u.avatar_path}" />` : `<div class="user-pick-default">👤</div>`}
      </div>
      <div>
        <div class="user-pick-name">${u.username}</div>
        <div class="user-pick-elo">ELO ${u.elo} · ${u.wins}W ${u.losses}L</div>
      </div>
    </div>`).join('');

  document.querySelectorAll('.user-pick').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.user-pick').forEach(x => x.classList.remove('chosen'));
      el.classList.add('chosen');
      S.selectedOppId = parseInt(el.dataset.id);
    });
  });
}

$('cancelFightBtn').addEventListener('click', () => $('newGameModal').classList.remove('open'));
$('newGameModal').addEventListener('click', e => { if (e.target === $('newGameModal')) $('newGameModal').classList.remove('open'); });

$('startFightBtn').addEventListener('click', async () => {
  if (S.gameMode === 'hotseat' && !S.selectedOppId) {
    alert('Please select an opponent!'); return;
  }
  $('newGameModal').classList.remove('open');
  S.aiDepth = parseInt($('aiDepthSelect').value);

  // Resolve color
  let myColor = S.selectedColor;
  if (myColor === 'random') myColor = Math.random() < .5 ? 'white' : 'black';
  S.playerColor = myColor === 'white' ? 'w' : 'b';

  // Resolve opponent
  if (S.gameMode === 'ai') {
    const levels = {1:'ROOKIE',2:'AMATEUR',3:'FIGHTER',4:'CHAMPION'};
    S.opponent = { id: -1, username: `AI (${levels[S.aiDepth]})`, avatar_path: null, elo: 1200 + S.aiDepth * 100, isAI: true };
  } else {
    const res = await GET('/api/users');
    S.opponent = res.users.find(u => u.id === S.selectedOppId);
  }

  startVsScreen();
});

/* ══════════════════════════
   VS SCREEN
══════════════════════════ */
function startVsScreen() {
  showScreen('screen-vs');
  S.round = 1;

  const whitePlayer = S.playerColor === 'w' ? S.user : S.opponent;
  const blackPlayer = S.playerColor === 'w' ? S.opponent : S.user;

  // P1 = current user (left), P2 = opponent (right)
  setVsFighter('P1', S.user,     S.playerColor === 'w' ? '♔ WHITE' : '♚ BLACK');
  setVsFighter('P2', S.opponent, S.playerColor === 'w' ? '♚ BLACK' : '♔ WHITE');

  // Animate fighters sliding in
  const f1 = $('vsFighterP1'), f2 = $('vsFighterP2');
  f1.style.transform = 'translateX(-100vw)'; f2.style.transform = 'translateX(100vw)';
  f1.style.opacity   = '0';                  f2.style.opacity   = '0';

  requestAnimationFrame(() => {
    f1.style.transition = 'transform .6s cubic-bezier(0,.9,.3,1), opacity .4s';
    f2.style.transition = 'transform .6s cubic-bezier(0,.9,.3,1), opacity .4s';
    f1.style.transform  = 'translateX(0)'; f1.style.opacity = '1';
    f2.style.transform  = 'translateX(0)'; f2.style.opacity = '1';
  });

  const round = $('vsRound'), fight = $('vsFight');
  round.style.opacity = '0'; fight.style.transform = 'translate(-50%,-50%) scale(0)'; fight.style.opacity = '0';

  setTimeout(() => {
    round.style.transition = 'opacity .3s';
    round.textContent = `ROUND ${S.round}`;
    round.style.opacity = '1';
  }, 900);

  setTimeout(() => {
    round.style.opacity = '0';
    fight.style.transition = 'transform .25s cubic-bezier(.175,.885,.32,1.275), opacity .2s';
    fight.style.transform  = 'translate(-50%,-50%) scale(1)';
    fight.style.opacity    = '1';
  }, 1800);

  setTimeout(() => {
    fight.style.opacity = '0';
    startGame();
  }, 2800);
}

function setVsFighter(side, player, colorLabel) {
  const wrap   = $(`vsPortrait${side}Wrap`);
  const nameEl = $(`vsName${side}`);
  const eloEl  = $(`vsElo${side}`);
  const colEl  = $(`vsColor${side}`);

  wrap.innerHTML = player?.avatar_path
    ? `<img class="vs-portrait" src="${player.avatar_path}" />`
    : `<div class="vs-portrait-default">${player?.isAI ? '🤖' : '👤'}</div>`;

  nameEl.textContent = player?.username?.toUpperCase() || 'PLAYER';
  eloEl.textContent  = `ELO ${player?.elo || 1200}`;
  colEl.textContent  = colorLabel;
}

/* ══════════════════════════
   GAME INIT
══════════════════════════ */
function startGame() {
  showScreen('screen-game');

  S.chess      = new Chess();
  S.selectedSq = null;
  S.legalMoves = [];
  S.lastMove   = null;
  S.captureLog = { w: [], b: [] };
  S.gameOver   = false;
  S.gameResult = null;
  S.gameHow    = '';
  S.gameSeconds = 0;
  S.boardFlipped = S.playerColor === 'b';

  // Setup HUD players
  // White player HUD = P1 position if playerColor is white, else P2
  const whitePlayer = S.playerColor === 'w' ? S.user     : S.opponent;
  const blackPlayer = S.playerColor === 'w' ? S.opponent : S.user;
  setHudPlayer('P1', S.user,     S.playerColor === 'w' ? '♔' : '♚');
  setHudPlayer('P2', S.opponent, S.playerColor === 'w' ? '♚' : '♔');

  $('roundDisplay').textContent = `ROUND ${S.round}`;

  // Start timer
  clearInterval(S.timerInterval);
  S.timerInterval = setInterval(() => {
    S.gameSeconds++;
    $('timerDisplay').textContent = fmtTime(S.gameSeconds);
  }, 1000);

  renderBoard();
  updateHealthBars();
  updateStatus();

  // If player is black, AI goes first
  if (S.gameMode === 'ai' && S.playerColor === 'b') {
    setTimeout(aiMove, 600);
  }
}

function setHudPlayer(side, player, pieceIcon) {
  const nameEl     = $(`hudName${side}`);
  const imgEl      = $(`hudImg${side}`);
  const defaultEl  = $(`hudDefault${side}`);

  nameEl.textContent = player?.username?.toUpperCase() || 'PLAYER';
  if (player?.avatar_path) {
    imgEl.src = player.avatar_path;
    imgEl.style.display = '';
    defaultEl.style.display = 'none';
  } else {
    imgEl.style.display = 'none';
    defaultEl.style.display = '';
    defaultEl.textContent = player?.isAI ? '🤖' : '👤';
  }
}

/* ══════════════════════════
   BOARD RENDERING
══════════════════════════ */
function renderBoard() {
  const board   = S.chess.board();
  const boardEl = $('chessBoard');
  boardEl.innerHTML = '';

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const rank  = S.boardFlipped ? row       : 7 - row;
      const file  = S.boardFlipped ? 7 - col   : col;
      const sqStr = 'abcdefgh'[file] + (rank + 1);
      const piece = board[7 - rank][file];

      const sq = document.createElement('div');
      sq.className = 'sq ' + ((rank + file) % 2 === 0 ? 'dark' : 'light');
      sq.dataset.sq = sqStr;

      // State classes
      if (sqStr === S.selectedSq) sq.classList.add('selected');
      if (S.lastMove) {
        if (sqStr === S.lastMove.from) sq.classList.add('last-from');
        if (sqStr === S.lastMove.to)   sq.classList.add('last-to');
      }
      if (S.legalMoves.includes(sqStr)) {
        sq.classList.add(piece ? 'legal-capture' : 'legal-move');
      }

      // King in check highlight
      if (S.chess.in_check && S.chess.in_check()) {
        if (piece && piece.type === 'k' && piece.color === S.chess.turn()) {
          sq.classList.add('king-check');
        }
      }

      // Coordinates (edge squares)
      if (file === (S.boardFlipped ? 7 : 0)) {
        const r = document.createElement('span');
        r.className = 'coord coord-rank';
        r.textContent = rank + 1;
        sq.appendChild(r);
      }
      if (rank === (S.boardFlipped ? 7 : 0)) {
        const f = document.createElement('span');
        f.className = 'coord coord-file';
        f.textContent = 'abcdefgh'[file];
        sq.appendChild(f);
      }

      // Piece
      if (piece) {
        const p = document.createElement('div');
        p.className = 'piece ' + (piece.color === 'w' ? 'white-piece' : 'black-piece');
        p.textContent = UNICODE[piece.color][piece.type];
        sq.appendChild(p);
      }

      sq.addEventListener('click', () => handleClick(sqStr));
      boardEl.appendChild(sq);
    }
  }
}

/* ══════════════════════════
   MOVE HANDLING
══════════════════════════ */
function handleClick(sqStr) {
  if (S.gameOver) return;
  const turn = S.chess.turn();

  // Hotseat: either player can click; AI: only playerColor can click
  if (S.gameMode === 'ai' && turn !== S.playerColor) return;

  const piece = S.chess.get(sqStr);

  if (S.selectedSq) {
    if (S.legalMoves.includes(sqStr)) {
      executeMove(S.selectedSq, sqStr);
    } else if (piece && piece.color === turn) {
      S.selectedSq  = sqStr;
      S.legalMoves  = S.chess.moves({ square: sqStr, verbose: true }).map(m => m.to);
      renderBoard();
    } else {
      S.selectedSq = null; S.legalMoves = [];
      renderBoard();
    }
  } else {
    if (piece && piece.color === turn) {
      S.selectedSq = sqStr;
      S.legalMoves = S.chess.moves({ square: sqStr, verbose: true }).map(m => m.to);
      renderBoard();
    }
  }
}

function executeMove(from, to) {
  // Auto-promote to queen
  const piece = S.chess.get(from);
  let promotion = undefined;
  if (piece?.type === 'p') {
    const destRank = parseInt(to[1]);
    if ((piece.color === 'w' && destRank === 8) || (piece.color === 'b' && destRank === 1)) {
      promotion = 'q';
    }
  }

  const move = S.chess.move({ from, to, promotion });
  if (!move) return;

  // Track captures
  if (move.captured) {
    S.captureLog[move.color].push(move.captured);
  }

  S.lastMove   = { from, to };
  S.selectedSq = null;
  S.legalMoves = [];

  renderBoard();
  updateHealthBars();
  updateMoveList();
  updateStatus();

  // Check game-over conditions
  if (S.chess.in_checkmate()) {
    const winner = S.chess.turn() === 'w' ? 'black' : 'white';
    endGame(winner, 'checkmate');
    return;
  }
  if (S.chess.in_stalemate())  { endGame('draw', 'stalemate');  return; }
  if (S.chess.in_threefold_repetition()) { endGame('draw', 'threefold repetition'); return; }
  if (S.chess.insufficient_material())   { endGame('draw', 'insufficient material'); return; }
  if (S.chess.in_draw())       { endGame('draw', 'fifty-move rule'); return; }

  if (S.chess.in_check()) {
    announce('CHECK!', 1200, true);
  }

  // AI response
  if (S.gameMode === 'ai' && S.chess.turn() !== S.playerColor) {
    setTimeout(aiMove, 400 + Math.random() * 300);
  }
}

/* ══════════════════════════
   AI ENGINE (Minimax + Alpha-Beta)
══════════════════════════ */
const PST = {
  p: [0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
};

function evalBoard(chess) {
  if (chess.in_checkmate()) return chess.turn() === 'w' ? -99999 : 99999;
  if (chess.in_draw())      return 0;
  let score = 0;
  chess.board().forEach((row, ri) => {
    row.forEach((sq, ci) => {
      if (!sq) return;
      const isW = sq.color === 'w';
      const idx = isW ? ri * 8 + ci : (7 - ri) * 8 + ci;
      const val = (PIECE_WT[sq.type] || 0) * 100 + ((PST[sq.type]?.[idx]) || 0);
      score += isW ? val : -val;
    });
  });
  return score;
}

function minimax(chess, depth, alpha, beta, maxing) {
  if (depth === 0 || chess.game_over()) return evalBoard(chess);
  const moves = chess.moves();
  if (maxing) {
    let best = -Infinity;
    for (const m of moves) {
      chess.move(m);
      best  = Math.max(best, minimax(chess, depth-1, alpha, beta, false));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      chess.move(m);
      best = Math.min(best, minimax(chess, depth-1, alpha, beta, true));
      chess.undo();
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getBestMove(chess, depth) {
  const isWhite = chess.turn() === 'w';
  let moves = chess.moves();
  moves.sort(() => Math.random() - .5); // shuffle for variety

  let bestMove  = moves[0];
  let bestScore = isWhite ? -Infinity : Infinity;

  for (const m of moves) {
    chess.move(m);
    const score = minimax(chess, depth-1, -Infinity, Infinity, !isWhite);
    chess.undo();
    if (isWhite ? score > bestScore : score < bestScore) {
      bestScore = score; bestMove = m;
    }
  }
  return bestMove;
}

function aiMove() {
  if (S.gameOver || S.chess.game_over()) return;
  const best = getBestMove(S.chess, S.aiDepth);
  if (!best) return;

  const move = S.chess.move(best);
  if (!move) return;

  if (move.captured) S.captureLog[move.color].push(move.captured);
  S.lastMove   = { from: move.from, to: move.to };
  S.selectedSq = null; S.legalMoves = [];

  renderBoard(); updateHealthBars(); updateMoveList(); updateStatus();

  if (S.chess.in_checkmate())  { endGame(S.chess.turn() === 'w' ? 'black' : 'white', 'checkmate'); return; }
  if (S.chess.in_stalemate())  { endGame('draw', 'stalemate'); return; }
  if (S.chess.in_threefold_repetition()) { endGame('draw', 'threefold repetition'); return; }
  if (S.chess.insufficient_material())   { endGame('draw', 'insufficient material'); return; }
  if (S.chess.in_draw())       { endGame('draw', 'fifty-move rule'); return; }
  if (S.chess.in_check())      { announce('CHECK!', 1200, true); }
}

/* ══════════════════════════
   HEALTH BARS
══════════════════════════ */
function getMaterial() {
  let w = 0, b = 0;
  S.chess.board().forEach(row => {
    row.forEach(sq => {
      if (!sq || sq.type === 'k') return;
      if (sq.color === 'w') w += (PIECE_WT[sq.type] || 0);
      else                  b += (PIECE_WT[sq.type] || 0);
    });
  });
  return { w, b };
}

function updateHealthBars() {
  const mat = getMaterial();
  const wPct = Math.max(0, Math.round(mat.w / MAX_MAT * 100));
  const bPct = Math.max(0, Math.round(mat.b / MAX_MAT * 100));

  // P1 = logged-in user: if white → use white material, if black → use black material
  const p1Pct = S.playerColor === 'w' ? wPct : bPct;
  const p2Pct = S.playerColor === 'w' ? bPct : wPct;
  const p1Mat = S.playerColor === 'w' ? mat.w : mat.b;
  const p2Mat = S.playerColor === 'w' ? mat.b : mat.w;

  setHealthBar('P1', p1Pct, p1Mat);
  setHealthBar('P2', p2Pct, p2Mat);

  // Advantage text
  const diff = mat.w - mat.b;
  let advText = 'Equal';
  if (diff > 0) {
    const wName = S.playerColor === 'w' ? S.user.username : S.opponent.username;
    advText = `+${diff} ${wName}`;
  } else if (diff < 0) {
    const bName = S.playerColor === 'b' ? S.user.username : S.opponent.username;
    advText = `+${Math.abs(diff)} ${bName}`;
  }
  $('advantageText').textContent = advText;
}

function setHealthBar(side, pct, mat) {
  const red    = $(`healthR${side}`);
  const yellow = $(`healthY${side}`);
  const nums   = $(`hudMat${side}`);

  red.style.width    = pct + '%';
  yellow.style.width = pct + '%';
  nums.textContent   = `${mat}/${MAX_MAT}`;

  red.classList.remove('warning', 'danger');
  if (pct <= 25) red.classList.add('danger');
  else if (pct <= 50) red.classList.add('warning');

  // Yellow lags behind red for that classic SF effect
  setTimeout(() => { yellow.style.width = pct + '%'; }, 300);
}

/* ══════════════════════════
   STATUS + MOVE LIST
══════════════════════════ */
function updateStatus() {
  const turn = S.chess.turn();
  const isCheck = S.chess.in_check();

  $('turnPiece').textContent = turn === 'w' ? '♔' : '♚';
  $('turnName').textContent  = turn === 'w' ? 'WHITE' : 'BLACK';
  $('statusText').textContent = isCheck ? (turn === 'w' ? '⚠ White in CHECK!' : '⚠ Black in CHECK!') :
    turn === 'w' ? 'White to move' : 'Black to move';

  updateCaptured();
}

function updateCaptured() {
  const fmt = (arr) => arr.map(p => UNICODE['w'][p]).join('') || '—';
  // captureLog[w] = pieces captured BY white (which are black pieces)
  $('capturedByWhite').innerHTML = S.captureLog.w.map(p => UNICODE.b[p]).join(' ') || '—';
  $('capturedByBlack').innerHTML = S.captureLog.b.map(p => UNICODE.w[p]).join(' ') || '—';
}

function updateMoveList() {
  const history = S.chess.history();
  const rows = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push(`<div class="move-row">
      <span class="move-num">${Math.floor(i/2)+1}.</span>
      <span class="move-w">${history[i]    || ''}</span>
      <span class="move-b">${history[i+1] || ''}</span>
    </div>`);
  }
  const list = $('moveList');
  list.innerHTML = rows.join('');
  list.scrollTop = list.scrollHeight;
}

/* ══════════════════════════
   ANNOUNCEMENTS
══════════════════════════ */
function announce(text, duration = 1500, isRed = false) {
  const overlay = $('announceOverlay');
  const textEl  = $('announceText');

  textEl.textContent = text;
  textEl.className   = 'announce-text' + (isRed ? ' red-text' : '');
  overlay.classList.add('show');

  setTimeout(() => overlay.classList.remove('show'), duration);
}

/* ══════════════════════════
   GAME OVER
══════════════════════════ */
function endGame(result, how) {
  S.gameOver   = true;
  S.gameResult = result;
  S.gameHow    = how;
  clearInterval(S.timerInterval);

  const announceMap = {
    checkmate: result === 'draw' ? 'DRAW!' : 'CHECKMATE!',
    stalemate: 'STALEMATE!',
    'threefold repetition': 'DRAW!',
    'insufficient material': 'DRAW!',
    'fifty-move rule': 'DRAW!',
    resign: result === 'draw' ? 'DRAW!' : 'RESIGN!',
  };

  announce(announceMap[how] || 'GAME OVER!', 3000, how === 'stalemate' || result === 'draw');

  // Save game to backend (only hotseat games affect ELO)
  if (S.gameMode === 'hotseat' && S.opponent?.id > 0) {
    POST('/api/games', {
      opponent_id:      S.opponent.id,
      player_color:     S.playerColor,
      result,
      pgn:              S.chess.pgn(),
      moves_count:      S.chess.history().length,
      duration_seconds: S.gameSeconds,
    }).then(async () => {
      const me = await GET('/api/auth/me');
      if (me.user) S.user = me.user;
    });
  }

  setTimeout(() => showResultScreen(), 3200);
}

function showResultScreen() {
  showScreen('screen-result');

  const result    = S.gameResult;
  const isDraw    = result === 'draw';
  let winnerName  = isDraw ? 'DRAW' : result === 'white' ? 'WHITE' : 'BLACK';
  let winnerPlayer = null;

  if (!isDraw) {
    const isUserColor = (result === 'white' && S.playerColor === 'w') ||
                        (result === 'black' && S.playerColor === 'b');
    winnerPlayer = isUserColor ? S.user : S.opponent;
    winnerName   = winnerPlayer?.username?.toUpperCase() || winnerName;
  }

  // Trophy avatar
  const trophyEl = $('resultTrophy');
  if (winnerPlayer?.avatar_path) {
    trophyEl.innerHTML = `<img src="${winnerPlayer.avatar_path}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`;
  } else {
    trophyEl.textContent = isDraw ? '🤝' : '🏆';
  }

  $('resultCaption').textContent = isDraw ? 'DRAW' : 'WINNER';
  $('resultName').textContent    = winnerName;
  $('resultHow').textContent     = `by ${S.gameHow}`;

  const moves = S.chess.history().length;
  $('resultStats').innerHTML = [
    ['TOTAL MOVES', moves],
    ['GAME TIME',   fmtTime(S.gameSeconds)],
    ['WHITE CAPS',  S.captureLog.w.length],
    ['BLACK CAPS',  S.captureLog.b.length],
  ].map(([l, v]) => `
    <div class="result-stat-card">
      <div class="result-stat-lbl">${l}</div>
      <div class="result-stat-val">${v}</div>
    </div>`).join('');
}

/* ══════════════════════════
   GAME CONTROLS
══════════════════════════ */
$('resignBtn').addEventListener('click', () => {
  if (S.gameOver) return;
  if (!confirm('Resign the game?')) return;
  const winner = S.chess.turn() === 'w' ? 'black' : 'white';
  endGame(winner, 'resign');
});

$('drawBtn').addEventListener('click', () => {
  if (S.gameOver) return;
  if (!confirm('Offer / accept draw?')) return;
  endGame('draw', 'resign');
});

$('flipBtn').addEventListener('click', () => {
  S.boardFlipped = !S.boardFlipped;
  S.selectedSq   = null; S.legalMoves = [];
  renderBoard();
});

$('rematchBtn').addEventListener('click', () => {
  // Swap colors for rematch
  S.playerColor  = S.playerColor === 'w' ? 'b' : 'w';
  S.round++;
  startVsScreen();
});

$('returnBtn').addEventListener('click', () => enterLobby());

/* ══════════════════════════
   INIT
══════════════════════════ */
async function init() {
  setupAuth();
  const res = await GET('/api/auth/me');
  if (res.user) {
    S.user = res.user;
    enterLobby();
  } else {
    showScreen('screen-auth');
  }
}

init();
