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

    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL,
      method TEXT NOT NULL DEFAULT 'Bank transfer',
      notes TEXT NOT NULL DEFAULT '',
      paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE customers ADD COLUMN IF NOT EXISTS next_clean_date DATE;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT '';
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS charged_at TIMESTAMPTZ;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_date DATE;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS quoted_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS service TEXT NOT NULL DEFAULT 'Window cleaning';
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

function cleanText(value) {
  return String(value || '').trim();
}

function frequencyDays(value) {
  const frequency = cleanText(value).toLowerCase();
  if (frequency.includes('fortnight')) return 14;
  if (frequency.includes('6 week')) return 42;
  if (frequency.includes('8 week')) return 56;
  if (frequency.includes('week')) return 7;
  if (frequency.includes('month')) return 28;
  return 0;
}

async function notificationSettings() {
  const result = await pool.query(`SELECT setting_key,setting_value FROM app_settings WHERE setting_key LIKE 'notification_%'`);
  return Object.fromEntries(result.rows.map(row => [row.setting_key, row.setting_value]));
}

async function publishNotification({ title, message }) {
  const settings = await notificationSettings();
  if (settings.notification_enabled !== 'true' || !settings.notification_topic) return { sent: false, reason: 'disabled' };
  const serverUrl = cleanText(settings.notification_server_url || 'https://ntfy.sh').replace(/\/+$/, '');
  const parsed = new URL(serverUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Notification server must use HTTP or HTTPS');
  const headers = { 'Content-Type': 'application/json' };
  if (settings.notification_access_token) headers.Authorization = `Bearer ${settings.notification_access_token}`;
  const response = await fetch(serverUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ topic: settings.notification_topic, title, message, priority: 4, tags: ['new', 'broom'] }),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`Notification service returned ${response.status}`);
  return { sent: true };
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
    `INSERT INTO leads (name,address,postcode,email,phone,property_type,frequency,message,service)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [lead.name, lead.address || '', lead.postcode || '', lead.email || '', lead.phone || '', lead.property_type || '', lead.frequency || '', lead.message || '', lead.service || 'Window cleaning']
  );
  res.status(201).json({ ok: true, lead: result.rows[0] });
  const savedLead = result.rows[0];
  publishNotification({
    title: `New quote request: ${savedLead.name}`,
    message: `${savedLead.service || 'Cleaning enquiry'} · ${savedLead.phone}${savedLead.postcode ? ` · ${savedLead.postcode}` : ''}`
  }).catch(error => console.error('Lead notification failed:', error.message));
});

app.get('/admin/settings/notifications', auth, async (_req, res) => {
  const settings = await notificationSettings();
  res.json({
    ok: true,
    settings: {
      enabled: settings.notification_enabled === 'true',
      server_url: settings.notification_server_url || 'https://ntfy.sh',
      topic: settings.notification_topic || '',
      token_configured: Boolean(settings.notification_access_token)
    }
  });
});

app.put('/admin/settings/notifications', auth, async (req, res) => {
  const input = req.body || {};
  const serverUrl = cleanText(input.server_url || 'https://ntfy.sh').replace(/\/+$/, '');
  const topic = cleanText(input.topic);
  let parsed;
  try { parsed = new URL(serverUrl); } catch { return res.status(400).json({ ok: false, error: 'Enter a valid notification server URL' }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ ok: false, error: 'Notification server must use HTTP or HTTPS' });
  if (topic && !/^[a-zA-Z0-9_-]{3,128}$/.test(topic)) return res.status(400).json({ ok: false, error: 'Topic must be 3–128 letters, numbers, hyphens or underscores' });
  const values = {
    notification_enabled: input.enabled ? 'true' : 'false',
    notification_server_url: serverUrl,
    notification_topic: topic
  };
  if (cleanText(input.access_token)) values.notification_access_token = cleanText(input.access_token);
  if (input.clear_token) values.notification_access_token = '';
  for (const [key, value] of Object.entries(values)) {
    await pool.query(`INSERT INTO app_settings (setting_key,setting_value) VALUES ($1,$2) ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=now()`, [key, value]);
  }
  res.json({ ok: true, message: 'Notification settings saved' });
});

app.post('/admin/settings/notifications/test', auth, async (_req, res) => {
  try {
    const result = await publishNotification({ title: 'Cumbria Window Cleaning', message: 'Test notification received successfully.' });
    if (!result.sent) return res.status(400).json({ ok: false, error: 'Enable notifications and save a topic first' });
    res.json({ ok: true, message: 'Test notification sent' });
  } catch (error) { res.status(502).json({ ok: false, error: error.message }); }
});

app.get('/admin/summary', auth, async (_req, res) => {
  const [customers, jobsToday, owed, leads, revenue, followUps] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM customers WHERE status='Active'`),
    pool.query(`SELECT COUNT(*)::int AS count FROM jobs WHERE job_date = CURRENT_DATE AND status <> 'Cancelled'`),
    pool.query(`SELECT COALESCE(SUM(amount_owed),0)::float AS total FROM customers`),
    pool.query(`SELECT COUNT(*)::int AS count FROM leads WHERE status='New'`),
    pool.query(`SELECT COALESCE(SUM(amount),0)::float AS total FROM payments WHERE paid_at >= date_trunc('month', CURRENT_DATE)::date`),
    pool.query(`SELECT COUNT(*)::int AS count FROM leads WHERE follow_up_date <= CURRENT_DATE AND status NOT IN ('Won','Lost / Not interested','Existing customer')`)
  ]);
  res.json({
    ok: true,
    summary: {
      active_customers: customers.rows[0].count,
      jobs_today: jobsToday.rows[0].count,
      amount_owed: owed.rows[0].total,
      new_leads: leads.rows[0].count,
      revenue_this_month: revenue.rows[0].total,
      follow_ups_due: followUps.rows[0].count
    }
  });
});

