import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './admin-v5.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5055';
const blankCustomer = { name: '', address: '', postcode: '', email: '', phone: '', access_notes: '', notes: '', clean_price: 0, frequency: 'Monthly', amount_owed: 0, status: 'Active', next_clean_date: '', area: '' };
const today = new Date().toISOString().slice(0, 10);

function App() {
  const isAdminPage = window.location.pathname.replace(/\/+$/, '') === '/admin';
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
  const [payments, setPayments] = useState([]);
  const [customerHistory, setCustomerHistory] = useState(null);
  const [customerForm, setCustomerForm] = useState(blankCustomer);
  const [jobForm, setJobForm] = useState({ customer_id: '', job_date: today, status: 'Planned', notes: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [contactFilter, setContactFilter] = useState('All');
  const [leadFilter, setLeadFilter] = useState('Open');
  const [paymentForm, setPaymentForm] = useState({ customer_id: '', amount: '', method: 'Bank transfer', paid_at: today, notes: '' });
  const [throughDate, setThroughDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);
  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    const matches = (...values) => values.some(value => String(value || '').toLowerCase().includes(query));
    return [
      ...customers.filter(c => matches(c.name, c.address, c.postcode, c.email, c.phone, c.notes, c.access_notes)).map(c => ({ ...c, source: 'customer' })),
      ...leads.filter(l => matches(l.name, l.address, l.postcode, l.email, l.phone, l.message)).map(l => ({ ...l, source: 'lead', notes: l.message, amount_owed: 0 }))
    ];
  }, [search, customers, leads]);

  async function api(path, options = {}) {
    const res = await fetch(`${API}${path}`, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function loadAdmin() {
    if (!token) return;
    try {
      const [s, c, j, l, contactData, paymentData] = await Promise.all([
        api('/admin/summary', { headers }),
        api('/admin/customers', { headers }),
        api('/admin/jobs', { headers }),
        api('/admin/leads', { headers }),
        api('/admin/contacts', { headers }),
        api('/admin/payments', { headers })
      ]);
      setSummary(s.summary);
      setCustomers(c.customers);
      setJobs(j.jobs);
      setLeads(l.leads);
      setContacts(contactData.contacts);
      setPayments(paymentData.payments);
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
      return true;
    } catch (e) { setError(e.message); return false; }
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
    setError('');
    setNotice('');
    try {
      await api(`/admin/leads/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ status }) });
      setNotice(`Lead marked ${status.toLowerCase()}.`);
      await loadAdmin();
    } catch (e) { setError(e.message); }
  }

  async function saveLead(leadItem) {
    setError(''); setNotice('');
    try {
      await api(`/admin/leads/${leadItem.id}`, { method: 'PATCH', headers, body: JSON.stringify(leadItem) });
      setNotice('Lead details saved.');
      await loadAdmin();
    } catch (e) { setError(e.message); }
  }

  async function openCustomer(id) {
    setError('');
    try { setCustomerHistory(await api(`/admin/customers/${id}/history`, { headers })); }
    catch (e) { setError(e.message); }
  }

  async function addPayment(e) {
    e.preventDefault(); setError(''); setNotice('');
    try {
      await api('/admin/payments', { method: 'POST', headers, body: JSON.stringify(paymentForm) });
      setPaymentForm({ customer_id: '', amount: '', method: 'Bank transfer', paid_at: today, notes: '' });
      setNotice('Payment recorded and customer balance updated.');
      await loadAdmin();
      if (customerHistory) await openCustomer(customerHistory.customer.id);
    } catch (e) { setError(e.message); }
  }

  async function generateRecurring() {
    setError(''); setNotice('');
    try {
      const result = await api('/admin/jobs/generate-recurring', { method: 'POST', headers, body: JSON.stringify({ through_date: throughDate }) });
      setNotice(`${result.created} recurring job${result.created === 1 ? '' : 's'} created.`);
      await loadAdmin();
    } catch (e) { setError(e.message); }
  }

  function exportCsv() {
    const rows = [['Type','Name','Address','Postcode','Email','Phone','Status','Amount owed','Notes'], ...contacts.map(c => [c.source,c.name,c.address,c.postcode,c.email,c.phone,c.status,c.amount_owed,c.notes])];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `cwc-contacts-${today}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function convertLead(id) {
    setError('');
    setNotice('');
    try {
      const result = await api(`/admin/leads/${id}/convert`, { method: 'POST', headers });
      setNotice(result.message || (result.existing ? 'Lead matched existing customer/contact. No duplicate created.' : 'Lead converted into a customer/contact.'));
      await loadAdmin();
    } catch (e) { setError(e.message); }
  }

  function leadMatch(leadItem) {
    return customers.find(c => (leadItem.email && c.email?.toLowerCase() === leadItem.email.toLowerCase()) || (leadItem.phone && cleanPhone(c.phone) === cleanPhone(leadItem.phone)));
  }

  return <>
    <header className={`topbar ${isAdminPage ? 'adminTopbar' : ''}`}>
      <div className="brandMark"><span className="bucket">⌂</span><div><strong>Cumbria</strong><span>Window Cleaning</span></div></div>
      {isAdminPage ? <nav><a href="/">View public website</a></nav> : <nav><a href="#quote">Get a quote</a><a href="#services">Services</a></nav>}
    </header>

    <main className={isAdminPage ? 'adminPage' : ''}>
      {!isAdminPage && <>
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
      </>}

      {isAdminPage && <section id="admin" className="section adminPanel">
        <div className="adminHeader"><div><p className="eyebrow">Private planner</p><h2>Admin dashboard</h2></div>{token && <button className="small" onClick={() => { localStorage.removeItem('cwc_token'); setToken(''); }}>Logout</button>}</div>
        {error && <p className="error">{error}</p>}
        {notice && <p className="success">{notice}</p>}
        {!token ? <form className="login" onSubmit={doLogin}><input value={login.email} onChange={e => setLogin({ ...login, email: e.target.value })} /><input type="password" placeholder="Password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} /><button className="button">Login</button></form> : <>
          <div className="adminSearch"><input type="search" aria-label="Search all customers, contacts and leads" placeholder="Search customers, contacts and leads..." value={search} onChange={e => setSearch(e.target.value)} />{search && <button className="small" onClick={() => setSearch('')}>Clear</button>}</div>
          <div className="adminTools"><button className="small" onClick={exportCsv}>Export contacts CSV</button></div>
          <div className="tabs">{['dashboard','today','customers','planner','payments','leads','contacts'].map(t => <button className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t}>{t}</button>)}</div>
          {search ? <section className="searchResults"><div className="listHeading"><h3>Search results</h3><span>{searchResults.length} found</span></div><ContactList contacts={searchResults} empty="No matching customers, contacts or leads." /></section> : <>
          {tab === 'dashboard' && <div className="stats">
            <Stat title="Active customers" value={summary?.active_customers ?? 0} />
            <Stat title="Jobs today" value={summary?.jobs_today ?? 0} />
            <Stat title="Money owed" value={`£${Number(summary?.amount_owed || 0).toFixed(2)}`} />
            <Stat title="New leads" value={summary?.new_leads ?? 0} />
            <Stat title="Revenue this month" value={`£${Number(summary?.revenue_this_month || 0).toFixed(2)}`} />
            <Stat title="Follow-ups due" value={summary?.follow_ups_due ?? 0} />
          </div>}
          {tab === 'today' && <><div className="listHeading"><h3>Today's round</h3><span>{jobs.filter(j => j.job_date?.slice(0,10) === today).length} jobs</span></div><JobList jobs={jobs.filter(j => j.job_date?.slice(0,10) === today)} updateJob={updateJob} empty="No jobs planned for today." /></>}
          {tab === 'contacts' && <><CustomerForm form={customerForm} setForm={setCustomerForm} onSubmit={addCustomer} /><ContactFilters value={contactFilter} onChange={setContactFilter} /><ContactList contacts={filterContacts(contacts, contactFilter)} empty="No contacts match this filter." /></>}
          {tab === 'customers' && <>{customerHistory && <CustomerHistory data={customerHistory} close={() => setCustomerHistory(null)} setPayment={setPaymentForm} goPayments={() => setTab('payments')} />}<CustomerForm form={customerForm} setForm={setCustomerForm} onSubmit={addCustomer} /><CustomerList customers={customers} saveCustomer={saveCustomer} openCustomer={openCustomer} /></>}
          {tab === 'planner' && <><div className="plannerTools"><form className="inlineForm" onSubmit={addJob}><select value={jobForm.customer_id} onChange={e => setJobForm({ ...jobForm, customer_id: e.target.value })}><option value="">Choose customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input type="date" value={jobForm.job_date} onChange={e => setJobForm({ ...jobForm, job_date: e.target.value })} /><input placeholder="Notes" value={jobForm.notes} onChange={e => setJobForm({ ...jobForm, notes: e.target.value })} /><button>Add job</button></form><div className="recurringTool"><label>Generate recurring jobs through <input type="date" value={throughDate} onChange={e => setThroughDate(e.target.value)} /></label><button onClick={generateRecurring}>Generate</button></div></div><JobList jobs={jobs} updateJob={updateJob} /></>}
          {tab === 'payments' && <><PaymentForm form={paymentForm} setForm={setPaymentForm} customers={customers} onSubmit={addPayment} /><PaymentList payments={payments} /><h3>Outstanding balances</h3><MoneyList customers={customers} saveCustomer={saveCustomer} openCustomer={openCustomer} /></>}
          {tab === 'leads' && <><LeadFilters value={leadFilter} onChange={setLeadFilter} /><LeadList leads={filterLeads(leads, leadFilter)} updateLeadStatus={updateLeadStatus} saveLead={saveLead} convertLead={convertLead} leadMatch={leadMatch} /></>}
          </>}
        </>}
      </section>}
    </main>
  </>;
}

function cleanPhone(value) { return String(value || '').replace(/\s+/g, ''); }
function filterContacts(contacts, filter) {
  if (filter === 'Customers') return contacts.filter(c => c.source === 'customer');
  if (filter === 'Leads') return contacts.filter(c => c.source === 'lead');
  if (filter === 'Owes money') return contacts.filter(c => c.source === 'customer' && Number(c.amount_owed) > 0);
  if (filter === 'Active') return contacts.filter(c => String(c.status).toLowerCase() === 'active');
  return contacts;
}
function filterLeads(leads, filter) {
  if (filter === 'Open') return leads.filter(l => !['Won', 'Lost / Not interested', 'Existing customer'].includes(l.status));
  if (filter === 'Follow-ups due') return leads.filter(l => l.follow_up_date && l.follow_up_date.slice(0,10) <= today && !['Won', 'Lost / Not interested', 'Existing customer'].includes(l.status));
  if (filter === 'Won') return leads.filter(l => l.status === 'Won' || l.status === 'Existing customer');
  if (filter === 'Lost') return leads.filter(l => l.status === 'Lost / Not interested');
  return leads;
}
function Stat({ title, value }) { return <div className="stat"><span>{title}</span><strong>{value}</strong></div>; }
function Field({ form, setForm, name, placeholder, type = 'text' }) { return <input type={type} placeholder={placeholder} value={form[name] ?? ''} onChange={e => setForm({ ...form, [name]: e.target.value })} />; }
function CustomerForm({ form, setForm, onSubmit }) { return <form className="formGrid compact" onSubmit={onSubmit}><Field form={form} setForm={setForm} name="name" placeholder="Name" /><Field form={form} setForm={setForm} name="phone" placeholder="Phone" /><Field form={form} setForm={setForm} name="email" placeholder="Email" /><Field form={form} setForm={setForm} name="postcode" placeholder="Postcode" /><Field form={form} setForm={setForm} name="address" placeholder="Address" /><Field form={form} setForm={setForm} name="area" placeholder="Round / area" /><Field form={form} setForm={setForm} name="clean_price" placeholder="Price" type="number" /><Field form={form} setForm={setForm} name="amount_owed" placeholder="Amount owed" type="number" /><Field form={form} setForm={setForm} name="next_clean_date" placeholder="Next clean" type="date" /><Field form={form} setForm={setForm} name="access_notes" placeholder="Access notes" /><button className="button wide">Add customer/contact</button></form>; }
function CustomerList({ customers, saveCustomer, openCustomer }) { return <div className="tableList">{customers.map(c => <CustomerRow key={c.id} c={c} saveCustomer={saveCustomer} openCustomer={openCustomer} />)}</div>; }
function CustomerRow({ c, saveCustomer, openCustomer }) {
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState(c);
  useEffect(() => setEdit(c), [c]);
  if (editing) return <article className="customerEditor"><div className="formGrid"><Field form={edit} setForm={setEdit} name="name" placeholder="Name" /><Field form={edit} setForm={setEdit} name="phone" placeholder="Phone" /><Field form={edit} setForm={setEdit} name="email" placeholder="Email" /><Field form={edit} setForm={setEdit} name="address" placeholder="Address" /><Field form={edit} setForm={setEdit} name="postcode" placeholder="Postcode" /><Field form={edit} setForm={setEdit} name="area" placeholder="Round / area" /><Field form={edit} setForm={setEdit} name="clean_price" placeholder="Clean price" type="number" /><Field form={edit} setForm={setEdit} name="frequency" placeholder="Frequency" /><Field form={edit} setForm={setEdit} name="next_clean_date" placeholder="Next clean" type="date" /><Field form={edit} setForm={setEdit} name="amount_owed" placeholder="Amount owed" type="number" /><Field form={edit} setForm={setEdit} name="access_notes" placeholder="Access notes" /><Field form={edit} setForm={setEdit} name="notes" placeholder="Notes" /><select aria-label="Customer status" value={edit.status || 'Active'} onChange={e => setEdit({ ...edit, status: e.target.value })}><option>Active</option><option>Paused</option><option>Inactive</option></select></div><div className="editorActions"><button onClick={async () => { if (await saveCustomer(edit)) setEditing(false); }}>Save customer</button><button className="small" onClick={() => { setEdit(c); setEditing(false); }}>Cancel</button></div></article>;
  return <article className="row"><div><strong>{c.name}</strong><span>{c.address} {c.postcode}</span><span>{c.phone} {c.email}</span><span>{c.area && `${c.area} · `}{c.frequency}{c.next_clean_date && ` · Next ${c.next_clean_date.slice(0,10)}`}</span>{c.notes && <span>{c.notes}</span>}</div><StatusBadge value={c.status} /><b>{Number(c.amount_owed) > 0 ? `£${Number(c.amount_owed).toFixed(2)}` : ''}</b><div className="compactActions"><button onClick={() => openCustomer?.(c.id)}>History</button><button className="small" onClick={() => setEditing(true)}>Edit</button></div></article>;
}
function JobList({ jobs, updateJob, empty = 'No jobs found.' }) { return <div className="tableList">{jobs.length ? jobs.map(j => <article className="row" key={j.id}><div><strong>{j.job_date?.slice(0,10)} · {j.customer_name}</strong><span>{j.address}</span><span>{j.notes}</span></div><StatusBadge value={j.status} /><b>£{Number(j.price || 0).toFixed(2)}</b><div className="compactActions"><button onClick={() => updateJob(j, 'Done')}>Done</button><button className="small" onClick={() => updateJob(j, 'Skipped')}>Skip</button></div></article>) : <p className="emptyState">{empty}</p>}</div>; }
function MoneyList({ customers, saveCustomer, openCustomer }) { return <div className="tableList">{customers.filter(c => Number(c.amount_owed) > 0).map(c => <CustomerRow key={c.id} c={c} saveCustomer={saveCustomer} openCustomer={openCustomer} />)}</div>; }
function LeadList({ leads, updateLeadStatus, saveLead, convertLead, leadMatch }) { return <div className="tableList">{leads.length ? leads.map(l => <LeadRow key={l.id} lead={l} updateLeadStatus={updateLeadStatus} saveLead={saveLead} convertLead={convertLead} match={leadMatch(l)} />) : <p className="emptyState">No leads match this filter.</p>}</div>; }
function LeadRow({ lead, updateLeadStatus, saveLead, convertLead, match }) { const [edit, setEdit] = useState(lead); useEffect(() => setEdit(lead), [lead]); return <article className="row leadRow"><div><strong>{lead.name} · {lead.phone}</strong><span>{lead.address} {lead.postcode}</span><span>{lead.message}</span>{match && <span className="badge">Existing customer/contact: {match.name}</span>}</div><StatusBadge value={lead.status} /><div className="leadDetails"><label>Follow up <input type="date" value={edit.follow_up_date?.slice(0,10) || ''} onChange={e => setEdit({ ...edit, follow_up_date: e.target.value })} /></label><label>Quote £ <input type="number" value={edit.quoted_amount || ''} onChange={e => setEdit({ ...edit, quoted_amount: e.target.value })} /></label><button className="small" onClick={() => saveLead(edit)}>Save details</button></div><div className="rowActions"><a className="actionLink" href={`tel:${lead.phone}`}>Call</a><a className="actionLink" href={`https://wa.me/${cleanPhone(lead.phone).replace(/^0/, '44')}`} target="_blank" rel="noreferrer">WhatsApp</a><button onClick={() => updateLeadStatus(lead.id, 'Contacted')}>Contacted</button><button onClick={() => convertLead(lead.id)}>{match ? 'Mark existing' : 'Add as customer'}</button><button className="dangerButton" onClick={() => updateLeadStatus(lead.id, 'Lost / Not interested')}>Lost</button></div></article>; }
function LeadFilters({ value, onChange }) { return <div className="filterBar">{['Open','Follow-ups due','Won','Lost','All'].map(item => <button key={item} className={value === item ? 'active' : 'small'} onClick={() => onChange(item)}>{item}</button>)}</div>; }
function PaymentForm({ form, setForm, customers, onSubmit }) { return <form className="paymentForm" onSubmit={onSubmit}><h3>Record payment</h3><select required value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}><option value="">Choose customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} · owes £{Number(c.amount_owed).toFixed(2)}</option>)}</select><input required min="0.01" step="0.01" type="number" placeholder="Amount" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /><select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}><option>Bank transfer</option><option>Cash</option><option>Card</option><option>Other</option></select><input type="date" value={form.paid_at} onChange={e => setForm({ ...form, paid_at: e.target.value })} /><input placeholder="Payment notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /><button>Record payment</button></form>; }
function PaymentList({ payments }) { return <div className="tableList">{payments.length ? payments.map(p => <article className="row" key={p.id}><div><strong>{p.customer_name}</strong><span>{p.paid_at?.slice(0,10)} · {p.method}</span><span>{p.notes}</span></div><b className="paidAmount">+£{Number(p.amount).toFixed(2)}</b></article>) : <p className="emptyState">No payments recorded yet.</p>}</div>; }
function CustomerHistory({ data, close, setPayment, goPayments }) { const { customer, jobs, payments } = data; return <section className="historyPanel"><div className="listHeading"><div><p className="eyebrow">Customer record</p><h3>{customer.name}</h3></div><button className="small" onClick={close}>Close</button></div><div className="historySummary"><span>Balance <strong>£{Number(customer.amount_owed).toFixed(2)}</strong></span><span>Jobs <strong>{jobs.length}</strong></span><span>Payments <strong>{payments.length}</strong></span></div><div className="contactActions">{customer.phone && <a className="actionLink" href={`tel:${customer.phone}`}>Call</a>}{customer.email && <a className="actionLink" href={`mailto:${customer.email}`}>Email</a>}<button onClick={() => { setPayment(form => ({ ...form, customer_id: customer.id, amount: customer.amount_owed || '' })); goPayments(); }}>Record payment</button></div><div className="historyColumns"><div><h4>Job history</h4>{jobs.slice(0,10).map(j => <p key={j.id}><strong>{j.job_date?.slice(0,10)}</strong> · {j.status} · £{Number(j.price).toFixed(2)}</p>)}</div><div><h4>Payment history</h4>{payments.slice(0,10).map(p => <p key={p.id}><strong>{p.paid_at?.slice(0,10)}</strong> · {p.method} · £{Number(p.amount).toFixed(2)}</p>)}</div></div></section>; }
function ContactFilters({ value, onChange }) { return <div className="filterBar" aria-label="Contact filters">{['All', 'Customers', 'Leads', 'Owes money', 'Active'].map(filter => <button key={filter} className={value === filter ? 'active' : 'small'} onClick={() => onChange(filter)}>{filter}</button>)}</div>; }
function StatusBadge({ value }) { return <span className={`statusBadge status-${String(value || '').toLowerCase().replace(/[^a-z]+/g, '-')}`}>{value}</span>; }
function ContactList({ contacts, empty = 'No contacts found.' }) { return <div className="tableList">{contacts.length ? contacts.map(c => <article className="row" key={`${c.source}-${c.id}`}><div><strong>{c.name}</strong><span>{c.address} {c.postcode}</span><span>{c.phone} {c.email}</span><span>{c.notes}</span></div><span className="typeBadge">{c.source === 'customer' ? 'Customer' : 'Lead'}</span><StatusBadge value={c.status} /><b>{Number(c.amount_owed) > 0 ? `£${Number(c.amount_owed).toFixed(2)}` : ''}</b></article>) : <p className="emptyState">{empty}</p>}</div>; }

createRoot(document.getElementById('root')).render(<App />);
