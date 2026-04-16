const express       = require('express');
const session       = require('express-session');
const bcrypt        = require('bcryptjs');
const multer        = require('multer');
const Database      = require('better-sqlite3');
const path          = require('path');
const fs            = require('fs');

const app  = express();
const PORT = 3001;

/* ── Directory setup ── */
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/* ── Database ── */
const db = new Database(path.join(__dirname, 'chess.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    avatar_path   TEXT    DEFAULT NULL,
    elo           INTEGER DEFAULT 1200,
    wins          INTEGER DEFAULT 0,
    losses        INTEGER DEFAULT 0,
    draws         INTEGER DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS games (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    white_id         INTEGER NOT NULL,
    black_id         INTEGER NOT NULL,
    winner_id        INTEGER DEFAULT NULL,
    result           TEXT    NOT NULL,
    pgn              TEXT    DEFAULT '',
    moves_count      INTEGER DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (white_id) REFERENCES users(id),
    FOREIGN KEY (black_id) REFERENCES users(id)
  );
`);

/* ── Multer ── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar_${req.session.userId}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/jpeg|jpg|png|gif|webp/.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed'));
    }
  }
});

/* ── Middleware ── */
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(session({
  secret:            'chess-fighter-2024-x9k',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
};

/* ══════════════════════════════════
   AUTH
══════════════════════════════════ */
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)           return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username must be 3–20 characters' });
  if (password.length < 6)              return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    req.session.userId = result.lastInsertRowid;
    const user = db.prepare('SELECT id, username, avatar_path, elo, wins, losses, draws FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ user });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already taken' });
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.userId = user.id;
  res.json({ user: { id: user.id, username: user.username, avatar_path: user.avatar_path, elo: user.elo, wins: user.wins, losses: user.losses, draws: user.draws } });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = db.prepare('SELECT id, username, avatar_path, elo, wins, losses, draws FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ user });
});

/* ══════════════════════════════════
   USERS
══════════════════════════════════ */
app.get('/api/users', requireAuth, (req, res) => {
  const users = db.prepare(
    'SELECT id, username, avatar_path, elo, wins, losses, draws FROM users WHERE id != ? ORDER BY elo DESC'
  ).all(req.session.userId);
  res.json({ users });
});

app.post('/api/users/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const avatarPath = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(avatarPath, req.session.userId);
  res.json({ avatar_path: avatarPath });
});

/* ══════════════════════════════════
   GAMES
══════════════════════════════════ */
app.post('/api/games', requireAuth, (req, res) => {
  const { opponent_id, player_color, result, pgn, moves_count, duration_seconds } = req.body;
  const userId = req.session.userId;

  // Determine white/black ids based on player_color
  const whiteId = player_color === 'w' ? userId    : opponent_id;
  const blackId = player_color === 'w' ? opponent_id : userId;

  // Determine winner
  let winnerId = null;
  if      (result === 'white')    winnerId = whiteId;
  else if (result === 'black')    winnerId = blackId;
  // draw/stalemate → null

  // ELO calculation
  const userRow = db.prepare('SELECT elo FROM users WHERE id = ?').get(userId);
  const oppRow  = db.prepare('SELECT elo FROM users WHERE id = ?').get(opponent_id);
  if (userRow && oppRow) {
    const K        = 32;
    const expected = 1 / (1 + Math.pow(10, (oppRow.elo - userRow.elo) / 400));
    const score    = winnerId === userId ? 1 : winnerId === opponent_id ? 0 : 0.5;
    const newUserElo = Math.max(100, Math.round(userRow.elo + K * (score - expected)));
    const newOppElo  = Math.max(100, Math.round(oppRow.elo  + K * ((1 - score) - (1 - expected))));
    db.prepare('UPDATE users SET elo = ? WHERE id = ?').run(newUserElo, userId);
    db.prepare('UPDATE users SET elo = ? WHERE id = ?').run(newOppElo,  opponent_id);
  }

  // Update win/loss/draw
  if      (winnerId === userId)      { db.prepare('UPDATE users SET wins   = wins   + 1 WHERE id = ?').run(userId);      db.prepare('UPDATE users SET losses = losses + 1 WHERE id = ?').run(opponent_id); }
  else if (winnerId === opponent_id) { db.prepare('UPDATE users SET losses = losses + 1 WHERE id = ?').run(userId);      db.prepare('UPDATE users SET wins   = wins   + 1 WHERE id = ?').run(opponent_id); }
  else                               { db.prepare('UPDATE users SET draws  = draws  + 1 WHERE id = ?').run(userId);      db.prepare('UPDATE users SET draws  = draws  + 1 WHERE id = ?').run(opponent_id); }

  const gameRow = db.prepare(
    'INSERT INTO games (white_id, black_id, winner_id, result, pgn, moves_count, duration_seconds) VALUES (?,?,?,?,?,?,?)'
  ).run(whiteId, blackId, winnerId, result, pgn || '', moves_count || 0, duration_seconds || 0);

  res.json({ game_id: gameRow.lastInsertRowid });
});

/* ══════════════════════════════════
   LEADERBOARD
══════════════════════════════════ */
app.get('/api/leaderboard', (req, res) => {
  const rows = db.prepare(`
    SELECT
      u.id, u.username, u.avatar_path, u.elo,
      u.wins, u.losses, u.draws,
      (u.wins + u.losses + u.draws) AS total_games,
      CASE WHEN (u.wins + u.losses + u.draws) > 0
           THEN ROUND(u.wins * 100.0 / (u.wins + u.losses + u.draws), 1)
           ELSE 0 END AS win_pct,
      COALESCE(
        (SELECT ROUND(AVG(g.moves_count),0) FROM games g
         WHERE g.white_id = u.id OR g.black_id = u.id), 0
      ) AS avg_moves
    FROM users u
    ORDER BY u.elo DESC
    LIMIT 50
  `).all();
  res.json({ leaderboard: rows });
});

app.get('/api/games/history/:userId', requireAuth, (req, res) => {
  const games = db.prepare(`
    SELECT g.*,
           w.username AS white_name, w.avatar_path AS white_avatar,
           b.username AS black_name, b.avatar_path AS black_avatar
    FROM games g
    JOIN users w ON g.white_id = w.id
    JOIN users b ON g.black_id = b.id
    WHERE g.white_id = ? OR g.black_id = ?
    ORDER BY g.created_at DESC LIMIT 20
  `).all(req.params.userId, req.params.userId);
  res.json({ games });
});

/* ── Start ── */
app.listen(PORT, () => {
  console.log(`\n♟  CHESS FIGHTER running at http://localhost:${PORT}\n`);
});