app.get('/admin/customers', auth, async (_req, res) => {
  const result = await pool.query('SELECT * FROM customers ORDER BY name ASC');
  res.json({ ok: true, customers: result.rows });
});

app.post('/admin/customers', auth, async (req, res) => {
  const c = req.body || {};
  if (!cleanText(c.name)) return res.status(400).json({ ok: false, error: 'Customer name is required' });
  const result = await pool.query(
    `INSERT INTO customers (name,address,postcode,email,phone,access_notes,notes,clean_price,frequency,amount_owed,status,next_clean_date,area)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [c.name, c.address || '', c.postcode || '', c.email || '', c.phone || '', c.access_notes || '', c.notes || '', money(c.clean_price), c.frequency || 'Monthly', money(c.amount_owed), c.status || 'Active', c.next_clean_date || null, c.area || '']
  );
  res.status(201).json({ ok: true, customer: result.rows[0] });
});

app.patch('/admin/customers/:id', auth, async (req, res) => {
  const c = req.body || {};
  if (!cleanText(c.name)) return res.status(400).json({ ok: false, error: 'Customer name is required' });
  const result = await pool.query(
    `UPDATE customers SET name=$1,address=$2,postcode=$3,email=$4,phone=$5,access_notes=$6,notes=$7,clean_price=$8,frequency=$9,amount_owed=$10,status=$11,next_clean_date=$12,area=$13,updated_at=now()
     WHERE id=$14 RETURNING *`,
    [c.name, c.address || '', c.postcode || '', c.email || '', c.phone || '', c.access_notes || '', c.notes || '', money(c.clean_price), c.frequency || 'Monthly', money(c.amount_owed), c.status || 'Active', c.next_clean_date || null, c.area || '', req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Customer not found' });
  res.json({ ok: true, customer: result.rows[0] });
});

app.get('/admin/customers/:id/history', auth, async (req, res) => {
  const [customer, jobs, payments] = await Promise.all([
    pool.query('SELECT * FROM customers WHERE id=$1', [req.params.id]),
    pool.query('SELECT * FROM jobs WHERE customer_id=$1 ORDER BY job_date DESC, id DESC', [req.params.id]),
    pool.query('SELECT * FROM payments WHERE customer_id=$1 ORDER BY paid_at DESC, id DESC', [req.params.id])
  ]);
  if (!customer.rows[0]) return res.status(404).json({ ok: false, error: 'Customer not found' });
  res.json({ ok: true, customer: customer.rows[0], jobs: jobs.rows, payments: payments.rows });
});

app.get('/admin/payments', auth, async (_req, res) => {
  const result = await pool.query(`SELECT p.*, c.name AS customer_name FROM payments p JOIN customers c ON c.id=p.customer_id ORDER BY p.paid_at DESC, p.id DESC`);
  res.json({ ok: true, payments: result.rows });
});

app.post('/admin/payments', auth, async (req, res) => {
  const payment = req.body || {};
  const amount = money(payment.amount);
  if (!payment.customer_id || amount <= 0) return res.status(400).json({ ok: false, error: 'Customer and positive payment amount are required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const customer = await client.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE', [payment.customer_id]);
    if (!customer.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ ok: false, error: 'Customer not found' }); }
    const result = await client.query(
      `INSERT INTO payments (customer_id,amount,method,notes,paid_at) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [payment.customer_id, amount, payment.method || 'Bank transfer', payment.notes || '', payment.paid_at || new Date().toISOString().slice(0, 10)]
    );
    await client.query('UPDATE customers SET amount_owed=GREATEST(0,amount_owed-$1),updated_at=now() WHERE id=$2', [amount, payment.customer_id]);
    await client.query('COMMIT');
    res.status(201).json({ ok: true, payment: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
});

app.get('/admin/contacts', auth, async (_req, res) => {
  const result = await pool.query(`
    SELECT 'customer' AS source, id, name, address, postcode, email, phone, frequency, status, amount_owed::float AS amount_owed, notes, created_at
    FROM customers
    UNION ALL
    SELECT 'lead' AS source, id, name, address, postcode, email, phone, frequency, status, 0::float AS amount_owed, message AS notes, created_at
    FROM leads
    ORDER BY name ASC, created_at DESC
  `);
  res.json({ ok: true, contacts: result.rows });
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM jobs WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!current.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ ok: false, error: 'Job not found' }); }
    const shouldCharge = (j.status || 'Planned') === 'Done' && !current.rows[0].charged_at && current.rows[0].customer_id;
    const result = await client.query(
      `UPDATE jobs SET customer_name=$1,address=$2,job_date=$3,price=$4,status=$5,notes=$6,charged_at=CASE WHEN $8 THEN now() ELSE charged_at END,updated_at=now()
       WHERE id=$7 RETURNING *`,
      [j.customer_name || '', j.address || '', j.job_date, money(j.price), j.status || 'Planned', j.notes || '', req.params.id, Boolean(shouldCharge)]
    );
    if (shouldCharge) await client.query('UPDATE customers SET amount_owed=amount_owed+$1,updated_at=now() WHERE id=$2', [money(j.price), current.rows[0].customer_id]);
    await client.query('COMMIT');
    res.json({ ok: true, job: result.rows[0], charged: Boolean(shouldCharge) });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
});

