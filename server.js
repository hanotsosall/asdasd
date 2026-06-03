const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const http = require('http');
const multer = require('multer');
const cheerio = require('cheerio');
const axios = require('axios');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'steamfall_super_secret_2025';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('tiny'));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// ========== ДИРЕКТОРИИ ==========
const DATA_DIR = path.join(__dirname, 'data');
const TORRENTS_DIR = path.join(__dirname, 'torrents');
const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(TORRENTS_DIR)) fs.mkdirSync(TORRENTS_DIR);
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR);

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const ADS_FILE = path.join(DATA_DIR, 'ads.json');
const DOWNLOADS_FILE = path.join(DATA_DIR, 'downloads.json');
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json');

function readJSON(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return []; }
}
function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Инициализация данных
const adminHash = bcrypt.hashSync('admin123', 10);
if (!fs.existsSync(USERS_FILE)) {
    writeJSON(USERS_FILE, [{ id: 1, username: 'admin', password: adminHash, role: 'admin', email: 'admin@steamfall.com', avatar: 'https://i.pravatar.cc/150', createdAt: new Date().toISOString(), lastSeen: new Date().toISOString(), banned: false }]);
}
if (!fs.existsSync(GAMES_FILE)) {
    writeJSON(GAMES_FILE, [
        { id: 1, title: "Cyberpunk 2077", genre: "RPG", description: "Киберпанк будущего", size: "68 GB", magnet: "magnet:?xt=urn:btih:DEMO1", seeders: 1245, leechers: 342, rating: 4.2, releaseDate: "2020-12-10", developer: "CD Projekt Red", screenshots: ["https://picsum.photos/id/1/800/450"], downloads: 15800, addedAt: new Date().toISOString() },
        { id: 2, title: "The Witcher 3", genre: "RPG", description: "Легендарная RPG", size: "50 GB", magnet: "magnet:?xt=urn:btih:DEMO2", seeders: 2890, leechers: 567, rating: 4.9, releaseDate: "2015-05-19", developer: "CD Projekt Red", screenshots: ["https://picsum.photos/id/2/800/450"], downloads: 42000, addedAt: new Date().toISOString() }
    ]);
}
if (!fs.existsSync(REVIEWS_FILE)) writeJSON(REVIEWS_FILE, []);
if (!fs.existsSync(COMMENTS_FILE)) writeJSON(COMMENTS_FILE, []);
if (!fs.existsSync(ADS_FILE)) {
    writeJSON(ADS_FILE, [
        { id: 1, position: "header", code: '<div class="ad-banner">🔥 Premium доступ</div>', active: true },
        { id: 2, position: "sidebar", code: '<div class="ad-banner">📢 Реклама</div>', active: true }
    ]);
}
if (!fs.existsSync(DOWNLOADS_FILE)) writeJSON(DOWNLOADS_FILE, []);
if (!fs.existsSync(FAVORITES_FILE)) writeJSON(FAVORITES_FILE, []);

// ========== MIDDLEWARE ==========
function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Нет токена' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch(e) { res.status(401).json({ error: 'Неверный токен' }); }
}
function adminOnly(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Доступ только админу' });
    next();
}

// ========== AUTH ==========
app.post('/api/register', async (req, res) => {
    const { username, password, email } = req.body;
    const users = readJSON(USERS_FILE);
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Логин занят' });
    const hashed = bcrypt.hashSync(password, 10);
    const newUser = { id: Date.now(), username, password: hashed, email, role: 'user', avatar: 'https://i.pravatar.cc/150', createdAt: new Date().toISOString(), lastSeen: new Date().toISOString(), banned: false };
    users.push(newUser);
    writeJSON(USERS_FILE, users);
    const token = jwt.sign({ id: newUser.id, username: newUser.username, role: newUser.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: newUser.id, username: newUser.username, role: newUser.role, avatar: newUser.avatar } });
});
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Неверные данные' });
    if (user.banned) return res.status(403).json({ error: 'Аккаунт заблокирован' });
    user.lastSeen = new Date().toISOString();
    writeJSON(USERS_FILE, users);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, avatar: user.avatar } });
});
app.get('/api/me', auth, (req, res) => {
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'Не найден' });
    res.json({ id: user.id, username: user.username, email: user.email, role: user.role, avatar: user.avatar, createdAt: user.createdAt });
});

