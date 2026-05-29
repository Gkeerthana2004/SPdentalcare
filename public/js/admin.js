function getLocal(k) {
  try { return JSON.parse(localStorage.getItem('pd_' + k) || '[]'); } catch { return []; }
}
function setLocal(k, v) {
  localStorage.setItem('pd_' + k, JSON.stringify(v));
}

function debounce(fn, ms) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

const debouncedRenderAppointments = debounce(() => renderAppointments(), 300);
const debouncedRenderPatients = debounce(() => renderPatients(), 300);
const debouncedRenderOrtho = debounce(() => renderOrtho(), 300);

function selectRole(el, role) {
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function togglePasswordVisibility() {
  const inp = document.getElementById('loginPass');
  const btn = document.querySelector('.login-pass-toggle');
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
  } else {
    inp.type = 'password';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  }
}

function mergeById(localItems, remoteItems) {
  const map = new Map();
  for (const item of localItems) map.set(item.id, item);
  for (const item of remoteItems) map.set(item.id, item);
  return Array.from(map.values());
}

const DB = {
  async get(k) {
    const localData = getLocal(k);
    if (SupabaseDB.isConfigured() && k !== 'opg_reports') {
      try {
        let supabaseData = [];
        switch(k) {
          case 'patients': supabaseData = await SupabaseDB.getPatients(); break;
          case 'appointments': supabaseData = await SupabaseDB.getAppointments(); break;
          case 'ortho': supabaseData = await SupabaseDB.getOrthodontics(); break;
        }
        return mergeById(localData, supabaseData);
      } catch (e) {
        console.warn('DB.get Supabase error, using local:', e);
      }
    }
    return localData;
  },

  async push(k, item) {
    const localData = getLocal(k);
    localData.unshift(item);
    setLocal(k, localData);
    if (SupabaseDB.isConfigured() && k !== 'opg_reports') {
      try {
        switch(k) {
          case 'patients': return await SupabaseDB.addPatient(item);
          case 'appointments': return await SupabaseDB.addAppointment(item);
          case 'ortho': return await SupabaseDB.addOrthodonticCase(item);
        }
      } catch (e) {
        console.warn('DB.push Supabase error, saved locally:', e);
      }
    }
    return item;
  },

  async update(k, id, changes) {
    const localData = getLocal(k);
    const idx = localData.findIndex(x => x.id === id);
    if (idx >= 0) {
      Object.assign(localData[idx], changes);
      setLocal(k, localData);
    }
    if (SupabaseDB.isConfigured()) {
      try {
        switch(k) {
          case 'patients': await SupabaseDB.updatePatient(id, changes); break;
          case 'appointments': await SupabaseDB.updateAppointment(id, changes); break;
          case 'ortho': await SupabaseDB.updateOrthodonticCase(id, changes); break;
        }
      } catch (e) {
        console.warn('DB.update Supabase error:', e);
      }
    }
  },

  async delete(k, id) {
    let localData = getLocal(k);
    localData = localData.filter(x => x.id !== id);
    setLocal(k, localData);
    if (SupabaseDB.isConfigured() && k !== 'opg_reports') {
      try {
        switch(k) {
          case 'patients': await SupabaseDB.deletePatient(id); break;
          case 'appointments': await SupabaseDB.deleteAppointment(id); break;
          case 'ortho': await SupabaseDB.deleteOrthodonticCase(id); break;
        }
      } catch (e) {
        console.warn('DB.delete Supabase error:', e);
      }
    }
  },

  async set(k, v) {
    setLocal(k, v);
    if (SupabaseDB.isConfigured() && Array.isArray(v) && k !== 'opg_reports') {
      for (const item of v) {
        if (!item.id) continue;
        try {
          switch(k) {
            case 'patients': await SupabaseDB.addPatient(item).catch(() => SupabaseDB.updatePatient(item.id, item)); break;
            case 'appointments': await SupabaseDB.addAppointment(item).catch(() => SupabaseDB.updateAppointment(item.id, item)); break;
            case 'ortho': await SupabaseDB.addOrthodonticCase(item).catch(() => SupabaseDB.updateOrthodonticCase(item.id, item)); break;
          }
        } catch (e) {
          console.warn('DB.set Supabase sync error:', e);
        }
      }
    }
    return v;
  }
};

async function seedData() {
  const existingPatients = getLocal('patients');
  if (existingPatients.length > 0) return;
  const patientsData = [
    { id:'PD-0001', name:'Kavitha Rajan', dob:'1988-05-14', gender:'Female', blood:'B+', phone:'+91 98401 11111', email:'kavitha@email.com', address:'Anna Nagar, Chennai', treatment:'Orthodontics', doctor:'Dr. Poornima Gopiraj', history:'No known allergies', notes:'Class II malocclusion', created: new Date(Date.now()-86400000*10).toISOString() },
    { id:'PD-0002', name:'Suresh Kumar', dob:'1995-11-22', gender:'Male', blood:'O+', phone:'+91 98402 22222', email:'suresh@email.com', address:'T.Nagar, Chennai', treatment:'Dental Implants', doctor:'Dr. Lakshmi Rathan', history:'Diabetic - controlled', notes:'Missing tooth #36', created: new Date(Date.now()-86400000*5).toISOString() },
    { id:'PD-0003', name:'Anitha Devi', dob:'2002-03-08', gender:'Female', blood:'A+', phone:'+91 98403 33333', email:'anitha@email.com', address:'Velachery, Chennai', treatment:'General Check-up', doctor:'Dr. Saranya Mohan', history:'None', notes:'Routine annual check-up', created: new Date(Date.now()-86400000*2).toISOString() },
  ];
  const today = new Date().toISOString().split('T')[0];
  const appointmentsData = [
    { id:'APT-001', name:'Kavitha Rajan', phone:'+91 98401 11111', date:today, time:'5:00 PM', service:'Orthodontics', doctor:'Dr. Poornima Gopiraj', status:'Confirmed', visittype:'Follow-up', notes:'Wire adjustment visit 3', created:new Date().toISOString() },
    { id:'APT-002', name:'Suresh Kumar', phone:'+91 98402 22222', date:today, time:'6:00 PM', service:'Dental Implants', doctor:'Dr. Lakshmi Rathan', status:'Pending', visittype:'Follow-up', notes:'Post-op check', created:new Date().toISOString() },
    { id:'APT-003', name:'Anitha Devi', phone:'+91 98403 33333', date:today, time:'7:30 PM', service:'General Check-up', doctor:'Dr. Saranya Mohan', status:'Confirmed', visittype:'First Visit', notes:'', created:new Date().toISOString() },
  ];
  const orthoData = [
    { id:'OT-001', pid:'PD-0001', name:'Kavitha Rajan', age:36, gender:'Female', phone:'+91 98401 11111', type:'Metal Braces', start:'2024-06-01', end:'2025-12-01', doctor:'Dr. Poornima Gopiraj', diag:'Class II Division 1 malocclusion with severe crowding', plan:'Upper and lower fixed appliances, extraction of 14,24. Total 18 months', status:'Active', progress:55, visits:[
      { date:'2024-06-01', type:'Regular Adjustment', notes:'Initial banding and bonding. 0.014 NiTi wire placed.', progress:5, next:'2024-07-01' },
      { date:'2024-07-01', type:'Wire Change', notes:'0.018 NiTi. Good initial alignment. Patient cooperative.', progress:20, next:'2024-08-01' },
      { date:'2024-09-15', type:'Regular Adjustment', notes:'0.019x0.025 SS wire. Space closure started.', progress:40, next:'2024-11-01' },
      { date:'2025-01-10', type:'Progress Review', notes:'55% progress. Excellent cooperation. Finishing phase starting.', progress:55, next:'2025-03-01' },
    ]},
  ];
  setLocal('patients', patientsData);
  setLocal('appointments', appointmentsData);
  setLocal('ortho', orthoData);
  if (SupabaseDB.isConfigured()) {
    for (const p of patientsData) { await SupabaseDB.addPatient(p).catch(() => {}); }
    for (const a of appointmentsData) { await SupabaseDB.addAppointment(a).catch(() => {}); }
    for (const o of orthoData) { await SupabaseDB.addOrthodonticCase(o).catch(() => {}); }
  }
}

