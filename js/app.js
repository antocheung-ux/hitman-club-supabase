// ============================================
// HITMAN PEKANBARU HASHING CLUB - APP.JS v2.0
// ============================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let isAdmin = false;
let scanner = null;
let lastScanTime = 0;
let runRegMode = 'single';
let editingRunId = null;

let publicData = { runs: [], gallery: [], kamus: [], settings: {}, prestasi: [] };
let adminData = {
  people: [], periods: [], bills: [], payments: [], kas: [], runs: [],
  runRegs: [], scanLogs: [], waLogs: [], auditLogs: []
};

// ================== HELPERS ==================
function $(id) { return document.getElementById(id); }
function esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function rupiah(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function today() { return new Date().toISOString().slice(0,10); }

function normalizeWa(raw) {
  let clean = String(raw || '').replace(/[^0-9]/g, '');
  if (!clean) return '';
  if (clean.startsWith('0')) clean = '62' + clean.slice(1);
  if (clean.startsWith('8')) clean = '62' + clean;
  return clean;
}

function toast(message, type = 'info') {
  const container = $('toastContainer');
  const el = document.createElement('div');
  const colors = { success:'bg-emerald-700', error:'bg-rose-700', warn:'bg-amber-700', info:'bg-slate-800' };
  el.className = `toast ${colors[type] || colors.info}`;
  el.innerText = message;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 350); }, 4500);
}

function switchPage(page) {
  document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
  const target = $('page-' + page);
  if (target) { target.classList.remove('hidden'); target.classList.add('animate-fade-in-up'); }
  if (page === 'admin') updateAdminUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchAdminTab(tab) {
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));
  const target = $('tab-' + tab);
  if (target) target.classList.remove('hidden');
  const btn = document.querySelector(`[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');
  
  if (tab === 'birthday') loadBirthdays();
}

// ================== STORAGE ==================
function compressImage(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Gagal kompres.')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal baca gambar.')); };
    img.src = url;
  });
}

async function uploadImage(bucket, path, file) {
  const blob = await compressImage(file);
  const { error } = await db.storage.from(bucket).upload(path, blob, { upsert: true, contentType: blob.type });
  if (error) throw error;
  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ================== AUTH ==================
async function initApp() {
  await checkAuth();
  await loadPublic();
  if ($('kasDate')) { $('kasDate').value = today(); $('kasDate').max = today(); }
}

async function checkAuth() {
  const { data } = await db.auth.getSession();
  currentUser = data.session?.user || null;
  if (!currentUser) { isAdmin = false; updateAuthUI(); return; }
  const { data: adminProfile } = await db.from('admin_profiles').select('*').eq('user_id', currentUser.id).maybeSingle();
  isAdmin = !!adminProfile;
  updateAuthUI();
  if (isAdmin) await loadAdminData();
}

function updateAuthUI() {
  const logoutBtn = $('logoutNavBtn');
  if (logoutBtn) logoutBtn.classList.toggle('hidden', !isAdmin);
}

async function loginAdmin() {
  const email = $('adminEmail').value.trim();
  const password = $('adminPassword').value;
  if (!email || !password) return toast('Email & password wajib.', 'warn');
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return toast(error.message, 'error');
  await checkAuth();
  if (!isAdmin) return toast('User bukan admin.', 'error');
  toast('Login berhasil.', 'success');
  updateAdminUI();
  switchAdminTab('member');
}

async function logoutAdmin() {
  await db.auth.signOut();
  currentUser = null;
  isAdmin = false;
  updateAuthUI();
  updateAdminUI();
  stopScanner();
  switchPage('home');
  toast('Logout berhasil.', 'info');
}

function updateAdminUI() {
  const auth = $('adminAuth'), dashboard = $('adminDashboard');
  const galleryForm = $('adminGalleryForm'), kamusForm = $('adminKamusForm'), sejarahEditWrap = $('sejarahEditWrap');
  if (!auth || !dashboard) return;

  if (isAdmin) {
    auth.classList.add('hidden');
    dashboard.classList.remove('hidden');
    if (galleryForm) galleryForm.classList.remove('hidden');
    if (kamusForm) kamusForm.classList.remove('hidden');
    if (sejarahEditWrap) sejarahEditWrap.classList.remove('hidden');
    if ($('adminEmailDisplay')) $('adminEmailDisplay').innerText = currentUser.email;
    renderAdminAll();
  } else {
    auth.classList.remove('hidden');
    dashboard.classList.add('hidden');
    if (galleryForm) galleryForm.classList.add('hidden');
    if (kamusForm) kamusForm.classList.add('hidden');
    if (sejarahEditWrap) sejarahEditWrap.classList.add('hidden');
  }
}

// ================== PUBLIC DATA ==================
async function loadPublic() {
  const [runs, gallery, kamus, settings, prestasi] = await Promise.all([
    db.from('runs').select('*').order('tanggal_acara', { ascending: true }),
    db.from('gallery').select('*').order('created_at', { ascending: false }),
    db.from('kamus_hash').select('*').order('sort_order'),
    db.from('settings').select('key,value').eq('is_public', true),
    db.rpc('get_public_prestasi')
  ]);
  publicData.runs = runs.data || [];
  publicData.gallery = gallery.data || [];
  publicData.kamus = kamus.data || [];
  publicData.prestasi = prestasi.data || [];
  publicData.settings = Object.fromEntries((settings.data || []).map(s => [s.key, s.value]));
  renderPublicAll();
}

function renderPublicAll() {
  renderStats();
  renderJadwal();
  renderGallery();
  renderKamus();
  renderSejarah();
}

function renderStats() {
  // Stats dihitung saat admin load; untuk publik tampilkan dari data tersedia
  const el = (id) => $(id);
  if (el('stat-runs')) el('stat-runs').innerText = publicData.runs.length;
  if (el('stat-photos')) el('stat-photos').innerText = publicData.gallery.length;
}

function getUpcomingRuns() {
  const todayStr = today();
  return publicData.runs.filter(r => !r.tanggal_acara || r.tanggal_acara >= todayStr)
    .sort((a, b) => (a.tanggal_acara || '9999-99-99').localeCompare(b.tanggal_acara || '9999-99-99'));
}

function renderJadwal() {
  const featuredEl = $('featuredRun'), runSelect = $('publicRunSelect');
  if (!featuredEl || !runSelect) return;
  const upcoming = getUpcomingRuns();
  if (!upcoming.length) {
    featuredEl.innerHTML = '<p class="text-slate-500">Belum ada jadwal run.</p>';
    runSelect.innerHTML = '<option value="">Belum ada run</option>';
    $('publicRunRegList').innerHTML = '<p class="text-slate-500">Belum ada pendaftaran.</p>';
    return;
  }
  const f = upcoming[0];
  featuredEl.innerHTML = `
    <div class="bg-slate-950 border border-brand-gold/30 rounded-2xl p-5 space-y-3">
      <div class="flex items-start gap-4">
        ${f.foto_path ? `<img src="${f.foto_path}" class="w-24 h-24 rounded-xl object-cover border border-slate-800">` : '<div class="w-24 h-24 rounded-xl bg-slate-800 flex items-center justify-center text-4xl">🏃</div>'}
        <div class="flex-1">
          <div class="text-amber-400 font-black text-lg">Run #${f.run_number || '-'} - ${esc(f.nama)}</div>
          <div class="text-sm">📅 ${f.tanggal_acara || 'Belum ditentukan'}</div>
          <div class="text-sm">📍 ${esc(f.lokasi || 'Posko HITMAN')}</div>
          ${f.deskripsi ? `<p class="text-xs text-slate-400 mt-1">${esc(f.deskripsi)}</p>` : ''}
        </div>
      </div>
    </div>`;
  runSelect.innerHTML = upcoming.map(r => `<option value="${r.id}">Run #${r.run_number||'-'} - ${esc(r.nama)} - ${r.tanggal_acara||'TBA'}</option>`).join('');
  loadPublicRunRegs();
}

