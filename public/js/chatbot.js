const chatServices = [
  'General Check-up', 'Scaling', 'Dental Filling', 'Dental Implants',
  'Root Canal', 'Orthodontics', 'Ceramic Braces', 'Metal Braces',
  'Clear Aligners', 'Child Dental Care', 'Wisdom Tooth Removal'
];

let chatDoctors = [];

async function loadChatDoctors() {
  if (typeof SupabaseDB !== 'undefined' && SupabaseDB.isConfigured()) {
    try {
      const docs = await SupabaseDB.getDoctors();
      chatDoctors = docs.map(d => d.display_name).filter(Boolean);
    } catch (e) {
      chatDoctors = ['Dr. Saranya Mohan'];
    }
  }
  if (!chatDoctors.length) chatDoctors = ['Dr. Saranya Mohan'];
}

const chatTimes = ['5:00 PM','5:30 PM','6:00 PM','6:30 PM','7:00 PM','7:30 PM','8:00 PM','8:30 PM','9:00 PM'];

let chatState = { step: 0, data: {} };

function toggleChat() {
  const el = document.getElementById('chatWidget');
  el.classList.toggle('open');
  if (el.classList.contains('open') && !chatState.step) {
    loadChatDoctors();
    (async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const holidays = await getHolidays();
      const holiday = holidays.find(h => h.date === todayStr);
    if (holiday) {
      setTimeout(() => addChatMsg('bot', '\uD83C\uDF89 <b>Notice:</b> The clinic is closed today' + (holiday.reason ? ' (' + htmlEscape(holiday.reason) + ')' : '') + '.<br>Please select a different date to book.'), 300);
      setTimeout(() => addChatMsg('bot', 'What service are you looking for?'), 900);
      setTimeout(() => showChatOptions(chatServices, 'service'), 1400);
    } else {
      setTimeout(() => addChatMsg('bot', '\uD83D\uDC4B Hello! Welcome to <b>SP Dental Care</b>.<br>I\'ll help you book an appointment in just a few steps.'), 300);
      setTimeout(() => addChatMsg('bot', 'What service are you looking for?'), 800);
      setTimeout(() => showChatOptions(chatServices, 'service'), 1300);
    }
    chatState.step = 1;
    })();
  }
}

function chatEscapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

function addChatMsg(who, text) {
  const body = document.getElementById('chatBody');
  const d = document.createElement('div');
  d.className = 'chat-msg ' + who;
  d.innerHTML = text;
  body.appendChild(d);
  body.scrollTop = body.scrollHeight;
}

function safeChatMsg(who, text) {
  addChatMsg(who, chatEscapeHtml(text));
}

function showChatOptions(options, key) {
  const body = document.getElementById('chatBody');
  const d = document.createElement('div');
  d.className = 'chat-options';
  options.forEach(opt => {
    const b = document.createElement('button');
    b.className = 'chat-opt-btn';
    b.textContent = opt;
    b.onclick = () => handleChatChoice(key, opt);
    d.appendChild(b);
  });
  body.appendChild(d);
  body.scrollTop = body.scrollHeight;
}

async function showChatDatePicker() {
  const body = document.getElementById('chatBody');
  const d = document.createElement('div');
  d.className = 'chat-options';
  const inp = document.createElement('input');
  inp.type = 'date';
  inp.className = 'chat-date-inp';
  const todayDate = new Date();
  inp.min = todayDate.toISOString().split('T')[0];
  const todayStr = todayDate.toISOString().split('T')[0];
  const holidays = await getHolidays();
  if (holidays.some(h => h.date === todayStr)) {
    const next = new Date(todayDate); next.setDate(next.getDate() + 1);
    inp.value = next.toISOString().split('T')[0];
  } else {
    inp.value = todayStr;
  }
  const btn = document.createElement('button');
  btn.className = 'chat-opt-btn';
  btn.textContent = '\u2713 Select Date';
  btn.onclick = async () => {
    if (!inp.value) return;
    const hols = await getHolidays();
    if (hols.some(h => h.date === inp.value)) {
      addChatMsg('bot', '\u274C <b>Closure Notice</b><br>Sorry, the clinic is closed on this date. Please pick another day.');
      inp.value = '';
      return;
    }
    handleChatChoice('date', inp.value);
  };
  d.appendChild(inp);
  d.appendChild(btn);
  body.appendChild(d);
  body.scrollTop = body.scrollHeight;
}