let currentUser = null;
let loginAttempts = [];

async function handleLogin() {
  console.log('[Login] handleLogin called');
  const now = Date.now();
  loginAttempts = loginAttempts.filter(t => now - t < 60000);
  if (loginAttempts.length >= 5) {
    const wait = Math.ceil((60000 - (now - loginAttempts[0])) / 1000);
    showLoginError('Too many attempts. Try again in ' + wait + 's.');
    return;
  }

  const email = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  console.log('[Login] Email:', email, 'Password length:', password.length);

  if (!email || !password) {
    showLoginError('Please enter email and password');
    return;
  }

  const btn = document.getElementById('loginBtn');
  const btnText = btn.querySelector('.login-btn-text');
  const btnLoader = btn.querySelector('.login-btn-loader');
  const btnArrow = btn.querySelector('.login-btn-arrow');

  try {
    btn.disabled = true;
    btnText.style.display = 'none';
    btnArrow.style.display = 'none';
    btnLoader.style.display = 'inline-flex';

    console.log('[Login] SupabaseDB available:', typeof SupabaseDB !== 'undefined');
    console.log('[Login] SupabaseDB configured:', typeof SupabaseDB !== 'undefined' && SupabaseDB.isConfigured());

    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.isConfigured()) {
      showLoginError('Supabase not configured. Check .env file.');
      return;
    }

    loginAttempts.push(now);
    console.log('[Login] Calling SupabaseDB.login...');
    const result = await SupabaseDB.login(email, password);
    console.log('[Login] Result:', result);

    loginAttempts = [];
    if (!result || !result.user || !result.session) {
      console.log('[Login] No user/session in result');
      showLoginError('Login failed. Please check your credentials.');
      document.getElementById('loginPass').value = '';
      return;
    }
    currentUser = {
      email: result.user.email,
      name: result.user.user_metadata?.display_name || result.user.email?.split('@')[0] || 'Doctor',
      role: result.user.user_metadata?.role || 'Doctor',
      avatar: result.user.user_metadata?.avatar || '👨‍⚕️'
    };
    console.log('[Login] Success! User:', currentUser.name);
    document.getElementById('loginErr').style.display = 'none';
    document.getElementById('sbDocName').textContent = currentUser.name;
    document.getElementById('sbDocRole').textContent = currentUser.role;
    document.getElementById('sbAvatar').innerHTML = currentUser.avatar;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    await refreshAll();
    toast('👋', 'Welcome back!', currentUser.name + ' — ' + currentUser.role, 'success');
  } catch (e) {
    console.error('[Login] Error:', e);
    if (e.message && e.message.includes('Invalid login credentials')) {
      showLoginError('Invalid email or password. Please try again.');
    } else {
      showLoginError(e.message || 'Login failed. Please try again.');
    }
    document.getElementById('loginPass').value = '';
  } finally {
    btn.disabled = false;
    btnText.style.display = 'inline';
    btnArrow.style.display = 'inline';
    btnLoader.style.display = 'none';
  }
}

window.handleLogin = handleLogin;

function showLoginError(msg) {
  const err = document.getElementById('loginErr');
  document.getElementById('loginErrText').textContent = msg;
  err.style.display = 'flex';
  err.style.animation = 'none';
  err.offsetHeight;
  err.style.animation = 'errorShake 0.4s ease';
}

document.getElementById('loginPass').addEventListener('keydown', e => { if(e.key==='Enter') { e.preventDefault(); handleLogin(); } });

async function doLogout() {
  currentUser = null;
  if (SupabaseDB.isConfigured()) {
    try { await SupabaseDB.logout(); } catch (e) {}
  }
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginErr').style.display = 'none';
}

async function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if (el) el.classList.add('active');
  const titles = { overview:'Overview Dashboard', appointments:'Appointment Management', patients:'Patient Records', ortho:'Ortho Treatment Tracker', 'add-patient':'Add New Patient', holidays:'Clinic Holidays' };
  const icons = { overview:'📊', appointments:'📅', patients:'👥', ortho:'😁', 'add-patient':'➕', holidays:'🎉' };
  const t = titles[id] || id;
  document.getElementById('pageTitle').innerHTML = icons[id] ? htmlEscape(icons[id]) + ' <span style="font-style:italic;color:var(--teal)">' + htmlEscape(t.split(' ').slice(-1)[0]) + '</span> ' + htmlEscape(t.split(' ').slice(0,-1).join(' ')) : htmlEscape(t);
  if (id==='appointments') await renderAppointments();
  if (id==='patients') await renderPatients();
  if (id==='ortho') await renderOrtho();
  if (id==='overview') await renderOverview();
  if (id==='holidays') renderHolidays();
}

