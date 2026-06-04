const booking = { service:'', date:'', time:'', doctor:'', name:'', phone:'', email:'', age:'', visitType:'', concern:'' };
let currentStep = 1;

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
  const slotDate = new Date(dateStr + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const slotDay = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate());
  if (slotDay.getTime() !== today.getTime()) return false;
  const parsed = parseTime12h(timeStr);
  if (!parsed) return false;
  const slotTime = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), parsed.h, parsed.m, 0);
  const diffMs = slotTime.getTime() - now.getTime();
  return diffMs < 2 * 60 * 60 * 1000;
}

function selectOpt(el, groupId) {
  document.querySelectorAll('#' + groupId + ' .service-opt, #' + groupId + ' .doc-opt').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  if (groupId === 'serviceOptions') booking.service = el.dataset.val;
  if (groupId === 'doctorOptions') booking.doctor = el.dataset.val;
}

function selectSlot(el) {
  if (el.classList.contains('unavailable')) return;
  document.querySelectorAll('.time-slot').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  booking.time = el.textContent.trim();
}

async function updateSlotAvailability() {
  const date = document.getElementById('apptDate').value;
  if (!date) return;
  const bookedTimes = new Set();
  const localAppts = JSON.parse(localStorage.getItem('pd_appointments') || '[]');
  localAppts.filter(a => a.date === date).forEach(a => bookedTimes.add(a.time));
  if (typeof SupabaseDB !== 'undefined' && SupabaseDB.isConfigured()) {
    try {
      const remote = await SupabaseDB.getAppointments();
      remote.filter(a => a.date === date).forEach(a => bookedTimes.add(a.time));
    } catch (e) {
      console.warn('Could not fetch remote appointments:', e.message);
    }
  }
  document.querySelectorAll('.time-slot').forEach(slot => {
    const time = slot.textContent.trim();
    if (bookedTimes.has(time) || isSlotPast2Hours(time, date)) {
      slot.classList.add('unavailable');
      slot.classList.remove('selected');
    } else {
      slot.classList.remove('unavailable');
    }
  });
  if (bookedTimes.has(booking.time) || isSlotPast2Hours(booking.time, date)) booking.time = '';
}

async function nextStep(step) {
  if (step === 1) {
    if (!booking.service) { showToast('\u26A0\uFE0F','Please select a service','Choose from the options above'); return; }
    booking.concern = document.getElementById('concern').value;
  }
  if (step === 2) {
    booking.date = document.getElementById('apptDate').value;
    booking.visitType = document.getElementById('visitType').value;
    if (!booking.date) { showToast('\u26A0\uFE0F','Pick a date','Please select your preferred appointment date'); return; }
    if (typeof isHoliday === 'function' && isHoliday(booking.date)) {
      showToast('\uD83C\uDF89','Closure Notice','The clinic is closed on this date. Please choose another day.');
      booking.date = '';
      return;
    }
    await updateSlotAvailability();
    if (!booking.time) { showToast('\u26A0\uFE0F','Pick a time slot','This slot is already booked or too soon \u2014 please choose another'); return; }
    if (isSlotPast2Hours(booking.time, booking.date)) {
      booking.time = '';
      showToast('\u26A0\uFE0F','Slot too soon','Appointments must be booked at least 2 hours in advance. Please choose a later slot.');
      return;
    }
  }
  if (step === 3) {
    if (!booking.doctor) booking.doctor = 'Any Available Doctor';
  }
  showStep(step +1);
}

function prevStep(step) { showStep(step -1); }

function showStep(n) {
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  document.getElementById('step' + n).classList.add('active');
  for (let i = 1; i <= 4; i++) {
    const p = document.getElementById('ps' + i);
    p.classList.remove('active','done');
    if (i < n) p.classList.add('done');
    if (i === n) p.classList.add('active');
  }
  currentStep = n;
  if (n === 2) updateSlotAvailability();
}

