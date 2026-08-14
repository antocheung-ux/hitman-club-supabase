// =====================================================================
// HITMAN PEKANBARU HASHING CLUB - SUPABASE APP
// =====================================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let isAdmin = false;
let scanner = null;
let lastScanTime = 0;

let publicData = {
  runs: [],
  gallery: [],
  kamus: [],
  settings: {},
  prestasi: []
};

let adminData = {
  people: [],
  periods: [],
  bills: [],
  payments: [],
  kas: [],
  runs: [],
  runRegs: [],
  scanLogs: [],
  waLogs: [],
  auditLogs: [],
  settingsAll: []
};

// =====================================================================
// HELPERS
// =====================================================================

function $(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function rupiah(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

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

  const colors = {
    success: 'bg-emerald-700',
    error: 'bg-rose-700',
    warn: 'bg-amber-700',
    info: 'bg-slate-800'
  };

  el.className = `${colors[type] || colors.info} text-white text-xs font-bold p-4 rounded-2xl shadow-xl`;
  el.innerText = message;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 350);
  }, 4500);
}

function switchPage(page) {
  document.querySelectorAll('[id^="page-"]').forEach(el => el.classList.add('hidden'));
  const target = $('page-' + page);
  if (target) target.classList.remove('hidden');

  if (page === 'admin') {
    updateAdminUI();
  }
}

function switchAdminTab(tab) {
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
  const target = $('tab-' + tab);
  if (target) target.classList.remove('hidden');
}

function mapById(arr, key = 'id') {
  return Object.fromEntries((arr || []).map(x => [x[key], x]));
}

// =====================================================================
// STORAGE / IMAGE
// =====================================================================

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

      canvas.toBlob(
        blob => {
          if (blob) resolve(blob);
          else reject(new Error('Gagal kompres gambar.'));
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal membaca gambar.'));
    };

    img.src = url;
  });
}

async function uploadImage(bucket, path, file) {
  const blob = await compressImage(file);

  const { error } = await db.storage
    .from(bucket)
    .upload(path, blob, {
      upsert: true,
      contentType: blob.type
    });

  if (error) throw error;

  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// =====================================================================
// AUTH
// =====================================================================

async function initApp() {
  await checkAuth();
  await loadPublic();

  if ($('kasDate')) $('kasDate').value = today();
}

async function checkAuth() {
  const { data } = await db.auth.getSession();
  currentUser = data.session?.user || null;

  if (!currentUser) {
    isAdmin = false;
    updateAuthUI();
    return;
  }

  const { data: adminProfile } = await db
    .from('admin_profiles')
    .select('*')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  isAdmin = !!adminProfile;
  updateAuthUI();

  if (isAdmin) {
    await loadAdminData();
  }
}

function updateAuthUI() {
  const logoutBtn = $('logoutNavBtn');
  if (logoutBtn) {
    logoutBtn.classList.toggle('hidden', !isAdmin);
  }
}

async function loginAdmin() {
  const email = $('adminEmail').value.trim();
  const password = $('adminPassword').value;

  if (!email || !password) {
    toast('Email dan password wajib diisi.', 'warn');
    return;
  }

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    toast(error.message, 'error');
    return;
  }

  await checkAuth();

  if (!isAdmin) {
    toast('User login bukan admin.', 'error');
    return;
  }

  toast('Login admin berhasil.', 'success');
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
  const auth = $('adminAuth');
  const dashboard = $('adminDashboard');
  const galleryForm = $('adminGalleryForm');
  const kamusForm = $('adminKamusForm');
  const sejarahEditWrap = $('sejarahEditWrap');

  if (!auth || !dashboard) return;

  if (isAdmin) {
    auth.classList.add('hidden');
    dashboard.classList.remove('hidden');

    if (galleryForm) galleryForm.classList.remove('hidden');
    if (kamusForm) kamusForm.classList.remove('hidden');
    if (sejarahEditWrap) sejarahEditWrap.classList.remove('hidden');

    renderAdminAll();
  } else {
    auth.classList.remove('hidden');
    dashboard.classList.add('hidden');

    if (galleryForm) galleryForm.classList.add('hidden');
    if (kamusForm) kamusForm.classList.add('hidden');
    if (sejarahEditWrap) sejarahEditWrap.classList.add('hidden');
  }
}

// =====================================================================
// PUBLIC DATA
// =====================================================================

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
  publicData.settings = Object.fromEntries(
    (settings.data || []).map(s => [s.key, s.value])
  );

  renderPublicAll();
}

function renderPublicAll() {
  renderPrestasi();
  renderJadwal();
  renderGallery();
  renderKamus();
  renderSejarah();
}

