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

    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      invoice_number INTEGER UNIQUE NOT NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_address TEXT NOT NULL DEFAULT '',
      customer_postcode TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL DEFAULT '',
      invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
      due_date DATE,
      reference TEXT NOT NULL DEFAULT '',
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes TEXT NOT NULL DEFAULT '',
      subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
      total NUMERIC(10,2) NOT NULL DEFAULT 0,
      paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE customers ADD COLUMN IF NOT EXISTS next_clean_date DATE;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT '';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS charged_at TIMESTAMPTZ;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_date DATE;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS quoted_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS service TEXT NOT NULL DEFAULT 'Window cleaning';
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_notes TEXT NOT NULL DEFAULT '';
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_valid_until DATE;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMPTZ;
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

function importFrequency(value) {
  const frequency = cleanText(value).toLowerCase();
  if (frequency === 'weekly' || frequency === 'week' || frequency === 'every week') return 'Weekly';
  if (frequency === 'monthly' || frequency === 'month' || frequency === 'every month') return 'Monthly';
  return cleanText(value) || 'Monthly';
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

function londonClock() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

async function runReminderAutomation(force = false) {
  const settings = await notificationSettings();
  if (settings.notification_enabled !== 'true') return { sent: 0, message: 'Phone notifications are disabled' };
  const clock = londonClock();
  const reminderHour = Math.min(23, Math.max(0, Number(settings.notification_reminder_hour ?? 18)));
  if (!force && clock.hour < reminderHour) return { sent: 0, message: 'Waiting for reminder time' };
  let sent = 0;
  if (settings.notification_followup_reminders === 'true' && (force || settings.notification_followup_last_date !== clock.date)) {
    const due = await pool.query(`SELECT name,phone,follow_up_date FROM leads WHERE follow_up_date<=CURRENT_DATE AND status NOT IN ('Won','Lost / Not interested','Existing customer') ORDER BY follow_up_date,name`);
    if (due.rows.length) {
      const names = due.rows.slice(0, 8).map(lead => lead.name).join(', ');
      const result = await publishNotification({ title: `${due.rows.length} lead follow-up${due.rows.length === 1 ? '' : 's'} due`, message: `${names}${due.rows.length > 8 ? ` +${due.rows.length - 8} more` : ''}` });
      if (result.sent) sent += 1;
    }
    await pool.query(`INSERT INTO app_settings (setting_key,setting_value) VALUES ('notification_followup_last_date',$1) ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=now()`, [clock.date]);
  }
  if (settings.notification_schedule_reminders === 'true' && (force || settings.notification_schedule_last_date !== clock.date)) {
    const tomorrow = new Date(`${clock.date}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    const jobs = await pool.query(`SELECT j.customer_name,j.price,c.area FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id WHERE j.job_date=$1 AND j.status NOT IN ('Cancelled','Skipped') ORDER BY COALESCE(c.area,''),j.id`, [date]);
    if (jobs.rows.length) {
      const total = jobs.rows.reduce((sum, job) => sum + money(job.price), 0);
      const names = jobs.rows.slice(0, 8).map(job => job.customer_name).join(', ');
      const result = await publishNotification({ title: `Tomorrow's cleaning round`, message: `${jobs.rows.length} jobs · £${total.toFixed(2)} · ${names}${jobs.rows.length > 8 ? ` +${jobs.rows.length - 8} more` : ''}` });
      if (result.sent) sent += 1;
    }
    await pool.query(`INSERT INTO app_settings (setting_key,setting_value) VALUES ('notification_schedule_last_date',$1) ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=now()`, [clock.date]);
  }
  return { sent, message: sent ? `${sent} reminder notification${sent === 1 ? '' : 's'} sent` : 'No reminders were due' };
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
      followup_reminders: settings.notification_followup_reminders === 'true',
      schedule_reminders: settings.notification_schedule_reminders === 'true',
      reminder_hour: Number(settings.notification_reminder_hour ?? 18),
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
    notification_topic: topic,
    notification_followup_reminders: input.followup_reminders ? 'true' : 'false',
    notification_schedule_reminders: input.schedule_reminders ? 'true' : 'false',
    notification_reminder_hour: String(Math.min(23, Math.max(0, Number(input.reminder_hour ?? 18))))
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

app.post('/admin/settings/notifications/reminders/run', auth, async (_req, res) => {
  try { res.json({ ok: true, ...(await runReminderAutomation(true)) }); }
  catch (error) { res.status(502).json({ ok: false, error: error.message }); }
});

app.get('/admin/summary', auth, async (_req, res) => {
  const [customers, jobsToday, owed, leads, revenue, followUps] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM customers WHERE status='Active' AND deleted_at IS NULL`),
    pool.query(`SELECT COUNT(*)::int AS count FROM jobs WHERE job_date = CURRENT_DATE AND status <> 'Cancelled'`),
    pool.query(`SELECT COALESCE(SUM(amount_owed),0)::float AS total FROM customers WHERE deleted_at IS NULL`),
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
  const result = await pool.query('SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name ASC');
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

app.delete('/admin/customers/:id', auth, async (req, res) => {
  const result = await pool.query(`UPDATE customers SET deleted_at=now(),status='Inactive',updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id,name`, [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Customer not found' });
  res.json({ ok: true, customer: result.rows[0], message: 'Customer deleted. Historical jobs, payments and invoices were preserved.' });
});

app.get('/admin/reports', auth, async (_req, res) => {
  const [months, totals, leadSources] = await Promise.all([
    pool.query(`WITH months AS (SELECT generate_series(date_trunc('month',CURRENT_DATE)-interval '11 months',date_trunc('month',CURRENT_DATE),interval '1 month')::date AS month)
      SELECT to_char(m.month,'YYYY-MM') AS month,to_char(m.month,'Mon YY') AS label,
      COALESCE((SELECT SUM(p.amount) FROM payments p WHERE date_trunc('month',p.paid_at)=m.month),0)::float AS revenue,
      COALESCE((SELECT COUNT(*) FROM jobs j WHERE date_trunc('month',j.job_date)=m.month AND j.status='Done'),0)::int AS completed_jobs,
      COALESCE((SELECT SUM(j.price) FROM jobs j WHERE date_trunc('month',j.job_date)=m.month AND j.status='Done'),0)::float AS completed_value
      FROM months m ORDER BY m.month`),
    pool.query(`SELECT
      (SELECT COUNT(*)::int FROM customers WHERE status='Active' AND deleted_at IS NULL) AS active_customers,
      (SELECT COALESCE(SUM(amount_owed),0)::float FROM customers WHERE deleted_at IS NULL) AS outstanding,
      (SELECT COUNT(*)::int FROM leads) AS total_leads,
      (SELECT COUNT(*)::int FROM leads WHERE status IN ('Won','Existing customer')) AS won_leads,
      (SELECT COALESCE(SUM(amount),0)::float FROM payments WHERE paid_at>=CURRENT_DATE-interval '30 days') AS revenue_30_days`),
    pool.query(`SELECT COALESCE(NULLIF(service,''),'Not specified') AS service,COUNT(*)::int AS count FROM leads GROUP BY 1 ORDER BY count DESC,service LIMIT 8`)
  ]);
  const summary = totals.rows[0];
  summary.conversion_rate = summary.total_leads ? Math.round((summary.won_leads / summary.total_leads) * 1000) / 10 : 0;
  res.json({ ok: true, months: months.rows, summary, lead_services: leadSources.rows });
});

app.post('/admin/customers/import', auth, async (req, res) => {
  const customers = Array.isArray(req.body?.customers) ? req.body.customers : [];
  if (!customers.length) return res.status(400).json({ ok: false, error: 'The CSV does not contain any customer rows' });
  if (customers.length > 1000) return res.status(400).json({ ok: false, error: 'Import up to 1,000 customers at a time' });

  const client = await pool.connect();
  let imported = 0;
  let skipped = 0;
  const errors = [];
  try {
    await client.query('BEGIN');
    for (let index = 0; index < customers.length; index += 1) {
      const c = customers[index] || {};
      const name = cleanText(c.name);
      if (!name) { errors.push(`Row ${index + 2}: name is required`); continue; }
      const email = cleanText(c.email);
      const phone = cleanText(c.phone);
      const duplicate = await client.query(
        `SELECT id FROM customers WHERE deleted_at IS NULL AND (($1 <> '' AND lower(email)=lower($1)) OR ($2 <> '' AND regexp_replace(phone, '[^0-9]+', '', 'g')=regexp_replace($2, '[^0-9]+', '', 'g'))) LIMIT 1`,
        [email, phone]
      );
      if (duplicate.rows[0]) { skipped += 1; continue; }
      await client.query(
        `INSERT INTO customers (name,address,postcode,email,phone,access_notes,notes,clean_price,frequency,amount_owed,status,next_clean_date,area)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [name, cleanText(c.address), cleanText(c.postcode), email, phone, cleanText(c.access_notes), cleanText(c.notes), money(c.clean_price), importFrequency(c.frequency), money(c.amount_owed), cleanText(c.status) || 'Active', cleanText(c.next_clean_date) || null, cleanText(c.area)]
      );
      imported += 1;
    }
    await client.query('COMMIT');
    res.status(201).json({ ok: true, imported, skipped, errors: errors.slice(0, 20), message: `${imported} customer${imported === 1 ? '' : 's'} imported. ${skipped} duplicate${skipped === 1 ? '' : 's'} skipped.` });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ ok: false, error: `Import failed: ${error.message}` });
  } finally { client.release(); }
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
    FROM customers WHERE deleted_at IS NULL
    UNION ALL
    SELECT 'lead' AS source, id, name, address, postcode, email, phone, frequency, status, 0::float AS amount_owed, message AS notes, created_at
    FROM leads
    ORDER BY name ASC, created_at DESC
  `);
  res.json({ ok: true, contacts: result.rows });
});

app.get('/admin/jobs', auth, async (_req, res) => {
  const result = await pool.query(`SELECT j.*,c.area,c.postcode,c.phone FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id ORDER BY j.job_date ASC,j.id ASC`);
  res.json({ ok: true, jobs: result.rows });
});

app.get('/admin/data/export', auth, async (_req, res) => {
  const [customers, leads, jobs, payments, invoices, settings] = await Promise.all([
    pool.query('SELECT * FROM customers ORDER BY id'),
    pool.query('SELECT * FROM leads ORDER BY id'),
    pool.query('SELECT * FROM jobs ORDER BY id'),
    pool.query('SELECT * FROM payments ORDER BY id'),
    pool.query('SELECT * FROM invoices ORDER BY id'),
    pool.query(`SELECT setting_key,CASE WHEN setting_key='notification_access_token' THEN '[redacted]' ELSE setting_value END AS setting_value,updated_at FROM app_settings ORDER BY setting_key`)
  ]);
  res.json({ ok: true, exported_at: new Date().toISOString(), version: 'v1', data: { customers: customers.rows, leads: leads.rows, jobs: jobs.rows, payments: payments.rows, invoices: invoices.rows, settings: settings.rows } });
});

app.get('/admin/invoices', auth, async (_req, res) => {
  const result = await pool.query('SELECT * FROM invoices ORDER BY invoice_number DESC');
  res.json({ ok: true, invoices: result.rows });
});

app.post('/admin/invoices', auth, async (req, res) => {
  const invoice = req.body || {};
  const items = Array.isArray(invoice.items) ? invoice.items.map(item => ({ description: cleanText(item.description), unit_cost: money(item.unit_cost), quantity: Math.max(0, money(item.quantity)) })).filter(item => item.description && item.quantity > 0) : [];
  if (!cleanText(invoice.customer_name)) return res.status(400).json({ ok: false, error: 'Customer or company name is required' });
  if (!items.length) return res.status(400).json({ ok: false, error: 'Add at least one invoice item' });
  const subtotal = items.reduce((sum, item) => sum + item.unit_cost * item.quantity, 0);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(20260718)`);
    const numberResult = await client.query('SELECT COALESCE(MAX(invoice_number),85)+1 AS next_number FROM invoices');
    const result = await client.query(`INSERT INTO invoices (invoice_number,customer_id,customer_name,customer_address,customer_postcode,customer_email,invoice_date,due_date,reference,items,notes,subtotal,total,paid_amount,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$12,$13,$14) RETURNING *`, [numberResult.rows[0].next_number, invoice.customer_id || null, cleanText(invoice.customer_name), cleanText(invoice.customer_address), cleanText(invoice.customer_postcode), cleanText(invoice.customer_email), invoice.invoice_date || new Date().toISOString().slice(0,10), invoice.due_date || null, cleanText(invoice.reference), JSON.stringify(items), cleanText(invoice.notes), subtotal, money(invoice.paid_amount), cleanText(invoice.status) || 'Draft']);
    await client.query('COMMIT');
    res.status(201).json({ ok: true, invoice: result.rows[0] });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});