async function submitBooking() {
  booking.name = document.getElementById('fullName').value.trim();
  booking.phone = document.getElementById('phone').value.trim();
  booking.email = document.getElementById('email').value.trim();
  booking.age = document.getElementById('age').value;
  if (!booking.name || !booking.phone) {
    showToast('\u26A0\uFE0F','Please fill required fields','Name and phone number are required'); return;
  }
  if (booking.phone && booking.phone.length < 10) {
    showToast('\u26A0\uFE0F','Invalid phone','Please enter a valid phone number'); return;
  }
  try {
    checkRateLimit();
    const submitBtn = document.querySelector('#step4 .btn-next');
    submitBtn.innerHTML = '\u23F3 Submitting...';
    submitBtn.disabled = true;

    const appointmentId = 'APT-' + crypto.randomUUID().slice(0, 8);
    const appointmentData = {
      id: appointmentId,
      name: sanitizeName(booking.name),
      phone: sanitizePhone(booking.phone),
      email: sanitizeEmail(booking.email),
      age: parseInt(booking.age) || null,
      date: booking.date,
      time: booking.time,
      service: booking.service,
      doctor: booking.doctor || 'Any Available Doctor',
      status: 'Pending',
      visittype: booking.visitType,
      notes: String(booking.concern || '').trim(),
      created: new Date().toISOString()
    };

    let savedToSupabase = false;
    try {
      if (SupabaseDB.isConfigured()) {
        try {
          await SupabaseDB.addAppointment(appointmentData);
          const existingPatients = await SupabaseDB.getPatients();
          const existingPatient = existingPatients.find(p => p.phone === booking.phone);
          if (!existingPatient) {
            const patientId = 'PD-' + crypto.randomUUID().slice(0, 8);
            const patientData = {
              id: patientId,
              name: sanitizeName(booking.name),
              dob: null, gender: null, blood: null,
              phone: sanitizePhone(booking.phone),
              email: sanitizeEmail(booking.email),
              address: null, treatment: booking.service,
              doctor: booking.doctor || 'Any Available Doctor',
              history: null, notes: String(booking.concern || '').trim(),
              created: new Date().toISOString()
            };
            await SupabaseDB.addPatient(patientData);
          }
          savedToSupabase = true;
        } catch (e) {
          console.warn('Supabase save failed, falling back to local storage:', e);
        }
      }
      const localAppts = JSON.parse(localStorage.getItem('pd_appointments') || '[]');
      localAppts.unshift(appointmentData);
      localStorage.setItem('pd_appointments', JSON.stringify(localAppts));
      const localPatients = JSON.parse(localStorage.getItem('pd_patients') || '[]');
      if (!localPatients.find(p => p.phone === booking.phone)) {
        const patientId = 'PD-' + crypto.randomUUID().slice(0, 8);
        const patientData = {
          id: patientId, name: sanitizeName(booking.name),
          dob: null, gender: null, blood: null,
          phone: sanitizePhone(booking.phone), email: sanitizeEmail(booking.email), address: null,
          treatment: booking.service, doctor: booking.doctor || 'Any Available Doctor',
          history: null, notes: String(booking.concern || '').trim(), created: new Date().toISOString()
        };
        localPatients.unshift(patientData);
        localStorage.setItem('pd_patients', JSON.stringify(localPatients));
      }
      if (!savedToSupabase) {
        console.log('Appointment saved locally (Supabase not available)');
      }
    } catch (supabaseError) {
      console.error('Booking save failed:', supabaseError);
      throw new Error('Could not save booking. Please try again.');
    }

    const fmtDate = booking.date ? new Date(booking.date).toLocaleDateString('en-IN', {weekday:'long', day:'numeric', month:'long', year:'numeric'}) : 'Not specified';
    document.getElementById('confirmDetails').innerHTML = '<div class="confirm-row"><span class="key">Appointment ID</span><span class="val">' + htmlEscape(appointmentId) + '</span></div><div class="confirm-row"><span class="key">Service</span><span class="val">' + htmlEscape(booking.service) + '</span></div><div class="confirm-row"><span class="key">Date</span><span class="val">' + htmlEscape(fmtDate) + '</span></div><div class="confirm-row"><span class="key">Time</span><span class="val">' + htmlEscape(booking.time) + '</span></div><div class="confirm-row"><span class="key">Doctor</span><span class="val">' + htmlEscape(booking.doctor || 'Any Available') + '</span></div><div class="confirm-row"><span class="key">Patient</span><span class="val">' + htmlEscape(booking.name) + '</span></div><div class="confirm-row"><span class="key">Contact</span><span class="val">' + htmlEscape(booking.phone) + '</span></div><div class="confirm-row"><span class="key">Visit Type</span><span class="val">' + htmlEscape(booking.visitType) + '</span></div>';
    document.getElementById('formContainer').style.display = 'none';
    document.getElementById('bookingSuccess').style.display = 'block';
    const saveMsg = 'Appointment saved successfully' + (savedToSupabase ? ' to database.' : ' locally.');
    showToast('\uD83C\uDF89','Booking Confirmed!', saveMsg);
    updateSlotAvailability();
    setTimeout(() => resetBooking(), 5000);
  } catch (error) {
    console.error('Error saving appointment:', error);
    showToast('\u274C','Booking Failed',error.message || 'Please try again or contact us directly');
  } finally {
    const submitBtn = document.querySelector('#step4 .btn-next');
    if (submitBtn) {
      submitBtn.innerHTML = '\u2713 Confirm Booking';
      submitBtn.disabled = false;
    }
  }
}

