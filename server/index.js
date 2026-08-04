import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool, initSchema } from './db.js';
import { signToken, requireAuth, hashPassword, comparePassword, verifyGoogleToken } from './auth.js';
import { generateSolution } from './diagnose.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(new URL('./public', import.meta.url).pathname));

// ---------- Auth routes ----------

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'An account with this email already exists.' });

    const hash = await hashPassword(password);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, is_premium',
      [email, hash, name || null]
    );
    const user = result.rows[0];
    res.json({ token: signToken(user), user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid email or password.' });

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    res.json({ token: signToken(user), user: { id: user.id, email: user.email, name: user.name, is_premium: user.is_premium } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    const payload = await verifyGoogleToken(idToken);

    let result = await pool.query('SELECT * FROM users WHERE google_id = $1 OR email = $2', [payload.sub, payload.email]);
    let user = result.rows[0];

    if (!user) {
      const insert = await pool.query(
        'INSERT INTO users (email, google_id, name) VALUES ($1, $2, $3) RETURNING *',
        [payload.email, payload.sub, payload.name]
      );
      user = insert.rows[0];
    }

    res.json({ token: signToken(user), user: { id: user.id, email: user.email, name: user.name, is_premium: user.is_premium } });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Google sign-in failed.' });
  }
});

// ---------- Diagnosis routes ----------

const FREE_TIER_LIMIT = 5; // saved problems per month for free users

app.post('/api/diagnose', requireAuth, async (req, res) => {
  try {
    const { description } = req.body;
    if (!description || description.trim().length < 5) {
      return res.status(400).json({ error: 'Please describe your problem in a bit more detail.' });
    }

    const solution = await generateSolution(description);
    res.json({ solution });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not generate a solution right now. Please try again.' });
  }
});

app.post('/api/problems', requireAuth, async (req, res) => {
  try {
    const { title, description, solution, device_type } = req.body;

    const userResult = await pool.query('SELECT is_premium FROM users WHERE id = $1', [req.user.id]);
    const isPremium = userResult.rows[0]?.is_premium;

    if (!isPremium) {
      const countResult = await pool.query(
        "SELECT COUNT(*) FROM problems WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'",
        [req.user.id]
      );
      if (parseInt(countResult.rows[0].count) >= FREE_TIER_LIMIT) {
        return res.status(403).json({ error: `Free plan allows saving ${FREE_TIER_LIMIT} problems per month. Upgrade to Premium for unlimited saves.`, upgrade_required: true });
      }
    }

    const result = await pool.query(
      'INSERT INTO problems (user_id, title, description, solution, device_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, title, description, JSON.stringify(solution), device_type]
    );
    res.json({ problem: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save this problem.' });
  }
});

app.get('/api/problems', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM problems WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ problems: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load saved problems.' });
  }
});

app.patch('/api/problems/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body; // 'resolved' | 'unresolved'
    const result = await pool.query(
      'UPDATE problems SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [status, req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Problem not found.' });
    res.json({ problem: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update status.' });
  }
});

app.delete('/api/problems/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM problems WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete this problem.' });
  }
});

// ---------- Premium (stub — real payment provider plugs in here) ----------

app.post('/api/upgrade', requireAuth, async (req, res) => {
  // STUB: no real payment processing wired up yet.
  // When Paddle/JazzCash is connected, verify payment here before setting is_premium = true.
  res.status(501).json({ error: 'Payments are not connected yet. This button will work once a payment provider is set up.' });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT id, email, name, is_premium FROM users WHERE id = $1', [req.user.id]);
  res.json({ user: result.rows[0] });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Serve the SPA for any non-API route
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(new URL('./public/index.html', import.meta.url).pathname);
});

const PORT = process.env.PORT || 3001;

initSchema()
  .then(() => app.listen(PORT, () => console.log(`QuickFixr server running on port ${PORT}`)))
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
