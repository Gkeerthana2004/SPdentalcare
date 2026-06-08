const SUPABASE_URL = window.SUPABASE_CONFIG?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.SUPABASE_ANON_KEY;
const CLINIC_WHATSAPP = '919176640037';
const DEBUG = false;

function devLog(...args) { if (DEBUG) console.log('[SP]', ...args); }
function devWarn(...args) { if (DEBUG) console.warn('[SP]', ...args); }
function devError(...args) { if (DEBUG) console.error('[SP]', ...args); }

if (!crypto.randomUUID) {
  crypto.randomUUID = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
}

let supabaseClient = null;
let isSupabaseConfigured = false;
let currentSession = null;

function htmlEscape(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

function parseTime12h(timeStr) {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return { h, m };
}

function isSlotPast2Hours(timeStr, dateStr) {
  if (!dateStr || !timeStr) return false;
  const now = new Date();
  const parsed = parseTime12h(timeStr);
  if (!parsed) return false;
  const slotDate = new Date(dateStr + 'T00:00:00');
  const slotTime = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), parsed.h, parsed.m, 0);
  const diffMs = slotTime.getTime() - now.getTime();
  return diffMs < 2 * 60 * 60 * 1000;
}

function sanitizePhone(val) {
  return String(val || '').replace(/[^\d+\-\s()]/g, '').trim();
}

function sanitizeEmail(val) {
  const v = String(val || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : '';
}

function sanitizeName(val) {
  return String(val || '').replace(/[<>"'&]/g, '').trim().slice(0, 100);
}

function validateRequired(val, label) {
  if (!val || !String(val).trim()) {
    throw new Error(label + ' is required');
  }
  return String(val).trim();
}

let bookingTimestamps = [];
function checkRateLimit(maxPerMinute = 5) {
  const now = Date.now();
  bookingTimestamps = bookingTimestamps.filter(t => now - t < 60000);
  if (bookingTimestamps.length >= maxPerMinute) {
    throw new Error('Too many requests. Please wait a moment and try again.');
  }
  bookingTimestamps.push(now);
}

const hasValidSupabaseUrl = typeof SUPABASE_URL === 'string' && SUPABASE_URL.includes('.supabase.co');
const hasValidAnonKey = typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY !== '';

if (hasValidSupabaseUrl && hasValidAnonKey) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    isSupabaseConfigured = true;
    // Supabase client initialized
  } catch (e) {
    devWarn('Supabase init failed:', e.message);
  }
} else {
  devWarn('Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env');
}

async function initSession() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  currentSession = data?.session || null;
  if (currentSession && currentSession.expires_at) {
    const expiresAt = new Date(currentSession.expires_at * 1000);
    if (expiresAt <= new Date()) {
      currentSession = null;
      try { await supabaseClient.auth.signOut(); } catch (_) {}
    }
  }
  return currentSession;
}

async function doLogin(email, password) {
  if (!supabaseClient) throw new Error('Supabase not configured');
  const resp = await supabaseClient.auth.signInWithPassword({ email, password });
  if (resp.error) throw resp.error;
  let session = resp.data?.session || null;
  let user = resp.data?.user || null;
  if (!session && !user) {
    const sd = await supabaseClient.auth.getSession();
    session = sd?.data?.session || null;
    user = session?.user || null;
  }
  if (!user && session) user = session.user;
  currentSession = session;
  return { user, session };
}

async function doLogout() {
  if (!supabaseClient) return;
  try {
    await supabaseClient.auth.signOut();
  } catch (e) {
    devWarn('Logout error:', e.message);
  }
  currentSession = null;
}

function getSession() {
  return currentSession;
}

function getAuthHeader() {
  if (currentSession?.access_token) {
    return { Authorization: 'Bearer ' + currentSession.access_token };
  }
  return {};
}

