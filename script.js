// ASTRO NOVA - browser-only prototype.
// Data is kept in memory for this tab session. Nothing is sent to a server.
const state = { readings: [], reports: [], stream: null, recognition: null };

const $ = (id) => document.getElementById(id);
const now = () => new Date().toLocaleString();

$('menuToggle').addEventListener('click', () => $('mainNav').classList.toggle('open'));
document.querySelectorAll('#mainNav a').forEach(a => a.addEventListener('click', () => $('mainNav').classList.remove('open')));

function safeText(value) {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function updateDashboard() {
  const latest = {};
  state.readings.forEach(r => { if (!latest[r.metric]) latest[r.metric] = r; });
  $('heartDisplay').textContent = latest.heart ? latest.heart.value : '—';
  $('spo2Display').textContent = latest.spo2 ? latest.spo2.value : '—';
  $('tempDisplay').textContent = latest.temperature ? latest.temperature.value : '—';
  $('bpDisplay').textContent = latest.bp ? latest.bp.value : '—';
  const list = $('readingList');
  if (!state.readings.length) {
    list.className = 'empty-state';
    list.textContent = 'No measurements recorded. Add a reading in Monitoring to see it here.';
    return;
  }
  list.className = '';
  list.innerHTML = state.readings.slice().reverse().map(r =>
    `<div class="report-item"><b>${safeText(r.label)}: ${safeText(r.value)}</b> · ${safeText(r.source)}<small>${safeText(r.time)}${r.note ? ' · ' + safeText(r.note) : ''}</small></div>`
  ).join('');
}

$('readingForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const metric = $('metric').value;
  const raw = $('readingValue').value.trim();
  if (!raw || !/^-?\d+(\.\d+)?$/.test(raw)) {
    alert('Please enter a numeric measured value. Do not enter an estimate.');
    return;
  }
  const labels = {heart:'Heart rate (BPM)',spo2:'SpO₂ (%)',temperature:'Temperature (°C)',bp:'Blood pressure (mmHg)'};
  const value = Number(raw);
  if ((metric === 'heart' && (value <= 0 || value > 300)) ||
      (metric === 'spo2' && (value <= 0 || value > 100)) ||
      (metric === 'temperature' && (value < 25 || value > 45))) {
    alert('This value is outside the prototype input range. Check the measurement and unit.');
    return;
  }
  const entry = {metric, label:labels[metric], value:raw, source:$('readingSource').value, note:$('readingNote').value.trim(), time:now()};
  state.readings.push(entry);
  $('readingForm').reset();
  updateDashboard();
});

$('bluetoothBtn').addEventListener('click', () => {
  const supported = !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  $('bluetoothStatus').textContent = supported
    ? 'Web Bluetooth is available; no device has been paired.'
    : 'Web Bluetooth is not supported in this browser/device.';
  if (supported) alert('Bluetooth API is available. A specific compatible device service and data protocol must be implemented before readings can be received.');
});

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    $('cameraStatus').textContent = 'Camera access is unavailable. Use HTTPS or localhost and a supported browser.';
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
    $('cameraVideo').srcObject = state.stream;
    $('cameraVideo').style.display = 'block';
    $('cameraPlaceholder').style.display = 'none';
    $('cameraStatus').textContent = 'Camera is active. No health analysis is being performed.';
    $('startCamera').disabled = true; $('stopCamera').disabled = false; $('captureBtn').disabled = false; $('scanQrBtn').disabled = false;
  } catch (error) {
    $('cameraStatus').textContent = `Camera could not start: ${error.message}. Check browser permission and close other camera apps.`;
  }
}
function stopCamera() {
  if (state.stream) state.stream.getTracks().forEach(track => track.stop());
  state.stream = null; $('cameraVideo').srcObject = null; $('cameraVideo').style.display = 'none';
  $('cameraPlaceholder').style.display = 'grid';
  $('cameraStatus').textContent = 'Camera stopped.';
  $('startCamera').disabled = false; $('stopCamera').disabled = true; $('captureBtn').disabled = true; $('scanQrBtn').disabled = true;
}
$('startCamera').addEventListener('click', startCamera);
$('stopCamera').addEventListener('click', stopCamera);
$('captureBtn').addEventListener('click', () => {
  const video = $('cameraVideo'), canvas = $('captureCanvas');
  if (!video.videoWidth) { $('cameraStatus').textContent = 'Camera is not ready yet.'; return; }
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  $('cameraStatus').textContent = `Image captured locally (${canvas.width} × ${canvas.height}). No face or medical analysis was performed.`;
});
$('scanQrBtn').addEventListener('click', async () => {
  if (!('BarcodeDetector' in window)) {
    $('qrResult').textContent = 'QR scanning is not supported by this browser. Try a supported Chromium browser or add a dedicated QR library.';
    return;
  }
  try {
    const detector = new BarcodeDetector({formats:['qr_code']});
    const codes = await detector.detect($('cameraVideo'));
    $('qrResult').textContent = codes.length ? `QR content (unverified): ${codes.map(c => c.rawValue).join(' | ')}` : 'No QR code detected in the current camera frame.';
  } catch (e) { $('qrResult').textContent = `QR scan failed: ${e.message}`; }
});