app.patch('/admin/invoices/:id', auth, async (req, res) => {
  const invoice = req.body || {};
  const result = await pool.query(`UPDATE invoices SET status=COALESCE($1,status),paid_amount=COALESCE($2,paid_amount),updated_at=now() WHERE id=$3 RETURNING *`, [invoice.status || null, invoice.paid_amount === undefined ? null : money(invoice.paid_amount), req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Invoice not found' });
  res.json({ ok: true, invoice: result.rows[0] });
});

app.post('/admin/jobs/schedule-notification', auth, async (req, res) => {
  const date = cleanText(req.body?.date) || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'Enter a valid schedule date' });
  const result = await pool.query(`SELECT j.customer_name,j.address,j.price,c.area FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id WHERE j.job_date=$1 AND j.status NOT IN ('Cancelled','Skipped') ORDER BY COALESCE(c.area,''),j.id`, [date]);
  const jobs = result.rows;
  if (!jobs.length) return res.status(400).json({ ok: false, error: `No planned jobs found for ${date}` });
  const total = jobs.reduce((sum, job) => sum + money(job.price), 0);
  const preview = jobs.slice(0, 8).map(job => `${job.customer_name}${job.area ? ` (${job.area})` : ''}`).join(', ');
  try {
    const notification = await publishNotification({ title: `Cleaning round: ${date}`, message: `${jobs.length} jobs · £${total.toFixed(2)} · ${preview}${jobs.length > 8 ? ` +${jobs.length - 8} more` : ''}` });
    if (!notification.sent) return res.status(400).json({ ok: false, error: 'Enable phone notifications in Settings first' });
    res.json({ ok: true, message: `Schedule notification sent for ${jobs.length} jobs.` });
  } catch (error) { res.status(502).json({ ok: false, error: error.message }); }
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

app.post('/admin/leads', auth, async (req, res) => {
  const lead = req.body || {};
  if (!cleanText(lead.name) || !cleanText(lead.phone)) return res.status(400).json({ ok: false, error: 'Name and phone are required' });
  const result = await pool.query(`INSERT INTO leads (name,address,postcode,email,phone,property_type,frequency,message,service,status,follow_up_date,quoted_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [cleanText(lead.name),cleanText(lead.address),cleanText(lead.postcode),cleanText(lead.email),cleanText(lead.phone),cleanText(lead.property_type),cleanText(lead.frequency),cleanText(lead.message),cleanText(lead.service) || 'Window cleaning',cleanText(lead.status) || 'New',lead.follow_up_date || null,money(lead.quoted_amount)]);
  res.status(201).json({ ok: true, lead: result.rows[0], message: 'Lead added successfully.' });
});

app.get('/admin/leads', auth, async (_req, res) => {
  const result = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
  res.json({ ok: true, leads: result.rows });
});

app.patch('/admin/leads/:id', auth, async (req, res) => {
  const lead = req.body || {};
  const result = await pool.query(
    `UPDATE leads SET status=COALESCE($1,status),follow_up_date=CASE WHEN $8 THEN NULLIF($2,'')::date ELSE follow_up_date END,quoted_amount=COALESCE($3,quoted_amount),quote_notes=COALESCE($4,quote_notes),quote_valid_until=CASE WHEN $9 THEN NULLIF($5,'')::date ELSE quote_valid_until END,quote_sent_at=COALESCE($6,quote_sent_at),updated_at=now() WHERE id=$7 RETURNING *`,
    [lead.status || null, lead.follow_up_date ?? '', lead.quoted_amount === undefined ? null : money(lead.quoted_amount), lead.quote_notes === undefined ? null : cleanText(lead.quote_notes), lead.quote_valid_until ?? '', lead.quote_sent_at || null, req.params.id, Object.hasOwn(lead, 'follow_up_date'), Object.hasOwn(lead, 'quote_valid_until')]
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
     WHERE deleted_at IS NULL AND (($1 <> '' AND lower(email) = lower($1)) OR ($2 <> '' AND regexp_replace(phone, '\\s+', '', 'g') = regexp_replace($2, '\\s+', '', 'g')))
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
  setTimeout(() => runReminderAutomation().catch(error => console.error('Reminder automation failed:', error.message)), 10000);
  setInterval(() => runReminderAutomation().catch(error => console.error('Reminder automation failed:', error.message)), 10 * 60 * 1000);
}).catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});