async function loadPublicRunRegs() {
  const runId = $('publicRunSelect').value;
  const list = $('publicRunRegList');
  if (!runId) { list.innerHTML = '<p class="text-slate-500">Pilih run.</p>'; return; }
  const { data } = await db.from('run_registrations').select('*').eq('run_id', runId).order('created_at', { ascending: false });
  if (!data || !data.length) { list.innerHTML = '<p class="text-slate-500">Belum ada peserta.</p>'; return; }
  list.innerHTML = data.map(x => `
    <div class="flex justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
      <span>${esc(x.nama)}</span>
      <span class="text-xs font-bold ${x.tipe === 'member' ? 'text-emerald-400' : 'text-amber-400'}">${esc(x.tipe)}</span>
    </div>`).join('');
}

function setRunRegMode(mode) {
  runRegMode = mode;
  const sBtn = $('runRegModeSingleBtn'), mBtn = $('runRegModeMultiBtn');
  const sWrap = $('runRegSingleWrap'), mWrap = $('runRegMultiWrap');
  if (mode === 'multi') {
    mBtn.classList.add('bg-emerald-700','text-white'); mBtn.classList.remove('text-slate-400');
    sBtn.classList.remove('bg-emerald-700','text-white'); sBtn.classList.add('text-slate-400');
    mWrap.classList.remove('hidden'); sWrap.classList.add('hidden');
  } else {
    sBtn.classList.add('bg-emerald-700','text-white'); sBtn.classList.remove('text-slate-400');
    mBtn.classList.remove('bg-emerald-700','text-white'); mBtn.classList.add('text-slate-400');
    sWrap.classList.remove('hidden'); mWrap.classList.add('hidden');
  }
}

async function submitPublicRunReg() {
  const runId = $('publicRunSelect').value;
  if (!runId) return toast('Pilih run.', 'warn');

  let names = [];
  if (runRegMode === 'multi') {
    names = $('publicRunNameList').value.split('\n').map(s => s.trim()).filter(s => s);
    if (!names.length) return toast('Isi minimal 1 nama.', 'warn');
  } else {
    const name = $('publicRunName').value.trim();
    if (!name) return toast('Isi nama.', 'warn');
    names = [name];
  }

  let success = 0, duplicate = 0;
  for (const name of names) {
    const { data, error } = await db.rpc('register_run_public', { p_run_id: runId, p_nama: name });
    if (error) { toast(error.message, 'error'); continue; }
    if (data.status === 'duplicate') duplicate++;
    else success++;
  }

  if (success > 0) toast(`${success} peserta terdaftar${duplicate > 0 ? `, ${duplicate} duplikat` : ''}.`, 'success');
  else if (duplicate > 0) toast('Semua nama sudah terdaftar.', 'warn');

  $('publicRunName').value = '';
  $('publicRunNameList').value = '';
  loadPublicRunRegs();
}

function renderGallery() {
  const grid = $('galleryGrid');
  if (!grid) return;
  if (!publicData.gallery.length) { grid.innerHTML = '<p class="text-slate-500 text-sm col-span-full">Belum ada foto.</p>'; return; }
  grid.innerHTML = publicData.gallery.map(g => `
    <div class="relative rounded-2xl overflow-hidden border border-slate-800 group cursor-pointer card-hover" onclick="openGalleryModal('${g.image_path}')">
      <img src="${g.image_path}" class="w-full h-40 object-cover group-hover:scale-105 transition">
      ${g.caption ? `<div class="absolute bottom-0 bg-gradient-to-t from-black/90 to-transparent text-xs p-2 w-full">${esc(g.caption)}</div>` : ''}
      ${isAdmin ? `<button onclick="event.stopPropagation(); deleteGallery('${g.id}')" class="absolute top-2 right-2 bg-rose-600 hover:bg-rose-500 px-2 py-1 rounded-lg text-xs font-bold opacity-0 group-hover:opacity-100 transition">✕</button>` : ''}
    </div>`).join('');
}