// ========== ИГРЫ ==========
app.get('/api/games', (req, res) => {
    let games = readJSON(GAMES_FILE);
    const { search, genre, sort, page = 1, limit = 12 } = req.query;
    if (search) games = games.filter(g => g.title.toLowerCase().includes(search.toLowerCase()));
    if (genre && genre !== 'all') games = games.filter(g => g.genre === genre);
    if (sort === 'date') games.sort((a,b) => new Date(b.addedAt) - new Date(a.addedAt));
    if (sort === 'downloads') games.sort((a,b) => b.downloads - a.downloads);
    const start = (page-1)*limit;
    const paginated = games.slice(start, start+limit);
    res.json({ games: paginated, total: games.length, page: +page, totalPages: Math.ceil(games.length/limit) });
});
app.get('/api/games/:id', (req, res) => {
    let games = readJSON(GAMES_FILE);
    const game = games.find(g => g.id == req.params.id);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });
    res.json(game);
});
app.post('/api/games', auth, adminOnly, (req, res) => {
    const games = readJSON(GAMES_FILE);
    const newGame = { ...req.body, id: Date.now(), rating: 0, downloads: 0, addedAt: new Date().toISOString(), seeders: 0, leechers: 0 };
    games.push(newGame);
    writeJSON(GAMES_FILE, games);
    res.json(newGame);
});
app.delete('/api/games/:id', auth, adminOnly, (req, res) => {
    let games = readJSON(GAMES_FILE);
    games = games.filter(g => g.id != req.params.id);
    writeJSON(GAMES_FILE, games);
    res.json({ success: true });
});

// ========== ОТЗЫВЫ ==========
app.get('/api/reviews/:gameId', (req, res) => {
    const reviews = readJSON(REVIEWS_FILE);
    res.json(reviews.filter(r => r.gameId == req.params.gameId));
});
app.post('/api/reviews', auth, (req, res) => {
    const { gameId, text, rating } = req.body;
    const reviews = readJSON(REVIEWS_FILE);
    const newReview = { id: Date.now(), gameId, userId: req.user.id, author: req.user.username, text, rating, likes: 0, createdAt: new Date().toISOString() };
    reviews.push(newReview);
    writeJSON(REVIEWS_FILE, reviews);
    res.json(newReview);
});
app.post('/api/reviews/:id/like', auth, (req, res) => {
    let reviews = readJSON(REVIEWS_FILE);
    const rev = reviews.find(r => r.id == req.params.id);
    if (rev) { rev.likes += 1; writeJSON(REVIEWS_FILE, reviews); res.json({ likes: rev.likes }); }
    else res.status(404).json({ error: 'Not found' });
});
app.get('/api/comments/:reviewId', (req, res) => {
    const comments = readJSON(COMMENTS_FILE);
    res.json(comments.filter(c => c.reviewId == req.params.reviewId));
});
app.post('/api/comments', auth, (req, res) => {
    const { reviewId, text } = req.body;
    const comments = readJSON(COMMENTS_FILE);
    const newComment = { id: Date.now(), reviewId, userId: req.user.id, author: req.user.username, text, createdAt: new Date().toISOString() };
    comments.push(newComment);
    writeJSON(COMMENTS_FILE, comments);
    res.json(newComment);
});

// ========== ИЗБРАННОЕ ==========
app.get('/api/favorites', auth, (req, res) => {
    let favs = readJSON(FAVORITES_FILE);
    favs = favs.filter(f => f.userId === req.user.id);
    res.json(favs);
});
app.post('/api/favorites', auth, (req, res) => {
    const { gameId } = req.body;
    let favs = readJSON(FAVORITES_FILE);
    if (!favs.find(f => f.userId === req.user.id && f.gameId == gameId)) {
        favs.push({ userId: req.user.id, gameId, addedAt: new Date().toISOString() });
        writeJSON(FAVORITES_FILE, favs);
    }
    res.json({ success: true });
});
app.delete('/api/favorites/:gameId', auth, (req, res) => {
    let favs = readJSON(FAVORITES_FILE);
    favs = favs.filter(f => !(f.userId === req.user.id && f.gameId == req.params.gameId));
    writeJSON(FAVORITES_FILE, favs);
    res.json({ success: true });
});