async function renderOverview() {
  const today = new Date().toISOString().split('T')[0];
  const apts = await DB.get('appointments') || [];
  const patients = await DB.get('patients') || [];
  const ortho = await DB.get('ortho') || [];
  const todayApts = apts.filter(a => a.date === today);
  const completed = todayApts.filter(a => a.status === 'Completed').length;
  const activeOrtho = ortho.filter(o => o.status === 'Active').length;

  document.getElementById('ovAppts').textContent = todayApts.length;
  document.getElementById('ovPatients').textContent = patients.length;
  document.getElementById('ovOrtho').textContent = activeOrtho;
  document.getElementById('ovCompleted').textContent = completed;
  document.getElementById('ovApptChg').textContent = '\u2191 ' + todayApts.length + ' scheduled today';
  document.getElementById('apptBadge').textContent = todayApts.filter(a=>a.status!=='Completed').length;
  document.getElementById('orthoBadge').textContent = activeOrtho;

  const tbody = document.getElementById('overviewApptTable');
  tbody.innerHTML = '';
  if (!todayApts.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:30px">No appointments today. <a onclick="openApptModal()" style="color:var(--teal);cursor:pointer">Add one \u2192</a></td></tr>';
    return;
  }
  todayApts.slice(0,5).forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><strong>' + htmlEscape(a.time) + '</strong></td><td>' + htmlEscape(a.name) + '</td><td>' + htmlEscape(a.service) + '</td><td style="color:var(--teal);font-size:13px">' + htmlEscape(a.doctor) + '</td><td><span class="badge badge-' + htmlEscape((a.status||'pending').toLowerCase()) + '">' + htmlEscape(a.status) + '</span></td><td><button class="btn btn-sm btn-gold" data-action="markComplete" data-id="' + htmlEscape(a.id) + '">\u2713 Done</button></td>';
    tbody.appendChild(tr);
  });

  const ptbody = document.getElementById('overviewPatientTable');
  ptbody.innerHTML = '';
  if (!patients.length) {
    ptbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:30px">No patients yet.</td></tr>';
    return;
  }
  patients.slice(0,5).forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><strong>' + htmlEscape(p.name) + '</strong><br><span style="font-size:11px;color:var(--text-dim)">' + htmlEscape(p.id) + '</span></td><td>' + htmlEscape(calcAge(p.dob)) + ' / ' + htmlEscape((p.gender && p.gender.charAt(0)) || '\u2014') + '</td><td style="font-size:12px;color:var(--text-muted)">' + htmlEscape(formatDate(p.created)) + '</td><td><span class="badge badge-active" style="font-size:11px">' + htmlEscape(p.treatment) + '</span></td><td><button class="btn btn-sm btn-outline" data-action="viewPatient" data-id="' + htmlEscape(p.id) + '">View \u2192</button></td>';
    ptbody.appendChild(tr);
  });
}

function openApptModal() {
  const m = document.getElementById('apptModal');
  document.getElementById('am_date').value = new Date().toISOString().split('T')[0];
  m.classList.add('open');
}

async function saveAppointment() {
  const name = document.getElementById('am_name').value.trim();
  const phone = document.getElementById('am_phone').value.trim();
  const date = document.getElementById('am_date').value;
  const time = document.getElementById('am_time').value;
  if (!name || !phone || !date) { toast('\u26A0\uFE0F','Missing fields','Name, phone and date are required','error'); return; }
  if (isHoliday(date)) { toast('\uD83C\uDF89','Closure Notice','Clinic is closed on this date','error'); return; }
  try {
    checkRateLimit();
    const apts = await DB.get('appointments') || [];
    const id = 'APT-' + crypto.randomUUID().slice(0, 8);
    const apt = { id, name: sanitizeName(name), phone: sanitizePhone(phone), date, time,
      service: document.getElementById('am_service').value,
      doctor: document.getElementById('am_doctor').value,
      status: document.getElementById('am_status').value,
      visittype: document.getElementById('am_visittype').value,
      notes: document.getElementById('am_notes').value,
      created: new Date().toISOString()
    };
    await DB.push('appointments', apt);
    closeModal('apptModal');
    document.getElementById('am_name').value=''; document.getElementById('am_phone').value=''; document.getElementById('am_notes').value='';
    await renderAppointments(); await renderOverview();
    toast('\u2705','Appointment Saved!',htmlEscape(name) + ' \u2014 ' + htmlEscape(time) + ' on ' + htmlEscape(formatDate(date)),'success');
  } catch (e) {
    console.error('Error saving appointment:', e);
    toast('\u274C','Save Failed',e.message || 'Could not save appointment','error');
  }
}

async function renderAppointments() {
  const apts = await DB.get('appointments') || [];
  const q = (document.getElementById('apptSearch')?.value||'').toLowerCase();
  const sf = document.getElementById('apptStatusFilter')?.value||'';
  const df = document.getElementById('apptDrFilter')?.value||'';
  const filtered = apts.filter(a =>
    (!q || a.name.toLowerCase().includes(q) || a.service.toLowerCase().includes(q)) &&
    (!sf || a.status === sf) && (!df || a.doctor === df)
  );
  const tbody = document.getElementById('apptTable');
  tbody.innerHTML = '';
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dim)">No appointments found.</td></tr>'; return; }
  filtered.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><strong>' + htmlEscape(a.time) + '</strong><br><span style="font-size:11px;color:var(--text-muted)">' + htmlEscape(formatDate(a.date)) + '</span></td><td><strong>' + htmlEscape(a.name) + '</strong><br><span style="font-size:11px;color:var(--text-dim)">' + htmlEscape(a.visittype) + '</span></td><td style="font-size:13px;color:var(--text-muted)">' + htmlEscape(a.phone) + '</td><td>' + htmlEscape(a.service) + '</td><td style="color:var(--teal);font-size:13px">' + htmlEscape(a.doctor) + '</td><td><span class="badge badge-' + htmlEscape((a.status||'pending').toLowerCase()) + '">' + htmlEscape(a.status) + '</span></td><td style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm btn-gold" data-action="markComplete" data-id="' + htmlEscape(a.id) + '">\u2713</button><button class="btn btn-sm btn-danger" data-action="deleteAppt" data-id="' + htmlEscape(a.id) + '">\u2715</button></td>';
    tbody.appendChild(tr);
  });
}

async function markComplete(id) {
  try {
    await DB.update('appointments', id, { status: 'Completed' });
    await renderAppointments(); await renderOverview();
    toast('\u2705','Marked Complete','Appointment updated','success');
  } catch (e) {
    console.error('Error marking complete:', e);
    toast('\u274C','Update Failed','Could not update appointment','error');
  }
}
async function deleteAppt(id) {
  if (!confirm('Delete this appointment?')) return;
  try {
    await DB.delete('appointments', id);
    await renderAppointments(); await renderOverview();
    toast('\uD83D\uDDD1\uFE0F','Deleted','Appointment removed');
  } catch (e) {
    console.error('Error deleting appointment:', e);
    toast('\u274C','Delete Failed','Could not delete appointment','error');
  }
}