$('symptomForm').addEventListener('submit', (event) => {
  event.preventDefault();
  state.reports.push({type:'Symptom report', detail:`${$('bodyRegion').value}: ${$('symptomText').value}`, extra:`Reported severity: ${$('severity').value}; Duration: ${$('duration').value || 'Not specified'}`, time:now()});
  $('symptomForm').reset(); renderReports();
});
$('wellnessForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!$('mood').value || !$('stress').value || !$('fatigue').value) { alert('Please complete all wellness fields.'); return; }
  state.reports.push({type:'Wellness check-in', detail:`Mood: ${$('mood').value}; Stress: ${$('stress').value}; Fatigue: ${$('fatigue').value}`, extra:'Self-reported information; not a clinical assessment.', time:now()});
  $('wellnessForm').reset(); renderReports();
});
function renderReports() {
  const el = $('reportList');
  if (!state.reports.length) { el.className='empty-state'; el.textContent='No symptom or wellness reports yet.'; return; }
  el.className='';
  el.innerHTML = state.reports.slice().reverse().map(r => `<div class="report-item"><b>${safeText(r.type)}</b><br>${safeText(r.detail)}<small>${safeText(r.extra)} · ${safeText(r.time)}</small></div>`).join('');
}
$('clearSession').addEventListener('click', () => {
  if (!confirm('Clear all readings and reports from this browser session?')) return;
  state.readings = []; state.reports = []; updateDashboard(); renderReports();
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
$('voiceBtn').addEventListener('click', () => {
  if (!SpeechRecognition) {
    $('voiceStatus').textContent = 'Speech recognition is not supported in this browser. You can type into the symptom form instead.';
    return;
  }
  if (state.recognition) { state.recognition.stop(); state.recognition = null; return; }
  const recognition = new SpeechRecognition();
  state.recognition = recognition; recognition.lang = 'en-US'; recognition.interimResults = false;
  $('voiceStatus').textContent = 'Listening… speak your health note.';
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    $('symptomText').value = transcript;
    $('voiceStatus').textContent = `Captured speech: “${transcript}” — review it and submit the symptom form to save.`;
    $('symptomForm').scrollIntoView({behavior:'smooth',block:'center'});
  };
  recognition.onerror = (event) => $('voiceStatus').textContent = `Voice input error: ${event.error}`;
  recognition.onend = () => { state.recognition = null; };
  recognition.start();
});
$('speakBtn').addEventListener('click', () => {
  if (!('speechSynthesis' in window)) { $('voiceStatus').textContent = 'Text-to-speech is not supported in this browser.'; return; }
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance('Hello. I am Nova. I can help you organize a symptom note. I cannot diagnose medical conditions. Please contact your medical team for health concerns.'));
});

$('exportBtn').addEventListener('click', () => {
  const report = {title:'ASTRO NOVA - Current Session Report',generatedAt:now(),notice:'Student prototype. Not a medical record or diagnosis.',readings:state.readings,reports:state.reports};
  const blob = new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href=url; a.download='astro-nova-session-report.json'; a.click(); URL.revokeObjectURL(url);
});
$('sosBtn').addEventListener('click', () => {
  const entry = {type:'Local SOS draft',detail:'SOS workflow requested by user. NOT SENT to any person or service.',extra:'Use the approved emergency procedure and contact mission control / qualified personnel directly.',time:now()};
  state.reports.push(entry); renderReports();
  $('sosStatus').textContent = 'Local SOS draft added to this session only. No alert was transmitted.';
  $('reportList').scrollIntoView({behavior:'smooth',block:'center'});
});

window.addEventListener('beforeunload', stopCamera);
updateDashboard(); renderReports();
