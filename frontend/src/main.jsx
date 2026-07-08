import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5055';
const blankCustomer = { name: '', address: '', postcode: '', email: '', phone: '', access_notes: '', notes: '', clean_price: 0, frequency: 'Monthly', amount_owed: 0, status: 'Active' };
const today = new Date().toISOString().slice(0, 10);

function App() {
  const [lead, setLead] = useState({ name: '', phone: '', email: '', address: '', postcode: '', property_type: '', frequency: 'Monthly', message: '' });
  const [leadSent, setLeadSent] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('cwc_token') || '');
  const [login, setLogin] = useState({ email: 'admin@cumbriawindowcleaning.local', password: '' });
  const [tab, setTab] = useState('dashboard');
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [leads, setLeads] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [customerForm, setCustomerForm] = useState(blankCustomer);
  const [jobForm, setJobForm] = useState({ customer_id: '', job_date: today, status: 'Planned', notes: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);

  async function api(path, options = {}) {
    const res = await fetch(`${API}${path}`, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function loadAdmin() {
    if (!token) return;
    try {
      const [s, c, j, l, contactData] = await Promise.all([
        api('/admin/summary', { headers }),
        api('/admin/customers', { headers }),
        api('/admin/jobs', { headers }),
        api('/admin/leads', { headers }),
        api('/admin/contacts', { headers })
      ]);
      setSummary(s.summary);
      setCustomers(c.customers);
      setJobs(j.jobs);
      setLeads(l.leads);
      setContacts(contactData.contacts);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { loadAdmin(); }, [token]);

  async function submitLead(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) });
      setLeadSent(true);
      setLead({ name: '', phone: '', email: '', address: '', postcode: '', property_type: '', frequency: 'Monthly', message: '' });
    } catch (e) { setError(e.message); }
  }

  async function doLogin(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await api('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(login) });
      localStorage.setItem('cwc_token', data.token);
      setToken(data.token);
    } catch (e) { setError(e.message); }
  }

  async function addCustomer(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await api('/admin/customers', { method: 'POST', headers, body: JSON.stringify(customerForm) });
      setCustomerForm(blankCustomer);
      setNotice('Customer/contact added.');
      await loadAdmin();
    } catch (e) { setError(e.message); }
  }

  async function saveCustomer(customer) {
    setError('');
    setNotice('');
    try {
      await api(`/admin/customers/${customer.id}`, { method: 'PATCH', headers, body: JSON.stringify(customer) });
      setNotice('Customer saved.');
      await loadAdmin();
    } catch (e) { setError(e.message); }
  }

  async function addJob(e) {
    e.preventDefault();
    await api('/admin/jobs', { method: 'POST', headers, body: JSON.stringify(jobForm) });
    setJobForm({ customer_id: '', job_date: today, status: 'Planned', notes: '' });
    await loadAdmin();
  }

  async function updateJob(job, status) {
    await api(`/admin/jobs/${job.id}`, { method: 'PATCH', headers, body: JSON.stringify({ ...job, status }) });
    await loadAdmin();
  }

  async function updateLeadStatus(id, status) {
    await api(`/admin/leads/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ status }) });
    await loadAdmin();
  }

  async function convertLead(id) {
    setError('');
    setNotice('');
    try {
      const result = await api(`/admin/leads/${id}/convert`, { method: 'POST', headers });
      setNotice(result.existing ? 'Lead matched an existing customer/contact.' : 'Lead converted into a customer/contact.');
      await loadAdmin();
    } catch (e) { setError(e.message); }
  }

  function leadMatch(leadItem) {
    return customers.find(c => (leadItem.email && c.email?.toLowerCase() === leadItem.email.toLowerCase()) || (leadItem.phone && cleanPhone(c.phone) === cleanPhone(leadItem.phone)));
  }

  return <>
    <header className="topbar">
      <div className="brandMark"><span className="bucket">⌂</span><div><strong>Cumbria</strong><span>Window Cleaning</span></div></div>
      <nav><a href="#quote">Get a quote</a><a href="#services">Services</a><a href="#admin">Admin</a></nav>
    </header>

    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Commercial & domestic</p>
          <h1>Reliable window cleaning across Cumbria.</h1>
          <p className="heroText">A simple local website for Facebook adverts, quote requests and regular customer bookings.</p>
          <div className="heroActions"><a className="button" href="#quote">Request a quote</a><a className="button ghost" href="tel:+440000000000">Call now</a></div>
        </div>
        <div className="heroCard">
          <h3>Local cleaning slots</h3>
          <p>Domestic homes, shops, offices and regular rounds.</p>
          <ul><li>Regular monthly cleans</li><li>One-off cleans</li><li>Payment tracking</li><li>Planner built in</li></ul>
        </div>
      </section>

      <section id="services" className="section cards">
        {['Domestic window cleaning','Commercial window cleaning','Regular rounds','Conservatories, fascias and extras'].map((title) => <article className="card" key={title}><h3>{title}</h3><p>Professional service with easy booking and clear customer records.</p></article>)}
      </section>

      <section id="quote" className="section quotePanel">
        <div><p className="eyebrow">Facebook advert landing page</p><h2>Request a free quote</h2><p>New leads land straight inside the private admin area.</p>{leadSent && <p className="success">Thanks, your request has been sent.</p>}</div>
        <form onSubmit={submitLead} className="formGrid">
          <input required placeholder="Name" value={lead.name} onChange={e => setLead({ ...lead, name: e.target.value })} />
          <input required placeholder="Phone" value={lead.phone} onChange={e => setLead({ ...lead, phone: e.target.value })} />
          <input placeholder="Email" value={lead.email} onChange={e => setLead({ ...lead, email: e.target.value })} />
          <input placeholder="Postcode" value={lead.postcode} onChange={e => setLead({ ...lead, postcode: e.target.value })} />
          <input className="wide" placeholder="Address" value={lead.address} onChange={e => setLead({ ...lead, address: e.target.value })} />
          <select value={lead.frequency} onChange={e => setLead({ ...lead, frequency: e.target.value })}><option>Monthly</option><option>Fortnightly</option><option>One-off</option><option>Commercial quote</option></select>
          <input placeholder="Property type" value={lead.property_type} onChange={e => setLead({ ...lead, property_type: e.target.value })} />
          <textarea className="wide" placeholder="Notes" value={lead.message} onChange={e => setLead({ ...lead, message: e.target.value })} />
          <button className="button wide">Send request</button>
        </form>
      </section>

      <section id="admin" className="section adminPanel">
        <div className="adminHeader"><div><p className="eyebrow">Private planner</p><h2>Admin dashboard</h2></div>{token && <button className="small" onClick={() => { localStorage.removeItem('cwc_token'); setToken(''); }}>Logout</button>}</div>
        {error && <p className="error">{error}</p>}
        {notice && <p className="success">{notice}</p>}
        {!token ? <form className="login" onSubmit={doLogin}><input value={login.email} onChange={e => setLogin({ ...login, email: e.target.value })} /><input type="password" placeholder="Password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} /><button className="button">Login</button></form> : <>
          <div className="tabs">{['dashboard','contacts','customers','planner','money','leads'].map(t => <button className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t}>{t}</button>)}</div>
          {tab === 'dashboard' && <div className="stats">
            <Stat title="Active customers" value={summary?.active_customers ?? 0} />
            <Stat title="Jobs today" value={summary?.jobs_today ?? 0} />
            <Stat title="Money owed" value={`£${Number(summary?.amount_owed || 0).toFixed(2)}`} />
            <Stat title="New leads" value={summary?.new_leads ?? 0} />
          </div>}
          {tab === 'contacts' && <><CustomerForm form={customerForm} setForm={setCustomerForm} onSubmit={addCustomer} /><ContactList contacts={contacts} /></>}
          {tab === 'customers' && <><CustomerForm form={customerForm} setForm={setCustomerForm} onSubmit={addCustomer} /><CustomerList customers={customers} saveCustomer={saveCustomer} /></>}
          {tab === 'planner' && <><form className="inlineForm" onSubmit={addJob}><select value={jobForm.customer_id} onChange={e => setJobForm({ ...jobForm, customer_id: e.target.value })}><option value="">Choose customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input type="date" value={jobForm.job_date} onChange={e => setJobForm({ ...jobForm, job_date: e.target.value })} /><input placeholder="Notes" value={jobForm.notes} onChange={e => setJobForm({ ...jobForm, notes: e.target.value })} /><button>Add job</button></form><JobList jobs={jobs} updateJob={updateJob} /></>}
          {tab === 'money' && <MoneyList customers={customers} saveCustomer={saveCustomer} />}
          {tab === 'leads' && <LeadList leads={leads} updateLeadStatus={updateLeadStatus} convertLead={convertLead} leadMatch={leadMatch} />}
        </>}
      </section>
    </main>
  </>;
}

function cleanPhone(value) { return String(value || '').replace(/\s+/g, ''); }
function Stat({ title, value }) { return <div className="stat"><span>{title}</span><strong>{value}</strong></div>; }
function Field({ form, setForm, name, placeholder, type = 'text' }) { return <input type={type} placeholder={placeholder} value={form[name] ?? ''} onChange={e => setForm({ ...form, [name]: e.target.value })} />; }
function CustomerForm({ form, setForm, onSubmit }) { return <form className="formGrid compact" onSubmit={onSubmit}><Field form={form} setForm={setForm} name="name" placeholder="Name" /><Field form={form} setForm={setForm} name="phone" placeholder="Phone" /><Field form={form} setForm={setForm} name="email" placeholder="Email" /><Field form={form} setForm={setForm} name="postcode" placeholder="Postcode" /><Field form={form} setForm={setForm} name="address" placeholder="Address" /><Field form={form} setForm={setForm} name="clean_price" placeholder="Price" type="number" /><Field form={form} setForm={setForm} name="amount_owed" placeholder="Amount owed" type="number" /><Field form={form} setForm={setForm} name="access_notes" placeholder="Access notes" /><button className="button wide">Add customer/contact</button></form>; }
function CustomerList({ customers, saveCustomer }) { return <div className="tableList">{customers.map(c => <CustomerRow key={c.id} c={c} saveCustomer={saveCustomer} />)}</div>; }
function CustomerRow({ c, saveCustomer }) { const [edit, setEdit] = useState(c); return <article className="row"><div><strong>{c.name}</strong><span>{c.address} {c.postcode}</span><span>{c.phone} {c.email}</span></div><input type="number" value={edit.amount_owed} onChange={e => setEdit({ ...edit, amount_owed: e.target.value })} /><button onClick={() => saveCustomer(edit)}>Save owed</button></article>; }
function JobList({ jobs, updateJob }) { return <div className="tableList">{jobs.map(j => <article className="row" key={j.id}><div><strong>{j.job_date?.slice(0,10)} · {j.customer_name}</strong><span>{j.address}</span><span>{j.notes}</span></div><b>{j.status}</b><button onClick={() => updateJob(j, 'Done')}>Done</button><button onClick={() => updateJob(j, 'Skipped')}>Skip</button></article>)}</div>; }
function MoneyList({ customers, saveCustomer }) { return <div className="tableList">{customers.filter(c => Number(c.amount_owed) > 0).map(c => <CustomerRow key={c.id} c={c} saveCustomer={saveCustomer} />)}</div>; }
function LeadList({ leads, updateLeadStatus, convertLead, leadMatch }) { return <div className="tableList">{leads.map(l => { const match = leadMatch(l); return <article className="row" key={l.id}><div><strong>{l.name} · {l.phone}</strong><span>{l.address} {l.postcode}</span><span>{l.message}</span>{match && <span className="badge">Existing customer/contact: {match.name}</span>}</div><b>{l.status}</b><button onClick={() => updateLeadStatus(l.id, 'Contacted')}>Contacted</button><button onClick={() => convertLead(l.id)}>{match ? 'Mark existing' : 'Add as customer'}</button></article>; })}</div>; }
function ContactList({ contacts }) { return <div className="tableList">{contacts.map(c => <article className="row" key={`${c.source}-${c.id}`}><div><strong>{c.name}</strong><span>{c.address} {c.postcode}</span><span>{c.phone} {c.email}</span><span>{c.notes}</span></div><b>{c.source === 'customer' ? 'Customer' : 'Lead'}</b><b>{c.status}</b><b>{Number(c.amount_owed) > 0 ? `£${Number(c.amount_owed).toFixed(2)}` : ''}</b></article>)}</div>; }

createRoot(document.getElementById('root')).render(<App />);