async function addPatient() {
  const name = document.getElementById('np_name').value.trim();
  const dob = document.getElementById('np_dob').value;
  const phone = document.getElementById('np_phone').value.trim();
  const treatment = document.getElementById('np_treatment').value;
  const gender = document.getElementById('np_gender').value;
  if (!name||!phone||!treatment||!gender) { toast('\u26A0\uFE0F','Required fields missing','Fill name, phone, gender & treatment','error'); return; }
  try {
    checkRateLimit();
    const patients = await DB.get('patients') || [];
    const id = 'PD-' + crypto.randomUUID().slice(0, 8);
    const p = { id, name: sanitizeName(name), dob, gender,
      blood: document.getElementById('np_blood').value,
      phone: sanitizePhone(phone), email: sanitizeEmail(document.getElementById('np_email').value),
      address: document.getElementById('np_address').value,
      treatment, doctor: document.getElementById('np_doctor').value,
      history: document.getElementById('np_history').value,
      notes: document.getElementById('np_notes').value,
      created: new Date().toISOString()
    };
    await DB.push('patients', p);
    ['np_name','np_dob','np_phone','np_email','np_address','np_history','np_notes'].forEach(f => document.getElementById(f).value='');
    document.getElementById('np_gender').value=''; document.getElementById('np_treatment').value='';
    toast('\u2705','Patient Added!',htmlEscape(name) + ' \u2014 ' + id,'success');
    await renderOverview();
    if (treatment === 'Orthodontics') setTimeout(() => toast('\uD83D\uDCA1','Tip','This patient has Orthodontics \u2014 add an Ortho Case from the tracker!'), 2500);
  } catch (e) {
    console.error('Error adding patient:', e);
    toast('\u274C','Add Failed',e.message || 'Could not add patient','error');
  }
}

async function renderPatients() {
  const patients = await DB.get('patients') || [];
  const q = (document.getElementById('patientSearch')?.value||'').toLowerCase();
  const tf = document.getElementById('patientFilter')?.value||'';
  const filtered = patients.filter(p =>
    (!q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) &&
    (!tf || p.treatment === tf)
  );
  const tbody = document.getElementById('patientTable');
  tbody.innerHTML = '';
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dim)">No patients found.</td></tr>'; return; }
  filtered.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td style="color:var(--teal);font-size:12px;font-weight:600">' + htmlEscape(p.id) + '</td><td><strong>' + htmlEscape(p.name) + '</strong><br><span style="font-size:11px;color:var(--text-dim)">' + htmlEscape(p.email||'\u2014') + '</span></td><td>' + htmlEscape(calcAge(p.dob)) + ' yrs / ' + htmlEscape((p.gender&&p.gender.charAt(0))||'\u2014') + '</td><td style="font-size:13px;color:var(--text-muted)">' + htmlEscape(p.phone) + '</td><td><span class="badge badge-active" style="font-size:11px">' + htmlEscape(p.treatment) + '</span></td><td style="font-size:12px;color:var(--text-muted)">' + htmlEscape(formatDate(p.created)) + '</td><td style="display:flex;gap:6px"><button class="btn btn-sm btn-outline" data-action="viewPatient" data-id="' + htmlEscape(p.id) + '">View</button><button class="btn btn-sm btn-teal" data-action="editPatient" data-id="' + htmlEscape(p.id) + '">Edit</button><button class="btn btn-sm btn-danger" data-action="deletePatient" data-id="' + htmlEscape(p.id) + '">\u2715</button></td>';
    tbody.appendChild(tr);
  });
}