const SupabaseDB = {
  async getPatients(limit = 200) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('patients').select('*').order('created', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },

  async addPatient(patient) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const sanitized = {
      id: patient.id,
      name: sanitizeName(patient.name),
      dob: patient.dob || null,
      gender: patient.gender || null,
      blood: patient.blood || null,
      phone: sanitizePhone(patient.phone),
      email: sanitizeEmail(patient.email),
      address: String(patient.address || '').trim(),
      treatment: String(patient.treatment || '').trim(),
      doctor: String(patient.doctor || '').trim(),
      history: String(patient.history || '').trim(),
      notes: String(patient.notes || '').trim(),
      created: patient.created || new Date().toISOString()
    };
    const { data, error } = await supabaseClient.from('patients').upsert([sanitized], { onConflict: 'id' }).select();
    if (error) throw error;
    return data?.[0];
  },

  async updatePatient(id, updates) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('patients').update(updates).eq('id', id).select();
    if (error) throw error;
    return data?.[0];
  },

  async getAppointments(limit = 500) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('appointments').select('*').order('created', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },

  async addAppointment(appointment) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const sanitized = {
      id: appointment.id,
      name: sanitizeName(appointment.name),
      phone: sanitizePhone(appointment.phone),
      email: sanitizeEmail(appointment.email),
      age: appointment.age || null,
      date: appointment.date,
      time: String(appointment.time || '').trim(),
      service: String(appointment.service || '').trim(),
      doctor: String(appointment.doctor || '').trim(),
      status: appointment.status || 'Pending',
      visittype: String(appointment.visittype || '').trim(),
      notes: String(appointment.notes || '').trim(),
      created: appointment.created || new Date().toISOString()
    };
    const { data, error } = await supabaseClient.from('appointments').upsert([sanitized], { onConflict: 'id' }).select();
    if (error) throw error;
    return data?.[0];
  },

  async updateAppointment(id, updates) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('appointments').update(updates).eq('id', id).select();
    if (error) throw error;
    return data?.[0];
  },

  async deleteAppointment(id) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { error } = await supabaseClient.from('appointments').delete().eq('id', id);
    if (error) throw error;
  },

  async getOrthodontics(limit = 200) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('orthodontics').select('*').order('start', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },

  async addOrthodonticCase(orthoCase) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('orthodontics').upsert([orthoCase], { onConflict: 'id' }).select();
    if (error) throw error;
    return data?.[0];
  },

  async updateOrthodonticCase(id, updates) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('orthodontics').update(updates).eq('id', id).select();
    if (error) throw error;
    return data?.[0];
  },

  async deleteOrthodonticCase(id) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { error } = await supabaseClient.from('orthodontics').delete().eq('id', id);
    if (error) throw error;
  },

  async getOPGReports(limit = 50) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('opg_reports').select('id, pid, ortho_id, title, date, notes, created').order('date', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },

  async getOPGReportImage(id) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('opg_reports').select('image').eq('id', id).single();
    if (error) throw error;
    return data?.image || '';
  },

  async getOPGReportsByPatient(pid) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('opg_reports').select('*').eq('pid', pid).order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getOPGReportsByOrtho(orthoId) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('opg_reports').select('*').eq('ortho_id', orthoId).order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async addOPGReport(report) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('opg_reports').upsert([report], { onConflict: 'id' }).select();
    if (error) throw error;
    return data?.[0];
  },

  async updateOPGReport(id, updates) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const sanitized = {};
    for (const [key, val] of Object.entries(updates)) {
      if (typeof val === 'string') sanitized[key] = sanitizeName(val);
      else sanitized[key] = val;
    }
    const { data, error } = await supabaseClient.from('opg_reports').update(sanitized).eq('id', id).select();
    if (error) throw error;
    return data?.[0];
  },

  async deleteOPGReport(id) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { error } = await supabaseClient.from('opg_reports').delete().eq('id', id);
    if (error) throw error;
  },

  async deletePatient(id) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { error } = await supabaseClient.from('patients').delete().eq('id', id);
    if (error) throw error;
  },

  async addAuditLog(log) {
    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient.from('audit_logs').insert([{
        user_id: currentSession?.user?.id || null,
        user_email: currentSession?.user?.email || 'unknown',
        action: log.action,
        entity_type: log.entityType,
        entity_id: log.entityId || null,
        entity_name: log.entityName || null,
        details: log.details || {},
        ip_address: log.ipAddress || null,
        created: new Date().toISOString()
      }]);
      if (error) devWarn('Audit log error:', error);
    } catch (e) {
      devWarn('Audit log failed:', e);
    }
  },

  async getDoctors() {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('doctors').select('*').order('display_name', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getAuditLogs(limit = 100) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('audit_logs').select('*').order('created', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },

  async addPatientConsent(consent) {
    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient.from('patient_consents').insert([{
        patient_id: consent.patientId,
        consent_type: consent.consentType,
        consent_given: consent.consentGiven,
        consent_text: consent.consentText,
        ip_address: consent.ipAddress || null,
        created: new Date().toISOString()
      }]);
      if (error) devWarn('Consent insert error:', error);
    } catch (e) {
      devWarn('Consent insert failed:', e);
    }
  },

  async getPatientConsents(patientId) {
    if (!supabaseClient) throw new Error('Supabase not configured');
    const { data, error } = await supabaseClient.from('patient_consents').select('*').eq('patient_id', patientId).order('created', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  isConfigured() {
    return isSupabaseConfigured;
  },

  getClient() {
    return supabaseClient;
  },

  async login(email, password) {
    return doLogin(email, password);
  },

  async logout() {
    return doLogout();
  },

  getSession() {
    return currentSession;
  }
};

async function getHolidays() {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('clinic_holidays').select('*').order('date', { ascending: true });
      if (!error && data) {
        return data.map(h => ({ date: h.date, reason: h.reason }));
      }
    } catch (e) {
      devWarn('Holiday fetch failed:', e.message || e);
    }
  }
  return [];
}

async function addHoliday(date, reason) {
  if (!supabaseClient) throw new Error('Supabase not configured');
  try {
    const { error } = await supabaseClient.from('clinic_holidays').upsert([{ date, reason: reason || 'Closure' }], { onConflict: 'date' });
    if (error) throw error;
    return true;
  } catch (e) {
    devWarn('Holiday add failed:', e.message || e);
    return false;
  }
}

async function removeHoliday(date) {
  if (!supabaseClient) throw new Error('Supabase not configured');
  try {
    const { error } = await supabaseClient.from('clinic_holidays').delete().eq('date', date);
    if (error) throw error;
  } catch (e) {
    devWarn('Holiday remove failed:', e.message || e);
  }
}

function isHoliday(dateStr) {
  devWarn('isHoliday called synchronously - use getHolidays() instead for Supabase-backed data');
  return false;
}
window.getHolidays = getHolidays;
window.isHoliday = isHoliday;
window.addHoliday = addHoliday;
window.removeHoliday = removeHoliday;
window.devLog = devLog;
window.devWarn = devWarn;
window.devError = devError;

window.SupabaseDB = SupabaseDB;
window.htmlEscape = htmlEscape;
window.sanitizeName = sanitizeName;
window.sanitizePhone = sanitizePhone;
window.sanitizeEmail = sanitizeEmail;
window.validateRequired = validateRequired;
window.checkRateLimit = checkRateLimit;
window.CLINIC_WHATSAPP = CLINIC_WHATSAPP;
window.initSession = initSession;
window.getSession = getSession;

initSession().catch(e => devWarn('Session init failed:', e.message || e));
