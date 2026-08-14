/* =====================================================================
   HITMAN PEKANBARU HASHING CLUB - js/app.js (VERSI 4 - FINAL)
   Dikunci 1:1 ke skema database asli (2026-08-15)
   ===================================================================== */
(function () {
  'use strict';

  // ===== Ambil client dari config.js =====
  var sb = window.sb;
  if (!sb || !window.supabaseReady) {
    console.error('❌ [app.js] Supabase belum siap');
    alert('Database belum siap. Refresh halaman.');
    return;
  }

  console.log('✅ [app.js] Supabase siap! Memulai aplikasi...');

  // ===== Konstanta Storage =====
  var SUPABASE_URL = 'https://awpcrceoxddyltasznht.supabase.co';
  var GALLERY_BUCKET = 'gallery-photos';
  var RUNS_BUCKET = 'run-photos';

  // ===== Helpers =====
  function buildPublicUrl(bucket, path) {
    if (!path) return '';
    if (path.startsWith('http')) return path; // sudah URL penuh
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
    try {
      return new Date(d).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
    } catch (e) { return d; }
  }

  function genToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // ===== State =====
  var currentUser = null;
  var isAdminUser = false;

  // =====================================================================
  // INISIALISASI
  // =====================================================================
  document.addEventListener('DOMContentLoaded', async function () {
    await initAuth();
    bindEvents();
    await loadPublic();
  });

  // =====================================================================
  // AUTH
  // =====================================================================
  async function initAuth() {
    try {
      var sess = await sb.auth.getSession();
      if (sess.data.session) {
        currentUser = sess.data.session.user;
        await checkAdmin(currentUser.id);
      }
      sb.auth.onAuthStateChange(async function (event, session) {
        if (event === 'SIGNED_IN' && session) {
          currentUser = session.user;
          await checkAdmin(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          currentUser = null;
          isAdminUser = false;
          updateUI();
        }
      });
    } catch (err) {
      console.error('❌ initAuth:', err);
    }
  }

  async function checkAdmin(userId) {
    try {
      var res = await sb.from('admin_profiles')
        .select('user_id, role')
        .eq('user_id', userId)
        .maybeSingle();
      isAdminUser = !res.error && !!res.data;
    } catch (e) {
      isAdminUser = false;
    }
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
      document.getElementById('login-modal').classList.remove('active');
      document.getElementById('form-login').reset();
      alert('Login berhasil!');
    } catch (err) {
      if (errDiv) {
        errDiv.classList.remove('hidden');
        errDiv.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>' + escapeHtml(err.message || 'Login gagal');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Masuk'; }
    }
  }

  async function logoutAdmin() {
    if (!confirm('Logout?')) return;
    await sb.auth.signOut();
    currentUser = null;
    isAdminUser = false;
    updateUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.logoutAdmin = logoutAdmin;
  window.isAdminLoggedIn = function () { return isAdminUser && !!currentUser; };

  // =====================================================================
  // EVENTS
  // =====================================================================
  function bindEvents() {
    document.getElementById('form-login')?.addEventListener('submit', handleLogin);

    // Upload Excel
    var upBtn = document.getElementById('btn-upload-excel');
    var upInput = document.getElementById('excel-file-input');
    if (upBtn && upInput) {
      upBtn.addEventListener('click', function () { upInput.click(); });
      upInput.addEventListener('change', handleExcelUpload);
    }

    // Export
    attachExport('member');
    attachExport('kas');

    // Registrasi run
    document.getElementById('form-run-registration')?.addEventListener('submit', handleRunReg);

    // Rekap WA
    document.getElementById('btn-rekap-daftar')?.addEventListener('click', function () { rekapWA('daftar'); });
    document.getElementById('btn-rekap-hadir')?.addEventListener('click', function () { rekapWA('hadir'); });
    document.getElementById('btn-copy-rekap')?.addEventListener('click', function () {
      var t = document.getElementById('rekap-text').innerText;
      navigator.clipboard.writeText(t).then(function () { alert('Rekap di-copy!'); });
    });

    // Scanner
    document.getElementById('btn-open-scanner')?.addEventListener('click', openScanner);

    // Simpan edit member
    document.getElementById('form-edit-member')?.addEventListener('submit', saveEditMember);
  }

  // =====================================================================
  // PUBLIC DATA
  // =====================================================================
  async function loadPublic() {
    await Promise.allSettled([loadRuns(), lockRun(), loadGallery(), loadKamus()]);
  }

  async function loadAdmin() {
    await Promise.allSettled([loadMembersTable(), loadUltah(), loadLogs()]);
  }

  // ---------- JADWAL RUN ----------
  async function loadRuns() {
    var c = document.getElementById('run-list-container');
    if (!c) return;
    try {
      var res = await sb.from('runs')
        .select('id, run_number, nama, foto_path, tanggal_acara, lokasi, deskripsi')
        .eq('status', 'published')
        .gte('tanggal_acara', todayISO())
        .order('tanggal_acara', { ascending: true })
        .limit(6);
      if (res.error) throw res.error;
      var data = res.data || [];
      if (!data.length) {
        c.innerHTML = '<p class="text-gray-500 col-span-2 text-center py-8">Belum ada jadwal run minggu ini.</p>';
        return;
      }
      c.innerHTML = data.map(function (r) {
        var img = r.foto_path ? '<img src="' + buildPublicUrl(RUNS_BUCKET, r.foto_path) + '" class="w-full h-32 object-cover rounded mb-3">' : '';
        return '<div class="bg-hash-light p-4 rounded-lg border border-green-200 shadow-sm hover:shadow-md transition">'
          + img
          + '<div class="flex justify-between items-start mb-2">'
          + '<h4 class="font-bold text-hash-green text-lg">' + escapeHtml(r.nama) + '</h4>'
          + '<span class="bg-hash-amber text-white text-xs px-2 py-1 rounded-full">Run #' + (r.run_number || '') + '</span>'
          + '</div>'
          + '<p class="text-sm text-gray-600 mb-1"><i class="fas fa-calendar mr-2"></i>' + formatTanggal(r.tanggal_acara) + '</p>'
          + '<p class="text-sm text-gray-600 mb-1"><i class="fas fa-map-marker-alt mr-2"></i>' + escapeHtml(r.lokasi || 'TBD') + '</p>'
          + (r.deskripsi ? '<p class="text-sm text-gray-700 mt-2">' + escapeHtml(r.deskripsi) + '</p>' : '')
          + '</div>';
      }).join('');
    } catch (err) {
      console.error('loadRuns:', err);
      c.innerHTML = '<p class="text-red-500 col-span-2">Error: ' + escapeHtml(err.message) + '</p>';
    }
  }

  async function lockRun() {
    var sel = document.getElementById('run-select');
    if (!sel) return;
    try {
      var res = await sb.from('runs')
        .select('id, nama, tanggal_acara, run_number')
        .eq('status', 'published')
        .gte('tanggal_acara', todayISO())
        .order('tanggal_acara', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (res.error || !res.data) {
        sel.innerHTML = '<option value="">Tidak ada run terdekat</option>';
        return;
      }
      var r = res.data;
      sel.innerHTML = '<option value="' + r.id + '" selected>#' + r.run_number + ' ' + escapeHtml(r.nama) + ' - ' + formatTanggal(r.tanggal_acara) + '</option>';
      sel.disabled = true;
      sel.classList.add('bg-gray-100', 'cursor-not-allowed');
    } catch (err) { console.error('lockRun:', err); }
  }

  async function handleRunReg(e) {
    e.preventDefault();
    var nama = document.getElementById('reg-name').value.trim();
    var runId = document.getElementById('run-select').value;
    if (!nama || !runId) { alert('Lengkapi data!'); return; }
    if (await checkDupRun(nama, runId)) return;
    try {
      var res = await sb.from('run_registrations').insert({
        run_id: runId,
        nama: nama,
        tanggal: todayISO(),
        tipe: 'single',
        person_id: null
      });
      if (res.error) throw res.error;
      alert('Berhasil daftar run!');
      e.target.reset();
    } catch (err) {
      alert('Gagal daftar: ' + err.message);
    }
  }

  async function checkDupRun(nama, runId) {
    try {
      var res = await sb.from('run_registrations')
        .select('nama')
        .eq('run_id', runId)
        .ilike('nama', nama)
        .limit(1);
      if (res.data && res.data.length > 0) {
        alert('Nama ' + nama + ' sudah terdaftar di run ini.');
        return true;
      }
      return false;
    } catch (e) { return false; }
  }

  // ---------- GALERI ----------
  async function loadGallery() {
    var c = document.getElementById('gallery-container');
    if (!c) return;
    try {
      var res = await sb.from('gallery')
        .select('id, image_path, caption')
        .order('created_at', { ascending: false })
        .limit(12);
      if (res.error) throw res.error;
      var data = res.data || [];
      if (!data.length) {
        c.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8">Belum ada foto.</p>';
        return;
      }
      c.innerHTML = data.map(function (img) {
        var url = buildPublicUrl(GALLERY_BUCKET, img.image_path);
        var cap = escapeHtml(img.caption || 'Tanpa Judul');
        return '<div class="gallery-item bg-white rounded-lg overflow-hidden shadow-md" onclick="openLightbox(\'' + url + '\', \'' + cap.replace(/'/g, "\\'") + '\')">'
          + '<img src="' + url + '" alt="' + cap + '" class="w-full h-48 object-cover" loading="lazy">'
          + '<div class="p-2 text-center text-sm text-gray-600 truncate">' + cap + '</div>'
          + '</div>';
      }).join('');
    } catch (err) {
      console.error('loadGallery:', err);
      c.innerHTML = '<p class="text-red-500 col-span-full">Error: ' + escapeHtml(err.message) + '</p>';
    }
  }

  // ---------- KAMUS HASH ----------
  async function loadKamus() {
    var c = document.getElementById('kamus-container');
    if (!c) return;
    try {
      var res = await sb.from('kamus_hash')
        .select('id, term, def')
        .order('sort_order', { ascending: true })
        .limit(100);
      if (res.error) throw res.error;
      var data = res.data || [];
      if (!data.length) {
        c.innerHTML = '<p class="text-gray-500 text-center py-8">Belum ada kamus.</p>';
        return;
      }
      c.innerHTML = '<dl class="grid grid-cols-1 md:grid-cols-2 gap-3">'
        + data.map(function (k) {
          return '<div class="bg-hash-light p-3 rounded border-l-4 border-hash-green">'
            + '<dt class="font-bold text-hash-green">' + escapeHtml(k.term) + '</dt>'
            + '<dd class="text-sm text-gray-700 mt-1">' + escapeHtml(k.def) + '</dd>'
            + '</div>';
        }).join('')
        + '</dl>';
    } catch (err) {
      console.error('loadKamus:', err);
    }
  }

  // =====================================================================
  // MANAJEMEN MEMBER (UPLOAD + EDIT + EXPORT)
  // =====================================================================
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
          Object.keys(r).forEach(function (k) {
            lr[k.toLowerCase().replace(/\s/g, '_')] = r[k];
          });
          return {
            id: (lr.id || 'M' + Date.now() + Math.floor(Math.random() * 1000)).toString(),
            nama: lr.nama || lr.name || '',
            hashname: lr.hashname || '',
            tanggal_lahir: lr.tanggal_lahir || null,
            size: lr.size || lr.ukuran || 'L',
            phone: lr.phone || lr.no_hp || '',
            type: lr.type || 'member',
            status_member: lr.status_member || 'active',
            qr_token: lr.qr_token || genToken(),
            attendance_count: 0,
            registered_at: todayISO()
          };
        }).filter(function (r) { return r.nama; });
        if (!clean.length) { alert('File kosong/format salah!'); return; }

        // Cek duplikasi nama
        var names = clean.map(function (r) { return r.nama; });
        var dupRes = await sb.from('people').select('nama').in('nama', names);
        if (dupRes.data && dupRes.data.length > 0) {
          alert('Nama ' + dupRes.data.map(function (m) { return m.nama; }).join(', ') + ' sudah terdaftar. Upload dibatalkan.');
          return;
        }

        var ins = await sb.from('people').insert(clean).select();
        if (ins.error) throw ins.error;
        alert('Berhasil upload ' + ins.data.length + ' member!');
        e.target.value = '';
        if (isAdminUser) await loadMembersTable();
      } catch (err) { alert('Gagal: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
  }

  async function loadMembersTable() {
    var body = document.getElementById('members-table-body');
    if (!body) return;
    try {
      var res = await sb.from('people')
        .select('id, nama, hashname, phone, size, tanggal_lahir, type, status_member, attendance_count')
        .order('nama');
      if (res.error) throw res.error;
      var data = res.data || [];
      if (!data.length) {
        body.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-gray-500">Belum ada member.</td></tr>';
        return;
      }
      body.innerHTML = data.map(function (m) {
        return '<tr class="border-b hover:bg-gray-50">'
          + '<td class="px-3 py-2 text-sm">' + escapeHtml(m.id) + '</td>'
          + '<td class="px-3 py-2 text-sm font-semibold">' + escapeHtml(m.nama) + '</td>'
          + '<td class="px-3 py-2 text-sm">' + escapeHtml(m.hashname || '-') + '</td>'
          + '<td class="px-3 py-2 text-sm">' + escapeHtml(m.phone || '-') + '</td>'
          + '<td class="px-3 py-2 text-sm">' + escapeHtml(m.size || '-') + '</td>'
          + '<td class="px-3 py-2 text-sm">' + (m.attendance_count || 0) + '</td>'
          + '<td class="px-3 py-2 text-sm"><button class="bg-hash-amber text-white px-3 py-1 rounded text-xs" onclick="openEditMember(\'' + m.id + '\')"><i class="fas fa-edit mr-1"></i>Edit</button></td>'
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

  function closeEditMember() {
    document.getElementById('edit-member-modal')?.classList.remove('active');
  }
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

  // =====================================================================
  // EXPORT
  // =====================================================================
  function attachExport(type) {
    document.getElementById('btn-export-' + type + '-excel')?.addEventListener('click', function () { doExport(type, 'excel'); });
    document.getElementById('btn-export-' + type + '-pdf')?.addEventListener('click', function () { doExport(type, 'pdf'); });
  }

  async function doExport(type, fmt) {
    var data = [], title = 'Data', cols = [];
    try {
      if (type === 'member') {
        var r = await sb.from('people').select('*').order('nama');
        data = r.data || [];
        title = 'Database_Member_Hitman';
        cols = ['id', 'nama', 'hashname', 'phone', 'size', 'tanggal_lahir', 'type', 'status_member', 'attendance_count'];
      } else {
        var r = await sb.from('kas_transactions')
          .select('*')
          .is('deleted_at', null)
          .order('tanggal', { ascending: false });
        data = r.data || [];
        title = 'Laporan_Kas_Bank';
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
      doc.setFontSize(14);
      doc.setTextColor(22, 101, 52);
      doc.text(title.replace(/_/g, ' '), 14, 15);
      var rows = data.map(function (r) { return cols.map(function (c) { return r[c] != null ? String(r[c]) : '-'; }); });
      doc.autoTable({ head: [cols], body: rows, startY: 22, styles: { fontSize: 7 }, headStyles: { fillColor: [22, 101, 52] } });
      doc.save(title + '_' + todayISO() + '.pdf');
    }
  }

  // =====================================================================
  // KAS TRANSAKSI (SOFT DELETE + CASCADE IURAN)
  // =====================================================================
  async function deleteKasTransaction(id) {
    if (!confirm('Hapus transaksi ini? Iuran terkait akan otomatis kembali ke "Belum Bayar".')) return;
    try {
      // 1) Ambil transaksi untuk dapat payment_id
      var tr = await sb.from('kas_transactions').select('id, payment_id').eq('id', id).maybeSingle();
      if (tr.error || !tr.data) throw new Error('Transaksi tidak ditemukan');

      var paymentId = tr.data.payment_id;

      // 2) Soft delete kas_transactions (set deleted_at)
      var softDel = await sb.from('kas_transactions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (softDel.error) throw softDel.error;

      // 3) Jika ada payment_id, cascade ke iuran_bills
      if (paymentId) {
        // Cari semua bill_id lewat payment_items
        var items = await sb.from('payment_items').select('bill_id').eq('payment_id', paymentId);
        if (items.data && items.data.length > 0) {
          var billIds = items.data.map(function (i) { return i.bill_id; });
          // Reset iuran_bills ke unpaid
          await sb.from('iuran_bills')
            .update({
              status: 'unpaid',
              paid_at: null,
              payment_id: null,
              updated_at: new Date().toISOString()
            })
            .in('id', billIds);
        }
        // Reset payment status
        await sb.from('payments')
          .update({
            status: 'cancelled',
            kas_transaction_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', paymentId);
      }

      alert('Transaksi dihapus (soft-delete). Iuran terkait sudah direset ke "Belum Bayar".');
    } catch (err) {
      alert('Gagal hapus: ' + err.message);
    }
  }
  window.deleteKasTransaction = deleteKasTransaction;

  // =====================================================================
  // ULTAH
  // =====================================================================
  async function loadUltah() {
    var c = document.getElementById('ultah-container');
    if (!c) return;
    try {
      var curMonth = new Date().getMonth() + 1;
      var res = await sb.from('people').select('nama, tanggal_lahir, phone').not('tanggal_lahir', 'is', null);
      if (res.error) throw res.error;
      var data = (res.data || []).filter(function (m) {
        return m.tanggal_lahir && (new Date(m.tanggal_lahir).getMonth() + 1 === curMonth);
      });
      if (!data.length) {
        c.innerHTML = '<p class="text-gray-500 col-span-2 text-center py-8">Tidak ada ultah bulan ini.</p>';
        return;
      }
      c.innerHTML = data.map(function (m) {
        var d = new Date(m.tanggal_lahir);
        var tgl = d.getDate();
        var bln = d.toLocaleDateString('id-ID', { month: 'long' });
        return '<div class="bg-gradient-to-r from-pink-50 to-purple-50 p-4 rounded-lg border border-pink-200 flex items-center justify-between">'
          + '<div class="flex items-center gap-3">'
          + '<div class="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center"><i class="fas fa-birthday-cake text-pink-500"></i></div>'
          + '<div><h5 class="font-bold">' + escapeHtml(m.nama) + '</h5><p class="text-sm text-gray-600">' + tgl + ' ' + bln + '</p></div>'
          + '</div>'
          + '<button onclick="sendWish(\'' + escapeHtml(m.nama).replace(/'/g, "\\'") + '\',\'' + escapeHtml(m.phone || '') + '\')" class="bg-green-500 text-white px-3 py-1 rounded-lg text-sm"><i class="fab fa-whatsapp mr-1"></i>Ucapan</button>'
          + '</div>';
      }).join('');
    } catch (err) { console.error('loadUltah:', err); }
  }

  function sendWish(name, phone) {
    var msg = 'Selamat Ulang Tahun ' + name + '! 🎂 On On! - Hitman Pekanbaru';
    window.open('https://wa.me/' + (phone || '') + '?text=' + encodeURIComponent(msg), '_blank');
  }
  window.sendWishWhatsApp = sendWish;

  // =====================================================================
  // REKAP WA
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
      var msg = '*REKAP ' + type.toUpperCase() + ' RUN*\n#' + run.run_number + ' ' + run.nama + '\n' + formatTanggal(run.tanggal_acara) + '\n\n';

      if (type === 'daftar') {
        var regs = await sb.from('run_registrations').select('nama').eq('run_id', run.id);
        if (regs.data && regs.data.length) {
          msg += 'Total: ' + regs.data.length + '\n' + regs.data.map(function (r, i) { return (i + 1) + '. ' + r.nama; }).join('\n');
        } else msg += 'Belum ada pendaftar.';
      } else {
        var att = await sb.from('attendances').select('person_id, people:person_id(nama)').eq('tanggal', run.tanggal_acara);
        if (att.data && att.data.length) {
          msg += 'Total: ' + att.data.length + '\n' + att.data.map(function (a, i) {
            var n = (a.people && a.people.nama) || a.person_id || '?';
            return (i + 1) + '. ' + n;
          }).join('\n');
        } else msg += 'Belum ada kehadiran.';
      }
      rt.innerText = msg;
    } catch (err) { rt.innerText = 'Error: ' + err.message; }
  }
  window.generateRekapWA = rekapWA;

  // =====================================================================
  // LOGS
  // =====================================================================
  async function loadLogs() {
    var tb = document.getElementById('logs-table-body');
    if (!tb) return;
    try {
      var res = await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(30);
      if (res.error) throw res.error;
      var data = res.data || [];
      if (!data.length) {
        tb.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500">Belum ada log.</td></tr>';
        return;
      }
      tb.innerHTML = data.map(function (l) {
        var detail = (l.entity_type || '') + (l.entity_id ? '#' + l.entity_id : '');
        return '<tr class="border-b hover:bg-gray-50">'
          + '<td class="px-3 py-2 text-xs">' + new Date(l.created_at).toLocaleString('id-ID') + '</td>'
          + '<td class="px-3 py-2 text-sm font-semibold">' + escapeHtml(l.action || '-') + '</td>'
          + '<td class="px-3 py-2 text-xs">' + escapeHtml((l.actor_user_id || '').substring(0, 8)) + '…</td>'
          + '<td class="px-3 py-2 text-xs">' + escapeHtml(detail) + '</td>'
          + '</tr>';
      }).join('');
    } catch (err) { console.error('loadLogs:', err); }
  }

  // =====================================================================
  // QR SCANNER
  // =====================================================================
  var scanner = null;

  function openScanner() {
    var modal = document.getElementById('scanner-modal');
    if (modal) modal.classList.add('active');
    if (scanner) { try { scanner.clear(); } catch (e) {} }
    scanner = new Html5Qrcode('qr-reader');
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 250 },
      async function (qr) {
        await processAttendance(qr);
        try { scanner.stop(); } catch (e) {}
      },
      function () {}
    ).catch(function (err) { alert('Gagal akses kamera: ' + err); });
  }
  window.initQRScanner = openScanner;

  async function processAttendance(qrToken) {
    try {
      // 1) Scan log entry
      await sb.from('scan_logs').insert({
        qr_token: qrToken,
        scan_date: todayISO(),
        result: 'started',
        message: 'scan initiated'
      });

      // 2) Lookup member
      var mRes = await sb.from('people')
        .select('id, nama, status_member')
        .eq('qr_token', qrToken)
        .maybeSingle();

      if (!mRes.data) {
        await sb.from('scan_logs').insert({
          qr_token: qrToken, scan_date: todayISO(),
          result: 'invalid', message: 'token not found'
        });
        alert('QR tidak valid!');
        return;
      }
      var member = mRes.data;

      // 3) Cek duplikat absen hari ini
      var dupCheck = await sb.from('attendances')
        .select('id')
        .eq('person_id', member.id)
        .eq('tanggal', todayISO())
        .limit(1);

      if (dupCheck.data && dupCheck.data.length > 0) {
        alert(member.nama + ' sudah absen hari ini!');
        await sb.from('scan_logs').insert({
          qr_token: qrToken, scan_date: todayISO(),
          person_id: member.id, result: 'duplicate', message: 'already scanned today'
        });
        return;
      }

      // 4) Insert attendance
      var ins = await sb.from('attendances').insert({
        person_id: member.id,
        tanggal: todayISO(),
        scanned_at: new Date().toISOString(),
        keterangan: 'Hadir'
      });
      if (ins.error) throw ins.error;

      // 5) Increment counter
      await sb.from('people')
        .update({ attendance_count: (member.attendance_count || 0) + 1 })
        .eq('id', member.id);

      await sb.from('scan_logs').insert({
        qr_token: qrToken, scan_date: todayISO(),
        person_id: member.id, result: 'success', message: 'attendance recorded'
      });

      alert('Absensi berhasil: ' + member.nama);
    } catch (err) {
      console.error('processAttendance:', err);
      alert('Error absensi: ' + err.message);
    }
  }

  function closeScanner() {
    var modal = document.getElementById('scanner-modal');
    if (modal) modal.classList.remove('active');
    if (scanner) try { scanner.stop(); } catch (e) {}
  }
  window.closeScannerModal = closeScanner;

  // =====================================================================
  // ID CARD
  // =====================================================================
  async function downloadIDCard(elId, name) {
    var el = document.getElementById(elId);
    if (!el) return;
    var canvas = await html2canvas(el, { scale: 2, useCORS: true });
    var a = document.createElement('a');
    a.download = 'ID_' + (name || 'card') + '.png';
    a.href = canvas.toDataURL();
    a.click();
  }
  window.downloadIDCard = downloadIDCard;

  // =====================================================================
  // LIGHTBOX
  // =====================================================================
  window.openLightbox = function (url, cap) {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox-caption').innerText = cap || '';
    document.getElementById('lightbox-modal').classList.add('active');
  };
  window.closeLightbox = function (ev) {
    if (!ev || ev.target.id === 'lightbox-modal') {
      document.getElementById('lightbox-modal').classList.remove('active');
    }
  };
})();