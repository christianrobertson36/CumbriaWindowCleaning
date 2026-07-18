import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './admin-v5.css';
import './public-v7.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5055';
const blankCustomer = { name: '', address: '', postcode: '', email: '', phone: '', access_notes: '', notes: '', clean_price: 0, frequency: 'Monthly', amount_owed: 0, status: 'Active', next_clean_date: '', area: '' };
const today = new Date().toISOString().slice(0, 10);
const blankInvoice = { customer_id: '', customer_name: '', customer_address: '', customer_postcode: '', customer_email: '', invoice_date: today, due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0,10), reference: '', notes: 'Thank you for your business.', status: 'Draft', paid_amount: 0, items: [{ description: 'Window cleaning services', unit_cost: '', quantity: 1 }] };

function App() {
  const isAdminPage = window.location.pathname.replace(/\/+$/, '') === '/admin';
  const [lead, setLead] = useState({ name: '', phone: '', email: '', address: '', postcode: '', property_type: '', service: 'Domestic window cleaning', frequency: 'Monthly', message: '' });
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
  const [reports, setReports] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [invoiceForm, setInvoiceForm] = useState(blankInvoice);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
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
  const [plannerDate, setPlannerDate] = useState(today);
  const [notificationForm, setNotificationForm] = useState({ enabled: false, server_url: 'https://ntfy.sh', topic: '', access_token: '', token_configured: false, clear_token: false, followup_reminders: false, schedule_reminders: false, reminder_hour: 18 });

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);
  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    const matches = (...values) => values.some(value => String(value || '').toLowerCase().includes(query));
    return [
      ...customers.filter(c => matches(c.name, c.address, c.postcode, c.email, c.phone, c.notes, c.access_notes)).map(c => ({ ...c, source: 'customer' })),
      ...leads.filter(l => matches(l.name, l.address, l.postcode, l.email, l.phone, l.service, l.message)).map(l => ({ ...l, source: 'lead', notes: [l.service, l.message].filter(Boolean).join(' · '), amount_owed: 0 }))
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
      const [s, c, j, l, contactData, paymentData, notificationData, reportData, invoiceData] = await Promise.all([
        api('/admin/summary', { headers }),
        api('/admin/customers', { headers }),
        api('/admin/jobs', { headers }),
        api('/admin/leads', { headers }),
        api('/admin/contacts', { headers }),
        api('/admin/payments', { headers }),
        api('/admin/settings/notifications', { headers }),
        api('/admin/reports', { headers }),
        api('/admin/invoices', { headers })
      ]);
      setSummary(s.summary);
      setCustomers(c.customers);
      setJobs(j.jobs);
      setLeads(l.leads);
      setContacts(contactData.contacts);
      setPayments(paymentData.payments);
      setReports(reportData);
      setInvoices(invoiceData.invoices);
      setNotificationForm(current => ({ ...current, ...notificationData.settings, access_token: '', clear_token: false }));
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
      setLead({ name: '', phone: '', email: '', address: '', postcode: '', property_type: '', service: 'Domestic window cleaning', frequency: 'Monthly', message: '' });
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
    setError(''); setNotice('');
    try {
      await api(`/admin/jobs/${job.id}`, { method: 'PATCH', headers, body: JSON.stringify({ ...job, status }) });
      setNotice(status === 'Cancelled' ? 'Job cancelled.' : status === 'Planned' ? 'Job reopened.' : status === 'Done' ? 'Job completed and balance updated.' : 'Job saved.');
      await loadAdmin();
      return true;
    } catch (e) { setError(e.message); return false; }
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

  async function importCustomers(customers) {
    setError('');
    setNotice('');
    try {
      const result = await api('/admin/customers/import', { method: 'POST', headers, body: JSON.stringify({ customers }) });
      const rowWarnings = result.errors?.length ? ` ${result.errors.join(' ')}` : '';
      setNotice(`${result.message}${rowWarnings}`);
      await loadAdmin();
    } catch (e) { setError(e.message); }
  }

  async function saveLead(leadItem) {
    setError(''); setNotice('');
    try {
      await api(`/admin/leads/${leadItem.id}`, { method: 'PATCH', headers, body: JSON.stringify(leadItem) });
      setNotice('Lead details saved.');
      await loadAdmin();
      return true;
    } catch (e) { setError(e.message); return false; }
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

  async function createInvoice(e) {
    e.preventDefault(); setError(''); setNotice('');
    try {
      const result = await api('/admin/invoices', { method: 'POST', headers, body: JSON.stringify(invoiceForm) });
      setInvoiceForm(blankInvoice); setSelectedInvoice(result.invoice); setNotice(`Invoice ${String(result.invoice.invoice_number).padStart(6,'0')} created.`); await loadAdmin();
    } catch (e) { setError(e.message); }
  }

  async function updateInvoice(invoice, changes) {
    setError('');
    try { const result = await api(`/admin/invoices/${invoice.id}`, { method: 'PATCH', headers, body: JSON.stringify(changes) }); setSelectedInvoice(current => current?.id === invoice.id ? result.invoice : current); await loadAdmin(); }
    catch (e) { setError(e.message); }
  }

  async function generateRecurring() {
    setError(''); setNotice('');
    try {
      const result = await api('/admin/jobs/generate-recurring', { method: 'POST', headers, body: JSON.stringify({ through_date: throughDate }) });
      setNotice(`${result.created} recurring job${result.created === 1 ? '' : 's'} created.`);
      await loadAdmin();
    } catch (e) { setError(e.message); }
  }

  async function sendScheduleNotification(date) {
    setError(''); setNotice('');
    try {
      const result = await api('/admin/jobs/schedule-notification', { method: 'POST', headers, body: JSON.stringify({ date }) });
      setNotice(result.message);
    } catch (e) { setError(e.message); }
  }

  async function saveNotificationSettings(e) {
    e.preventDefault(); setError(''); setNotice('');
    try {
      await api('/admin/settings/notifications', { method: 'PUT', headers, body: JSON.stringify(notificationForm) });
      setNotice('Push notification settings saved.');
      await loadAdmin();
    } catch (e) { setError(e.message); }
  }

  async function testNotification() {
    setError(''); setNotice('');
    try {
      const result = await api('/admin/settings/notifications/test', { method: 'POST', headers });
      setNotice(result.message || 'Test notification sent.');
    } catch (e) { setError(e.message); }
  }

  async function runReminders() {
    setError(''); setNotice('');
    try {
      const result = await api('/admin/settings/notifications/reminders/run', { method: 'POST', headers });
      setNotice(result.message);
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

  async function downloadBackup() {
    setError('');
    try {
      const backup = await api('/admin/data/export', { headers });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      link.download = `cwc-full-backup-${today}.json`;
      link.click(); URL.revokeObjectURL(link.href);
      setNotice('Full data backup downloaded. Keep it somewhere secure.');
    } catch (e) { setError(e.message); }
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
      <a className="brandMark" href="/" aria-label="Cumbria Window Cleaning home"><span className="bucket">⌂</span><div><strong>Cumbria</strong><span>Window Cleaning</span></div></a>
      {isAdminPage ? <nav><a href="/">View public website</a></nav> : <nav><a href="#services">Services</a><a className="navQuote" href="#quote">Get a free quote</a></nav>}
    </header>

    <main className={isAdminPage ? 'adminPage' : ''}>
      {!isAdminPage && <>
      <section className="hero">
        <div>
          <p className="eyebrow">Local · Reliable · Professional</p>
          <h1>Clearer windows, without the hassle.</h1>
          <p className="heroText">Reliable domestic and commercial window cleaning across Cumbria, with regular rounds and one-off cleans available.</p>
          <div className="heroActions"><a className="button primaryCta" href="#quote">Get my free quote <span>→</span></a><a className="button ghost" href="#services">Explore services</a></div>
          <div className="trustRow"><span>✓ Fully insured</span><span>✓ Easy quote requests</span><span>✓ Regular or one-off cleans</span><span>✓ Homes, shops and offices</span></div>
        </div>
        <div className="heroCard">
          <span className="heroCardLabel">Now taking enquiries</span>
          <h3>Window cleaning that fits around you.</h3>
          <p>Tell us what you need and we’ll get back to you with a straightforward quote.</p>
          <ul><li>Domestic properties</li><li>Commercial premises</li><li>Regular cleaning rounds</li><li>One-off cleans and extras</li></ul>
          <a href="#quote">Check availability <span>→</span></a>
        </div>
        <img className="heroVan" src="/ford-transit-branded.png" alt="Cumbria Window Cleaning Ford Transit van" />
      </section>

      <section id="services" className="servicesSection">
        <div className="sectionIntro"><p className="eyebrow">What we can help with</p><h2>A cleaner finish, inside and out.</h2><p>Flexible local services for homes and businesses across Cumbria.</p></div>
        <div className="section cards">
        {[
          ['Domestic window cleaning','Dependable cleaning for homes of every size.','/services/domestic-window-cleaning.png','Professional domestic window cleaning'],
          ['Commercial window cleaning','A professional finish for shops, offices and premises.','/services/commercial-window-cleaning.png','Clean commercial shopfront windows'],
          ['Regular cleaning rounds','Choose a schedule that keeps your windows looking their best.','/services/regular-rounds.png','Regular window cleaning rounds in Cumbria'],
          ['Carpet cleaning','Refresh carpets in homes, offices and commercial premises.','/services/carpet-cleaning.png','Professional carpet cleaning'],
          ['Conservatories and extras','Ask about conservatories, fascias and additional cleaning.','/services/conservatory-extras.png','Conservatory and exterior cleaning']
        ].map(([title, copy, image, alt], index) => <article className="card" key={title}><img className="serviceImage" src={image} alt={alt} loading="lazy" /><div className="serviceCardBody"><span className="serviceNumber">0{index + 1}</span><h3>{title}</h3><p>{copy}</p><a href="#quote">Request a quote →</a></div></article>)}
        </div>
      </section>

      <section className="whySection">
        <div className="sectionIntro"><p className="eyebrow">Simple from start to finish</p><h2>A cleaning service built around you.</h2><p>Clear communication, flexible options and a professional finish for every property.</p></div>
        <div className="whyGrid">
          <article><span>01</span><h3>Fully insured</h3><p>Work is carried out with full insurance cover for extra reassurance at your home or business.</p></article>
          <article><span>02</span><h3>Easy to arrange</h3><p>Send your details online and we’ll get back to you with availability and a straightforward quote.</p></article>
          <article><span>03</span><h3>Flexible visits</h3><p>Choose regular rounds or ask about a one-off clean when your property needs extra attention.</p></article>
          <article><span>04</span><h3>More than windows</h3><p>Ask about carpets, conservatories, fascias and other exterior cleaning requirements.</p></article>
        </div>
      </section>

      <section className="coverageSection">
        <div><p className="eyebrow">Areas covered</p><h2>Local cleaning across Cumbria.</h2><p>Routes and availability vary, so send us your postcode and the service you need. We’ll confirm whether we can add your property to a regular round or arrange a one-off visit.</p></div>
        <a className="button coverageCta" href="#quote">Check my postcode <span>→</span></a>
      </section>

      <section id="faq" className="faqSection">
        <div className="sectionIntro"><p className="eyebrow">Good to know</p><h2>Frequently asked questions.</h2></div>
        <div className="faqList">
          <details><summary>Are you insured?</summary><p>Yes. Cumbria Window Cleaning is fully insured for work at homes and commercial properties.</p></details>
          <details><summary>How do I get a quote?</summary><p>Complete the short form below with your address, postcode and required service. We’ll contact you about availability and pricing.</p></details>
          <details><summary>Do you offer regular and one-off cleaning?</summary><p>Yes. You can request a regular cleaning round or a one-off visit. Available options depend on your location and the service required.</p></details>
          <details><summary>Do I need to be at home?</summary><p>Not always. If safe access can be arranged, we can discuss this with you when confirming the clean.</p></details>
          <details><summary>What happens during bad weather?</summary><p>If conditions are unsuitable or unsafe, we’ll contact you about the visit and arrange the most appropriate next step.</p></details>
          <details><summary>Which cleaning services can I request?</summary><p>Domestic and commercial windows, regular rounds, carpets, conservatories, fascias and additional cleaning can all be requested through the quote form.</p></details>
        </div>
      </section>

      <section id="quote" className="section quoteSection">
        <div className="quotePanel">
        <div className="quoteIntro"><p className="eyebrow">Quick and easy</p><h2>Request a free quote</h2><p>Share a few details and we’ll get back to you about availability and pricing.</p>{leadSent && <p className="success">Thanks—your request has been sent. We’ll be in touch.</p>}</div>
        <form onSubmit={submitLead} className="formGrid quoteForm">
          <input required placeholder="Name" value={lead.name} onChange={e => setLead({ ...lead, name: e.target.value })} />
          <input required placeholder="Phone" value={lead.phone} onChange={e => setLead({ ...lead, phone: e.target.value })} />
          <input placeholder="Email" value={lead.email} onChange={e => setLead({ ...lead, email: e.target.value })} />
          <input placeholder="Postcode" value={lead.postcode} onChange={e => setLead({ ...lead, postcode: e.target.value })} />
          <input className="wide" placeholder="Address" value={lead.address} onChange={e => setLead({ ...lead, address: e.target.value })} />
          <label className="formField"><span>Service required</span><select value={lead.service} onChange={e => setLead({ ...lead, service: e.target.value })}><option>Domestic window cleaning</option><option>Commercial window cleaning</option><option>Regular cleaning round</option><option>Carpet cleaning</option><option>Conservatory cleaning</option><option>Fascias and extras</option><option>Other / not sure</option></select></label>
          <label className="formField"><span>How often?</span><select value={lead.frequency} onChange={e => setLead({ ...lead, frequency: e.target.value })}><option>Monthly</option><option>Fortnightly</option><option>One-off</option><option>Commercial quote</option><option>Not sure</option></select></label>
          <input placeholder="Property type" value={lead.property_type} onChange={e => setLead({ ...lead, property_type: e.target.value })} />
          <textarea className="wide" placeholder="Notes" value={lead.message} onChange={e => setLead({ ...lead, message: e.target.value })} />
          <button className="button wide quoteSubmit">Request my free quote <span>→</span></button>
        </form>
        <p className="privacyNote">Your details are only used to respond to your enquiry.</p>
        </div>
      </section>
      <footer className="publicFooter">
        <div className="footerBrand"><span className="footerLogo" aria-hidden="true"></span><p>Fully insured domestic and commercial cleaning services across Cumbria.</p></div>
        <div><strong>Services</strong><a href="#services">Window cleaning</a><a href="#services">Carpet cleaning</a><a href="#services">Conservatories and extras</a></div>
        <div><strong>Enquiries</strong><a href="#quote">Request a free quote</a><a href="#faq">Frequently asked questions</a></div>
        <div id="privacy"><strong>Your privacy</strong><p>Details submitted through the quote form are used only to respond to your enquiry and manage any requested service.</p></div>
        <p className="footerBottom">© {new Date().getFullYear()} Cumbria Window Cleaning</p>
      </footer>
      <a className="mobileQuoteBar" href="#quote">Get a free quote <span>→</span></a>
      </>}

      {isAdminPage && <section id="admin" className="section adminPanel">
        <div className="adminHeader"><div><p className="eyebrow">Private planner</p><h2>Admin dashboard</h2></div>{token && <button className="small" onClick={() => { localStorage.removeItem('cwc_token'); setToken(''); }}>Logout</button>}</div>
        {error && <p className="error">{error}</p>}
        {notice && <p className="success">{notice}</p>}
        {!token ? <form className="login" onSubmit={doLogin}><input value={login.email} onChange={e => setLogin({ ...login, email: e.target.value })} /><input type="password" placeholder="Password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} /><button className="button">Login</button></form> : <>
          <div className="adminSearch"><input type="search" aria-label="Search all customers, contacts and leads" placeholder="Search customers, contacts and leads..." value={search} onChange={e => setSearch(e.target.value)} />{search && <button className="small" onClick={() => setSearch('')}>Clear</button>}</div>
          <div className="adminTools"><button className="small" onClick={exportCsv}>Export contacts CSV</button></div>
          <div className="tabs">{['dashboard','today','customers','planner','payments','invoices','leads','contacts','reports','settings'].map(t => <button className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t}>{t}</button>)}</div>
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
          {tab === 'contacts' && <><CustomerImport onImport={importCustomers} /><CustomerForm form={customerForm} setForm={setCustomerForm} onSubmit={addCustomer} /><ContactFilters value={contactFilter} onChange={setContactFilter} /><ContactList contacts={filterContacts(contacts, contactFilter)} empty="No contacts match this filter." /></>}
          {tab === 'customers' && <>{customerHistory && <CustomerHistory data={customerHistory} close={() => setCustomerHistory(null)} setPayment={setPaymentForm} goPayments={() => setTab('payments')} />}<CustomerForm form={customerForm} setForm={setCustomerForm} onSubmit={addCustomer} /><CustomerList customers={customers} saveCustomer={saveCustomer} openCustomer={openCustomer} /></>}
          {tab === 'planner' && <PlannerWorkspace jobs={jobs} customers={customers} jobForm={jobForm} setJobForm={setJobForm} addJob={addJob} updateJob={updateJob} selectedDate={plannerDate} setSelectedDate={setPlannerDate} throughDate={throughDate} setThroughDate={setThroughDate} generateRecurring={generateRecurring} sendScheduleNotification={sendScheduleNotification} />}
          {tab === 'payments' && <><PaymentForm form={paymentForm} setForm={setPaymentForm} customers={customers} onSubmit={addPayment} /><OutstandingBalances customers={customers} setPaymentForm={setPaymentForm} openCustomer={openCustomer} setTab={setTab} /><PaymentList payments={payments} /></>}
          {tab === 'invoices' && <InvoiceWorkspace customers={customers} invoices={invoices} form={invoiceForm} setForm={setInvoiceForm} createInvoice={createInvoice} selected={selectedInvoice} setSelected={setSelectedInvoice} updateInvoice={updateInvoice} />}
          {tab === 'leads' && <><LeadFilters value={leadFilter} onChange={setLeadFilter} /><LeadList leads={filterLeads(leads, leadFilter)} updateLeadStatus={updateLeadStatus} saveLead={saveLead} convertLead={convertLead} leadMatch={leadMatch} /></>}
          {tab === 'reports' && <Reports data={reports} />}
          {tab === 'settings' && <><NotificationSettings form={notificationForm} setForm={setNotificationForm} onSubmit={saveNotificationSettings} onTest={testNotification} onRunReminders={runReminders} /><DataTools downloadBackup={downloadBackup} exportCsv={exportCsv} /></>}
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
  if (filter === 'Quoted') return leads.filter(l => l.status === 'Quoted');
  if (filter === 'Won') return leads.filter(l => l.status === 'Won' || l.status === 'Existing customer');
  if (filter === 'Lost') return leads.filter(l => l.status === 'Lost / Not interested');
  return leads;
}
function Stat({ title, value }) { return <div className="stat"><span>{title}</span><strong>{value}</strong></div>; }
function Field({ form, setForm, name, placeholder, type = 'text' }) { return <input type={type} placeholder={placeholder} value={form[name] ?? ''} onChange={e => setForm({ ...form, [name]: e.target.value })} />; }
function CustomerForm({ form, setForm, onSubmit }) { return <form className="formGrid compact" onSubmit={onSubmit}><Field form={form} setForm={setForm} name="name" placeholder="Name" /><Field form={form} setForm={setForm} name="phone" placeholder="Phone" /><Field form={form} setForm={setForm} name="email" placeholder="Email" /><Field form={form} setForm={setForm} name="postcode" placeholder="Postcode" /><Field form={form} setForm={setForm} name="address" placeholder="Address" /><Field form={form} setForm={setForm} name="area" placeholder="Round / area" /><Field form={form} setForm={setForm} name="clean_price" placeholder="Price" type="number" /><Field form={form} setForm={setForm} name="amount_owed" placeholder="Amount owed" type="number" /><Field form={form} setForm={setForm} name="next_clean_date" placeholder="Next clean" type="date" /><Field form={form} setForm={setForm} name="access_notes" placeholder="Access notes" /><button className="button wide">Add customer/contact</button></form>; }
function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i += 1; row.push(field); if (row.some(value => value.trim())) rows.push(row); row = []; field = ''; }
    else field += char;
  }
  row.push(field); if (row.some(value => value.trim())) rows.push(row);
  if (rows.length < 2) throw new Error('CSV needs a header row and at least one customer');
  const headers = rows[0].map(value => value.trim().toLowerCase().replace(/\s+/g, '_').replace(/^\ufeff/, ''));
  if (!headers.includes('name')) throw new Error('CSV must include a name column');
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ''])));
}
function CustomerImport({ onImport }) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [localError, setLocalError] = useState('');
  async function chooseFile(event) {
    const file = event.target.files?.[0];
    setLocalError(''); setRows([]); setFileName(file?.name || '');
    if (!file) return;
    try { setRows(parseCsv(await file.text())); } catch (error) { setLocalError(error.message); }
  }
  function downloadTemplate() {
    const csv = 'name,address,postcode,email,phone,clean_price,frequency,amount_owed,access_notes,notes,status,area,next_clean_date\nExample Customer,1 Main Street,CA1 1AA,customer@example.com,07123456789,15.00,Monthly,0,Side gate,Example note,Active,Carlisle,2026-08-01\n';
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'cwc-customer-import-template.csv'; link.click(); URL.revokeObjectURL(link.href);
  }
  return <section className="csvImport"><div><strong>Import customer contacts</strong><p>Upload a CSV with customer details, price and Weekly or Monthly frequency. Existing matching email addresses or phone numbers are skipped.</p></div><div className="csvActions"><button type="button" className="small" onClick={downloadTemplate}>Download CSV template</button><label className="fileButton">Choose CSV<input type="file" accept=".csv,text/csv" onChange={chooseFile} /></label>{rows.length > 0 && <button type="button" onClick={() => onImport(rows)}>Import {rows.length} customer{rows.length === 1 ? '' : 's'}</button>}</div>{fileName && <span className="csvFile">{fileName}{rows.length ? ` · ${rows.length} rows ready` : ''}</span>}{localError && <p className="error">{localError}</p>}</section>;
}
function CustomerList({ customers, saveCustomer, openCustomer }) { return <div className="tableList">{customers.map(c => <CustomerRow key={c.id} c={c} saveCustomer={saveCustomer} openCustomer={openCustomer} />)}</div>; }
function CustomerRow({ c, saveCustomer, openCustomer }) {
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState(c);
  useEffect(() => setEdit(c), [c]);
  if (editing) return <article className="customerEditor"><div className="formGrid"><Field form={edit} setForm={setEdit} name="name" placeholder="Name" /><Field form={edit} setForm={setEdit} name="phone" placeholder="Phone" /><Field form={edit} setForm={setEdit} name="email" placeholder="Email" /><Field form={edit} setForm={setEdit} name="address" placeholder="Address" /><Field form={edit} setForm={setEdit} name="postcode" placeholder="Postcode" /><Field form={edit} setForm={setEdit} name="area" placeholder="Round / area" /><Field form={edit} setForm={setEdit} name="clean_price" placeholder="Clean price" type="number" /><Field form={edit} setForm={setEdit} name="frequency" placeholder="Frequency" /><Field form={edit} setForm={setEdit} name="next_clean_date" placeholder="Next clean" type="date" /><Field form={edit} setForm={setEdit} name="amount_owed" placeholder="Amount owed" type="number" /><Field form={edit} setForm={setEdit} name="access_notes" placeholder="Access notes" /><Field form={edit} setForm={setEdit} name="notes" placeholder="Notes" /><select aria-label="Customer status" value={edit.status || 'Active'} onChange={e => setEdit({ ...edit, status: e.target.value })}><option>Active</option><option>Paused</option><option>Inactive</option></select></div><div className="editorActions"><button onClick={async () => { if (await saveCustomer(edit)) setEditing(false); }}>Save customer</button><button className="small" onClick={() => { setEdit(c); setEditing(false); }}>Cancel</button></div></article>;
  return <article className="row"><div><strong>{c.name}</strong><span>{c.address} {c.postcode}</span><span>{c.phone} {c.email}</span><span>{c.area && `${c.area} · `}{c.frequency}{c.next_clean_date && ` · Next ${c.next_clean_date.slice(0,10)}`}</span>{c.notes && <span>{c.notes}</span>}</div><StatusBadge value={c.status} /><b>{Number(c.amount_owed) > 0 ? `£${Number(c.amount_owed).toFixed(2)}` : ''}</b><div className="compactActions"><button onClick={() => openCustomer?.(c.id)}>History</button><button className="small" onClick={() => setEditing(true)}>Edit</button></div></article>;
}
function PlannerWorkspace({ jobs, customers, jobForm, setJobForm, addJob, updateJob, selectedDate, setSelectedDate, throughDate, setThroughDate, generateRecurring, sendScheduleNotification }) {
  const [month, setMonth] = useState(selectedDate.slice(0, 7));
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('All areas');
  const dayJobs = jobs.filter(job => job.job_date?.slice(0, 10) === selectedDate);
  const areas = [...new Set(jobs.map(job => job.area).filter(Boolean))].sort();
  const filtered = dayJobs.filter(job => (area === 'All areas' || job.area === area) && [job.customer_name, job.address, job.postcode, job.phone, job.notes, job.area].some(value => String(value || '').toLowerCase().includes(query.toLowerCase())));
  function changeMonth(offset) {
    const cursor = new Date(`${month}-01T12:00:00`); cursor.setMonth(cursor.getMonth() + offset);
    setMonth(cursor.toISOString().slice(0, 7));
  }
  function chooseDate(date) { setSelectedDate(date); setJobForm(current => ({ ...current, job_date: date })); }
  return <section className="plannerWorkspace">
    <div className="plannerTools"><form className="inlineForm" onSubmit={addJob}><select required value={jobForm.customer_id} onChange={e => setJobForm({ ...jobForm, customer_id: e.target.value })}><option value="">Choose customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.area ? ` · ${c.area}` : ''}</option>)}</select><input type="date" value={jobForm.job_date} onChange={e => { setJobForm({ ...jobForm, job_date: e.target.value }); setSelectedDate(e.target.value); }} /><input placeholder="Job notes" value={jobForm.notes} onChange={e => setJobForm({ ...jobForm, notes: e.target.value })} /><button>Add job</button></form><div className="recurringTool"><label>Generate recurring jobs through <input type="date" value={throughDate} onChange={e => setThroughDate(e.target.value)} /></label><button onClick={generateRecurring}>Generate</button></div></div>
    <div className="plannerGrid"><MonthCalendar month={month} jobs={jobs} selectedDate={selectedDate} chooseDate={chooseDate} previous={() => changeMonth(-1)} next={() => changeMonth(1)} /><div className="roundPanel"><div className="roundHeading"><div><p className="eyebrow">Daily round</p><h3>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3></div><span>{filtered.length} jobs · £{filtered.reduce((sum, job) => sum + Number(job.price || 0), 0).toFixed(2)}</span></div><div className="roundFilters"><input type="search" placeholder="Search this round..." value={query} onChange={e => setQuery(e.target.value)} /><select value={area} onChange={e => setArea(e.target.value)}><option>All areas</option>{areas.map(value => <option key={value}>{value}</option>)}</select><button className="small" onClick={() => window.print()}>Print work sheet</button><button className="small" onClick={() => sendScheduleNotification(selectedDate)}>Send to phone</button></div><RoundSheet jobs={filtered} updateJob={updateJob} date={selectedDate} /></div></div>
  </section>;
}
function MonthCalendar({ month, jobs, selectedDate, chooseDate, previous, next }) {
  const first = new Date(`${month}-01T12:00:00`);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)];
  return <aside className="monthCalendar"><div className="calendarHeading"><button className="small" onClick={previous}>←</button><strong>{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong><button className="small" onClick={next}>→</button></div><div className="weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => <span key={day}>{day}</span>)}</div><div className="calendarDays">{cells.map((date, index) => date ? <button key={date} className={`${date === selectedDate ? 'selected' : ''} ${date === today ? 'today' : ''}`} onClick={() => chooseDate(date)}><span>{Number(date.slice(-2))}</span>{jobs.some(job => job.job_date?.slice(0,10) === date) && <b>{jobs.filter(job => job.job_date?.slice(0,10) === date).length}</b>}</button> : <i key={`blank-${index}`}></i>)}</div></aside>;
}
function RoundSheet({ jobs, updateJob, date }) {
  const groups = Object.groupBy ? Object.groupBy(jobs, job => job.area || 'Unassigned area') : jobs.reduce((all, job) => ({ ...all, [job.area || 'Unassigned area']: [...(all[job.area || 'Unassigned area'] || []), job] }), {});
  if (!jobs.length) return <p className="emptyState">No jobs match this date and filter.</p>;
  return <div className="dailySheet"><div className="printHeading"><h2>Cumbria Window Cleaning</h2><p>Work sheet · {date}</p></div>{Object.entries(groups).map(([group, groupJobs]) => <section className="areaGroup" key={group}><h4>{group}<span>{groupJobs.length} jobs</span></h4>{groupJobs.map((job, index) => <RoundJob key={job.id} job={job} index={index} updateJob={updateJob} />)}</section>)}</div>;
}
function RoundJob({ job, index, updateJob }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(job);
  useEffect(() => setDraft(job), [job]);
  if (editing) return <article className="roundJob roundJobEditor"><b>{index + 1}</b><div><strong>{job.customer_name}</strong><input aria-label="Job notes" placeholder="Job notes" value={draft.notes || ''} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></div><label>Date<input type="date" value={draft.job_date?.slice(0,10) || ''} onChange={e => setDraft({ ...draft, job_date: e.target.value })} /></label><label>Price<input type="number" step="0.01" value={draft.price || 0} onChange={e => setDraft({ ...draft, price: e.target.value })} /></label><select aria-label="Job status" value={draft.status || 'Planned'} onChange={e => setDraft({ ...draft, status: e.target.value })}><option>Planned</option><option>Done</option><option>Skipped</option><option>Cancelled</option></select><div className="compactActions"><button onClick={async () => { if (await updateJob(draft, draft.status)) setEditing(false); }}>Save</button><button className="small" onClick={() => { setDraft(job); setEditing(false); }}>Cancel</button></div></article>;
  return <article className="roundJob"><b>{index + 1}</b><div><strong>{job.customer_name}</strong><span>{job.address} {job.postcode}</span><span>{job.phone}{job.notes ? ` · ${job.notes}` : ''}</span></div><span>£{Number(job.price || 0).toFixed(2)}</span><StatusBadge value={job.status} /><div className="compactActions"><button onClick={() => updateJob(job, 'Done')}>Done</button><button className="small" onClick={() => setEditing(true)}>Edit</button><button className="small" onClick={() => updateJob(job, job.status === 'Cancelled' ? 'Planned' : 'Cancelled')}>{job.status === 'Cancelled' ? 'Reopen' : 'Cancel'}</button></div></article>;
}
function JobList({ jobs, updateJob, empty = 'No jobs found.' }) { return <div className="tableList">{jobs.length ? jobs.map(j => <article className="row" key={j.id}><div><strong>{j.job_date?.slice(0,10)} · {j.customer_name}</strong><span>{j.address}</span><span>{j.notes}</span></div><StatusBadge value={j.status} /><b>£{Number(j.price || 0).toFixed(2)}</b><div className="compactActions"><button onClick={() => updateJob(j, 'Done')}>Done</button><button className="small" onClick={() => updateJob(j, 'Skipped')}>Skip</button></div></article>) : <p className="emptyState">{empty}</p>}</div>; }
function OutstandingBalances({ customers, setPaymentForm, openCustomer, setTab }) {
  const owing = customers.filter(customer => Number(customer.amount_owed) > 0).sort((a, b) => Number(b.amount_owed) - Number(a.amount_owed));
  const total = owing.reduce((sum, customer) => sum + Number(customer.amount_owed), 0);
  function reminder(customer) { return `Hi ${customer.name}, this is a friendly reminder that £${Number(customer.amount_owed).toFixed(2)} is outstanding for your cleaning service. Please get in touch if you have any questions. Thank you, Cumbria Window Cleaning.`; }
  function record(customer) { setPaymentForm(form => ({ ...form, customer_id: customer.id, amount: customer.amount_owed })); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  return <section className="outstandingPanel"><div className="listHeading"><div><p className="eyebrow">Payment follow-up</p><h3>Outstanding balances</h3></div><span>{owing.length} customers · £{total.toFixed(2)}</span></div>{owing.length ? <div className="debtList">{owing.map(customer => { const text = encodeURIComponent(reminder(customer)); const whatsapp = cleanPhone(customer.phone).replace(/^0/, '44'); return <article className="debtRow" key={customer.id}><div><strong>{customer.name}</strong><span>{customer.address} {customer.postcode}</span><span>{customer.phone} {customer.email}</span></div><b>£{Number(customer.amount_owed).toFixed(2)}</b><div className="compactActions">{customer.phone && <a className="actionLink" href={`sms:${customer.phone}?body=${text}`}>SMS reminder</a>}{customer.phone && <a className="actionLink" href={`https://wa.me/${whatsapp}?text=${text}`} target="_blank" rel="noreferrer">WhatsApp</a>}<button className="small" onClick={() => { openCustomer(customer.id); setTab('customers'); }}>Statement</button><button onClick={() => record(customer)}>Record payment</button></div></article>; })}</div> : <p className="emptyState">No outstanding customer balances.</p>}</section>;
}
function InvoiceWorkspace({ customers, invoices, form, setForm, createInvoice, selected, setSelected, updateInvoice }) {
  function chooseCustomer(id) { const customer = customers.find(item => String(item.id) === id); setForm(current => customer ? { ...current, customer_id: customer.id, customer_name: customer.name, customer_address: customer.address, customer_postcode: customer.postcode, customer_email: customer.email } : { ...current, customer_id: '' }); }
  function updateItem(index, key, value) { setForm(current => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) })); }
  function removeItem(index) { setForm(current => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) })); }
  const draftTotal = form.items.reduce((sum, item) => sum + Number(item.unit_cost || 0) * Number(item.quantity || 0), 0);
  return <section className="invoiceWorkspace">{selected && <InvoiceDocument invoice={selected} close={() => setSelected(null)} updateInvoice={updateInvoice} />}<form className="invoiceBuilder" onSubmit={createInvoice}><div className="listHeading"><div><p className="eyebrow">Commercial billing</p><h3>Create invoice</h3></div><strong>Draft total £{draftTotal.toFixed(2)}</strong></div><div className="invoiceFormGrid"><label>Choose saved customer<select value={form.customer_id} onChange={e => chooseCustomer(e.target.value)}><option value="">Enter company manually</option>{customers.map(customer => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label><label>Company / customer<input required value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></label><label>Address<input value={form.customer_address} onChange={e => setForm({ ...form, customer_address: e.target.value })} /></label><label>Postcode<input value={form.customer_postcode} onChange={e => setForm({ ...form, customer_postcode: e.target.value })} /></label><label>Accounts email<input type="email" value={form.customer_email} onChange={e => setForm({ ...form, customer_email: e.target.value })} /></label><label>Reference / PO number<input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></label><label>Invoice date<input type="date" value={form.invoice_date} onChange={e => setForm({ ...form, invoice_date: e.target.value })} /></label><label>Due date<input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></label></div><div className="invoiceItems"><div className="invoiceItemHead"><span>Description</span><span>Unit cost</span><span>Quantity</span><span>Line total</span><span></span></div>{form.items.map((item, index) => <div className="invoiceItemEdit" key={index}><input required placeholder="Service description" value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} /><input required min="0" step="0.01" type="number" placeholder="0.00" value={item.unit_cost} onChange={e => updateItem(index, 'unit_cost', e.target.value)} /><input required min="0.01" step="0.01" type="number" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} /><strong>£{(Number(item.unit_cost || 0) * Number(item.quantity || 0)).toFixed(2)}</strong><button type="button" className="small" disabled={form.items.length === 1} onClick={() => removeItem(index)}>Remove</button></div>)}<button type="button" className="small addInvoiceItem" onClick={() => setForm(current => ({ ...current, items: [...current.items, { description: '', unit_cost: '', quantity: 1 }] }))}>+ Add line item</button></div><label className="invoiceNotes">Notes<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label><button>Create and preview invoice</button></form><section className="invoiceHistory"><div className="listHeading"><h3>Invoice history</h3><span>{invoices.length} invoices</span></div>{invoices.length ? <div className="tableList">{invoices.map(invoice => <article className="invoiceHistoryRow" key={invoice.id}><div><strong>#{String(invoice.invoice_number).padStart(6,'0')} · {invoice.customer_name}</strong><span>{invoice.invoice_date?.slice(0,10)}{invoice.reference ? ` · ${invoice.reference}` : ''}</span></div><StatusBadge value={invoice.status} /><b>£{Number(invoice.total).toFixed(2)}</b><button className="small" onClick={() => setSelected(invoice)}>Open</button></article>)}</div> : <p className="emptyState">No invoices created yet.</p>}</section></section>;
}
function InvoiceDocument({ invoice, close, updateInvoice }) {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const balance = Math.max(0, Number(invoice.total) - Number(invoice.paid_amount || 0));
  const emailSubject = encodeURIComponent(`Invoice ${String(invoice.invoice_number).padStart(6,'0')} from Cumbria Window Cleaning`);
  const emailBody = encodeURIComponent(`Hello ${invoice.customer_name},\n\nPlease find invoice ${String(invoice.invoice_number).padStart(6,'0')} for £${Number(invoice.total).toFixed(2)}. The balance due is £${balance.toFixed(2)}${invoice.due_date ? ` by ${new Date(`${invoice.due_date.slice(0,10)}T12:00:00`).toLocaleDateString('en-GB')}` : ''}.\n\nThank you,\nCumbria Window Cleaning`);
  return <section className="invoiceDocument printableInvoice"><div className="invoiceTop"><span className="invoiceLogo"></span><div><a href="mailto:Melon74@hotmail.com">Melon74@hotmail.com</a><span>07938692028</span></div><address>73 Newlands Gardens<br />Workington CA14 3PG<br />United Kingdom</address></div><h2>INVOICE</h2><div className="invoiceSummary"><dl><dt>Invoice Number</dt><dd>{String(invoice.invoice_number).padStart(6,'0')}</dd><dt>Invoice Date</dt><dd>{new Date(`${invoice.invoice_date.slice(0,10)}T12:00:00`).toLocaleDateString('en-GB')}</dd>{invoice.due_date && <><dt>Due Date</dt><dd>{new Date(`${invoice.due_date.slice(0,10)}T12:00:00`).toLocaleDateString('en-GB')}</dd></>}<dt>Invoice Total</dt><dd>£{Number(invoice.total).toFixed(2)}</dd><dt>Balance Due</dt><dd>£{balance.toFixed(2)}</dd></dl><div><strong>{invoice.customer_name}</strong><span>{invoice.customer_address}</span><span>{invoice.customer_postcode}</span><span>United Kingdom</span><span>{invoice.customer_email}</span>{invoice.reference && <span>Reference: {invoice.reference}</span>}</div></div><table className="invoiceTable"><thead><tr><th>Item</th><th>Description</th><th>Unit Cost</th><th>Quantity</th><th>Line Total</th></tr></thead><tbody>{items.map((item, index) => <tr key={index}><td>{index + 1}</td><td>{item.description}</td><td>£{Number(item.unit_cost).toFixed(2)}</td><td>{item.quantity}</td><td>£{(Number(item.unit_cost) * Number(item.quantity)).toFixed(2)}</td></tr>)}</tbody></table><div className="invoiceBottom"><div>{invoice.notes && <p>{invoice.notes}</p>}<p><strong>Payment details</strong><br />Please contact Cumbria Window Cleaning if you need payment information or have a query about this invoice.</p></div><dl><dt>Net</dt><dd>£{Number(invoice.subtotal).toFixed(2)}</dd><dt>Subtotal</dt><dd>£{Number(invoice.subtotal).toFixed(2)}</dd><dt>Total</dt><dd>£{Number(invoice.total).toFixed(2)}</dd><dt>Paid to Date</dt><dd>£{Number(invoice.paid_amount || 0).toFixed(2)}</dd><dt>Balance Due</dt><dd>£{balance.toFixed(2)}</dd></dl></div><div className="invoiceActions noPrint"><button onClick={() => window.print()}>Print / save PDF</button>{invoice.customer_email && <a className="actionLink" href={`mailto:${invoice.customer_email}?subject=${emailSubject}&body=${emailBody}`}>Email details</a>}<button className="small" onClick={() => updateInvoice(invoice, { status: 'Sent' })}>Mark sent</button><button className="small" onClick={() => updateInvoice(invoice, { status: 'Paid', paid_amount: invoice.total })}>Mark paid</button><button className="small" onClick={close}>Close</button></div></section>;
}
function LeadList({ leads, updateLeadStatus, saveLead, convertLead, leadMatch }) { return <div className="tableList">{leads.length ? leads.map(l => <LeadRow key={l.id} lead={l} updateLeadStatus={updateLeadStatus} saveLead={saveLead} convertLead={convertLead} match={leadMatch(l)} />) : <p className="emptyState">No leads match this filter.</p>}</div>; }
function LeadRow({ lead, updateLeadStatus, saveLead, convertLead, match }) {
  const [edit, setEdit] = useState(lead); const [showQuote, setShowQuote] = useState(false);
  useEffect(() => setEdit(lead), [lead]);
  const quoteMessage = encodeURIComponent(`Hi ${lead.name}, your quote from Cumbria Window Cleaning is £${Number(edit.quoted_amount || 0).toFixed(2)} for ${lead.service || 'cleaning'}.${edit.quote_valid_until ? ` This quote is valid until ${new Date(`${edit.quote_valid_until.slice(0,10)}T12:00:00`).toLocaleDateString('en-GB')}.` : ''} Please get in touch if you would like to go ahead. Thank you.`);
  const whatsapp = cleanPhone(lead.phone).replace(/^0/, '44');
  async function markQuoted() { const sent = { ...edit, status: 'Quoted', quote_sent_at: new Date().toISOString() }; if (await saveLead(sent)) setEdit(sent); }
  return <article className="row leadRow"><div><strong>{lead.name} · {lead.phone}</strong><span>{lead.service || 'Window cleaning'} · {lead.address} {lead.postcode}</span><span>{lead.message}</span>{Number(lead.quoted_amount) > 0 && <span className="quoteSummary">Quote £{Number(lead.quoted_amount).toFixed(2)}{lead.quote_valid_until ? ` · valid to ${lead.quote_valid_until.slice(0,10)}` : ''}</span>}{match && <span className="badge">Existing customer/contact: {match.name}</span>}</div><StatusBadge value={lead.status} /><div className="leadDetails quoteFields"><label>Follow up<input type="date" value={edit.follow_up_date?.slice(0,10) || ''} onChange={e => setEdit({ ...edit, follow_up_date: e.target.value })} /></label><label>Quote £<input type="number" min="0" step="0.01" value={edit.quoted_amount || ''} onChange={e => setEdit({ ...edit, quoted_amount: e.target.value })} /></label><label>Valid until<input type="date" value={edit.quote_valid_until?.slice(0,10) || ''} onChange={e => setEdit({ ...edit, quote_valid_until: e.target.value })} /></label><label className="quoteNotes">Quote scope / notes<textarea value={edit.quote_notes || ''} onChange={e => setEdit({ ...edit, quote_notes: e.target.value })} placeholder="Work included, frequency or conditions" /></label><button className="small" onClick={() => saveLead(edit)}>Save draft</button><button onClick={markQuoted}>Mark quoted</button></div><div className="rowActions"><a className="actionLink" href={`tel:${lead.phone}`}>Call</a>{Number(edit.quoted_amount) > 0 && lead.phone && <a className="actionLink" href={`sms:${lead.phone}?body=${quoteMessage}`}>SMS quote</a>}{Number(edit.quoted_amount) > 0 && lead.phone && <a className="actionLink" href={`https://wa.me/${whatsapp}?text=${quoteMessage}`} target="_blank" rel="noreferrer">WhatsApp quote</a>}{Number(edit.quoted_amount) > 0 && <button className="small" onClick={() => setShowQuote(true)}>View / print quote</button>}<button onClick={() => updateLeadStatus(lead.id, 'Contacted')}>Contacted</button><button onClick={() => convertLead(lead.id)}>{match ? 'Mark existing' : 'Add as customer'}</button><button className="dangerButton" onClick={() => updateLeadStatus(lead.id, 'Lost / Not interested')}>Lost</button></div>{showQuote && <QuoteDocument lead={{ ...lead, ...edit }} close={() => setShowQuote(false)} />}</article>;
}
function QuoteDocument({ lead, close }) { return <section className="quoteDocument printableQuote"><div className="quoteDocumentHeader"><span className="statementLogo"></span><div><strong>QUOTATION</strong><span>Date: {new Date().toLocaleDateString('en-GB')}</span>{lead.quote_valid_until && <span>Valid until: {new Date(`${lead.quote_valid_until.slice(0,10)}T12:00:00`).toLocaleDateString('en-GB')}</span>}</div></div><div className="quoteCustomer"><p>Prepared for</p><h3>{lead.name}</h3><span>{lead.address} {lead.postcode}</span><span>{lead.phone} {lead.email}</span></div><div className="quoteService"><div><span>Service</span><strong>{lead.service || 'Cleaning service'}</strong></div><b>£{Number(lead.quoted_amount || 0).toFixed(2)}</b></div>{lead.quote_notes && <div className="quoteScope"><strong>Work included</strong><p>{lead.quote_notes}</p></div>}<p className="quoteTerms">Please contact Cumbria Window Cleaning to accept this quotation and arrange a suitable date. Any changes to the requested work may affect the final price.</p><p className="statementFooter">Cumbria Window Cleaning · Fully insured domestic and commercial cleaning</p><div className="settingsActions noPrint"><button onClick={() => window.print()}>Print quote</button><button className="small" onClick={close}>Close</button></div></section>; }
function LeadFilters({ value, onChange }) { return <div className="filterBar">{['Open','Follow-ups due','Quoted','Won','Lost','All'].map(item => <button key={item} className={value === item ? 'active' : 'small'} onClick={() => onChange(item)}>{item}</button>)}</div>; }
function PaymentForm({ form, setForm, customers, onSubmit }) { return <form className="paymentForm" onSubmit={onSubmit}><h3>Record payment</h3><select required value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}><option value="">Choose customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} · owes £{Number(c.amount_owed).toFixed(2)}</option>)}</select><input required min="0.01" step="0.01" type="number" placeholder="Amount" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /><select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}><option>Bank transfer</option><option>Cash</option><option>Card</option><option>Other</option></select><input type="date" value={form.paid_at} onChange={e => setForm({ ...form, paid_at: e.target.value })} /><input placeholder="Payment notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /><button>Record payment</button></form>; }
function PaymentList({ payments }) { return <div className="tableList">{payments.length ? payments.map(p => <article className="row" key={p.id}><div><strong>{p.customer_name}</strong><span>{p.paid_at?.slice(0,10)} · {p.method}</span><span>{p.notes}</span></div><b className="paidAmount">+£{Number(p.amount).toFixed(2)}</b></article>) : <p className="emptyState">No payments recorded yet.</p>}</div>; }
function CustomerHistory({ data, close, setPayment, goPayments }) { const { customer, jobs, payments } = data; return <section className="historyPanel printableStatement"><div className="statementPrintHeader"><span className="statementLogo"></span><div><strong>Customer statement</strong><span>{new Date().toLocaleDateString('en-GB')}</span></div></div><div className="listHeading"><div><p className="eyebrow">Customer record</p><h3>{customer.name}</h3><span>{customer.address} {customer.postcode}</span></div><button className="small noPrint" onClick={close}>Close</button></div><div className="historySummary"><span>Balance <strong>£{Number(customer.amount_owed).toFixed(2)}</strong></span><span>Jobs <strong>{jobs.length}</strong></span><span>Payments <strong>{payments.length}</strong></span></div><div className="contactActions noPrint">{customer.phone && <a className="actionLink" href={`tel:${customer.phone}`}>Call</a>}{customer.email && <a className="actionLink" href={`mailto:${customer.email}`}>Email</a>}<button onClick={() => window.print()}>Print statement</button><button onClick={() => { setPayment(form => ({ ...form, customer_id: customer.id, amount: customer.amount_owed || '' })); goPayments(); }}>Record payment</button></div><div className="historyColumns"><div><h4>Job history</h4>{jobs.slice(0,20).map(j => <p key={j.id}><strong>{j.job_date?.slice(0,10)}</strong> · {j.status} · £{Number(j.price).toFixed(2)}</p>)}</div><div><h4>Payment history</h4>{payments.slice(0,20).map(p => <p key={p.id}><strong>{p.paid_at?.slice(0,10)}</strong> · {p.method} · £{Number(p.amount).toFixed(2)}</p>)}</div></div><p className="statementFooter">Cumbria Window Cleaning · Fully insured domestic and commercial cleaning</p></section>; }
function Reports({ data }) {
  if (!data) return <p className="emptyState">Loading reports...</p>;
  const maxRevenue = Math.max(1, ...data.months.map(month => Number(month.revenue)));
  const maxService = Math.max(1, ...data.lead_services.map(service => Number(service.count)));
  return <section className="reportsPage"><div className="reportStats"><Stat title="Revenue · 30 days" value={`£${Number(data.summary.revenue_30_days).toFixed(2)}`} /><Stat title="Active customers" value={data.summary.active_customers} /><Stat title="Lead conversion" value={`${data.summary.conversion_rate}%`} /><Stat title="Outstanding" value={`£${Number(data.summary.outstanding).toFixed(2)}`} /></div><div className="reportGrid"><article className="reportCard revenueReport"><div className="listHeading"><div><p className="eyebrow">Cash received</p><h3>Revenue by month</h3></div><span>Last 12 months</span></div><div className="revenueChart">{data.months.map(month => <div className="revenueColumn" key={month.month}><span>£{Math.round(Number(month.revenue))}</span><i style={{ height: `${Math.max(3, (Number(month.revenue) / maxRevenue) * 100)}%` }}></i><b>{month.label}</b></div>)}</div></article><article className="reportCard"><p className="eyebrow">Work completed</p><h3>Monthly job totals</h3><div className="metricList">{data.months.slice(-6).reverse().map(month => <div key={month.month}><span>{month.label}</span><strong>{month.completed_jobs} jobs</strong><b>£{Number(month.completed_value).toFixed(2)}</b></div>)}</div></article><article className="reportCard serviceReport"><p className="eyebrow">Lead demand</p><h3>Enquiries by service</h3>{data.lead_services.length ? data.lead_services.map(service => <div className="serviceMetric" key={service.service}><div><span>{service.service}</span><b>{service.count}</b></div><i><em style={{ width: `${(Number(service.count) / maxService) * 100}%` }}></em></i></div>) : <p className="emptyState">No lead data yet.</p>}</article></div></section>;
}
function NotificationSettings({ form, setForm, onSubmit, onTest, onRunReminders }) { return <section className="settingsPanel"><div><p className="eyebrow">Phone alerts</p><h3>Push notifications and reminders</h3><p>Receive new quote requests immediately, plus optional daily reminders for follow-ups and tomorrow’s work.</p></div><form onSubmit={onSubmit} className="settingsForm"><label className="toggleRow"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /><span>Enable phone notifications</span></label><label>Notification server<input required value={form.server_url} onChange={e => setForm({ ...form, server_url: e.target.value })} placeholder="https://ntfy.sh" /></label><label>Private topic name<input required={form.enabled} value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="cwc-long-random-private-topic" /></label><label>Access token {form.token_configured && <span className="configuredBadge">Saved</span>}<input type="password" value={form.access_token} onChange={e => setForm({ ...form, access_token: e.target.value, clear_token: false })} placeholder={form.token_configured ? 'Leave blank to keep saved token' : 'Optional for protected topics'} /></label>{form.token_configured && <label className="toggleRow"><input type="checkbox" checked={form.clear_token} onChange={e => setForm({ ...form, clear_token: e.target.checked })} /><span>Remove saved access token</span></label>}<div className="reminderOptions"><strong>Automatic daily reminders</strong><label className="toggleRow"><input type="checkbox" checked={form.followup_reminders} onChange={e => setForm({ ...form, followup_reminders: e.target.checked })} /><span>Lead follow-ups that are due</span></label><label className="toggleRow"><input type="checkbox" checked={form.schedule_reminders} onChange={e => setForm({ ...form, schedule_reminders: e.target.checked })} /><span>Tomorrow’s cleaning schedule</span></label><label>Send after this hour (UK time)<select value={form.reminder_hour} onChange={e => setForm({ ...form, reminder_hour: Number(e.target.value) })}>{[...Array(24)].map((_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2,'0')}:00</option>)}</select></label></div><div className="settingsActions"><button>Save settings</button><button type="button" className="small" onClick={onTest}>Send test</button><button type="button" className="small" onClick={onRunReminders}>Run reminders now</button></div></form><aside className="settingsHelp"><strong>Phone setup</strong><ol><li>Install the ntfy app from your phone’s app store.</li><li>Subscribe to the exact topic entered above.</li><li>Save these settings, then press Send test.</li></ol><p>Each automatic reminder runs at most once per UK calendar day, including after the API restarts.</p></aside></section>; }
function DataTools({ downloadBackup, exportCsv }) { return <section className="dataTools"><div><p className="eyebrow">Data safety</p><h3>Backups and exports</h3><p>Download a full JSON backup containing customers, leads, jobs, payments and invoices. Notification access tokens are never included.</p></div><div className="settingsActions"><button onClick={downloadBackup}>Download full backup</button><button className="small" onClick={exportCsv}>Export contacts CSV</button></div><p className="backupWarning">Store backups securely because they contain customer contact details.</p></section>; }
function ContactFilters({ value, onChange }) { return <div className="filterBar" aria-label="Contact filters">{['All', 'Customers', 'Leads', 'Owes money', 'Active'].map(filter => <button key={filter} className={value === filter ? 'active' : 'small'} onClick={() => onChange(filter)}>{filter}</button>)}</div>; }
function StatusBadge({ value }) { return <span className={`statusBadge status-${String(value || '').toLowerCase().replace(/[^a-z]+/g, '-')}`}>{value}</span>; }
function ContactList({ contacts, empty = 'No contacts found.' }) { return <div className="tableList">{contacts.length ? contacts.map(c => <article className="row" key={`${c.source}-${c.id}`}><div><strong>{c.name}</strong><span>{c.address} {c.postcode}</span><span>{c.phone} {c.email}</span><span>{c.notes}</span></div><span className="typeBadge">{c.source === 'customer' ? 'Customer' : 'Lead'}</span><StatusBadge value={c.status} /><b>{Number(c.amount_owed) > 0 ? `£${Number(c.amount_owed).toFixed(2)}` : ''}</b></article>) : <p className="emptyState">{empty}</p>}</div>; }

createRoot(document.getElementById('root')).render(<App />);