async function editPatient(pid) {
  const patients = await DB.get('patients') || [];
  const p = patients.find(x => x.id===pid);
  if (!p) return;
  const idField = 'pe_' + pid.replace(/[^a-zA-Z0-9]/g, '');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = '<div class="modal" style="max-width:640px"><div class="modal-hdr"><h3>Edit <span>Patient</span></h3><div class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">\u2715</div></div><div class="modal-body" id="' + htmlEscape(idField) + '"><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px"><div class="mg"><label>Full Name *</label><input class="inp" id="ep_name" value="' + htmlEscape(p.name) + '"></div><div class="mg"><label>Date of Birth</label><input class="inp" type="date" id="ep_dob" value="' + htmlEscape(p.dob||'') + '"></div><div class="mg"><label>Gender</label><select id="ep_gender"><option value="">Select</option><option' + (p.gender==='Male'?' selected':'') + '>Male</option><option' + (p.gender==='Female'?' selected':'') + '>Female</option><option' + (p.gender==='Other'?' selected':'') + '>Other</option></select></div><div class="mg"><label>Blood Group</label><select id="ep_blood"><option value="">Unknown</option>' + ['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(b => '<option' + (p.blood===b?' selected':'') + '>' + b + '</option>').join('') + '</select></div><div class="mg"><label>Phone *</label><input class="inp" id="ep_phone" value="' + htmlEscape(p.phone) + '"></div><div class="mg"><label>Email</label><input class="inp" id="ep_email" type="email" value="' + htmlEscape(p.email||'') + '"></div><div class="mg" style="grid-column:span 2"><label>Address</label><input class="inp" id="ep_address" value="' + htmlEscape(p.address||'') + '"></div><div class="mg"><label>Primary Treatment</label><select id="ep_treatment"><option value="">Select</option>' + ['General Check-up','Scaling','Dental Filling','Dental Implants','Root Canal','Orthodontics','SRP','Zirconia Crowns','Metal Ceramic Crown','Ceramic Braces','Metal Braces','Clear Aligners','Child Dental Care','FLAP Surgery','Orthognathic Surgery','Wisdom Tooth Removal','FPD - Bridging','Complete Denture','Fixed Implant Denture','Removable Overdenture'].map(t => '<option' + (p.treatment===t?' selected':'') + '>' + t + '</option>').join('') + '</select></div><div class="mg"><label>Assigned Doctor</label><select id="ep_doctor"><option' + (p.doctor==='Dr. Saranya Mohan'?' selected':'') + '>Dr. Saranya Mohan</option><option' + (p.doctor==='Dr. Poornima Gopiraj'?' selected':'') + '>Dr. Poornima Gopiraj</option><option' + (p.doctor==='Dr. Syed Sulaiman'?' selected':'') + '>Dr. Syed Sulaiman</option><option' + (p.doctor==='Dr. Lakshmi Rathan'?' selected':'') + '>Dr. Lakshmi Rathan</option><option' + (p.doctor==='Dr. B. Radhika'?' selected':'') + '>Dr. B. Radhika</option><option' + (p.doctor==='Dr. Ashik Ahamed'?' selected':'') + '>Dr. Ashik Ahamed</option></select></div><div class="mg" style="grid-column:span 2"><label>Medical History</label><textarea id="ep_history">' + htmlEscape(p.history||'') + '</textarea></div><div class="mg" style="grid-column:span 2"><label>Notes</label><textarea id="ep_notes">' + htmlEscape(p.notes||'') + '</textarea></div></div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px"><button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button><button class="btn btn-teal" onclick="savePatientEdit(\'' + htmlEscape(p.id) + '\')">\u2713 Save Changes</button></div></div></div>';
  document.body.appendChild(modal);
}

async function savePatientEdit(pid) {
  const updates = {
    name: document.getElementById('ep_name').value.trim(),
    dob: document.getElementById('ep_dob').value,
    gender: document.getElementById('ep_gender').value,
    blood: document.getElementById('ep_blood').value,
    phone: document.getElementById('ep_phone').value.trim(),
    email: document.getElementById('ep_email').value.trim(),
    address: document.getElementById('ep_address').value.trim(),
    treatment: document.getElementById('ep_treatment').value,
    doctor: document.getElementById('ep_doctor').value,
    history: document.getElementById('ep_history').value.trim(),
    notes: document.getElementById('ep_notes').value.trim()
  };
  if (!updates.name || !updates.phone) {
    toast('\u26A0\uFE0F','Required','Name and phone are required','error'); return;
  }
  try {
    checkRateLimit();
    await DB.update('patients', pid, updates);
    document.querySelector('.modal-overlay:last-child').remove();
    await renderPatients(); await renderOverview();
    toast('\u2705','Patient Updated!',updates.name,'success');
  } catch (e) {
    console.error('Error updating patient:', e);
    toast('\u274C','Update Failed',e.message||'Could not update patient','error');
  }
}

async function viewPatient(pid) {
  const patients = await DB.get('patients') || [];
  const p = patients.find(x => x.id===pid);
  if (!p) return;
  const apts = (await DB.get('appointments')||[]).filter(a => a.name===p.name);
  const ortho = (await DB.get('ortho')||[]).filter(o => o.pid===pid);

  const body = document.getElementById('patientViewBody');
  body.innerHTML = '';
  const div = document.createElement('div');
  div.innerHTML = '<div style="display:grid;grid-template-columns:200px 1fr;gap:24px;margin-bottom:24px"><div style="background:var(--surface2);border-radius:16px;padding:24px;text-align:center"><div style="font-size:52px;margin-bottom:12px">' + (p.gender==='Female'?'\uD83D\uDC69':'\uD83D\uDC68') + '</div><div style="font-family:\'Lora\',serif;font-size:18px;font-weight:600;margin-bottom:4px">' + htmlEscape(p.name) + '</div><div style="font-size:12px;color:var(--teal);margin-bottom:16px">' + htmlEscape(p.id) + '</div><span class="badge badge-active">' + htmlEscape(p.treatment) + '</span><div style="margin-top:16px;font-size:12px;color:var(--text-muted);line-height:2"><div>\uD83E\uDE78 ' + htmlEscape(p.blood||'\u2014') + ' &nbsp;|&nbsp; ' + htmlEscape(calcAge(p.dob)) + ' yrs</div><div>\uD83D\uDCDE ' + htmlEscape(p.phone) + '</div><div>\uD83D\uDC68\u200D\u2695\uFE0F ' + htmlEscape(p.doctor) + '</div></div></div><div style="display:flex;flex-direction:column;gap:14px"><div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:18px"><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Medical History</div><div style="font-size:14px;line-height:1.6">' + htmlEscape(p.history||'None recorded') + '</div></div><div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:18px"><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Clinical Notes</div><div style="font-size:14px;line-height:1.6">' + htmlEscape(p.notes||'\u2014') + '</div></div><div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:18px"><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Address</div><div style="font-size:14px">' + htmlEscape(p.address||'\u2014') + '</div></div></div></div>';
  body.appendChild(div);

  if (apts.length) {
    const aptDiv = document.createElement('div');
    aptDiv.innerHTML = '<div style="font-family:\'Lora\',serif;font-size:16px;font-weight:600;margin-bottom:12px">\uD83D\uDCC5 Appointment History <span style="font-size:13px;color:var(--text-muted);font-weight:400;font-family:\'Sora\',sans-serif">(' + apts.length + ' total)</span></div><div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px;overflow:hidden;margin-bottom:20px"><table style="width:100%;border-collapse:collapse"><thead style="background:rgba(0,0,0,0.2)"><tr><th style="padding:10px 16px;text-align:left;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Date</th><th style="padding:10px 16px;text-align:left;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Service</th><th style="padding:10px 16px;text-align:left;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Status</th></tr></thead><tbody>' + apts.map(a=>'<tr><td style="padding:10px 16px;font-size:13px;border-bottom:1px solid var(--border)">' + htmlEscape(formatDate(a.date)) + ' ' + htmlEscape(a.time) + '</td><td style="padding:10px 16px;font-size:13px;border-bottom:1px solid var(--border)">' + htmlEscape(a.service) + '</td><td style="padding:10px 16px;border-bottom:1px solid var(--border)"><span class="badge badge-' + htmlEscape((a.status||'pending').toLowerCase()) + '" style="font-size:11px">' + htmlEscape(a.status) + '</span></td></tr>').join('') + '</tbody></table></div>';
    body.appendChild(aptDiv);
  } else {
    const pEl = document.createElement('p');
    pEl.style.cssText = 'color:var(--text-dim);font-size:13px;margin-bottom:20px';
    pEl.textContent = 'No appointments found.';
    body.appendChild(pEl);
  }

  if (ortho.length) {
    const oDiv = document.createElement('div');
    oDiv.innerHTML = '<div style="font-family:\'Lora\',serif;font-size:16px;font-weight:600;margin-bottom:12px">\uD83D\uDE01 Ortho Case</div><div style="background:var(--teal-dim);border:1px solid rgba(45,212,191,0.2);border-radius:12px;padding:16px;font-size:13px"><strong>' + htmlEscape(ortho[0].type) + '</strong> \u2014 Started ' + htmlEscape(formatDate(ortho[0].start)) + ' \u2014 Progress: <span style="color:var(--teal)">' + htmlEscape(String(ortho[0].progress)) + '%</span></div>';
    body.appendChild(oDiv);
  }

  document.getElementById('patientViewModal').classList.add('open');
}

async function deletePatient(pid) {
  if (!confirm('Delete this patient? This cannot be undone.')) return;
  try {
    await DB.delete('patients', pid);
    await renderPatients(); await renderOverview();
    toast('\uD83D\uDDD1\uFE0F','Deleted','Patient record removed');
  } catch (e) {
    console.error('Error deleting patient:', e);
    toast('\u274C','Delete Failed','Could not delete patient','error');
  }
}

let activeOrthoId = null;

function openOrthoModal() {
  document.getElementById('om_start').value = new Date().toISOString().split('T')[0];
  document.getElementById('orthoModal').classList.add('open');
}

async function saveOrthoCase() {
  const name = document.getElementById('om_name').value.trim();
  const start = document.getElementById('om_start').value;
  if (!name||!start) { toast('\u26A0\uFE0F','Missing fields','Name and start date required','error'); return; }
  try {
    checkRateLimit();
    const ortho = await DB.get('ortho') || [];
    const id = 'OT-' + crypto.randomUUID().slice(0, 8);
    const pid = document.getElementById('om_pid').value.trim() || id;
    const o = { id, pid, name: sanitizeName(name),
      age: document.getElementById('om_age').value,
      gender: document.getElementById('om_gender').value,
      phone: sanitizePhone(document.getElementById('om_phone').value),
      type: document.getElementById('om_type').value,
      start, end: document.getElementById('om_end').value,
      doctor: document.getElementById('om_doctor').value,
      diag: document.getElementById('om_diag').value,
      plan: document.getElementById('om_plan').value,
      status:'Active', progress:0, visits:[]
    };
    await DB.push('ortho', o);
    closeModal('orthoModal');
    ['om_name','om_pid','om_age','om_phone','om_end','om_diag','om_plan'].forEach(f => document.getElementById(f).value='');
    await renderOrtho(); await renderOverview();
    toast('\u2705','Ortho Case Created!',htmlEscape(name) + ' \u2014 ' + htmlEscape(o.type),'success');
  } catch (e) {
    console.error('Error saving ortho case:', e);
    toast('\u274C','Save Failed',e.message || 'Could not save ortho case','error');
  }
}

function openVisitModal(orthoId) {
  activeOrthoId = orthoId;
  document.getElementById('ov_date').value = new Date().toISOString().split('T')[0];
  document.getElementById('ov_progress').value = '';
  document.getElementById('ov_notes').value = '';
  document.getElementById('orthoVisitModal').classList.add('open');
}

async function saveOrthoVisit() {
  const date = document.getElementById('ov_date').value;
  const notes = document.getElementById('ov_notes').value.trim();
  if (!date||!notes) { toast('\u26A0\uFE0F','Required','Date and notes are required','error'); return; }
  try {
    checkRateLimit();
    const ortho = await DB.get('ortho') || [];
    const i = ortho.findIndex(o => o.id===activeOrthoId);
    if (i<0) return;
    const prog = parseInt(document.getElementById('ov_progress').value)||ortho[i].progress;
    const visit = { date, type: document.getElementById('ov_type').value, notes, progress:prog, next: document.getElementById('ov_next').value };
    ortho[i].visits = ortho[i].visits||[];
    ortho[i].visits.unshift(visit);
    ortho[i].progress = prog;
    ortho[i].status = document.getElementById('ov_status').value;
    await DB.set('ortho', ortho);
    closeModal('orthoVisitModal');
    await renderOrtho(); await renderOverview();
    toast('\u2705','Visit Recorded!','Progress: ' + prog + '%','success');
  } catch (e) {
    console.error('Error saving ortho visit:', e);
    toast('\u274C','Save Failed',e.message || 'Could not save visit','error');
  }
}

async function renderOrtho() {
  const ortho = await DB.get('ortho') || [];
  const q = (document.getElementById('orthoSearch')?.value||'').toLowerCase();
  const sf = document.getElementById('orthoStatusFilter')?.value||'';
  const filtered = ortho.filter(o =>
    (!q || o.name.toLowerCase().includes(q)) && (!sf || o.status===sf)
  );
  const el = document.getElementById('orthoCaseList');
  el.innerHTML = '';
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state"><div class="es-icon">\uD83D\uDE01</div><p>No ortho cases yet.<br>Click "+ New Ortho Case" to add one.</p></div>';
    return;
  }
  filtered.forEach(o => {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;margin-bottom:20px';
    const visitsHtml = (!o.visits||!o.visits.length)
      ? '<div style="color:var(--text-dim);font-size:13px;padding:12px 0">No visits recorded yet.</div>'
      : o.visits.map((v,idx) => '<div class="ortho-visit"><div class="ortho-visit-num">' + (o.visits.length - idx) + '</div><div class="ov-top"><div><span class="ov-date">\uD83D\uDCC5 ' + htmlEscape(formatDate(v.date)) + '</span><span class="ov-type" style="margin-left:10px">\u00B7 ' + htmlEscape(v.type) + '</span></div><div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--teal);font-weight:600">' + htmlEscape(String(v.progress)) + '% complete</span>' + (v.next ? '<span style="font-size:11px;color:var(--text-muted)">Next: ' + htmlEscape(formatDate(v.next)) + '</span>' : '') + '</div></div><div class="ov-notes">' + htmlEscape(v.notes) + '</div></div>').join('');
    card.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px"><div style="display:flex;align-items:center;gap:14px"><div style="width:48px;height:48px;border-radius:14px;background:var(--teal-dim);border:1px solid rgba(45,212,191,0.2);display:flex;align-items:center;justify-content:center;font-size:24px">' + (o.gender==='Female'?'\uD83D\uDC69':'\uD83D\uDC68') + '</div><div><div style="font-family:\'Lora\',serif;font-size:18px;font-weight:600">' + htmlEscape(o.name) + '</div><div style="font-size:12px;color:var(--teal)">' + htmlEscape(o.id) + ' \u00B7 ' + htmlEscape(o.type) + '</div><div style="font-size:12px;color:var(--text-muted);margin-top:2px">' + htmlEscape(o.doctor) + ' \u00B7 ' + (o.age?htmlEscape(String(o.age))+' yrs ':'') + htmlEscape(o.gender) + '</div></div></div><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="badge badge-' + htmlEscape((o.status||'active').toLowerCase()) + '">' + htmlEscape(o.status) + '</span><button class="btn btn-sm btn-teal" data-action="openVisit" data-id="' + htmlEscape(o.id) + '">\u2795 Add Visit</button><button class="btn btn-sm btn-outline" data-action="openOPG" data-id="' + htmlEscape(o.id) + '" style="border-color:rgba(45,110,110,0.3);color:var(--teal)">\uD83E\uDDB7 OPG</button><button class="btn btn-sm btn-danger" data-action="deleteOrtho" data-id="' + htmlEscape(o.id) + '">\u2715</button></div></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px"><div style="background:var(--surface2);border-radius:12px;padding:14px"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Diagnosis</div><div style="font-size:13px;line-height:1.5">' + htmlEscape(o.diag||'\u2014') + '</div></div><div style="background:var(--surface2);border-radius:12px;padding:14px"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Timeline</div><div style="font-size:13px">' + htmlEscape(formatDate(o.start)) + ' \u2192 ' + (o.end?htmlEscape(formatDate(o.end)):'Ongoing') + '</div></div><div style="background:var(--surface2);border-radius:12px;padding:14px"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Overall Progress</div><div style="font-family:\'Lora\',serif;font-size:24px;font-weight:600;color:var(--teal)">' + htmlEscape(String(o.progress)) + '%</div><div class="prog-bar-wrap" style="margin-top:6px"><div class="prog-bar" style="width:' + htmlEscape(String(o.progress)) + '%"></div></div></div></div><div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.8px">Visit Log <span style="font-weight:400;font-size:12px">(' + (o.visits||[]).length + ' visits)</span></div><div class="ortho-timeline">' + visitsHtml + '</div>';
    el.appendChild(card);
  });
}

async function deleteOrtho(id) {
  if (!confirm('Delete this ortho case?')) return;
  try {
    await DB.delete('ortho', id);
    await renderOrtho(); await renderOverview();
    toast('\uD83D\uDDD1\uFE0F','Deleted','Ortho case removed');
  } catch (e) {
    console.error('Error deleting ortho case:', e);
    toast('\u274C','Delete Failed','Could not delete ortho case','error');
  }
}

let activeOPGOrthoId = null;

function openOPGModal(orthoId) {
  activeOPGOrthoId = orthoId;
  renderOPGs(orthoId);
  document.getElementById('opgModal').classList.add('open');
}

async function viewOPG(id) {
  const allOPGs = await DB.get('opg_reports') || [];
  const r = allOPGs.find(x => x.id === id);
  if (!r || !r.image) return;

  let dataUrl = r.image;
  if (!r.image.startsWith('data:')) {
    dataUrl = 'data:application/pdf;base64,' + r.image;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.style.zIndex = '600';
  modal.innerHTML = '<div class="modal" style="max-width:950px;max-height:95vh;display:flex;flex-direction:column">' +
    '<div class="modal-hdr"><h3>\uD83D\uDCC4 ' + htmlEscape(r.title) + '</h3>' +
    '<div style="display:flex;gap:8px;align-items:center">' +
    '<a href="' + dataUrl + '" download="' + htmlEscape(r.title) + '.pdf" class="btn btn-sm btn-teal" style="text-decoration:none">⬇ Download</a>' +
    '<div class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">✕</div></div></div>' +
    '<div class="modal-body" style="flex:1;overflow:auto;padding:0 24px 24px;background:#525659">' +
    '<div id="pdfViewerContainer" style="text-align:center;padding:20px 0"></div>' +
    '</div></div>';

  modal.addEventListener('click', function(e) { if (e.target === this) this.remove(); });
  document.body.appendChild(modal);

  const container = document.getElementById('pdfViewerContainer');
  if (!container) return;

  if (typeof pdfjsLib !== 'undefined') {
    renderPDF(dataUrl, container);
  } else {
    container.innerHTML = '<div style="color:#ccc;padding:40px">Loading PDF viewer...</div>';
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      renderPDF(dataUrl, container);
    };
    script.onerror = () => {
      container.innerHTML = '<div style="color:#ccc;padding:40px"><p>PDF viewer failed to load.</p>' +
        '<a href="' + dataUrl + '" download="' + htmlEscape(r.title) + '.pdf" style="color:#4dabf7;margin-top:10px;display:inline-block">⬇ Download PDF instead</a></div>';
    };
    document.head.appendChild(script);
  }
}

async function renderPDF(dataUrl, container) {
  try {
    const loadingTask = pdfjsLib.getDocument(dataUrl);
    const pdf = await loadingTask.promise;
    container.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;padding:12px;background:rgba(0,0,0,0.3);border-radius:8px;margin-bottom:12px;color:white;font-size:13px';
    toolbar.innerHTML = '<button class="btn btn-sm btn-outline" id="pdfPrev" style="color:white;border-color:rgba(255,255,255,0.3)">← Prev</button>' +
      '<span id="pdfPageInfo"></span>' +
      '<button class="btn btn-sm btn-outline" id="pdfNext" style="color:white;border-color:rgba(255,255,255,0.3)">Next →</button>';
    container.appendChild(toolbar);

    let currentPage = 1;
    const totalPages = pdf.numPages;
    document.getElementById('pdfPageInfo').textContent = 'Page ' + currentPage + ' of ' + totalPages;

    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = 'display:inline-block;position:relative';
    container.appendChild(canvasContainer);

    async function renderPage(num) {
      canvasContainer.innerHTML = '';
      const page = await pdf.getPage(num);
      const scale = 1.5;
      const viewport = page.getViewport({ scale: scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.cssText = 'max-width:100%;height:auto;border-radius:4px;box-shadow:0 4px 20px rgba(0,0,0,0.4)';
      canvasContainer.appendChild(canvas);
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    }

    await renderPage(currentPage);

    document.getElementById('pdfPrev').onclick = async () => {
      if (currentPage > 1) { currentPage--; document.getElementById('pdfPageInfo').textContent = 'Page ' + currentPage + ' of ' + totalPages; await renderPage(currentPage); }
    };
    document.getElementById('pdfNext').onclick = async () => {
      if (currentPage < totalPages) { currentPage++; document.getElementById('pdfPageInfo').textContent = 'Page ' + currentPage + ' of ' + totalPages; await renderPage(currentPage); }
    };
  } catch (e) {
    console.error('PDF render error:', e);
    container.innerHTML = '<div style="color:#ccc;padding:40px"><p>Could not render PDF: ' + htmlEscape(e.message) + '</p>' +
      '<a href="' + dataUrl + '" download style="color:#4dabf7;margin-top:10px;display:inline-block">⬇ Download PDF instead</a></div>';
  }
}

async function renderOPGs(orthoId) {
  const ortho = (await DB.get('ortho') || []).find(o => o.id === orthoId);
  const allOPGs = await DB.get('opg_reports') || [];
  const opgs = allOPGs.filter(r => r.ortho_id === orthoId);
  const container = document.getElementById('opgList');
  container.innerHTML = '';
  if (!opgs.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-dim);font-size:13px">No OPG reports yet. Upload the first one below.</div>';
    return;
  }
  opgs.forEach(r => {
    const div = document.createElement('div');
    div.style.cssText = 'background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:14px';
    div.innerHTML = '<div style="padding:16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px"><div style="display:flex;align-items:flex-start;gap:14px;flex:1;min-width:0"><div style="width:44px;height:44px;border-radius:10px;background:rgba(45,110,110,0.1);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">\uD83D\uDCC4</div><div style="min-width:0"><div style="font-size:15px;font-weight:600;color:var(--deep)">' + htmlEscape(r.title) + '</div><div style="font-size:12px;color:var(--muted);margin-top:3px">\uD83D\uDCC5 ' + htmlEscape(formatDate(r.date)) + (r.image ? ' \u00B7 ' + ((r.image.length * 3/4 / 1024).toFixed(0)) + ' KB' : '') + '</div>' + (r.notes ? '<div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.5">' + htmlEscape(r.notes) + '</div>' : '') + '</div></div><div style="display:flex;gap:6px;flex-shrink:0">' + (r.image ? '<button class="btn btn-sm btn-teal" data-action="viewOPG" data-id="' + htmlEscape(r.id) + '">\uD83D\uDC41 View PDF</button>' : '') + '<button class="btn btn-sm btn-danger" data-action="deleteOPG" data-id="' + htmlEscape(r.id) + '">\u2715</button></div></div>';
    container.appendChild(div);
  });
}

function triggerOPGUpload() {
  document.getElementById('opgFileInput').click();
}

function handleOPGFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.type !== 'application/pdf') {
    toast('\u26A0\uFE0F','Invalid format','Only PDF files are accepted','error');
    event.target.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast('\u26A0\uFE0F','File too large','PDF must be under 5MB','error');
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('opgPreview').innerHTML = '<div style="background:var(--cream);border-radius:8px;padding:16px;text-align:center;color:var(--teal);font-size:13px"><span style="font-size:32px;display:block;margin-bottom:6px">\uD83D\uDCC4</span>PDF selected: <strong>' + htmlEscape(file.name) + '</strong><br><span style="font-size:11px;color:var(--muted)">' + (file.size/1024).toFixed(1) + ' KB</span></div>';
    document.getElementById('opgImageData').value = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveOPG() {
  const title = document.getElementById('opg_title').value.trim();
  const date = document.getElementById('opg_date').value;
  if (!title || !date) { toast('\u26A0\uFE0F','Missing fields','Title and date are required','error'); return; }
  try {
    checkRateLimit();
    const existing = await DB.get('opg_reports') || [];
    const id = 'OPG-' + crypto.randomUUID().slice(0, 8);
    const ortho = (await DB.get('ortho') || []).find(o => o.id === activeOPGOrthoId);
    const report = {
      id, pid: ortho?.pid || '',
      ortho_id: activeOPGOrthoId,
      title: sanitizeName(title), date,
      notes: document.getElementById('opg_notes').value.trim(),
      image: document.getElementById('opgImageData').value || '',
      created: new Date().toISOString()
    };
    await DB.push('opg_reports', report);
    document.getElementById('opg_title').value = '';
    document.getElementById('opg_notes').value = '';
    document.getElementById('opgImageData').value = '';
    document.getElementById('opgPreview').innerHTML = '';
    document.getElementById('opgFileInput').value = '';
    renderOPGs(activeOPGOrthoId);
    toast('\u2705','OPG Saved!',htmlEscape(title) + ' \u2014 ' + htmlEscape(formatDate(date)),'success');
  } catch (e) {
    console.error('Error saving OPG report:', e);
    toast('\u274C','Save Failed',e.message || 'Could not save OPG report','error');
  }
}

async function deleteOPG(id) {
  if (!confirm('Delete this OPG report?')) return;
  try {
    await DB.delete('opg_reports', id);
    renderOPGs(activeOPGOrthoId);
    toast('\uD83D\uDDD1\uFE0F','Deleted','OPG report removed');
  } catch (e) {
    console.error('Error deleting OPG report:', e);
    toast('\u274C','Delete Failed','Could not delete OPG report','error');
  }
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', function(e){ if(e.target===this) this.classList.remove('open'); }));

document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === 'markComplete') markComplete(id);
  else if (action === 'deleteAppt') deleteAppt(id);
  else if (action === 'deletePatient') deletePatient(id);
  else if (action === 'editPatient') editPatient(id);
  else if (action === 'viewPatient') viewPatient(id);
  else if (action === 'openVisit') openVisitModal(id);
  else if (action === 'deleteOrtho') deleteOrtho(id);
  else if (action === 'openOPG') openOPGModal(id);
  else if (action === 'viewOPG') viewOPG(id);
  else if (action === 'deleteOPG') deleteOPG(id);
  else if (action === 'deleteHoliday') deleteHoliday(id);
});