function openGalleryModal(url) {
  $('galleryModalImg').src = url;
  $('galleryModal').classList.remove('hidden');
  $('galleryModal').classList.add('flex');
}

function closeGalleryModal() {
  $('galleryModal').classList.add('hidden');
  $('galleryModal').classList.remove('flex');
}

async function uploadGallery() {
  const file = $('galleryFile').files[0];
  const caption = $('galleryCaption').value.trim();
  if (!file) return toast('Pilih foto.', 'warn');
  try {
    const path = `gallery/${Date.now()}.jpg`;
    const url = await uploadImage('gallery-photos', path, file);
    const { error } = await db.from('gallery').insert({ image_path: url, caption, submitter: isAdmin ? 'Admin' : 'Anonim' });
    if (error) throw error;
    toast('Foto ditambahkan.', 'success');
    $('galleryFile').value = '';
    $('galleryCaption').value = '';
    await loadPublic();
    if (isAdmin) await loadAdminData();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteGallery(id) {
  if (!isAdmin) return toast('Hanya admin.', 'error');
  if (!confirm('Hapus foto?')) return;
  const { error } = await db.from('gallery').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Foto dihapus.', 'success');
  await loadPublic();
}

function renderKamus() {
  const list = $('kamusList');
  if (!list) return;
  if (!publicData.kamus.length) { list.innerHTML = '<p class="text-slate-500 text-sm col-span-full">Belum ada istilah.</p>'; return; }
  list.innerHTML = publicData.kamus.map(k => `
    <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 card-hover">
      <div class="flex justify-between items-start gap-2">
        <div class="font-bold text-white">${esc(k.term)}</div>
        ${isAdmin ? `<button onclick="deleteKamus('${k.id}')" class="text-rose-400 text-xs font-bold">🗑️</button>` : ''}
      </div>
      <div class="text-slate-400 text-xs mt-2">${esc(k.def)}</div>
    </div>`).join('');
}

async function addKamus() {
  if (!isAdmin) return toast('Hanya admin.', 'error');
  const term = $('kamusTerm').value.trim(), def = $('kamusDef').value.trim();
  if (!term || !def) return toast('Lengkapi data.', 'warn');
  const { error } = await db.from('kamus_hash').insert({ id: 'k' + Date.now(), term, def, sort_order: 999 });
  if (error) return toast(error.message, 'error');
  toast('Istilah ditambah.', 'success');
  $('kamusTerm').value = ''; $('kamusDef').value = '';
  await loadPublic();
}

async function deleteKamus(id) {
  if (!isAdmin) return toast('Hanya admin.', 'error');
  if (!confirm('Hapus istilah?')) return;
  const { error } = await db.from('kamus_hash').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Dihapus.', 'success');
  await loadPublic();
}

function renderSejarah() {
  const view = $('sejarahView'), edit = $('sejarahEdit');
  if (!view) return;
  const sejarah = publicData.settings.sejarahKlub || 'Sejarah belum ditambahkan.';
  view.innerText = sejarah;
  if (edit) edit.value = sejarah;
}

async function saveSejarah() {
  if (!isAdmin) return toast('Hanya admin.', 'error');
  const { error } = await db.from('settings').upsert({ key: 'sejarahKlub', value: $('sejarahEdit').value, is_public: true });
  if (error) return toast(error.message, 'error');
  toast('Sejarah disimpan.', 'success');
  await loadPublic();
}

// ================== ADMIN DATA ==================
async function loadAdminData() {
  if (!isAdmin) return;
  const [people, periods, bills, payments, kas, runs, runRegs, scanLogs, waLogs, auditLogs] = await Promise.all([
    db.from('people').select('*').order('created_at', { ascending: false }),
    db.from('iuran_periods').select('*').order('periode_key', { ascending: false }),
    db.from('iuran_bills').select('*'),
    db.from('payments').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('kas_transactions').select('*').is('deleted_at', null).order('tanggal', { ascending: false }).limit(300),
    db.from('runs').select('*').order('created_at', { ascending: false }),
    db.from('run_registrations').select('*').order('created_at', { ascending: false }).limit(300),
    db.from('scan_logs').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('wa_logs').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50)
  ]);
  adminData = {
    people: people.data || [], periods: periods.data || [], bills: bills.data || [],
    payments: payments.data || [], kas: kas.data || [], runs: runs.data || [],
    runRegs: runRegs.data || [], scanLogs: scanLogs.data || [], waLogs: waLogs.data || [],
    auditLogs: auditLogs.data || []
  };
  renderAdminAll();
}

function renderAdminAll() {
  renderStatsAdmin();
  renderMembers();
  renderIuran();
  renderPayments();
  renderKas();
  renderRunsAdmin();
  renderRunRegsAdmin();
  renderLogs();
}

function renderStatsAdmin() {
  const members = adminData.people.filter(p => p.type === 'member' && p.status_member === 'Aktif').length;
  const visitors = adminData.people.filter(p => p.type === 'visitor').length;
  if ($('stat-members')) $('stat-members').innerText = members;
  if ($('stat-visitors')) $('stat-visitors').innerText = visitors;
}

// ================== MEMBER ==================
function renderMembers() {
  const tbody = $('membersTable');
  if (!tbody) return;
  if (!adminData.people.length) { tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-slate-500">Belum ada data.</td></tr>'; return; }
  tbody.innerHTML = adminData.people.map(p => {
    const status = p.type === 'member' ? (p.status_member || 'Aktif') : 'Visitor';
    const ultah = p.tanggal_lahir ? formatBirthday(p.tanggal_lahir) : '-';
    return `
      <tr class="hover:bg-slate-800/40">
        <td class="p-2">${p.foto_path ? `<img src="${p.foto_path}" class="w-10 h-10 rounded-full object-cover border border-slate-700">` : '<div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">👤</div>'}</td>
        <td class="p-2 font-semibold">${esc(p.nama)}</td>
        <td class="p-2">${esc(p.hashname || '-')}</td>
        <td class="p-2">${esc(p.type)}</td>
        <td class="p-2 text-xs">${ultah}</td>
        <td class="p-2"><span class="${status === 'Aktif' ? 'text-emerald-400' : status === 'Non Aktif' ? 'text-rose-400' : 'text-sky-400'} font-bold">${esc(status)}</span></td>
        <td class="p-2 font-bold text-emerald-400">${p.attendance_count || 0}x</td>
        <td class="p-2 space-x-1 whitespace-nowrap">
          <button onclick="showQrModal('${esc(p.id)}')" class="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 px-2 py-1 rounded-lg text-xs font-bold">🪪 ID</button>
          ${p.type === 'member' ? `<button onclick="toggleMemberStatus('${esc(p.id)}')" class="bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded-lg text-xs font-bold">${status === 'Aktif' ? '🚫' : '✅'}</button>` : ''}
        </td>
      </tr>`;
  }).join('');
}

function formatBirthday(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const today2 = new Date();
  const isToday = d.getMonth() === today2.getMonth() && d.getDate() === today2.getDate();
  const age = today2.getFullYear() - d.getFullYear();
  const label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  return isToday ? `<span class="text-pink-400 font-bold">🎂 ${label} (${age}th)</span>` : `${label} (${age}th)`;
}

async function handleRegister(e) {
  e.preventDefault();
  const type = $('regType').value;
  const name = $('regName').value.trim();
  const hashname = $('regHash').value.trim() || '-';
  const phone = normalizeWa($('regPhone').value);
  const size = $('regSize').value;
  const birthdate = $('regBirthdate').value || null;
  const file = $('regPhoto').files[0];
  const prefix = type === 'member' ? 'HHHH' : 'VVVV';
  const id = prefix + '-' + Math.floor(100000 + Math.random() * 900000);
  const qrToken = crypto.randomUUID();
  let fotoPath = null;
  try {
    if (file) fotoPath = await uploadImage('member-photos', `${type}/${encodeURIComponent(id)}/${Date.now()}.jpg`, file);
    const { error } = await db.from('people').insert({
      id, type, nama: name, hashname, phone, size, qr_token: qrToken,
      status_member: type === 'member' ? 'Aktif' : null,
      foto_path: fotoPath, tanggal_lahir: birthdate, ukuran_baju: size
    });
    if (error) throw error;
    toast(`${type === 'member' ? 'Member' : 'Visitor'} disimpan. Tagihan otomatis dibuat.`, 'success');
    e.target.reset();
    await loadAdminData();
  } catch (err) { toast(err.message, 'error'); }
}

async function toggleMemberStatus(id) {
  const person = adminData.people.find(x => x.id === id);
  if (!person) return;
  const newStatus = person.status_member === 'Aktif' ? 'Non Aktif' : 'Aktif';
  const { error } = await db.from('people').update({ status_member: newStatus }).eq('id', id);
  if (error) return toast(error.message, 'error');
  toast(`Status: ${newStatus}`, 'success');
  await loadAdminData();
}

function showQrModal(id) {
  const p = adminData.people.find(x => x.id === id);
  if (!p) return;
  $('cardTypeLabel').innerText = p.type === 'member' ? 'ID Member Digital' : 'ID Visitor Digital';
  $('cardName').innerText = p.nama;
  $('cardHash').innerText = `"${p.hashname || '-'}"`;
  $('cardId').innerText = 'ID: ' + p.id;
  $('cardInfo').innerText = `Ukuran: ${p.ukuran_baju || 'L'} • ${p.tanggal_lahir ? 'Lahir: ' + new Date(p.tanggal_lahir).toLocaleDateString('id-ID') : ''}`;
  if (p.foto_path) {
    $('cardPhoto').src = p.foto_path;
    $('cardPhoto').classList.remove('hidden');
    $('cardPhotoPlaceholder').classList.add('hidden');
  } else {
    $('cardPhoto').classList.add('hidden');
    $('cardPhotoPlaceholder').classList.remove('hidden');
  }
  $('qrBox').innerHTML = '';
  new QRCode($('qrBox'), { text: p.qr_token, width: 110, height: 110 });
  $('qrModal').classList.remove('hidden');
  $('qrModal').classList.add('flex');
}

function closeQrModal() {
  $('qrModal').classList.add('hidden');
  $('qrModal').classList.remove('flex');
}

function downloadCard() {
  const card = $('memberCard');
  if (!card) return;
  html2canvas(card, { scale: 3, useCORS: true, backgroundColor: null }).then(canvas => {
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `ID_Card_${$('cardName').innerText.replace(/\s+/g, '_')}.png`;
    link.click();
    toast('ID Card diunduh.', 'success');
  });
}

// ================== SCANNER ==================
function startScanner() {
  if (scanner) return toast('Sudah aktif.', 'info');
  scanner = new Html5Qrcode('reader');
  scanner.start(
    { facingMode: 'environment' }, { fps: 10, qrbox: 220 },
    async text => {
      const now = Date.now();
      if (now - lastScanTime < 3000) return;
      lastScanTime = now;
      let token = text.trim();
      try { const parsed = JSON.parse(text); token = parsed.token || parsed.id || token; } catch (e) {}
      const { data, error } = await db.rpc('record_attendance', { p_qr: token, p_tanggal: today() });
      const result = $('scanResult');
      if (error) { result.className = 'text-sm font-bold text-rose-400'; result.innerText = error.message; return toast(error.message, 'error'); }
      if (data.status === 'success') {
        result.className = 'text-sm font-bold text-emerald-400';
        result.innerText = `✅ ${data.nama} (${data.hashname || '-'}) hadir. Total: ${data.count}x`;
        toast(result.innerText, 'success');
        await loadAdminData();
      } else {
        result.className = 'text-sm font-bold text-amber-400';
        result.innerText = `⚠️ ${data.message}`;
        toast(data.message, 'warn');
      }
    }, () => {}
  ).catch(err => { toast('Gagal buka kamera: ' + err, 'error'); scanner = null; });
}

function stopScanner() {
  if (!scanner) return;
  scanner.stop().then(() => { scanner.clear(); scanner = null; $('reader').innerHTML = ''; }).catch(() => {});
}

// ================== IURAN ==================
function renderIuran() {
  renderPayMemberOptions();
  renderPayPeriodOptions();
  renderBills();
}

function renderBills() {
  const tbody = $('billsTable');
  if (!tbody) return;
  const periodMap = Object.fromEntries(adminData.periods.map(p => [p.id, p]));
  const memberMap = Object.fromEntries(adminData.people.map(p => [p.id, p]));
  const bills = adminData.bills.slice().sort((a, b) => String(periodMap[b.period_id]?.periode_key || '').localeCompare(String(periodMap[a.period_id]?.periode_key || '')));
  if (!bills.length) { tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-slate-500">Belum ada tagihan.</td></tr>'; return; }
  tbody.innerHTML = bills.map(b => {
    const period = periodMap[b.period_id] || {};
    const member = memberMap[b.member_id] || {};
    const statusClass = { belum_bayar:'text-amber-400', proses_verifikasi:'text-sky-400', lunas:'text-emerald-400', dibebaskan:'text-slate-500' }[b.status] || 'text-slate-300';
    return `
      <tr class="hover:bg-slate-800/40">
        <td class="p-2 font-bold">${esc(period.periode_key || '-')}</td>
        <td class="p-2">${esc(member.nama || b.member_id)}</td>
        <td class="p-2">${rupiah(b.amount)}</td>
        <td class="p-2 font-bold ${statusClass}">${esc(b.status)}</td>
        <td class="p-2">${b.status === 'belum_bayar' ? `<button onclick="remindBill('${b.id}')" class="bg-emerald-700 hover:bg-emerald-600 px-2 py-1 rounded-lg text-xs font-bold">📲 WA</button>` : '-'}</td>
      </tr>`;
  }).join('');
}

function renderPayMemberOptions() {
  const select = $('payMember');
  if (!select) return;
  const members = adminData.people.filter(x => x.type === 'member');
  select.innerHTML = '<option value="">Pilih member</option>' + members.map(m => `<option value="${m.id}">${esc(m.nama)} (${esc(m.hashname || '-')})</option>`).join('');
}

function renderPayPeriodOptions() {
  const select = $('payPeriods');
  if (!select) return;
  const memberId = $('payMember').value;
  const periodMap = Object.fromEntries(adminData.periods.map(p => [p.id, p]));
  const unpaid = adminData.bills.filter(b => b.member_id === memberId && b.status === 'belum_bayar')
    .sort((a, b) => String(periodMap[a.period_id]?.periode_key || '').localeCompare(String(periodMap[b.period_id]?.periode_key || '')));
  if (!unpaid.length) { select.innerHTML = '<option>Tidak ada tagihan</option>'; return; }
  select.innerHTML = unpaid.map(b => {
    const period = periodMap[b.period_id] || {};
    return `<option value="${esc(period.periode_key)}">${esc(period.periode_key)} - ${rupiah(b.amount)}</option>`;
  }).join('');
}

async function autoGenerateBills() {
  if (!confirm('Generate tagihan bulan berjalan untuk semua member aktif?')) return;
  const { data, error } = await db.rpc('auto_generate_current_month_bills');
  if (error) return toast(error.message, 'error');
  if (data.status === 'success') {
    toast(`Periode ${data.periode}: ${data.new_bills} tagihan baru dibuat.`, 'success');
    await loadAdminData();
  } else {
    toast(data.message || 'Gagal.', 'error');
  }
}

async function submitPayment(e) {
  e.preventDefault();
  const memberId = $('payMember').value;
  const periodKeys = Array.from($('payPeriods').selectedOptions).map(o => o.value);
  if (!memberId || !periodKeys.length) return toast('Pilih member & bulan.', 'warn');
  const { error } = await db.rpc('submit_payment', {
    p_member_id: memberId, p_period_keys: periodKeys,
    p_payment_method: $('payMethod').value, p_reference_no: null
  });
  if (error) return toast(error.message, 'error');
  toast('Payment request dibuat.', 'success');
  e.target.reset();
  await loadAdminData();
}

function renderPayments() {
  const tbody = $('paymentsTable');
  if (!tbody) return;
  const memberMap = Object.fromEntries(adminData.people.map(p => [p.id, p]));
  if (!adminData.payments.length) { tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-slate-500">Belum ada.</td></tr>'; return; }
  tbody.innerHTML = adminData.payments.map(p => {
    const member = memberMap[p.member_id] || {};
    const statusClass = { menunggu_verifikasi:'text-amber-400', disetujui:'text-emerald-400', ditolak:'text-rose-400', dibatalkan:'text-slate-500' }[p.status] || 'text-slate-300';
    return `
      <tr class="hover:bg-slate-800/40">
        <td class="p-2">${new Date(p.created_at).toLocaleString('id-ID')}</td>
        <td class="p-2">${esc(member.nama || p.member_id)}</td>
        <td class="p-2 font-bold">${rupiah(p.total_amount)}</td>
        <td class="p-2">${esc(p.payment_method || '-')}</td>
        <td class="p-2 font-bold ${statusClass}">${esc(p.status)}</td>
        <td class="p-2 space-x-1">${p.status === 'menunggu_verifikasi' ? `
          <button onclick="approvePayment('${p.id}')" class="bg-emerald-700 hover:bg-emerald-600 px-2 py-1 rounded-lg text-xs font-bold">✅</button>
          <button onclick="rejectPaymentPrompt('${p.id}')" class="bg-rose-600 hover:bg-rose-500 px-2 py-1 rounded-lg text-xs font-bold">❌</button>` : '-'}</td>
      </tr>`;
  }).join('');
}

async function approvePayment(id) {
  if (!confirm('Setujui pembayaran?')) return;
  const { error } = await db.rpc('approve_payment', { p_payment_id: id });
  if (error) return toast(error.message, 'error');
  toast('Disetujui. Kas masuk dicatat.', 'success');
  await loadAdminData();
}

async function rejectPaymentPrompt(id) {
  const reason = prompt('Alasan menolak:');
  if (reason === null) return;
  const { error } = await db.rpc('reject_payment', { p_payment_id: id, p_reason: reason || null });
  if (error) return toast(error.message, 'error');
  toast('Ditolak.', 'success');
  await loadAdminData();
}

async function remindBill(billId) {
  const bill = adminData.bills.find(x => x.id === billId);
  if (!bill) return;
  const member = adminData.people.find(x => x.id === bill.member_id);
  const period = adminData.periods.find(x => x.id === bill.period_id);
  if (!member || !period || !member.phone) return toast('Nomor WA tidak ada.', 'warn');
  const phone = normalizeWa(member.phone);
  const message = `Halo ${member.nama} (${member.hashname || '-'}) 👋\n\nMengingatkan iuran Hitman Pekanbaru untuk periode ${period.periode_key} sebesar ${rupiah(bill.amount)} belum tercatat lunas.\n\nMohon diselesaikan ya. Terima kasih! 🙏`;
  const link = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  try {
    await db.rpc('log_wa', { p_phone: phone, p_target_name: member.nama, p_message_type: 'reminder_iuran', p_status: 'manual', p_mode: 'wa.me', p_link: link });
    window.open(link, '_blank');
    toast('Link WA dibuka.', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// ================== KAS ==================
function renderKas() {
  const tbody = $('kasTable');
  const saldoEl = $('kasSaldo');
  if (!tbody || !saldoEl) return;
  let saldo = 0;
  adminData.kas.forEach(k => { saldo += k.tipe === 'Masuk' ? Number(k.jumlah) : -Number(k.jumlah); });
  saldoEl.innerText = rupiah(saldo);
  if (!adminData.kas.length) { tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-slate-500">Belum ada.</td></tr>'; return; }
  tbody.innerHTML = adminData.kas.map(k => `
    <tr class="hover:bg-slate-800/40">
      <td class="p-2">${esc(k.tanggal)}</td>
      <td class="p-2">${esc(k.kategori)}</td>
      <td class="p-2">${esc(k.keterangan || '-')}</td>
      <td class="p-2 font-bold ${k.tipe === 'Masuk' ? 'text-emerald-400' : 'text-rose-400'}">${esc(k.tipe)}</td>
      <td class="p-2 font-mono">${rupiah(k.jumlah)}</td>
      <td class="p-2"><button onclick="deleteKas('${k.id}')" class="bg-rose-600 hover:bg-rose-500 px-2 py-1 rounded-lg text-xs font-bold">🗑️</button></td>
    </tr>`).join('');
}

async function addKas(e) {
  e.preventDefault();
  const tanggal = $('kasDate').value;
  if (tanggal > today()) return toast('Tanggal tidak boleh melebihi hari ini.', 'error');
  const { error } = await db.from('kas_transactions').insert({
    tanggal, tipe: $('kasTipe').value, kategori: $('kasKategori').value,
    keterangan: $('kasKet').value.trim(), jumlah: parseFloat($('kasJumlah').value || 0),
    created_by: currentUser?.id || null
  });
  if (error) return toast(error.message, 'error');
  toast('Kas disimpan.', 'success');
  e.target.reset();
  $('kasDate').value = today();
  await loadAdminData();
}

async function deleteKas(id) {
  if (!confirm('Hapus transaksi? (akan tercatat di audit log)')) return;
  const { error } = await db.from('kas_transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Dihapus (soft delete).', 'success');
  await loadAdminData();
}

// ================== HARE / RUN ==================
function renderRunsAdmin() {
  const tbody = $('runsTable');
  if (!tbody) return;
  if (!adminData.runs.length) { tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-slate-500">Belum ada run.</td></tr>'; return; }
  tbody.innerHTML = adminData.runs.map(r => `
    <tr class="hover:bg-slate-800/40">
      <td class="p-2 font-bold text-amber-400">#${r.run_number || '-'}</td>
      <td class="p-2 font-semibold">${esc(r.nama)}</td>
      <td class="p-2">${r.tanggal_acara || '-'}</td>
      <td class="p-2">${esc(r.lokasi || '-')}</td>
      <td class="p-2 space-x-1 whitespace-nowrap">
        <button onclick="editRun('${r.id}')" class="bg-amber-600 hover:bg-amber-500 text-slate-950 px-2 py-1 rounded-lg text-xs font-bold">✏️</button>
        <button onclick="deleteRun('${r.id}')" class="bg-rose-600 hover:bg-rose-500 px-2 py-1 rounded-lg text-xs font-bold">🗑️</button>
      </td>
    </tr>`).join('');
}

async function addRun(e) {
  e.preventDefault();
  const file = $('runPhoto').files[0];
  let fotoPath = null;
  try {
    if (file) fotoPath = await uploadImage('run-photos', `runs/${Date.now()}.jpg`, file);
    const payload = {
      run_number: parseInt($('runNumber').value || 0) || null,
      nama: $('runName').value.trim(),
      tanggal_acara: $('runDate').value || null,
      lokasi: $('runLocation').value.trim(),
      deskripsi: $('runDesc').value.trim(),
      foto_path: fotoPath, status: 'published'
    };
    let error;
    if (editingRunId) {
      ({ error } = await db.from('runs').update(payload).eq('id', editingRunId));
    } else {
      ({ error } = await db.from('runs').insert(payload));
    }
    if (error) throw error;
    toast(editingRunId ? 'Run diperbarui.' : 'Run ditambahkan.', 'success');
    cancelEditRun();
    e.target.reset();
    await loadPublic();
    await loadAdminData();
  } catch (err) { toast(err.message, 'error'); }
}

function editRun(id) {
  const r = adminData.runs.find(x => x.id === id);
  if (!r) return;
  editingRunId = id;
  $('runEditId').value = id;
  $('runNumber').value = r.run_number || '';
  $('runName').value = r.nama || '';
  $('runDate').value = r.tanggal_acara || '';
  $('runLocation').value = r.lokasi || '';
  $('runDesc').value = r.deskripsi || '';
  $('hareFormTitle').innerText = '✏️ Edit Hare / Run';
  $('btnSubmitRun').innerText = '💾 Update Run';
  $('btnCancelEditRun').classList.remove('hidden');
  window.scrollTo({ top: $('tab-hare').offsetTop - 100, behavior: 'smooth' });
}

function cancelEditRun() {
  editingRunId = null;
  $('runEditId').value = '';
  $('hareFormTitle').innerText = '🚩 Tambah Hare / Run';
  $('btnSubmitRun').innerText = '➕ Simpan Run';
  $('btnCancelEditRun').classList.add('hidden');
  const form = $('tab-hare').querySelector('form');
  if (form) form.reset();
}

async function deleteRun(id) {
  if (!confirm('Hapus run?')) return;
  const { error } = await db.from('runs').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Run dihapus.', 'success');
  await loadPublic();
  await loadAdminData();
}

// ================== BIRTHDAY ==================
async function loadBirthdays() {
  const list = $('birthdayList');
  if (!list) return;
  list.innerHTML = '<p class="text-slate-400">Memuat...</p>';
  const { data, error } = await db.rpc('get_birthdays_today');
  if (error) { list.innerHTML = `<p class="text-rose-400">${error.message}</p>`; return; }
  if (!data || !data.length) { list.innerHTML = '<p class="text-slate-400">🎈 Tidak ada yang ulang hari ini.</p>'; return; }
  list.innerHTML = data.map(m => `
    <div class="flex justify-between items-center bg-slate-950/80 border border-pink-800/40 rounded-2xl p-4 card-hover">
      <div>
        <div class="text-2xl mb-1">🎂🎉</div>
        <div class="font-bold text-white">${esc(m.nama)} <span class="text-pink-400">(${esc(m.hashname || '-')})</span></div>
        <div class="text-xs text-slate-400">📅 Lahir: ${new Date(m.tanggal_lahir).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</div>
        <div class="text-xs text-slate-400">📱 ${esc(m.phone || '-')}</div>
      </div>
      <button onclick="sendBirthdayWA('${esc(m.phone)}','${esc(m.nama)}','${esc(m.hashname || '-')}')" class="bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-500 hover:to-pink-400 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg">📲 Kirim Ucapan</button>
    </div>`).join('');
}

async function sendBirthdayWA(phone, nama, hashname) {
  const cleanPhone = normalizeWa(phone);
  if (!cleanPhone) return toast('Nomor tidak valid.', 'warn');
  const message = `🎉🎂 *Selamat Ulang Tahun!* 🎂🎉\n\nHalo *${nama}* (${hashname})!\n\nSegenap keluarga besar *Hitman Pekanbaru Hashing Club* mengucapkan:\n\n🎈 Selamat ulang tahun!\n💪 Sehat selalu, murah rezeki, dan terus semangat di setiap run!\n\nSampai jumpa di jalur! On-On! 🏃‍♂️💨\n\n_Hitman Pekanbaru Hashing Club_`;
  const link = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  try {
    await db.rpc('log_wa', { p_phone: cleanPhone, p_target_name: nama, p_message_type: 'birthday_wish', p_status: 'manual', p_mode: 'wa.me', p_link: link });
    window.open(link, '_blank');
    toast('Ucapan ultah dibuka.', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// ================== LOGS ==================
function renderLogs() {
  const scanEl = $('scanLogs'), waEl = $('waLogs'), auditEl = $('auditLogs');
  if (scanEl) scanEl.innerHTML = adminData.scanLogs.length ? adminData.scanLogs.map(x => `
    <div class="bg-slate-950 border border-slate-800 rounded-xl p-2">${new Date(x.created_at).toLocaleString('id-ID')} - <span class="font-bold">${esc(x.result)}</span> - ${esc(x.message || '')}</div>
  `).join('') : '<p class="text-slate-500">Belum ada.</p>';
  if (waEl) waEl.innerHTML = adminData.waLogs.length ? adminData.waLogs.map(x => `
    <div class="bg-slate-950 border border-slate-800 rounded-xl p-2">${new Date(x.created_at).toLocaleString('id-ID')} - ${esc(x.message_type)} - ${esc(x.target_name)}</div>
  `).join('') : '<p class="text-slate-500">Belum ada.</p>';
  if (auditEl) auditEl.innerHTML = adminData.auditLogs.length ? adminData.auditLogs.map(x => `
    <div class="bg-slate-950 border border-slate-800 rounded-xl p-2">${new Date(x.created_at).toLocaleString('id-ID')} - <span class="font-bold">${esc(x.action)}</span> - ${esc(x.entity_type)}</div>
  `).join('') : '<p class="text-slate-500">Belum ada.</p>';
}

// ================== RUN REGS ADMIN & REKAP WA ==================
function renderRunRegsAdmin() {
  const select = $('adminRunRecapSelect');
  const container = $('runRegsTable');
  if (select) {
    select.innerHTML = adminData.runs.map(r => `<option value="${r.id}">Run #${r.run_number || '-'} - ${esc(r.nama)} - ${r.tanggal_acara || 'TBA'}</option>`).join('');
  }
  if (!container) return;
  const runMap = Object.fromEntries(adminData.runs.map(r => [r.id, r]));
  if (!adminData.runRegs.length) { container.innerHTML = '<p class="text-slate-500">Belum ada pendaftaran.</p>'; return; }
  container.innerHTML = adminData.runRegs.map(x => {
    const run = runMap[x.run_id] || {};
    return `
      <div class="flex justify-between items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
        <div><div class="font-bold">${esc(x.nama)}</div><div class="text-[11px] text-slate-500">Run #${run.run_number || '-'} - ${esc(run.nama || '')}</div></div>
        <span class="text-xs font-bold ${x.tipe === 'member' ? 'text-emerald-400' : 'text-amber-400'}">${esc(x.tipe)}</span>
      </div>`;
  }).join('');
}

function getGroupNumber() {
  const manual = $('recapGroupNumber') ? $('recapGroupNumber').value.trim() : '';
  const fromSettings = (adminData.settingsAll || []).find(s => s.key === 'waGroupNumber');
  return normalizeWa(manual || (fromSettings ? fromSettings.value : ''));
}

async function sendRunRegRecapWA() {
  const runId = $('adminRunRecapSelect').value;
  const group = getGroupNumber();
  if (!runId) return toast('Pilih run dulu.', 'warn');
  if (!group) return toast('Nomor WA grup belum diisi.', 'warn');

  const regs = adminData.runRegs.filter(x => x.run_id === runId);
  const run = adminData.runs.find(x => x.id === runId);
  const members = regs.filter(x => x.tipe === 'member');
  const visitors = regs.filter(x => x.tipe !== 'member');

  let message = `*REKAP PESERTA RUN HITMAN*\n\n`;
  message += `Run: #${run?.run_number || '-'} - ${run?.nama || ''}\n`;
  message += `Tanggal: ${run?.tanggal_acara || '-'}\n\n`;
  message += `*Member (${members.length}):*\n`;
  members.forEach((x, i) => message += `${i + 1}. ${x.nama}\n`);
  message += `\n*Visitor (${visitors.length}):*\n`;
  visitors.forEach((x, i) => message += `${i + 1}. ${x.nama}\n`);
  message += `\nTotal Peserta Daftar: ${regs.length} orang\n\n*Hitman Pekanbaru Hashing Club*`;

  const link = `https://wa.me/${group}?text=${encodeURIComponent(message)}`;
  try {
    await db.rpc('log_wa', { p_phone: group, p_target_name: 'Grup WA', p_message_type: 'rekap_daftar_run', p_status: 'manual', p_mode: 'wa.me', p_link: link });
    window.open(link, '_blank');
    toast('Rekap daftar siap dikirim.', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function sendAttendanceRecapWA() {
  const date = $('recapDateAdmin').value || today();
  const group = getGroupNumber();
  if (!group) return toast('Nomor WA grup belum diisi.', 'warn');

  const { data, error } = await db.from('attendances').select('person_id, people(hashname, nama, type)').eq('tanggal', date);
  if (error) return toast(error.message, 'error');

  const memberList = (data || []).filter(x => x.people?.type === 'member');
  const visitorList = (data || []).filter(x => x.people?.type !== 'member');
  const total = memberList.length + visitorList.length;

  let message = `*REKAP ABSENSI RUN HITMAN*\n\n`;
  message += `Yang Hadir:\nTanggal: ${date}\n\n`;
  message += `*Member (${memberList.length}):*\n`;
  memberList.forEach((x, i) => message += `${i + 1}. ${x.people?.hashname || x.people?.nama || '-'}\n`);
  message += `\n*Visitor (${visitorList.length}):*\n`;
  visitorList.forEach((x, i) => message += `${i + 1}. ${x.people?.hashname || x.people?.nama || '-'}\n`);
  message += `\nTotal Peserta Hadir: ${total} orang\n\n*Hitman Pekanbaru Hashing Club*`;

  const link = `https://wa.me/${group}?text=${encodeURIComponent(message)}`;
  try {
    await db.rpc('log_wa', { p_phone: group, p_target_name: 'Grup WA', p_message_type: 'rekap_absensi', p_status: 'manual', p_mode: 'wa.me', p_link: link });
    window.open(link, '_blank');
    toast('Rekap absensi siap dikirim.', 'success');
  } catch (err) { toast(err.message, 'error'); }
}



// ================== INIT ==================
document.addEventListener('DOMContentLoaded', initApp);