function renderPrestasi() {
  const target = parseInt(publicData.settings.runTarget || 20);
  const el = $('prestasiList');
  if (!el) return;

  const achievers = publicData.prestasi.filter(x => x.attendance_count >= target);

  if (!achievers.length) {
    el.innerHTML = '<p class="text-slate-500">Belum ada member mencapai target ' + target + 'x kehadiran.</p>';
    return;
  }

  el.innerHTML = achievers.map(x => `
    <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4">
      <div class="text-amber-400 font-bold">${esc(x.hashname || '-')}</div>
      <div class="text-slate-400 text-xs">${x.attendance_count}x kehadiran</div>
    </div>
  `).join('');
}

function getUpcomingRuns() {
  const todayStr = today();

  return publicData.runs
    .filter(r => !r.tanggal_acara || r.tanggal_acara >= todayStr)
    .sort((a, b) => {
      const da = a.tanggal_acara || '9999-99-99';
      const dbb = b.tanggal_acara || '9999-99-99';
      return da.localeCompare(dbb);
    });
}

function renderJadwal() {
  const featuredEl = $('featuredRun');
  const runSelect = $('publicRunSelect');

  if (!featuredEl || !runSelect) return;

  const upcoming = getUpcomingRuns();

  if (!upcoming.length) {
    featuredEl.innerHTML = '<p class="text-slate-500">Belum ada jadwal run.</p>';
    runSelect.innerHTML = '<option value="">Belum ada run</option>';
    $('publicRunRegList').innerHTML = '<p class="text-slate-500">Belum ada pendaftaran.</p>';
    return;
  }

  const featured = upcoming[0];

  featuredEl.innerHTML = `
    <div class="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-2">
      <div class="text-amber-400 font-black text-lg">
        Run #${featured.run_number || '-'} - ${esc(featured.nama)}
      </div>
      <div>📅 ${featured.tanggal_acara || 'Belum ditentukan'}</div>
      <div>📍 ${esc(featured.lokasi || 'Posko HITMAN')}</div>
      <div class="text-slate-400">${esc(featured.deskripsi || '')}</div>
      ${featured.foto_path ? `<img src="${featured.foto_path}" class="mt-3 rounded-2xl max-h-72 object-cover border border-slate-800">` : ''}
    </div>
  `;

  runSelect.innerHTML = upcoming.map(r => `
    <option value="${r.id}">
      Run #${r.run_number || '-'} - ${esc(r.nama)} - ${r.tanggal_acara || 'Tanggal belum ditentukan'}
    </option>
  `).join('');

  loadPublicRunRegs();
}

async function loadPublicRunRegs() {
  const runId = $('publicRunSelect').value;
  const list = $('publicRunRegList');

  if (!runId) {
    list.innerHTML = '<p class="text-slate-500">Pilih run terlebih dahulu.</p>';
    return;
  }

  const { data } = await db
    .from('run_registrations')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: false });

  if (!data || !data.length) {
    list.innerHTML = '<p class="text-slate-500">Belum ada peserta terdaftar.</p>';
    return;
  }

  list.innerHTML = data.map(x => `
    <div class="flex justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
      <span>${esc(x.nama)}</span>
      <span class="text-xs font-bold ${x.tipe === 'member' ? 'text-emerald-400' : 'text-amber-400'}">
        ${esc(x.tipe)}
      </span>
    </div>
  `).join('');
}

async function submitPublicRunReg() {
  const runId = $('publicRunSelect').value;
  const name = $('publicRunName').value.trim();

  if (!runId || !name) {
    toast('Pilih run dan isi nama.', 'warn');
    return;
  }

  const { data, error } = await db.rpc('register_run_public', {
    p_run_id: runId,
    p_nama: name
  });

  if (error) {
    toast(error.message, 'error');
    return;
  }

  if (data.status === 'duplicate') {
    toast(data.message, 'warn');
    return;
  }

  toast(`${name} terdaftar sebagai ${data.tipe}.`, 'success');
  $('publicRunName').value = '';
  loadPublicRunRegs();
}

function renderGallery() {
  const grid = $('galleryGrid');
  if (!grid) return;

  if (!publicData.gallery.length) {
    grid.innerHTML = '<p class="text-slate-500 text-sm">Belum ada foto.</p>';
    return;
  }

  grid.innerHTML = publicData.gallery.map(g => `
    <div class="relative rounded-2xl overflow-hidden border border-slate-800 group">
      <img src="${g.image_path}" class="w-full h-40 object-cover">
      ${g.caption ? `<div class="absolute bottom-0 bg-black/70 text-xs p-2 w-full">${esc(g.caption)}</div>` : ''}
      ${isAdmin ? `<button onclick="deleteGallery('${g.id}')" class="absolute top-2 right-2 bg-rose-600 px-2 py-1 rounded-lg text-xs font-bold">Hapus</button>` : ''}
    </div>
  `).join('');
}