function calcAge(dob) {
  if (!dob) return '\u2014';
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : '\u2014';
}
function formatDate(d) {
  if (!d) return '\u2014';
  try { return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); } catch { return d; }
}

async function renderHolidays() {
  const holidays = getHolidays();
  const el = document.getElementById('holidayList');
  el.innerHTML = '';
  if (!holidays.length) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-dim);font-size:13px">No holidays set. Add clinic holidays below to block bookings on those dates.</div>';
    return;
  }
  holidays.sort((a,b) => a.date.localeCompare(b.date)).forEach(h => {
    const d = new Date(h.date + 'T00:00:00');
    const dayName = d.toLocaleDateString('en-IN', { weekday:'long' });
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:8px';
    div.innerHTML = '<div><strong style="font-size:14px">\uD83D\uDCC5 ' + htmlEscape(formatDate(h.date)) + '</strong><span style="font-size:12px;color:var(--muted);margin-left:10px">' + htmlEscape(dayName) + '</span>' + (h.reason ? '<span style="font-size:12px;color:var(--muted);margin-left:10px">\u00B7 ' + htmlEscape(h.reason) + '</span>' : '') + '</div><button class="btn btn-sm btn-danger" data-action="deleteHoliday" data-id="' + htmlEscape(h.date) + '">\u2715</button>';
    el.appendChild(div);
  });
}