app.post('/admin/jobs/generate-recurring', auth, async (req, res) => {
  const throughDate = req.body?.through_date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const customers = await pool.query(`SELECT * FROM customers WHERE status='Active' AND next_clean_date IS NOT NULL AND next_clean_date <= $1 ORDER BY next_clean_date`, [throughDate]);
  let created = 0;
  for (const customer of customers.rows) {
    const days = frequencyDays(customer.frequency);
    if (!days) continue;
    const firstDate = customer.next_clean_date instanceof Date ? customer.next_clean_date.toISOString().slice(0, 10) : String(customer.next_clean_date).slice(0, 10);
    let jobDate = new Date(`${firstDate}T12:00:00Z`);
    const limit = new Date(`${throughDate}T12:00:00Z`);
    while (jobDate <= limit) {
      const date = jobDate.toISOString().slice(0, 10);
      const inserted = await pool.query(
        `INSERT INTO jobs (customer_id,customer_name,address,job_date,price,status,notes)
         SELECT $1,$2,$3,$4,$5,'Planned','Recurring clean' WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE customer_id=$1 AND job_date=$4) RETURNING id`,
        [customer.id, customer.name, customer.address, date, money(customer.clean_price)]
      );
      created += inserted.rowCount;
      jobDate.setUTCDate(jobDate.getUTCDate() + days);
    }
    await pool.query('UPDATE customers SET next_clean_date=$1,updated_at=now() WHERE id=$2', [jobDate.toISOString().slice(0, 10), customer.id]);
  }
  res.json({ ok: true, created, through_date: throughDate });
});

app.get('/admin/leads', auth, async (_req, res) => {
  const result = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
  res.json({ ok: true, leads: result.rows });
});

app.patch('/admin/leads/:id', auth, async (req, res) => {
  const lead = req.body || {};
  const result = await pool.query(
    `UPDATE leads SET status=COALESCE($1,status),follow_up_date=COALESCE($2,follow_up_date),quoted_amount=COALESCE($3,quoted_amount),updated_at=now() WHERE id=$4 RETURNING *`,
    [lead.status || null, lead.follow_up_date || null, lead.quoted_amount === undefined ? null : money(lead.quoted_amount), req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Lead not found' });
  res.json({ ok: true, lead: result.rows[0] });
});

app.post('/admin/leads/:id/convert', auth, async (req, res) => {
  const leadResult = await pool.query('SELECT * FROM leads WHERE id=$1', [req.params.id]);
  const lead = leadResult.rows[0];
  if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found' });

  const existing = await pool.query(
    `SELECT * FROM customers
     WHERE ($1 <> '' AND lower(email) = lower($1)) OR ($2 <> '' AND regexp_replace(phone, '\\s+', '', 'g') = regexp_replace($2, '\\s+', '', 'g'))
     ORDER BY updated_at DESC
     LIMIT 1`,
    [lead.email || '', lead.phone || '']
  );

  if (existing.rows[0]) {
    await pool.query('UPDATE leads SET status=$1, updated_at=now() WHERE id=$2', ['Existing customer', lead.id]);
    return res.json({ ok: true, existing: true, customer: existing.rows[0], message: 'Lead matched existing customer/contact. No duplicate created.' });
  }

  const notes = [lead.service, lead.property_type, lead.message].filter(Boolean).join(' - ');
  const customer = await pool.query(
    `INSERT INTO customers (name,address,postcode,email,phone,notes,frequency,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [lead.name, lead.address || '', lead.postcode || '', lead.email || '', lead.phone || '', notes, lead.frequency || 'Monthly', 'Active']
  );
  await pool.query('UPDATE leads SET status=$1, updated_at=now() WHERE id=$2', ['Won', lead.id]);
  res.status(201).json({ ok: true, existing: false, customer: customer.rows[0], message: 'Lead converted into a customer/contact.' });
});

initDb().then(() => {
  app.listen(port, () => console.log(`Cumbria Window Cleaning API v1 listening on ${port}`));
}).catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});