function showChatTimeSlots() {
  const body = document.getElementById('chatBody');
  const d = document.createElement('div');
  d.className = 'chat-options';
  const booked = new Set();
  const loadSlots = async () => {
    try {
      const remote = await SupabaseDB.getAppointments();
      remote.filter(a => a.date === chatState.data.date).forEach(a => booked.add(a.time));
    } catch (e) {
      devWarn('Could not fetch appointments:', e.message);
    }
    chatTimes.forEach(t => {
      const past2h = isSlotPast2Hours(t, chatState.data.date);
      const b = document.createElement('button');
      b.className = 'chat-opt-btn' + (booked.has(t) || past2h ? ' disabled' : '');
      b.textContent = t + (past2h ? ' (too soon)' : '');
      if (!booked.has(t) && !past2h) b.onclick = () => handleChatChoice('time', t);
      d.appendChild(b);
    });
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
  };
  loadSlots();
}

function showChatNameInput() {
  const body = document.getElementById('chatBody');
  const d = document.createElement('div');
  d.className = 'chat-options';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'chat-text-inp';
  inp.placeholder = 'Your full name...';
  const btn = document.createElement('button');
  btn.className = 'chat-opt-btn';
  btn.textContent = '\u2713 Next';
  btn.onclick = () => {
    const v = inp.value.trim();
    if (v) { handleChatChoice('name', v); }
    else { inp.style.borderColor = '#e74c3c'; }
  };
  d.appendChild(inp);
  d.appendChild(btn);
  body.appendChild(d);
  body.scrollTop = body.scrollHeight;
  setTimeout(() => inp.focus(), 100);
}

function showChatPhoneInput() {
  const body = document.getElementById('chatBody');
  const d = document.createElement('div');
  d.className = 'chat-options';
  const inp = document.createElement('input');
  inp.type = 'tel';
  inp.className = 'chat-text-inp';
  inp.placeholder = '+91 XXXXX XXXXX';
  const btn = document.createElement('button');
  btn.className = 'chat-opt-btn';
  btn.textContent = '\u2713 Book Now';
  btn.onclick = () => {
    const v = inp.value.trim();
    if (v) { handleChatChoice('phone', v); }
    else { inp.style.borderColor = '#e74c3c'; }
  };
  d.appendChild(inp);
  d.appendChild(btn);
  body.appendChild(d);
  body.scrollTop = body.scrollHeight;
  setTimeout(() => inp.focus(), 100);
}

async function handleChatChoice(key, value) {
  chatState.data[key] = value;
  addChatMsg('user', htmlEscape(value));

  if (key === 'service') {
    setTimeout(() => addChatMsg('bot', 'Great choice! ' + (value === 'Orthodontics' ? '\uD83D\uDE01 ' : '') + 'Now, pick your preferred date.'), 400);
    setTimeout(() => showChatDatePicker(), 900);
    chatState.step = 2;
  } else if (key === 'date') {
    const d = new Date(value + 'T00:00:00');
    const formatted = d.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    chatState.data.dateDisplay = formatted;
    setTimeout(() => addChatMsg('bot', '\uD83D\uDCC5 <b>' + htmlEscape(formatted) + '</b> \u2014 great! Now choose a time slot:'), 400);
    setTimeout(() => addChatMsg('bot', '<small>\u2139\uFE0F Appointments must be booked at least 2 hours in advance.</small>'), 700);
    setTimeout(() => showChatTimeSlots(), 900);
    chatState.step = 3;
  } else if (key === 'time') {
    if (isSlotPast2Hours(value, chatState.data.date)) {
      addChatMsg('bot', '\u274C That slot is less than 2 hours away. Please choose a later time.');
      return;
    }
    setTimeout(() => addChatMsg('bot', '\u23F0 <b>' + htmlEscape(value) + '</b> \u2014 perfect! Who would you like to see?'), 400);
    setTimeout(() => showChatOptions(chatDoctors, 'doctor'), 900);
    chatState.step = 4;
  } else if (key === 'doctor') {
    setTimeout(() => addChatMsg('bot', '\uD83D\uDC68\u200D\u2695\uFE0F <b>' + htmlEscape(value) + '</b> \u2014 excellent choice! What\'s your name?'), 400);
    setTimeout(() => showChatNameInput(), 900);
    chatState.step = 5;
  } else if (key === 'name') {
    setTimeout(() => {
      addChatMsg('bot', 'Nice to meet you, <b>' + htmlEscape(value) + '</b>!');
      setTimeout(() => {
        addChatMsg('bot', 'Before we proceed, we need your consent to collect and process your personal and health data for appointment scheduling. By continuing, you agree to our <a href="privacy.html" target="_blank" style="color:var(--gold);text-decoration:underline;">Privacy Policy</a>.');
        setTimeout(() => showChatOptions(['I Consent \u2705', 'Cancel \u2715'], 'consent'), 600);
      }, 500);
    }, 400);
    chatState.step = 6;
  } else if (key === 'consent') {
    if (value.startsWith('Cancel')) {
      addChatMsg('bot', 'Booking cancelled. Your data will not be stored.');
      setTimeout(() => {
        document.querySelectorAll('.chat-options').forEach(el => el.remove());
        addChatMsg('bot', 'Is there anything else I can help with?');
        setTimeout(() => showChatOptions(['Book Appointment', 'Close'], 'restart'), 600);
      }, 500);
      chatState.step = 0;
      return;
    }
    chatState.data.consent = true;
    setTimeout(() => addChatMsg('bot', 'Last step \u2014 your phone number:'), 400);
    setTimeout(() => showChatPhoneInput(), 900);
    chatState.step = 7;
  } else if (key === 'phone') {
    addChatMsg('bot', '\u23F3 Booking your appointment...');
    await submitChatBooking();
  } else if (key === 'restart') {
    document.querySelectorAll('.chat-options').forEach(el => el.remove());
    if (value.startsWith('Book')) {
      resetChat();
    } else {
      toggleChat();
    }
  }
}

