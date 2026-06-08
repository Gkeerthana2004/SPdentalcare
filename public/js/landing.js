const booking = { service:'', date:'', time:'', doctor:'', name:'', phone:'', email:'', age:'', visitType:'', concern:'' };
let currentStep = 1;
let availableDoctors = [];

async function loadDoctors() {
  if (typeof SupabaseDB !== 'undefined' && SupabaseDB.isConfigured()) {
    try {
      const docs = await SupabaseDB.getDoctors();
      availableDoctors = docs.map(d => d.display_name).filter(Boolean);
    } catch (e) {
      devWarn('Could not fetch doctors:', e.message);
      availableDoctors = ['Dr. Saranya Mohan'];
    }
  }
  if (!availableDoctors.length) availableDoctors = ['Dr. Saranya Mohan'];
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
  try {
    const remote = await SupabaseDB.getAppointments();
    remote.filter(a => a.date === date).forEach(a => bookedTimes.add(a.time));
  } catch (e) {
    devWarn('Could not fetch appointments:', e.message);
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
    if (!availableDoctors.length) await loadDoctors();
    booking.doctor = availableDoctors[0] || 'Dr. Saranya Mohan';
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
  const consentChecked = document.getElementById('consentCheck')?.checked;
  if (!consentChecked) {
    showToast('\u26A0\uFE0F','Consent Required','Please consent to data collection to book an appointment');
    return;
  }
  try {
    checkRateLimit();

    const bookedTimes = new Set();
    try {
      const remote = await SupabaseDB.getAppointments();
      remote.filter(a => a.date === booking.date).forEach(a => bookedTimes.add(a.time));
    } catch (e) {
      devWarn('Could not fetch appointments:', e.message);
    }
    if (bookedTimes.has(booking.time)) {
      showToast('\u274C','Slot Taken','This slot was just booked by someone else. Please go back and choose another time.');
      return;
    }

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

    if (SupabaseDB.isConfigured()) {
      try {
        await SupabaseDB.addAppointment(appointmentData);
        const existingPatients = await SupabaseDB.getPatients();
        const existingPatient = existingPatients.find(p => p.phone === booking.phone);
        let patientId;
        if (!existingPatient) {
          patientId = 'PD-' + crypto.randomUUID().slice(0, 8);
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
        } else {
          patientId = existingPatient.id;
        }
        await SupabaseDB.addPatientConsent({
          patientId,
          consentType: 'data_collection',
          consentGiven: true,
          consentText: 'Patient consented to data collection for appointment scheduling and treatment purposes'
        });
      } catch (e) {
        devError('Booking save failed:', e);
        throw new Error('Could not save booking. Please try again or contact us directly.');
      }
    } else {
      throw new Error('Database not configured. Please contact the clinic directly.');
    }

    const fmtDate = booking.date ? new Date(booking.date).toLocaleDateString('en-IN', {weekday:'long', day:'numeric', month:'long', year:'numeric'}) : 'Not specified';
    document.getElementById('confirmDetails').innerHTML = '<div class="confirm-row"><span class="key">Appointment ID</span><span class="val">' + htmlEscape(appointmentId) + '</span></div><div class="confirm-row"><span class="key">Service</span><span class="val">' + htmlEscape(booking.service) + '</span></div><div class="confirm-row"><span class="key">Date</span><span class="val">' + htmlEscape(fmtDate) + '</span></div><div class="confirm-row"><span class="key">Time</span><span class="val">' + htmlEscape(booking.time) + '</span></div><div class="confirm-row"><span class="key">Doctor</span><span class="val">' + htmlEscape(booking.doctor || 'Any Available') + '</span></div><div class="confirm-row"><span class="key">Patient</span><span class="val">' + htmlEscape(booking.name) + '</span></div><div class="confirm-row"><span class="key">Contact</span><span class="val">' + htmlEscape(booking.phone) + '</span></div><div class="confirm-row"><span class="key">Visit Type</span><span class="val">' + htmlEscape(booking.visitType) + '</span></div>';
    document.getElementById('formContainer').style.display = 'none';
    document.getElementById('bookingSuccess').style.display = 'block';
    showToast('\uD83C\uDF89','Booking Confirmed!','Appointment saved successfully');
    updateSlotAvailability();
    setTimeout(() => resetBooking(), 5000);
  } catch (error) {
    devError('Error saving appointment:', error);
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
  const nav = document.getElementById('mobileNav');
  nav.classList.add('open');
  document.getElementById('hamburger').setAttribute('aria-expanded', 'true');
  nav.querySelector('a')?.focus();
});
document.getElementById('mobileClose').addEventListener('click', closeMobileNav);
function closeMobileNav() {
  document.getElementById('mobileNav').classList.remove('open');
  document.getElementById('hamburger').setAttribute('aria-expanded', 'false');
  document.getElementById('hamburger').focus();
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('mobileNav').classList.contains('open')) {
    closeMobileNav();
  }
});

const today = new Date();
const todayStr = today.toISOString().split('T')[0];

document.getElementById('apptDate').min = todayStr;

(async () => {
  const holidays = await getHolidays();
  const holidayToday = holidays.find(h => h.date === todayStr);
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
})();
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

const revealEls = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
}, { threshold:0.12 });
revealEls.forEach(el => observer.observe(el));

loadDoctors();