function resetBooking() {
  document.getElementById('formContainer').style.display = 'block';
  document.getElementById('bookingSuccess').style.display = 'none';
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  document.getElementById('step1').classList.add('active');
  document.querySelectorAll('.service-opt, .doc-opt, .time-slot').forEach(e => e.classList.remove('selected'));
  document.querySelectorAll('.form-control').forEach(e => e.value = '');
  for (let k in booking) booking[k] = '';
  showStep(1);
}

function showToast(icon, title, msg) {
  document.getElementById('toastTitle').textContent = icon + ' ' + title;
  document.getElementById('toastMsg').textContent = msg;
  const t = document.getElementById('toast');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50);
});

document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('mobileNav').classList.add('open');
});
document.getElementById('mobileClose').addEventListener('click', closeMobileNav);
function closeMobileNav() { document.getElementById('mobileNav').classList.remove('open'); }

const today = new Date();
const todayStr = today.toISOString().split('T')[0];
const holidayToday = (typeof isHoliday === 'function' && isHoliday(todayStr))
  ? (JSON.parse(localStorage.getItem('pd_holidays')||'[]')).find(h => h.date === todayStr) : null;

document.getElementById('apptDate').min = todayStr;

if (holidayToday) {
  document.getElementById('apptDate').value = '';
  document.getElementById('bookingHolidayMsg').style.display = 'flex';
  document.getElementById('holidayMsgText').textContent = holidayToday.reason
    ? 'Today is a holiday (' + holidayToday.reason + ')' : 'Today is a holiday';

  document.getElementById('siteHolidayBanner').style.display = 'block';
  document.getElementById('siteHolidayMsg').textContent = '\uD83C\uDF89 Today is a holiday (' + (holidayToday.reason || 'Holiday') + ').';
  document.getElementById('navbar').style.top = '46px';

  const waBtn = document.getElementById('whatsappBtn');
  if (waBtn) {
    const msg = 'Hi%20SP%20Dental%20Care!%20I%20saw%20you%27re%20closed%20today%20(' + encodeURIComponent(holidayToday.reason || 'Holiday') + ').%20Can%20I%20book%20for%20another%20day%3F';
    waBtn.href = 'https://wa.me/' + CLINIC_WHATSAPP + '?text=' + msg;
    waBtn.title = 'Closed today \u2014 message us to book another day';
  }
} else {
  document.getElementById('apptDate').value = todayStr;
  document.getElementById('navbar').style.top = '0';
}
document.getElementById('apptDate').addEventListener('change', () => {
  booking.time = '';
  const val = document.getElementById('apptDate').value;
  if (typeof isHoliday === 'function' && isHoliday(val)) {
    showToast('\uD83C\uDF89','Closure Notice','The clinic is closed on this date. Please choose another day.');
    document.getElementById('apptDate').value = '';
    booking.date = '';
    return;
  }
  updateSlotAvailability();
});
setTimeout(updateSlotAvailability, 500);

function submitContactForm() {
  const name = document.getElementById('cf_name').value.trim();
  const phone = document.getElementById('cf_phone').value.trim();
  const email = document.getElementById('cf_email').value.trim();
  const subject = document.getElementById('cf_subject').value;
  const message = document.getElementById('cf_message').value.trim();
  if (!name || !message) {
    showToast('\u26A0\uFE0F','Missing fields','Please provide your name and message');
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('\u26A0\uFE0F','Invalid email','Please enter a valid email address');
    return;
  }
  if (phone && phone.length < 10) {
    showToast('\u26A0\uFE0F','Invalid phone','Please enter a valid phone number');
    return;
  }
  try {
    const contactMsgs = JSON.parse(localStorage.getItem('pd_contact_messages') || '[]');
    contactMsgs.unshift({ id: 'MSG-' + Date.now().toString().slice(-6), name, phone, email, subject, message, date: new Date().toISOString() });
    localStorage.setItem('pd_contact_messages', JSON.stringify(contactMsgs));
    document.getElementById('cf_name').value = '';
    document.getElementById('cf_phone').value = '';
    document.getElementById('cf_email').value = '';
    document.getElementById('cf_message').value = '';
    showToast('\u2705','Message Sent!','We\'ll get back to you within 24 hours');
  } catch (e) {
    showToast('\u274C','Send Failed','Could not send message. Please try again.');
  }
}

const revealEls = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
}, { threshold:0.12 });
revealEls.forEach(el => observer.observe(el));
