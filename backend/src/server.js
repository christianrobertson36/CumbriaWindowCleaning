import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 5055);
const jwtSecret = process.env.JWT_SECRET || 'change-this-secret';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cumbria:change-db-password@localhost:5432/cumbria_window_cleaning'
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      postcode TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      access_notes TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      clean_price NUMERIC(10,2) NOT NULL DEFAULT 0,
      frequency TEXT NOT NULL DEFAULT 'Monthly',
      amount_owed NUMERIC(10,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      job_date DATE NOT NULL DEFAULT CURRENT_DATE,
      price NUMERIC(10,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Planned',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      postcode TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      property_type TEXT NOT NULL DEFAULT '',
      frequency TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'New',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function tokenFor(email) {
  return jwt.sign({ email, role: 'admin' }, jwtSecret, { expiresIn: '12h' });
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'Not authorised' });
  }
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, app: 'Cumbria Window Cleaning API', version: 'v1' });
});

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    return res.json({ ok: true, token: tokenFor(email), email });
  }
  res.status(401).json({ ok: false, error: 'Invalid login' });
});

app.post('/leads', async (req, res) => {
  const lead = req.body || {};
  if (!lead.name || !lead.phone) return res.status(400).json({ ok: false, error: 'Name and phone are required' });
  const result = await pool.query(
    `INSERT INTO leads (name,address,postcode,email,phone,property_type,frequency,message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [lead.name, lead.address || '', lead.postcode || '', lead.email || '', lead.phone || '', lead.property_type || '', lead.frequency || '', lead.message || '']
  );
  res.status(201).json({ ok: true, lead: result.rows[0] });
});

app.get('/admin/summary', auth, async (_req, res) => {
  const [customers, jobsToday, owed, leads] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM customers WHERE status='Active'`),
    pool.query(`SELECT COUNT(*)::int AS count FROM jobs WHERE job_date = CURRENT_DATE AND status <> 'Cancelled'`),
    pool.query(`SELECT COALESCE(SUM(amount_owed),0)::float AS total FROM customers`),
    pool.query(`SELECT COUNT(*)::int AS count FROM leads WHERE status='New'`)
  ]);
  res.json({
    ok: true,
    summary: {
      active_customers: customers.rows[0].count,
      jobs_today: jobsToday.rows[0].count,
      amount_owed: owed.rows[0].total,
      new_leads: leads.rows[0].count
    }
  });
});

app.get('/admin/customers', auth, async (_req, res) => {
  const result = await pool.query('SELECT * FROM customers ORDER BY name ASC');
  res.json({ ok: true, customers: result.rows });
});

app.post('/admin/customers', auth, async (req, res) => {
  const c = req.body || {};
  const result = await pool.query(
    `INSERT INTO customers (name,address,postcode,email,phone,access_notes,notes,clean_price,frequency,amount_owed,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [c.name, c.address || '', c.postcode || '', c.email || '', c.phone || '', c.access_notes || '', c.notes || '', money(c.clean_price), c.frequency || 'Monthly', money(c.amount_owed), c.status || 'Active']
  );
  res.status(201).json({ ok: true, customer: result.rows[0] });
});

app.patch('/admin/customers/:id', auth, async (req, res) => {
  const c = req.body || {};
  const result = await pool.query(
    `UPDATE customers SET name=$1,address=$2,postcode=$3,email=$4,phone=$5,access_notes=$6,notes=$7,clean_price=$8,frequency=$9,amount_owed=$10,status=$11,updated_at=now()
     WHERE id=$12 RETURNING *`,
    [c.name, c.address || '', c.postcode || '', c.email || '', c.phone || '', c.access_notes || '', c.notes || '', money(c.clean_price), c.frequency || 'Monthly', money(c.amount_owed), c.status || 'Active', req.params.id]
  );
  res.json({ ok: true, customer: result.rows[0] });
});

app.get('/admin/jobs', auth, async (_req, res) => {
  const result = await pool.query('SELECT * FROM jobs ORDER BY job_date ASC, id ASC');
  res.json({ ok: true, jobs: result.rows });
});

app.post('/admin/jobs', auth, async (req, res) => {
  const j = req.body || {};
  let customerName = j.customer_name || '';
  let address = j.address || '';
  let price = money(j.price);
  if (j.customer_id) {
    const c = await pool.query('SELECT name,address,clean_price FROM customers WHERE id=$1', [j.customer_id]);
    if (c.rows[0]) {
      customerName = customerName || c.rows[0].name;
      address = address || c.rows[0].address;
      price = price || money(c.rows[0].clean_price);
    }
  }
  const result = await pool.query(
    `INSERT INTO jobs (customer_id,customer_name,address,job_date,price,status,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [j.customer_id || null, customerName, address, j.job_date || new Date().toISOString().slice(0, 10), price, j.status || 'Planned', j.notes || '']
  );
  res.status(201).json({ ok: true, job: result.rows[0] });
});

app.patch('/admin/jobs/:id', auth, async (req, res) => {
  const j = req.body || {};
  const result = await pool.query(
    `UPDATE jobs SET customer_name=$1,address=$2,job_date=$3,price=$4,status=$5,notes=$6,updated_at=now()
     WHERE id=$7 RETURNING *`,
    [j.customer_name || '', j.address || '', j.job_date, money(j.price), j.status || 'Planned', j.notes || '', req.params.id]
  );
  res.json({ ok: true, job: result.rows[0] });
});

app.get('/admin/leads', auth, async (_req, res) => {
  const result = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
  res.json({ ok: true, leads: result.rows });
});

app.patch('/admin/leads/:id', auth, async (req, res) => {
  const result = await pool.query('UPDATE leads SET status=$1, updated_at=now() WHERE id=$2 RETURNING *', [req.body.status || 'New', req.params.id]);
  res.json({ ok: true, lead: result.rows[0] });
});

initDb().then(() => {
  app.listen(port, () => console.log(`Cumbria Window Cleaning API v1 listening on ${port}`));
}).catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});