function addHoliday() {
  const date = document.getElementById('holidayDate').value;
  const reason = document.getElementById('holidayReason').value.trim();
  if (!date) { toast('\u26A0\uFE0F','Select a date','Please pick a holiday date','error'); return; }
  const holidays = getHolidays();
  if (holidays.some(h => h.date === date)) { toast('\u26A0\uFE0F','Already set','This date is already a holiday','error'); return; }
  holidays.push({ date, reason: reason || 'Closure' });
  localStorage.setItem('pd_holidays', JSON.stringify(holidays));
  document.getElementById('holidayDate').value = '';
  document.getElementById('holidayReason').value = '';
  renderHolidays();
  toast('\u2705','Holiday Added',htmlEscape(formatDate(date)) + ' marked as holiday');
}

function deleteHoliday(date) {
  if (!confirm('Remove holiday on ' + formatDate(date) + '?')) return;
  let holidays = getHolidays();
  holidays = holidays.filter(h => h.date !== date);
  localStorage.setItem('pd_holidays', JSON.stringify(holidays));
  renderHolidays();
  toast('\uD83D\uDDD1\uFE0F','Removed',htmlEscape(formatDate(date)) + ' is no longer a holiday');
}

let toastTimer;
function toast(icon, title, msg, type='') {
  clearTimeout(toastTimer);
  const el = document.getElementById('toastEl');
  document.getElementById('toastTitle').textContent = icon + ' ' + title;
  document.getElementById('toastMsg').textContent = msg;
  el.className = 'toast ' + type;
  el.classList.add('show');
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

async function refreshAll() {
  await renderOverview();
  const today = new Date();
  document.getElementById('topbarDate').textContent = today.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}

(async () => {
  try {
    await seedData();
  } catch (e) {
    console.error('Error initializing data:', e);
  }

  try {
    if (typeof SupabaseDB !== 'undefined' && SupabaseDB.isConfigured()) {
      const session = await initSession();
      if (session && session.user) {
        currentUser = {
          email: session.user.email,
          name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Doctor',
          role: session.user.user_metadata?.role || 'Doctor',
          avatar: session.user.user_metadata?.avatar || '👨‍⚕️'
        };
        document.getElementById('sbDocName').textContent = currentUser.name;
        document.getElementById('sbDocRole').textContent = currentUser.role;
        document.getElementById('sbAvatar').innerHTML = currentUser.avatar;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        await refreshAll();
        console.log('[Session] Auto-logged in as', currentUser.name);
      }
    }
  } catch (e) {
    console.warn('[Session] Could not restore session:', e.message);
  }
})();