async function submitChatBooking() {
  try {
    checkRateLimit();

    const bookedTimes = new Set();
    try {
      const remote = await SupabaseDB.getAppointments();
      remote.filter(a => a.date === chatState.data.date).forEach(a => bookedTimes.add(a.time));
    } catch (e) {
      devWarn('Could not fetch appointments:', e.message);
    }
    if (bookedTimes.has(chatState.data.time)) {
      addChatMsg('bot', '\u274C Sorry, that slot was just booked by someone else. Please go back and choose another time.');
      return;
    }

    const d = chatState.data;
    const id = 'APT-' + crypto.randomUUID().slice(0, 8);
    const apt = {
      id, name: sanitizeName(d.name), phone: sanitizePhone(d.phone), email: '', age: null,
      date: d.date, time: d.time, service: d.service,
      doctor: d.doctor, status: 'Pending', visittype: 'First Visit',
      notes: '', created: new Date().toISOString()
    };

    if (typeof SupabaseDB !== 'undefined' && SupabaseDB.isConfigured()) {
      try {
        await SupabaseDB.addAppointment(apt);
        const existingPatients = await SupabaseDB.getPatients();
        const existingPatient = existingPatients.find(p => p.phone === d.phone);
        let patientId;
        if (!existingPatient) {
          patientId = 'PD-' + crypto.randomUUID().slice(0, 8);
          const patientData = {
            id: patientId, name: sanitizeName(d.name), phone: sanitizePhone(d.phone),
            email: '', dob: null, gender: null, blood: null, address: null,
            treatment: d.service, doctor: d.doctor, history: null, notes: '',
            created: new Date().toISOString()
          };
          await SupabaseDB.addPatient(patientData);
        } else {
          patientId = existingPatient.id;
        }
        if (d.consent) {
          await SupabaseDB.addPatientConsent({
            patientId,
            consentType: 'data_collection',
            consentGiven: true,
            consentText: 'Patient consented to data collection for appointment scheduling and treatment purposes via chatbot'
          });
        }
      } catch (e) {
        devError('Chat booking save failed:', e);
        throw new Error('Could not save booking. Please try again.');
      }
    } else {
      throw new Error('Database not configured. Please contact the clinic directly.');
    }

    document.querySelectorAll('.chat-options').forEach(el => el.remove());

    const body = document.getElementById('chatBody');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg bot';
    msgDiv.innerHTML = '\u2705 <b>Appointment Confirmed!</b><br><br><b>#' + htmlEscape(id) + '</b><br>\uD83D\uDCC5 ' + htmlEscape(d.dateDisplay || d.date) + '<br>\u23F0 ' + htmlEscape(d.time) + '<br>\uD83C\uDFE5 ' + htmlEscape(d.service) + '<br>\uD83D\uDC68\u200D\u2695\uFE0F ' + htmlEscape(d.doctor) + '<br>\uD83D\uDC64 ' + htmlEscape(d.name) + '<br><br>See you at the clinic! \uD83D\uDE0A';
    body.appendChild(msgDiv);

    const optDiv = document.createElement('div');
    optDiv.className = 'chat-options';
    const btn1 = document.createElement('button');
    btn1.className = 'chat-opt-btn';
    btn1.textContent = '\uD83D\uDD04 Book Another';
    btn1.onclick = resetChat;
    optDiv.appendChild(btn1);
    const btn2 = document.createElement('button');
    btn2.className = 'chat-opt-btn';
    btn2.textContent = '\u2715 Close';
    btn2.onclick = toggleChat;
    optDiv.appendChild(btn2);
    body.appendChild(optDiv);

    body.scrollTop = body.scrollHeight;
    chatState.step = 0;
  } catch (e) {
    addChatMsg('bot', '\u274C Sorry, something went wrong. ' + htmlEscape(e.message || 'Please try again.'));
    devError('Chat booking error:', e);
  }
}

function resetChat() {
  chatState = { step: 0, data: {} };
  document.getElementById('chatBody').innerHTML = '';
  const el = document.getElementById('chatWidget');
  if (el.classList.contains('open')) {
    el.classList.remove('open');
  }
  setTimeout(() => toggleChat(), 100);
}
