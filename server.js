const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-super-secret-jwt-key-change-in-production'; // Change this!

// Middleware
app.use(helmet());
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 1000 requests per windowMs
});
app.use(limiter);

// Database
const dbPath = path.join(__dirname, 'travel.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    package_name TEXT NOT NULL,
    duration TEXT,
    price REAL NOT NULL,
    guests TEXT,
    status TEXT DEFAULT 'confirmed',
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);
});

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Register
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', 
    [username, email, hashedPassword], 
    function(err) {
      if (err) {
        return res.status(400).json({ error: 'User already exists' });
      }
      res.json({ message: 'User registered successfully' });
    }
  );
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  });
});

// Profile
app.get('/api/profile', authenticateToken, (req, res) => {
  db.get('SELECT id, username, email FROM users WHERE id = ?', [req.user.id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(row);
  });
});

// Logout
app.post('/api/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// Get bookings
app.get('/api/bookings', authenticateToken, (req, res) => {
  db.all('SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Create booking
app.post('/api/bookings', authenticateToken, (req, res) => {
  const { package_name, duration, price, guests, details } = req.body;
  db.run('INSERT INTO bookings (user_id, package_name, duration, price, guests, details) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, package_name, duration, price, guests, details],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create booking' });
      }
      res.json({ id: this.lastID, message: 'Booking created' });
    }
  );
});

// Update booking
app.put('/api/bookings/:id', authenticateToken, (req, res) => {
  const { package_name, duration, price, status } = req.body;
  db.run('UPDATE bookings SET package_name = ?, duration = ?, price = ?, status = ? WHERE id = ? AND user_id = ?',
    [package_name, duration, price, status || 'confirmed', req.params.id, req.user.id],
    function(err) {
      if (err || this.changes === 0) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      res.json({ message: 'Booking updated' });
    }
  );
});

// Delete/Cancel booking
app.delete('/api/bookings/:id', authenticateToken, (req, res) => {
  db.run('UPDATE bookings SET status = "cancelled" WHERE id = ? AND user_id = ?', [req.params.id, req.user.id],
    function(err) {
      if (err || this.changes === 0) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      res.json({ message: 'Booking cancelled' });
    }
  );
});

// Serve static files
app.use(express.static(path.join(__dirname, '.')));

// Catch-all handler for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});



app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});