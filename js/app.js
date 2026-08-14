/* =====================================================================
   HITMAN PEKANBARU HASHING CLUB - js/app.js (VERSI 7 - FINAL)
   Perubahan dari v6: HANYA format rekapWA() sesuai template klub.
   ===================================================================== */
(function () {
  'use strict';

  var sb = window.sb;
  if (!sb || !window.supabaseReady) {
    console.error('❌ [app.js] Supabase belum siap');
    alert('Database belum siap. Refresh halaman.');
    return;
  }
  console.log('✅ [app.js] Supabase siap!');

  var SUPABASE_URL = 'https://awpcrceoxddyltasznht.supabase.co';
  var GALLERY_BUCKET = 'gallery-photos';
  var RUNS_BUCKET = 'run-photos';

  var currentUser = null;
  var isAdminUser = false;
  var lastAdminError = '';
  var nearestRunId = null;
  var detailRunId = null;

  // ===== Helpers =====
  function buildPublicUrl(bucket, path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return SUPABASE_URL + '/storage/v1/object/public/' + bucket + '/' + path;
  }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function todayISO() { return new Date().toISOString().split('T')[0]; }
  function formatTanggal(d) {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return d; }
  }
  function formatRupiah(n) {
    var v = Number(n || 0);
    return 'Rp ' + v.toLocaleString('id-ID');
  }
  function genToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', async function () {
    await initAuth();
    bindEvents();
    await loadPublic();
  });

  // ===== Auth =====
  async function initAuth() {
    try {
      var sess = await sb.auth.getSession();
      if (sess.data.session) {
        currentUser = sess.data.session.user;
        await checkAdmin(currentUser.id);
      }
      sb.auth.onAuthStateChange(function (event, session) {
        if (event === 'SIGNED_IN' && session) {
          setTimeout(async function () { currentUser = session.user; await checkAdmin(session.user.id); }, 0);
        } else if (event === 'SIGNED_OUT') {
          setTimeout(function () { currentUser = null; isAdminUser = false; updateUI(); }, 0);
        }
      });
    } catch (err) { console.error('❌ initAuth:', err); }
  }

  async function checkAdmin(userId) {
    lastAdminError = '';
    try {
      var res = await sb.from('admin_profiles').select('user_id, role').eq('user_id', userId).maybeSingle();
      if (res.error) { lastAdminError = 'Query admin_profiles gagal: ' + res.error.message; isAdminUser = false; }
      else if (res.data) { isAdminUser = true; }
      else { isAdminUser = false; lastAdminError = 'Tidak ada baris untuk user ini di admin_profiles.'; }
    } catch (e) { isAdminUser = false; lastAdminError = e.message; }
    updateUI();
  }

  function updateUI() {
    var el = function (id) { return document.getElementById(id); };
    if (isAdminUser && currentUser) {
      el('btn-login-nav')?.classList.add('hidden');
      el('btn-logout-nav')?.classList.remove('hidden');
      el('admin-sections')?.classList.remove('hidden');
      el('mobile-admin-menu')?.classList.remove('hidden');
      el('mobile-login-btn')?.classList.add('hidden');
      loadAdmin();
    } else {
      el('btn-login-nav')?.classList.remove('hidden');
      el('btn-logout-nav')?.classList.add('hidden');
      el('admin-sections')?.classList.add('hidden');
      el('mobile-admin-menu')?.classList.add('hidden');
      el('mobile-login-btn')?.classList.remove('hidden');
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    var errDiv = document.getElementById('login-error');
    var btn = document.getElementById('btn-login-submit');
    errDiv?.classList.add('hidden');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memproses...'; }
    try {
      var res = await sb.auth.signInWithPassword({ email: email, password: password });
      if (res.error) throw res.error;
      currentUser = res.data.user;
      await checkAdmin(currentUser.id);
      document.getElementById('login-modal').classList.remove('active');
      document.getElementById('form-login').reset();
      if (isAdminUser) {
        alert('Login berhasil! Selamat datang, Admin.');
        setTimeout(function () { document.getElementById('section-members')?.scrollIntoView({ behavior: 'smooth' }); }, 300);
      } else {
        alert('Login berhasil, tetapi akun ini BELUM terdaftar sebagai admin.\n\nDetail: ' + lastAdminError);
      }
    } catch (err) {
      if (errDiv) { errDiv.classList.remove('hidden'); errDiv.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>' + escapeHtml(err.message || 'Login gagal'); }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Masuk'; }
    }
  }

  async function logoutAdmin() {
    if (!confirm('Logout?')) return;
    await sb.auth.signOut();
    currentUser = null; isAdminUser = false;
    updateUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.logoutAdmin = logoutAdmin;
  window.isAdminLoggedIn = function () { return isAdminUser && !!currentUser; };

  // ===== Events =====
  function bindEvents() {
    document.getElementById('form-login')?.addEventListener('submit', handleLogin);

    var upBtn = document.getElementById('btn-upload-excel');
    var upInput = document.getElementById('excel-file-input');
    if (upBtn && upInput) {
      upBtn.addEventListener('click', function () { upInput.click(); });
      upInput.addEventListener('change', handleExcelUpload);
    }

    attachExport('member');
    attachExport('kas');

    document.getElementById('form-run-registration')?.addEventListener('submit', handleRunReg);
    document.getElementById('form-add-member')?.addEventListener('submit', handleAddMember);
    document.getElementById('form-add-kas')?.addEventListener('submit', handleAddKas);
    document.getElementById('form-edit-member')?.addEventListener('submit', saveEditMember);

    document.getElementById('btn-rekap-daftar')?.addEventListener('click', function () { rekapWA('daftar'); });
    document.getElementById('btn-rekap-hadir')?.addEventListener('click', function () { rekapWA('hadir'); });
    document.getElementById('btn-copy-rekap')?.addEventListener('click', function () {
      navigator.clipboard.writeText(document.getElementById('rekap-text').innerText).then(function () { alert('Rekap di-copy!'); });
    });

    document.getElementById('btn-open-scanner')?.addEventListener('click', openScanner);

    var kt = document.getElementById('kas-tanggal');
    if (kt) { kt.value = todayISO(); kt.max = todayISO(); }
  }

  // ===== Public =====
  async function loadPublic() {
    await Promise.allSettled([loadNearestRun(), loadHareList(), loadGallery(), loadKamus()]);
  }
  async function loadAdmin() {
    await Promise.allSettled([loadMembersTable(), loadKas(), loadUltah(), loadLogs()]);
  }

  // ---------- RUN TERDEKAT ----------
  async function loadNearestRun() {
    var c = document.getElementById('run-list-container');
    if (!c) return;
    try {
      var res = await sb.from('runs')
        .select('id, run_number, nama, foto_path, tanggal_acara, lokasi, deskripsi')
        .eq('status', 'published')
        .gte('tanggal_acara', todayISO())
        .order('tanggal_acara', { ascending: true })
        .limit(1);
      if (res.error) throw res.error;
      var data = res.data || [];
      if (!data.length) {
        nearestRunId = null;
        c.innerHTML = '<p class="text-gray-500 text-center py-8">Belum ada jadwal run minggu ini.</p>';
        return;
      }
      var r = data[0];
      nearestRunId = r.id;
      c.innerHTML = runCard(r, true);
    } catch (err) {
      c.innerHTML = '<p class="text-red-500">Error: ' + escapeHtml(err.message) + '</p>';
    }
  }

  // ---------- JADWAL HARE ----------
  async function loadHareList() {
    var c = document.getElementById('hare-list-container');
    if (!c) return;
    try {
      var res = await sb.from('runs')
        .select('id, run_number, nama, foto_path, tanggal_acara, lokasi')
        .eq('status', 'published')
        .gte('tanggal_acara', todayISO())
        .order('tanggal_acara', { ascending: true })
        .limit(30);
      if (res.error) throw res.error;
      var data = res.data || [];
      if (!data.length) {
        c.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8">Belum ada hare terdaftar.</p>';
        return;
      }
      c.innerHTML = data.map(function (r) { return runCard(r, false); }).join('');
    } catch (err) {
      c.innerHTML = '<p class="text-red-500 col-span-full">Error: ' + escapeHtml(err.message) + '</p>';
    }
  }

  function runCard(r, big) {
    var img = r.foto_path ? '<img src="' + buildPublicUrl(RUNS_BUCKET, r.foto_path) + '" class="w-full ' + (big ? 'h-56' : 'h-32') + ' object-cover rounded mb-3">' : '';
    return '<div class="run-card bg-hash-light p-4 rounded-lg border border-green-200 shadow-sm hover:shadow-lg transition" onclick="openRunDetail(\'' + r.id + '\')">'
      + img
      + '<div class="flex justify-between items-start mb-2">'
      + '<h4 class="font-bold text-hash-green ' + (big ? 'text-xl' : 'text-lg') + '">' + escapeHtml(r.nama) + '</h4>'
      + '<span class="bg-hash-amber text-white text-xs px-2 py-1 rounded-full">Run #' + (r.run_number || '') + '</span>'
      + '</div>'
      + '<p class="text-sm text-gray-600 mb-1"><i class="fas fa-calendar mr-2"></i>' + formatTanggal(r.tanggal_acara) + '</p>'
      + '<p class="text-sm text-gray-600"><i class="fas fa-map-marker-alt mr-2"></i>' + escapeHtml(r.lokasi || 'TBD') + '</p>'
      + '<p class="text-xs text-hash-green mt-2 font-semibold"><i class="fas fa-hand-pointer mr-1"></i>Klik untuk detail & daftar</p>'
      + '</div>';
  }

  // ---------- DETAIL RUN ----------
  async function openRunDetail(id) {
    try {
      var res = await sb.from('runs').select('*').eq('id', id).maybeSingle();
      if (res.error || !res.data) { alert('Run tidak ditemukan'); return; }
      var r = res.data;
      detailRunId = r.id;

      document.getElementById('rd-image').src = buildPublicUrl(RUNS_BUCKET, r.foto_path) || 'logo.png';
      document.getElementById('rd-badge').innerText = 'Run #' + (r.run_number || '');
      document.getElementById('rd-title').innerText = r.nama || '';
      document.getElementById('rd-date').innerHTML = '<i class="fas fa-calendar mr-2"></i>' + formatTanggal(r.tanggal_acara);
      document.getElementById('rd-location').innerHTML = '<i class="fas fa-map-marker-alt mr-2"></i>' + escapeHtml(r.lokasi || 'TBD');
      document.getElementById('rd-desc').innerText = r.deskripsi || '';

      var isNearest = (nearestRunId === r.id);
      document.getElementById('rd-reg-wrap').classList.toggle('hidden', !isNearest);
      document.getElementById('rd-lock-note').classList.toggle('hidden', isNearest);

      document.getElementById('form-run-registration').reset();
      document.getElementById('rd-single-wrap').classList.remove('hidden');
      document.getElementById('rd-group-wrap').classList.add('hidden');

      document.getElementById('run-detail-modal').classList.add('active');
    } catch (err) { alert('Error: ' + err.message); }
  }
  window.openRunDetail = openRunDetail;

  function closeRunDetail() {
    document.getElementById('run-detail-modal')?.classList.remove('active');
  }
  window.closeRunDetail = closeRunDetail;

  // ---------- DAFTAR RUN ----------
  async function handleRunReg(e) {
    e.preventDefault();
    if (!detailRunId) { alert('Pilih run terlebih dahulu'); return; }

    var tipe = document.querySelector('input[name="rd-tipe"]:checked').value;
    var names = [];
    if (tipe === 'single') {
      var n = document.getElementById('rd-single-name').value.trim();
      if (n) names.push(n);
    } else {
      names = document.getElementById('rd-group-names').value
        .split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
    }
    if (!names.length) { alert('Isi nama peserta terlebih dahulu!'); return; }

    var seen = {};
    var dupsInBatch = [];
    names.forEach(function (n) {
      var k = n.toLowerCase();
      if (seen[k]) dupsInBatch.push(n);
      seen[k] = true;
    });
    if (dupsInBatch.length) {
      alert('Nama ' + dupsInBatch.join(', ') + ' sudah terdaftar (duplikat dalam input).');
      return;
    }

    try {
      var chk = await sb.from('run_registrations').select('nama').eq('run_id', detailRunId).in('nama', names);
      if (chk.data && chk.data.length) {
        alert('Nama ' + chk.data.map(function (d) { return d.nama; }).join(', ') + ' sudah terdaftar.');
        return;
      }

      var rows = names.map(function (n) {
        return { run_id: detailRunId, nama: n, tanggal: todayISO(), tipe: tipe, person_id: null };
      });
      var ins = await sb.from('run_registrations').insert(rows);
      if (ins.error) throw ins.error;
      alert('Berhasil mendaftarkan ' + rows.length + ' peserta (' + tipe + ')!');
      closeRunDetail();
    } catch (err) {
      alert('Gagal daftar: ' + err.message);
    }
  }

  // ---------- GALERI ----------
  async function loadGallery() {
    var c = document.getElementById('gallery-container');
    if (!c) return;
    try {
      var res = await sb.from('gallery').select('id, image_path, caption').order('created_at', { ascending: false }).limit(12);
      if (res.error) throw res.error;
      var data = res.data || [];
      if (!data.length) { c.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8">Belum ada foto.</p>'; return; }
      c.innerHTML = data.map(function (img) {
        var url = buildPublicUrl(GALLERY_BUCKET, img.image_path);
        var cap = escapeHtml(img.caption || 'Tanpa Judul');
        return '<div class="gallery-item bg-white rounded-lg overflow-hidden shadow-md" onclick="openLightbox(\'' + url + '\', \'' + cap.replace(/'/g, "\\'") + '\')">'
          + '<img src="' + url + '" alt="' + cap + '" class="w-full h-48 object-cover" loading="lazy">'
          + '<div class="p-2 text-center text-sm text-gray-600 truncate">' + cap + '</div></div>';
      }).join('');
    } catch (err) { c.innerHTML = '<p class="text-red-500 col-span-full">Error: ' + escapeHtml(err.message) + '</p>'; }
  }

  // ---------- KAMUS ----------
  async function loadKamus() {
    var c = document.getElementById('kamus-container');
    if (!c) return;
    try {
      var res = await sb.from('kamus_hash').select('id, term, def').order('sort_order', { ascending: true }).limit(100);
      if (res.error) throw res.error;
      var data = res.data || [];
      if (!data.length) { c.innerHTML = '<p class="text-gray-500 text-center py-8">Belum ada kamus.</p>'; return; }
      c.innerHTML = '<dl class="grid grid-cols-1 md:grid-cols-2 gap-3">' + data.map(function (k) {
        return '<div class="bg-hash-light p-3 rounded border-l-4 border-hash-green">'
          + '<dt class="font-bold text-hash-green">' + escapeHtml(k.term) + '</dt>'
          + '<dd class="text-sm text-gray-700 mt-1">' + escapeHtml(k.def) + '</dd></div>';
      }).join('') + '</dl>';
    } catch (err) { console.error('loadKamus:', err); }
  }

  // ===== MEMBER =====
  async function handleAddMember(e) {
    e.preventDefault();
    var nama = document.getElementById('am-nama').value.trim();
    if (!nama) return;
    try {
      var dup = await sb.from('people').select('nama').ilike('nama', nama).limit(1);
      if (dup.data && dup.data.length) { alert('Nama ' + nama + ' sudah terdaftar.'); return; }

      var row = {
        id: 'M' + Date.now(),
        nama: nama,
        hashname: document.getElementById('am-hashname').value.trim(),
        phone: document.getElementById('am-phone').value.trim(),
        size: document.getElementById('am-size').value,
        tanggal_lahir: document.getElementById('am-tanggal_lahir').value || null,
        type: document.getElementById('am-type').value,
        status_member: 'active',
        qr_token: genToken(),
        attendance_count: 0,
        registered_at: todayISO()
      };
      var ins = await sb.from('people').insert(row);
      if (ins.error) throw ins.error;
      alert('Member ' + nama + ' berhasil disimpan!');
      e.target.reset();
      await loadMembersTable();
    } catch (err) { alert('Gagal simpan: ' + err.message); }
  }

  async function handleExcelUpload(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function (ev) {
      try {
        var data = new Uint8Array(ev.target.result);
        var wb = XLSX.read(data, { type: 'array' });
        var sheet = wb.Sheets[wb.SheetsNames[0]];
        var json = XLSX.utils.sheet_to_json(sheet);
        var clean = json.map(function (r) {
          var lr = {};
          Object.keys(r).forEach(function (k) { lr[k.toLowerCase().replace(/\s/g, '_')] = r[k]; });
          return {
            id: (lr.id || 'M' + Date.now() + Math.floor(Math.random() * 1000)).toString(),
            nama: lr.nama || lr.name || '',
            hashname: lr.hashname || '',
            tanggal_lahir: lr.tanggal_lahir || null,
            size: lr.size || lr.ukuran || 'L',
            phone: lr.phone || lr.no_hp || '',
            type: lr.type || 'member',
            status_member: 'active',
            qr_token: lr.qr_token || genToken(),
            attendance_count: 0,
            registered_at: todayISO()
          };
        }).filter(function (r) { return r.nama; });
        if (!clean.length) { alert('File kosong/format salah!'); return; }

        var names = clean.map(function (r) { return r.nama; });
        var dupRes = await sb.from('people').select('nama').in('nama', names);
        if (dupRes.data && dupRes.data.length) {
          alert('Nama ' + dupRes.data.map(function (m) { return m.nama; }).join(', ') + ' sudah terdaftar. Upload dibatalkan.');
          return;
        }
        var ins = await sb.from('people').insert(clean).select();
        if (ins.error) throw ins.error;
        alert('Berhasil upload ' + ins.data.length + ' member!');
        e.target.value = '';
        await loadMembersTable();
      } catch (err) { alert('Gagal: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
  }

  async function loadMembersTable() {
    var body = document.getElementById('members-table-body');
    if (!body) return;
    try {
      var res = await sb.from('people')
        .select('id, nama, hashname, phone, size, attendance_count')
        .order('nama');
      if (res.error) throw res.error;
      var data = res.data || [];
      if (!data.length) { body.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-gray-500">Belum ada member.</td></tr>'; return; }
      body.innerHTML = data.map(function (m) {
        return '<tr class="border-b hover:bg-gray-50">'
          + '<td class="px-3 py-2 text-xs">' + escapeHtml(m.id) + '</td>'
          + '<td class="px-3 py-2 text-sm font-semibold">' + escapeHtml(m.nama) + '</td>'
          + '<td class="px-3 py-2 text-sm">' + escapeHtml(m.hashname || '-') + '</td>'
          + '<td class="px-3 py-2 text-sm">' + escapeHtml(m.phone || '-') + '</td>'
          + '<td class="px-3 py-2 text-sm">' + escapeHtml(m.size || '-') + '</td>'
          + '<td class="px-3 py-2 text-sm">' + (m.attendance_count || 0) + '</td>'
          + '<td class="px-3 py-2"><button class="bg-hash-amber text-white px-3 py-1 rounded text-xs" onclick="openEditMember(\'' + m.id + '\')"><i class="fas fa-edit mr-1"></i>Edit</button></td>'
          + '</tr>';
      }).join('');
    } catch (err) {
      body.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-red-500">' + escapeHtml(err.message) + '</td></tr>';
    }
  }

  async function openEditMember(id) {
    var modal = document.getElementById('edit-member-modal');
    if (!modal) return;
    try {
      var res = await sb.from('people').select('*').eq('id', id).maybeSingle();
      if (res.error || !res.data) { alert('Member tidak ditemukan'); return; }
      var m = res.data;
      document.getElementById('edit-member-id').value = m.id;
      document.getElementById('edit-nama').value = m.nama || '';
      document.getElementById('edit-hashname').value = m.hashname || '';
      document.getElementById('edit-phone').value = m.phone || '';
      document.getElementById('edit-size').value = m.size || 'L';
      document.getElementById('edit-tanggal_lahir').value = m.tanggal_lahir || '';
      document.getElementById('edit-type').value = m.type || 'member';
      document.getElementById('edit-status').value = m.status_member || 'active';
      modal.classList.add('active');
    } catch (err) { alert('Error: ' + err.message); }
  }
  window.openEditMember = openEditMember;
  function closeEditMember() { document.getElementById('edit-member-modal')?.classList.remove('active'); }
  window.closeEditMember = closeEditMember;

  async function saveEditMember(e) {
    e.preventDefault();
    var id = document.getElementById('edit-member-id').value;
    var payload = {
      nama: document.getElementById('edit-nama').value.trim(),
      hashname: document.getElementById('edit-hashname').value.trim(),
      phone: document.getElementById('edit-phone').value.trim(),
      size: document.getElementById('edit-size').value,
      tanggal_lahir: document.getElementById('edit-tanggal_lahir').value || null,
      type: document.getElementById('edit-type').value,
      status_member: document.getElementById('edit-status').value,
      updated_at: new Date().toISOString()
    };
    try {
      var res = await sb.from('people').update(payload).eq('id', id);
      if (res.error) throw res.error;
      alert('Member berhasil diupdate!');
      closeEditMember();
      await loadMembersTable();
    } catch (err) { alert('Gagal update: ' + err.message); }
  }

  // ===== KAS BANK =====
  async function loadKas() {
    var body = document.getElementById('kas-table-body');
    if (!body) return;
    try {
      var res = await sb.from('kas_transactions')
        .select('id, tanggal, tipe, kategori, keterangan, jumlah')
        .is('deleted_at', null)
        .order('tanggal', { ascending: false })
        .limit(100);
      if (res.error) throw res.error;
      var data = res.data || [];

      var masuk = 0, keluar = 0;
      data.forEach(function (t) {
        var v = Number(t.jumlah || 0);
        var s = String(t.tipe || '').toLowerCase();
        if (s.indexOf('keluar') >= 0 || s.indexOf('out') >= 0) keluar += v;
        else masuk += v;
      });
      document.getElementById('kas-total-masuk').innerText = formatRupiah(masuk);
      document.getElementById('kas-total-keluar').innerText = formatRupiah(keluar);
      document.getElementById('kas-saldo').innerText = formatRupiah(masuk - keluar);

      if (!data.length) { body.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Belum ada transaksi.</td></tr>'; return; }
      body.innerHTML = data.map(function (t) {
        var isOut = String(t.tipe || '').toLowerCase().indexOf('keluar') >= 0;
        return '<tr class="border-b hover:bg-gray-50">'
          + '<td class="px-3 py-2 text-sm">' + (t.tanggal || '-') + '</td>'
          + '<td class="px-3 py-2"><span class="text-xs px-2 py-1 rounded-full ' + (isOut ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700') + '">' + escapeHtml(t.tipe || '-') + '</span></td>'
          + '<td class="px-3 py-2 text-sm">' + escapeHtml(t.kategori || '-') + '</td>'
          + '<td class="px-3 py-2 text-sm">' + escapeHtml(t.keterangan || '-') + '</td>'
          + '<td class="px-3 py-2 text-sm font-semibold ' + (isOut ? 'text-red-600' : 'text-green-600') + '">' + formatRupiah(t.jumlah) + '</td>'
          + '<td class="px-3 py-2"><button class="bg-red-500 text-white px-3 py-1 rounded text-xs" onclick="deleteKasTransaction(\'' + t.id + '\')"><i class="fas fa-trash mr-1"></i>Hapus</button></td>'
          + '</tr>';
      }).join('');
    } catch (err) {
      body.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-red-500">' + escapeHtml(err.message) + '</td></tr>';
    }
  }

  async function handleAddKas(e) {
    e.preventDefault();
    var tanggal = document.getElementById('kas-tanggal').value;
    if (!tanggal) { alert('Tanggal wajib diisi!'); return; }
    if (tanggal > todayISO()) { alert('Tanggal tidak boleh melebihi hari ini!'); return; }
    var row = {
      tanggal: tanggal,
      tipe: document.getElementById('kas-tipe').value,
      kategori: document.getElementById('kas-kategori').value.trim(),
      keterangan: document.getElementById('kas-keterangan').value.trim(),
      jumlah: Number(document.getElementById('kas-jumlah').value),
      member_id: null,
      payment_id: null,
      created_by: currentUser ? currentUser.id : null
    };
    try {
      var ins = await sb.from('kas_transactions').insert(row);
      if (ins.error) throw ins.error;
      alert('Transaksi berhasil disimpan!');
      e.target.reset();
      document.getElementById('kas-tanggal').value = todayISO();
      await loadKas();
    } catch (err) { alert('Gagal simpan: ' + err.message); }
  }

  async function deleteKasTransaction(id) {
    if (!confirm('Hapus transaksi ini? Iuran terkait akan otomatis kembali ke "Belum Bayar".')) return;
    try {
      var tr = await sb.from('kas_transactions').select('id, payment_id').eq('id', id).maybeSingle();
      if (tr.error || !tr.data) throw new Error('Transaksi tidak ditemukan');
      var paymentId = tr.data.payment_id;

      var softDel = await sb.from('kas_transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (softDel.error) throw softDel.error;

      if (paymentId) {
        var items = await sb.from('payment_items').select('bill_id').eq('payment_id', paymentId);
        if (items.data && items.data.length) {
          var billIds = items.data.map(function (i) { return i.bill_id; });
          await sb.from('iuran_bills').update({ status: 'unpaid', paid_at: null, payment_id: null, updated_at: new Date().toISOString() }).in('id', billIds);
        }
        await sb.from('payments').update({ status: 'cancelled', kas_transaction_id: null, updated_at: new Date().toISOString() }).eq('id', paymentId);
      }
      alert('Transaksi dihapus. Iuran terkait direset ke "Belum Bayar".');
      await loadKas();
    } catch (err) { alert('Gagal hapus: ' + err.message); }
  }
  window.deleteKasTransaction = deleteKasTransaction;

  // ===== EXPORT =====
  function attachExport(type) {
    document.getElementById('btn-export-' + type + '-excel')?.addEventListener('click', function () { doExport(type, 'excel'); });
    document.getElementById('btn-export-' + type + '-pdf')?.addEventListener('click', function () { doExport(type, 'pdf'); });
  }
  async function doExport(type, fmt) {
    var data = [], title = 'Data', cols = [];
    try {
      if (type === 'member') {
        var r = await sb.from('people').select('*').order('nama');
        data = r.data || []; title = 'Database_Member_Hitman';
        cols = ['id', 'nama', 'hashname', 'phone', 'size', 'tanggal_lahir', 'type', 'status_member', 'attendance_count'];
      } else {
        var r = await sb.from('kas_transactions').select('*').is('deleted_at', null).order('tanggal', { ascending: false });
        data = r.data || []; title = 'Laporan_Kas_Bank';
        cols = ['tanggal', 'tipe', 'kategori', 'keterangan', 'jumlah', 'member_id'];
      }
    } catch (err) { alert('Error ambil data: ' + err.message); return; }
    if (!data.length) { alert('Tidak ada data.'); return; }
    if (fmt === 'excel') {
      var ws = XLSX.utils.json_to_sheet(data, { header: cols });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, type);
      XLSX.writeFile(wb, title + '_' + todayISO() + '.xlsx');
    } else {
      var jsPDF = window.jspdf.jsPDF;
      var doc = new jsPDF();
      doc.setFontSize(14); doc.setTextColor(22, 101, 52);
      doc.text(title.replace(/_/g, ' '), 14, 15);
      var rows = data.map(function (r) { return cols.map(function (c) { return r[c] != null ? String(r[c]) : '-'; }); });
      doc.autoTable({ head: [cols], body: rows, startY: 22, styles: { fontSize: 7 }, headStyles: { fillColor: [22, 101, 52] } });
      doc.save(title + '_' + todayISO() + '.pdf');
    }
  }

  // ===== ULTAH =====
  async function loadUltah() {
    var c = document.getElementById('ultah-container');
    if (!c) return;
    try {
      var curMonth = new Date().getMonth() + 1;
      var res = await sb.from('people').select('nama, tanggal_lahir, phone').not('tanggal_lahir', 'is', null);
      if (res.error) throw res.error;
      var data = (res.data || []).filter(function (m) { return m.tanggal_lahir && (new Date(m.tanggal_lahir).getMonth() + 1 === curMonth); });
      if (!data.length) { c.innerHTML = '<p class="text-gray-500 col-span-2 text-center py-8">Tidak ada ultah bulan ini.</p>'; return; }
      c.innerHTML = data.map(function (m) {
        var d = new Date(m.tanggal_lahir);
        return '<div class="bg-gradient-to-r from-pink-50 to-purple-50 p-4 rounded-lg border border-pink-200 flex items-center justify-between">'
          + '<div class="flex items-center gap-3"><div class="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center"><i class="fas fa-birthday-cake text-pink-500"></i></div>'
          + '<div><h5 class="font-bold">' + escapeHtml(m.nama) + '</h5><p class="text-sm text-gray-600">' + d.getDate() + ' ' + d.toLocaleDateString('id-ID', { month: 'long' }) + '</p></div></div>'
          + '<button onclick="sendWish(\'' + escapeHtml(m.nama).replace(/'/g, "\\'") + '\',\'' + escapeHtml(m.phone || '') + '\')" class="bg-green-500 text-white px-3 py-1 rounded-lg text-sm"><i class="fab fa-whatsapp mr-1"></i>Ucapan</button></div>';
      }).join('');
    } catch (err) { console.error('loadUltah:', err); }
  }
  function sendWish(name, phone) {
    window.open('https://wa.me/' + (phone || '') + '?text=' + encodeURIComponent('Selamat Ulang Tahun ' + name + '! 🎂 On On! - Hitman Pekanbaru'), '_blank');
  }
  window.sendWishWhatsApp = sendWish;

  // =====================================================================
  // REKAP WA (FORMAT BARU sesuai template klub)
  // =====================================================================
  async function rekapWA(type) {
    var rc = document.getElementById('rekap-result');
    var rt = document.getElementById('rekap-text');
    if (!rc || !rt) return;
    rc.classList.remove('hidden');
    rt.innerText = 'Memuat...';
    try {
      var runRes = await sb.from('runs')
        .select('id, nama, tanggal_acara, run_number')
        .eq('status', 'published')
        .gte('tanggal_acara', todayISO())
        .order('tanggal_acara')
        .limit(1)
        .maybeSingle();
      if (!runRes.data) { rt.innerText = 'Tidak ada run mendatang.'; return; }
      var run = runRes.data;

      // Peta nama -> type (member/visitor) dari tabel people
      var ppl = await sb.from('people').select('nama, type');
      var typeMap = {};
      (ppl.data || []).forEach(function (p) {
        typeMap[String(p.nama).toLowerCase()] = (p.type || 'visitor');
      });

      var entries = [];
      if (type === 'daftar') {
        var regs = await sb.from('run_registrations').select('nama').eq('run_id', run.id);
        (regs.data || []).forEach(function (r) {
          entries.push({ nama: r.nama, tipe: typeMap[String(r.nama).toLowerCase()] || 'visitor' });
        });
      } else {
        var att = await sb.from('attendances').select('person_id, people:person_id(nama, type)').eq('tanggal', run.tanggal_acara);
        (att.data || []).forEach(function (a) {
          entries.push({
            nama: (a.people && a.people.nama) || a.person_id || '?',
            tipe: (a.people && a.people.type) || 'visitor'
          });
        });
      }

      var members = entries.filter(function (e) { return e.tipe === 'member'; });
      var visitors = entries.filter(function (e) { return e.tipe !== 'member'; });

      var judul = (type === 'daftar') ? 'REKAP DAFTAR RUN' : 'REKAP HADIR RUN';
      var totalLabel = (type === 'daftar') ? 'Total Daftar' : 'Total Hadir';

      var msg = '*' + judul + ' #' + run.run_number + ' ' + run.nama + '*\n';
      msg += formatTanggal(run.tanggal_acara) + '\n\n';
      msg += '*' + totalLabel + ' = ' + entries.length + '*\n';

      var no = 1;
      if (members.length) {
        msg += '*Total member : ' + members.length + '*\n';
        members.forEach(function (e) { msg += no + '. ' + e.nama + ' (member)\n'; no++; });
      }
      if (visitors.length) {
        msg += '\n*Total visitor : ' + visitors.length + '*\n';
        visitors.forEach(function (e) { msg += no + '. ' + e.nama + ' (visitor)\n'; no++; });
      }
      if (!entries.length) {
        msg += 'Belum ada data.\n';
      }

      msg += '\n*Hitman Pekanbaru Hashing Club*';
      rt.innerText = msg;
    } catch (err) {
      rt.innerText = 'Error: ' + err.message;
    }
  }
  window.generateRekapWA = rekapWA;

  // ===== LOGS =====
  async function loadLogs() {
    var tb = document.getElementById('logs-table-body');
    if (!tb) return;
    try {
      var res = await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(30);
      if (res.error) throw res.error;
      var data = res.data || [];
      if (!data.length) { tb.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500">Belum ada log.</td></tr>'; return; }
      tb.innerHTML = data.map(function (l) {
        var detail = (l.entity_type || '') + (l.entity_id ? ' #' + String(l.entity_id).substring(0, 8) : '');
        return '<tr class="border-b hover:bg-gray-50">'
          + '<td class="px-3 py-2 text-xs">' + new Date(l.created_at).toLocaleString('id-ID') + '</td>'
          + '<td class="px-3 py-2 text-sm font-semibold">' + escapeHtml(l.action || '-') + '</td>'
          + '<td class="px-3 py-2 text-xs">' + escapeHtml(String(l.actor_user_id || '').substring(0, 8)) + '…</td>'
          + '<td class="px-3 py-2 text-xs">' + escapeHtml(detail) + '</td></tr>';
      }).join('');
    } catch (err) { console.error('loadLogs:', err); }
  }

  // ===== SCANNER =====
  var scanner = null;
  function openScanner() {
    document.getElementById('scanner-modal').classList.add('active');
    if (scanner) { try { scanner.clear(); } catch (e) {} }
    scanner = new Html5Qrcode('qr-reader');
    scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 },
      async function (qr) { await processAttendance(qr); try { scanner.stop(); } catch (e) {} },
      function () {}
    ).catch(function (err) { alert('Gagal akses kamera: ' + err); });
  }
  window.initQRScanner = openScanner;

  async function processAttendance(qrToken) {
    try {
      await sb.from('scan_logs').insert({ qr_token: qrToken, scan_date: todayISO(), result: 'started', message: 'scan initiated' });
      var mRes = await sb.from('people').select('id, nama, attendance_count').eq('qr_token', qrToken).maybeSingle();
      if (!mRes.data) {
        await sb.from('scan_logs').insert({ qr_token: qrToken, scan_date: todayISO(), result: 'invalid', message: 'token not found' });
        alert('QR tidak valid!');
        return;
      }
      var member = mRes.data;
      var dup = await sb.from('attendances').select('id').eq('person_id', member.id).eq('tanggal', todayISO()).limit(1);
      if (dup.data && dup.data.length) {
        await sb.from('scan_logs').insert({ qr_token: qrToken, scan_date: todayISO(), person_id: member.id, result: 'duplicate', message: 'already scanned today' });
        alert(member.nama + ' sudah absen hari ini!');
        return;
      }
      var ins = await sb.from('attendances').insert({ person_id: member.id, tanggal: todayISO(), scanned_at: new Date().toISOString(), keterangan: 'Hadir' });
      if (ins.error) throw ins.error;
      await sb.from('people').update({ attendance_count: (member.attendance_count || 0) + 1 }).eq('id', member.id);
      await sb.from('scan_logs').insert({ qr_token: qrToken, scan_date: todayISO(), person_id: member.id, result: 'success', message: 'attendance recorded' });
      alert('Absensi berhasil: ' + member.nama);
    } catch (err) { alert('Error absensi: ' + err.message); }
  }

  function closeScanner() {
    document.getElementById('scanner-modal')?.classList.remove('active');
    if (scanner) try { scanner.stop(); } catch (e) {}
  }
  window.closeScannerModal = closeScanner;

  // ===== LIGHTBOX =====
  window.openLightbox = function (url, cap) {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox-caption').innerText = cap || '';
    document.getElementById('lightbox-modal').classList.add('active');
  };
  window.closeLightbox = function (ev) {
    if (!ev || ev.target.id === 'lightbox-modal') document.getElementById('lightbox-modal').classList.remove('active');
  };
})();