async function uploadGallery() {
  const file = $('galleryFile').files[0];
  const caption = $('galleryCaption').value.trim();

  if (!file) {
    toast('Pilih foto dulu.', 'warn');
    return;
  }

  try {
    const path = `gallery/${Date.now()}.jpg`;
    const url = await uploadImage('gallery-photos', path, file);

    const { error } = await db.from('gallery').insert({
      image_path: url,
      caption,
      submitter: 'Admin'
    });

    if (error) throw error;

    toast('Foto berhasil ditambahkan.', 'success');
    $('galleryFile').value = '';
    $('galleryCaption').value = '';
    await loadPublic();
    if (isAdmin) await loadAdminData();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteGallery(id) {
  if (!confirm('Hapus foto ini?')) return;

  const { error } = await db.from('gallery').delete().eq('id', id);
  if (error) return toast(error.message, 'error');

  toast('Foto dihapus.', 'success');
  await loadPublic();
}

function renderKamus() {
  const list = $('kamusList');
  if (!list) return;

  if (!publicData.kamus.length) {
    list.innerHTML = '<p class="text-slate-500 text-sm">Belum ada istilah.</p>';
    return;
  }

  list.innerHTML = publicData.kamus.map(k => `
    <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4">
      <div class="flex justify-between items-start gap-2">
        <div class="font-bold text-white">${esc(k.term)}</div>
        ${isAdmin ? `<button onclick="deleteKamus('${k.id}')" class="text-rose-400 text-xs font-bold">Hapus</button>` : ''}
      </div>
      <div class="text-slate-400 text-xs mt-2">${esc(k.def)}</div>
    </div>
  `).join('');
}

async function addKamus() {
  const term = $('kamusTerm').value.trim();
  const def = $('kamusDef').value.trim();

  if (!term || !def) {
    toast('Istilah dan definisi wajib diisi.', 'warn');
    return;
  }

  const { error } = await db.from('kamus_hash').insert({
    id: 'k' + Date.now(),
    term,
    def,
    sort_order: 999
  });

  if (error) return toast(error.message, 'error');

  toast('Istilah ditambahkan.', 'success');
  $('kamusTerm').value = '';
  $('kamusDef').value = '';
  await loadPublic();
}

async function deleteKamus(id) {
  if (!confirm('Hapus istilah ini?')) return;

  const { error } = await db.from('kamus_hash').delete().eq('id', id);
  if (error) return toast(error.message, 'error');

  toast('Istilah dihapus.', 'success');
  await loadPublic();
}

function renderSejarah() {
  const view = $('sejarahView');
  const edit = $('sejarahEdit');

  if (!view) return;

  const sejarah = publicData.settings.sejarahKlub || 'Sejarah belum ditambahkan.';
  view.innerText = sejarah;

  if (edit) edit.value = sejarah;
}

async function saveSejarah() {
  const value = $('sejarahEdit').value;

  const { error } = await db.from('settings').upsert({
    key: 'sejarahKlub',
    value,
    is_public: true
  });

  if (error) return toast(error.message, 'error');

  toast('Sejarah disimpan.', 'success');
  await loadPublic();
}

// =====================================================================
// ADMIN DATA
// =====================================================================

async function loadAdminData() {
  if (!isAdmin) return;

  const [
    people,
    periods,
    bills,
    payments,
    kas,
    runs,
    runRegs,
    scanLogs,
    waLogs,
    auditLogs,
    settingsAll
  ] = await Promise.all([
    db.from('people').select('*').order('created_at', { ascending: false }),
    db.from('iuran_periods').select('*').order('periode_key', { ascending: false }),
    db.from('iuran_bills').select('*'),
    db.from('payments').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('kas_transactions').select('*').is('deleted_at', null).order('tanggal', { ascending: false }).limit(300),
    db.from('runs').select('*').order('created_at', { ascending: false }),
    db.from('run_registrations').select('*').order('created_at', { ascending: false }).limit(300),
    db.from('scan_logs').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('wa_logs').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('settings').select('*')
  ]);

  adminData.people = people.data || [];
  adminData.periods = periods.data || [];
  adminData.bills = bills.data || [];
  adminData.payments = payments.data || [];
  adminData.kas = kas.data || [];
  adminData.runs = runs.data || [];
  adminData.runRegs = runRegs.data || [];
  adminData.scanLogs = scanLogs.data || [];
  adminData.waLogs = waLogs.data || [];
  adminData.auditLogs = auditLogs.data || [];
  adminData.settingsAll = settingsAll.data || [];

  renderAdminAll();
}

function renderAdminAll() {
  renderMembers();
  renderIuran();
  renderPayments();
  renderKas();
  renderRunsAdmin();
  renderRunRegsAdmin();
  renderLogs();
  renderSettingsAdmin();
  renderRunSelects();
}

// =====================================================================
// MEMBER
// =====================================================================

function renderMembers() {
  const tbody = $('membersTable');
  if (!tbody) return;

  if (!adminData.people.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-slate-500">Belum ada data.</td></tr>';
    return;
  }

  tbody.innerHTML = adminData.people.map(p => {
    const status = p.type === 'member' ? (p.status_member || 'Aktif') : 'Visitor';

    return `
      <tr class="hover:bg-slate-800/40">
        <td class="p-2">
          ${p.foto_path ? `<img src="${p.foto_path}" class="w-10 h-10 rounded-full object-cover border border-slate-700">` : '<div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">👤</div>'}
        </td>
        <td class="p-2 font-mono">${esc(p.id)}</td>
        <td class="p-2 font-semibold">${esc(p.nama)}</td>
        <td class="p-2">${esc(p.hashname || '-')}</td>
        <td class="p-2">${esc(p.type)}</td>
        <td class="p-2">${esc(p.phone || '-')}</td>
        <td class="p-2">
          <span class="${status === 'Aktif' ? 'text-emerald-400' : status === 'Non Aktif' ? 'text-rose-400' : 'text-sky-400'} font-bold">
            ${esc(status)}
          </span>
        </td>
        <td class="p-2 font-bold text-emerald-400">${p.attendance_count || 0}x</td>
        <td class="p-2 space-x-1 whitespace-nowrap">
          <button onclick="showQrModal('${esc(p.id)}')" class="bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded-lg text-xs font-bold">QR</button>
          ${p.type === 'member' ? `
            <button onclick="toggleMemberStatus('${esc(p.id)}')" class="bg-amber-600 hover:bg-amber-500 text-slate-950 px-2 py-1 rounded-lg text-xs font-bold">
              ${status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

async function handleRegister(e) {
  e.preventDefault();

  const type = $('regType').value;
  const name = $('regName').value.trim();
  const hashname = $('regHash').value.trim() || '-';
  const phone = normalizeWa($('regPhone').value);
  const size = $('regSize').value;
  const file = $('regPhoto').files[0];

  const prefix = type === 'member' ? 'HHHH' : 'VVVV';
  const id = prefix + '-' + Math.floor(100000 + Math.random() * 900000);
  const qrToken = crypto.randomUUID();

  let fotoPath = null;

  try {
    if (file) {
      fotoPath = await uploadImage(
        'member-photos',
        `${type}/${encodeURIComponent(id)}/${Date.now()}.jpg`,
        file
      );
    }

    const { error } = await db.from('people').insert({
      id,
      type,
      nama: name,
      hashname,
      phone,
      size,
      qr_token: qrToken,
      status_member: type === 'member' ? 'Aktif' : null,
      foto_path: fotoPath
    });

    if (error) throw error;

    toast(`${type === 'member' ? 'Member' : 'Visitor'} berhasil disimpan.`, 'success');
    e.target.reset();
    await loadAdminData();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function toggleMemberStatus(id) {
  const person = adminData.people.find(x => x.id === id);
  if (!person) return;

  const newStatus = person.status_member === 'Aktif' ? 'Non Aktif' : 'Aktif';

  const { error } = await db
    .from('people')
    .update({ status_member: newStatus })
    .eq('id', id);

  if (error) return toast(error.message, 'error');

  toast(`Status member menjadi ${newStatus}.`, 'success');
  await loadAdminData();
}

function showQrModal(id) {
  const person = adminData.people.find(x => x.id === id);
  if (!person) return;

  $('qrTitle').innerText = `${person.nama} (${person.hashname || '-'})`;
  $('qrBox').innerHTML = '';

  new QRCode($('qrBox'), {
    text: person.qr_token,
    width: 180,
    height: 180
  });

  $('qrModal').classList.remove('hidden');
  $('qrModal').classList.add('flex');
}

function closeQrModal() {
  $('qrModal').classList.add('hidden');
  $('qrModal').classList.remove('flex');
}

// =====================================================================
// SCANNER
// =====================================================================

function startScanner() {
  if (scanner) {
    toast('Scanner sudah aktif.', 'info');
    return;
  }

  scanner = new Html5Qrcode('reader');

  scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 220 },
    async text => {
      const now = Date.now();
      if (now - lastScanTime < 3000) return;
      lastScanTime = now;

      let token = text.trim();

      try {
        const parsed = JSON.parse(text);
        token = parsed.token || parsed.id || token;
      } catch (e) {}

      const { data, error } = await db.rpc('record_attendance', {
        p_qr: token,
        p_tanggal: today()
      });

      const result = $('scanResult');

      if (error) {
        result.className = 'text-sm font-bold text-rose-400';
        result.innerText = error.message;
        toast(error.message, 'error');
        return;
      }

      if (data.status === 'success') {
        result.className = 'text-sm font-bold text-emerald-400';
        result.innerText = `✅ ${data.nama} (${data.hashname || '-'}) hadir. Total: ${data.count}x`;
        toast(result.innerText, 'success');
        await loadAdminData();
      } else if (data.status === 'duplicate') {
        result.className = 'text-sm font-bold text-amber-400';
        result.innerText = `⚠️ ${data.message}`;
        toast(data.message, 'warn');
      } else {
        result.className = 'text-sm font-bold text-rose-400';
        result.innerText = `❌ ${data.message}`;
        toast(data.message, 'error');
      }
    },
    () => {}
  ).catch(err => {
    toast('Gagal membuka kamera: ' + err, 'error');
    scanner = null;
  });
}

function stopScanner() {
  if (!scanner) return;

  scanner.stop()
    .then(() => {
      scanner.clear();
      scanner = null;
      $('reader').innerHTML = '';
      toast('Scanner dimatikan.', 'info');
    })
    .catch(() => {});
}

// =====================================================================
// IURAN
// =====================================================================

function renderIuran() {
  renderPeriodOptions();
  renderBills();
  renderPayMemberOptions();
  renderPayPeriodOptions();
}

function renderPeriodOptions() {
  // currently not separate; bills table includes period
}

function renderBills() {
  const tbody = $('billsTable');
  if (!tbody) return;

  const periodMap = mapById(adminData.periods);
  const memberMap = mapById(adminData.people);

  const bills = adminData.bills
    .slice()
    .sort((a, b) => String(periodMap[b.period_id]?.periode_key || '').localeCompare(String(periodMap[a.period_id]?.periode_key || '')));

  if (!bills.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-slate-500">Belum ada tagihan.</td></tr>';
    return;
  }

  tbody.innerHTML = bills.map(b => {
    const period = periodMap[b.period_id] || {};
    const member = memberMap[b.member_id] || {};

    const statusClass = {
      belum_bayar: 'text-amber-400',
      proses_verifikasi: 'text-sky-400',
      lunas: 'text-emerald-400',
      dibebaskan: 'text-slate-500'
    }[b.status] || 'text-slate-300';

    return `
      <tr class="hover:bg-slate-800/40">
        <td class="p-2 font-bold">${esc(period.periode_key || '-')}</td>
        <td class="p-2">${esc(member.nama || b.member_id)} (${esc(member.hashname || '-')})</td>
        <td class="p-2">${rupiah(b.amount)}</td>
        <td class="p-2 font-bold ${statusClass}">${esc(b.status)}</td>
        <td class="p-2">
          ${b.status === 'belum_bayar' ? `
            <button onclick="remindBill('${b.id}')" class="bg-emerald-700 hover:bg-emerald-600 px-2 py-1 rounded-lg text-xs font-bold">
              WA Reminder
            </button>
          ` : '-'}
        </td>
      </tr>
    `;
  }).join('');
}

function renderPayMemberOptions() {
  const select = $('payMember');
  if (!select) return;

  const members = adminData.people.filter(x => x.type === 'member');

  select.innerHTML = '<option value="">Pilih member</option>' + members.map(m => `
    <option value="${m.id}">${esc(m.nama)} (${esc(m.hashname || '-')})</option>
  `).join('');
}

function renderPayPeriodOptions() {
  const select = $('payPeriods');
  if (!select) return;

  const memberId = $('payMember').value;
  const periodMap = mapById(adminData.periods);

  const unpaid = adminData.bills
    .filter(b => b.member_id === memberId && b.status === 'belum_bayar')
    .sort((a, b) => String(periodMap[a.period_id]?.periode_key || '').localeCompare(String(periodMap[b.period_id]?.periode_key || '')));

  if (!unpaid.length) {
    select.innerHTML = '<option value="">Tidak ada tagihan belum bayar</option>';
    return;
  }

  select.innerHTML = unpaid.map(b => {
    const period = periodMap[b.period_id] || {};
    return `<option value="${esc(period.periode_key)}">${esc(period.periode_key)} - ${rupiah(b.amount)}</option>`;
  }).join('');
}

async function createPeriod(e) {
  e.preventDefault();

  const monthValue = $('periodMonth').value;
  const tarif = parseFloat($('periodTarif').value || publicData.settings.tarifBulanan || 50000);
  const due = $('periodDue').value || `${monthValue}-10`;

  if (!monthValue) {
    toast('Pilih bulan periode.', 'warn');
    return;
  }

  const [tahun, bulan] = monthValue.split('-').map(Number);

  try {
    const { data: period, error } = await db
      .from('iuran_periods')
      .insert({
        periode_key: monthValue,
        bulan,
        tahun,
        tarif,
        jatuh_tempo: due,
        status: 'open'
      })
      .select()
      .single();

    if (error) throw error;

    const { data: count, error: genError } = await db.rpc('generate_iuran_bills', {
      p_period_id: period.id
    });

    if (genError) throw genError;

    toast(`Periode ${monthValue} dibuat. ${count} tagihan digenerate.`, 'success');
    e.target.reset();
    await loadAdminData();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function submitPayment(e) {
  e.preventDefault();

  const memberId = $('payMember').value;
  const periodKeys = Array.from($('payPeriods').selectedOptions).map(o => o.value);
  const method = $('payMethod').value;
  const ref = $('payRef').value.trim() || null;

  if (!memberId || !periodKeys.length) {
    toast('Pilih member dan minimal satu periode.', 'warn');
    return;
  }

  const { data, error } = await db.rpc('submit_payment', {
    p_member_id: memberId,
    p_period_keys: periodKeys,
    p_payment_method: method,
    p_reference_no: ref
  });

  if (error) {
    toast(error.message, 'error');
    return;
  }

  toast('Payment request berhasil dibuat.', 'success');
  e.target.reset();
  await loadAdminData();
}

function renderPayments() {
  const tbody = $('paymentsTable');
  if (!tbody) return;

  const memberMap = mapById(adminData.people);

  if (!adminData.payments.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-slate-500">Belum ada pembayaran.</td></tr>';
    return;
  }

  tbody.innerHTML = adminData.payments.map(p => {
    const member = memberMap[p.member_id] || {};

    const statusClass = {
      menunggu_verifikasi: 'text-amber-400',
      disetujui: 'text-emerald-400',
      ditolak: 'text-rose-400',
      dibatalkan: 'text-slate-500'
    }[p.status] || 'text-slate-300';

    return `
      <tr class="hover:bg-slate-800/40">
        <td class="p-2">${new Date(p.created_at).toLocaleString('id-ID')}</td>
        <td class="p-2">${esc(member.nama || p.member_id)}</td>
        <td class="p-2 font-bold">${rupiah(p.total_amount)}</td>
        <td class="p-2">${esc(p.payment_method || '-')}</td>
        <td class="p-2 font-bold ${statusClass}">${esc(p.status)}</td>
        <td class="p-2 space-x-1 whitespace-nowrap">
          ${p.status === 'menunggu_verifikasi' ? `
            <button onclick="approvePayment('${p.id}')" class="bg-emerald-700 hover:bg-emerald-600 px-2 py-1 rounded-lg text-xs font-bold">Approve</button>
            <button onclick="rejectPaymentPrompt('${p.id}')" class="bg-rose-600 hover:bg-rose-500 px-2 py-1 rounded-lg text-xs font-bold">Reject</button>
          ` : '-'}
        </td>
      </tr>
    `;
  }).join('');
}

async function approvePayment(id) {
  if (!confirm('Setujui pembayaran ini?')) return;

  const { error } = await db.rpc('approve_payment', {
    p_payment_id: id
  });

  if (error) return toast(error.message, 'error');

  toast('Pembayaran disetujui dan kas masuk dicatat.', 'success');
  await loadAdminData();
}

async function rejectPaymentPrompt(id) {
  const reason = prompt('Alasan menolak pembayaran:');
  if (reason === null) return;

  const { error } = await db.rpc('reject_payment', {
    p_payment_id: id,
    p_reason: reason || null
  });

  if (error) return toast(error.message, 'error');

  toast('Pembayaran ditolak.', 'success');
  await loadAdminData();
}

async function remindBill(billId) {
  const bill = adminData.bills.find(x => x.id === billId);
  if (!bill) return;

  const member = adminData.people.find(x => x.id === bill.member_id);
  const period = adminData.periods.find(x => x.id === bill.period_id);

  if (!member || !period) return;

  if (!member.phone) {
    toast('Member tidak punya nomor WA.', 'warn');
    return;
  }

  const phone = normalizeWa(member.phone);
  const message =
`Halo ${member.nama} (${member.hashname || '-'}) 👋

Mengingatkan iuran Hitman Pekanbaru Hashing Club untuk periode ${period.periode_key} sebesar ${rupiah(bill.amount)} belum tercatat lunas.

Mohon diselesaikan ya. Terima kasih! 🙏`;

  const link = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  try {
    await db.rpc('log_wa', {
      p_phone: phone,
      p_target_name: member.nama,
      p_message_type: 'reminder_iuran',
      p_status: 'manual',
      p_mode: 'wa.me',
      p_link: link
    });

    window.open(link, '_blank');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// =====================================================================
// KAS
// =====================================================================

function renderKas() {
  const tbody = $('kasTable');
  const saldoEl = $('kasSaldo');

  if (!tbody || !saldoEl) return;

  let saldo = 0;

  adminData.kas.forEach(k => {
    const jumlah = Number(k.jumlah || 0);
    saldo += k.tipe === 'Masuk' ? jumlah : -jumlah;
  });

  saldoEl.innerText = rupiah(saldo);

  if (!adminData.kas.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-slate-500">Belum ada transaksi kas.</td></tr>';
    return;
  }

  tbody.innerHTML = adminData.kas.map(k => `
    <tr class="hover:bg-slate-800/40">
      <td class="p-2">${esc(k.tanggal)}</td>
      <td class="p-2">${esc(k.kategori)}</td>
      <td class="p-2">${esc(k.keterangan || '-')}</td>
      <td class="p-2 font-bold ${k.tipe === 'Masuk' ? 'text-emerald-400' : 'text-rose-400'}">${esc(k.tipe)}</td>
      <td class="p-2 font-mono">${rupiah(k.jumlah)}</td>
      <td class="p-2">
        <button onclick="deleteKas('${k.id}')" class="bg-rose-600 hover:bg-rose-500 px-2 py-1 rounded-lg text-xs font-bold">Hapus</button>
      </td>
    </tr>
  `).join('');
}

async function addKas(e) {
  e.preventDefault();

  const payload = {
    tanggal: $('kasDate').value,
    tipe: $('kasTipe').value,
    kategori: $('kasKategori').value,
    keterangan: $('kasKet').value.trim(),
    jumlah: parseFloat($('kasJumlah').value || 0),
    created_by: currentUser?.id || null
  };

  const { error } = await db.from('kas_transactions').insert(payload);

  if (error) return toast(error.message, 'error');

  toast('Transaksi kas disimpan.', 'success');
  e.target.reset();
  $('kasDate').value = today();
  await loadAdminData();
}

async function deleteKas(id) {
  if (!confirm('Hapus transaksi ini? Data tetap tercatat di audit log sebagai soft delete.')) return;

  const { error } = await db
    .from('kas_transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return toast(error.message, 'error');

  toast('Transaksi dihapus.', 'success');
  await loadAdminData();
}

// =====================================================================
// RUN / HARE
// =====================================================================

function renderRunsAdmin() {
  const tbody = $('runsTable');
  if (!tbody) return;

  if (!adminData.runs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-slate-500">Belum ada run.</td></tr>';
    return;
  }

  tbody.innerHTML = adminData.runs.map(r => `
    <tr class="hover:bg-slate-800/40">
      <td class="p-2 font-bold text-amber-400">#${r.run_number || '-'}</td>
      <td class="p-2 font-semibold">${esc(r.nama)}</td>
      <td class="p-2">${r.tanggal_acara || '-'}</td>
      <td class="p-2">${esc(r.lokasi || '-')}</td>
      <td class="p-2">
        <button onclick="deleteRun('${r.id}')" class="bg-rose-600 hover:bg-rose-500 px-2 py-1 rounded-lg text-xs font-bold">Hapus</button>
      </td>
    </tr>
  `).join('');
}

async function addRun(e) {
  e.preventDefault();

  const file = $('runPhoto').files[0];
  let fotoPath = null;

  try {
    if (file) {
      fotoPath = await uploadImage('run-photos', `runs/${Date.now()}.jpg`, file);
    }

    const { error } = await db.from('runs').insert({
      run_number: parseInt($('runNumber').value || 0) || null,
      nama: $('runName').value.trim(),
      tanggal_acara: $('runDate').value || null,
      lokasi: $('runLocation').value.trim(),
      deskripsi: $('runDesc').value.trim(),
      foto_path: fotoPath,
      status: 'published'
    });

    if (error) throw error;

    toast('Run berhasil ditambahkan.', 'success');
    e.target.reset();
    await loadPublic();
    await loadAdminData();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteRun(id) {
  if (!confirm('Hapus run ini? Semua pendaftar run ini juga akan terhapus.')) return;

  const { error } = await db.from('runs').delete().eq('id', id);
  if (error) return toast(error.message, 'error');

  toast('Run dihapus.', 'success');
  await loadPublic();
  await loadAdminData();
}

function renderRunSelects() {
  const select = $('adminRunRecapSelect');
  if (!select) return;

  select.innerHTML = adminData.runs.map(r => `
    <option value="${r.id}">
      Run #${r.run_number || '-'} - ${esc(r.nama)} - ${r.tanggal_acara || 'Tanggal belum ditentukan'}
    </option>
  `).join('');
}

function renderRunRegsAdmin() {
  const container = $('runRegsTable');
  if (!container) return;

  const runMap = mapById(adminData.runs);

  if (!adminData.runRegs.length) {
    container.innerHTML = '<p class="text-slate-500">Belum ada pendaftaran.</p>';
    return;
  }

  container.innerHTML = adminData.runRegs.map(x => {
    const run = runMap[x.run_id] || {};

    return `
      <div class="flex justify-between items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
        <div>
          <div class="font-bold">${esc(x.nama)}</div>
          <div class="text-[11px] text-slate-500">
            Run #${run.run_number || '-'} - ${esc(run.nama || '')}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold ${x.tipe === 'member' ? 'text-emerald-400' : 'text-amber-400'}">${esc(x.tipe)}</span>
          <button onclick="deleteRunReg('${x.id}')" class="bg-rose-600 hover:bg-rose-500 px-2 py-1 rounded-lg text-xs font-bold">Hapus</button>
        </div>
      </div>
    `;
  }).join('');
}

async function deleteRunReg(id) {
  if (!confirm('Hapus pendaftaran ini?')) return;

  const { error } = await db.from('run_registrations').delete().eq('id', id);
  if (error) return toast(error.message, 'error');

  toast('Pendaftaran dihapus.', 'success');
  await loadAdminData();
}

async function sendRunRegRecapWA() {
  const runId = $('adminRunRecapSelect').value;
  const groupRaw = $('recapGroupNumber').value || adminData.settingsAll.find(s => s.key === 'waGroupNumber')?.value || '';
  const group = normalizeWa(groupRaw);

  if (!runId) {
    toast('Pilih run dulu.', 'warn');
    return;
  }

  if (!group) {
    toast('Nomor WA grup belum diisi.', 'warn');
    return;
  }

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

  message += `\nTotal: ${regs.length} orang\n\n*Hitman Pekanbaru Hashing Club*`;

  const link = `https://wa.me/${group}?text=${encodeURIComponent(message)}`;

  try {
    await db.rpc('log_wa', {
      p_phone: group,
      p_target_name: 'Grup WA',
      p_message_type: 'rekap_daftar_run',
      p_status: 'manual',
      p_mode: 'wa.me',
      p_link: link
    });

    window.open(link, '_blank');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// =====================================================================
// LOGS
// =====================================================================

function renderLogs() {
  const scanEl = $('scanLogs');
  const waEl = $('waLogs');
  const auditEl = $('auditLogs');

  if (scanEl) {
    scanEl.innerHTML = adminData.scanLogs.length
      ? adminData.scanLogs.map(x => `
          <div class="bg-slate-950 border border-slate-800 rounded-xl p-3">
            ${new Date(x.created_at).toLocaleString('id-ID')} -
            <span class="font-bold">${esc(x.result)}</span> -
            ${esc(x.message || '')}
          </div>
        `).join('')
      : '<p class="text-slate-500">Belum ada scan log.</p>';
  }

  if (waEl) {
    waEl.innerHTML = adminData.waLogs.length
      ? adminData.waLogs.map(x => `
          <div class="bg-slate-950 border border-slate-800 rounded-xl p-3">
            ${new Date(x.created_at).toLocaleString('id-ID')} -
            ${esc(x.message_type)} -
            ${esc(x.target_name)} -
            <span class="font-bold">${esc(x.status)}</span>
          </div>
        `).join('')
      : '<p class="text-slate-500">Belum ada WA log.</p>';
  }

  if (auditEl) {
    auditEl.innerHTML = adminData.auditLogs.length
      ? adminData.auditLogs.map(x => `
          <div class="bg-slate-950 border border-slate-800 rounded-xl p-3">
            ${new Date(x.created_at).toLocaleString('id-ID')} -
            <span class="font-bold">${esc(x.action)}</span> -
            ${esc(x.entity_type)} -
            ${esc(x.entity_id || '')}
          </div>
        `).join('')
      : '<p class="text-slate-500">Belum ada audit log.</p>';
  }
}

// =====================================================================
// SETTINGS
// =====================================================================

function renderSettingsAdmin() {
  const tbody = $('settingsTable');
  if (!tbody) return;

  if (!adminData.settingsAll.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-slate-500">Belum ada settings.</td></tr>';
    return;
  }

  tbody.innerHTML = adminData.settingsAll.map((s, i) => `
    <tr>
      <td class="p-2 font-mono">${esc(s.key)}</td>
      <td class="p-2">
        <textarea id="setVal${i}" rows="2" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2">${esc(s.value || '')}</textarea>
      </td>
      <td class="p-2">
        <input id="setPub${i}" type="checkbox" ${s.is_public ? 'checked' : ''}>
      </td>
      <td class="p-2">
        <button onclick="saveSettingByIndex(${i})" class="bg-emerald-700 hover:bg-emerald-600 px-3 py-2 rounded-xl text-xs font-bold">Simpan</button>
      </td>
    </tr>
  `).join('');
}

async function saveSettingByIndex(index) {
  const setting = adminData.settingsAll[index];
  if (!setting) return;

  const value = $('setVal' + index).value;
  const isPublic = $('setPub' + index).checked;

  const { error } = await db.from('settings').upsert({
    key: setting.key,
    value,
    is_public: isPublic
  });

  if (error) return toast(error.message, 'error');

  toast('Setting disimpan.', 'success');
  await loadAdminData();
  await loadPublic();
}

// =====================================================================
// INIT
// =====================================================================

document.addEventListener('DOMContentLoaded', initApp);