// ========== АДМИНКА ==========
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
    const users = readJSON(USERS_FILE);
    res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role, banned: u.banned, lastSeen: u.lastSeen })));
});
app.post('/api/admin/users/:id/ban', auth, adminOnly, (req, res) => {
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id == req.params.id);
    if (user) { user.banned = true; writeJSON(USERS_FILE, users); res.json({ success: true }); }
    else res.status(404).json({ error: 'Не найден' });
});
app.post('/api/admin/users/:id/unban', auth, adminOnly, (req, res) => {
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id == req.params.id);
    if (user) { user.banned = false; writeJSON(USERS_FILE, users); res.json({ success: true }); }
    else res.status(404).json({ error: 'Не найден' });
});

// ========== ИМПОРТ ==========
app.post('/api/import', auth, adminOnly, async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL не указан' });
    try {
        const { data } = await axios.get(url, { timeout: 5000 });
        const $ = cheerio.load(data);
        const title = $('title').text().trim() || 'Imported Game';
        res.json({ title, genre: 'Action', description: 'Imported', size: 'N/A', magnet: 'magnet:?xt=urn:btih:import', developer: 'Unknown', releaseDate: new Date().toISOString().split('T')[0], screenshots: ['https://picsum.photos/id/100/800/450'], tags: [] });
    } catch(e) { res.status(500).json({ error: 'Ошибка импорта' }); }
});

// ========== РЕКЛАМА ==========
app.get('/api/ads', (req, res) => {
    const ads = readJSON(ADS_FILE);
    res.json(ads.filter(a => a.active));
});
app.post('/api/ads', auth, adminOnly, (req, res) => {
    writeJSON(ADS_FILE, req.body);
    res.json({ success: true });
});

// ========== ЛОГИ ==========
app.get('/api/logs', auth, adminOnly, (req, res) => {
    const logFile = path.join(LOGS_DIR, 'server.log');
    if (fs.existsSync(logFile)) {
        const logs = fs.readFileSync(logFile, 'utf8');
        res.json({ logs: logs.split('\n').slice(-200) });
    } else res.json({ logs: [] });
});

// ========== СТАТИСТИКА ==========
app.get('/api/stats', (req, res) => {
    const games = readJSON(GAMES_FILE);
    const users = readJSON(USERS_FILE);
    const totalDownloads = games.reduce((s,g) => s + (g.downloads||0), 0);
    const totalSeeders = games.reduce((s,g) => s + g.seeders, 0);
    res.json({ totalGames: games.length, totalUsers: users.length, totalDownloads, totalSeeders });
});

// ========== ПИРЫ ==========
app.post('/api/update-peers', (req, res) => {
    let games = readJSON(GAMES_FILE);
    games = games.map(g => ({ ...g, seeders: Math.max(0, g.seeders + Math.floor(Math.random()*40)-20), leechers: Math.max(0, g.leechers + Math.floor(Math.random()*30)-15) }));
    writeJSON(GAMES_FILE, games);
    io.emit('peers-updated', games.map(g => ({ id: g.id, seeders: g.seeders, leechers: g.leechers })));
    res.json({ success: true });
});

io.on('connection', (socket) => {
    socket.on('join-game', (gameId) => socket.join(`game_${gameId}`));
    socket.on('chat-message', (data) => io.to(`game_${data.gameId}`).emit('chat-message', { author: data.author, text: data.text, timestamp: new Date().toISOString() }));
});

// ========== ЗАГРУЗКА ТОРРЕНТА ==========
const upload = multer({ dest: TORRENTS_DIR });
app.post('/api/upload-torrent', auth, adminOnly, upload.single('torrent'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Нет файла' });
    res.json({ filename: req.file.filename });
});

server.listen(PORT, () => {
    console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
    console.log(`🔐 Админка: http://localhost:${PORT}/admin.html (логин admin, пароль admin123)`);
});
