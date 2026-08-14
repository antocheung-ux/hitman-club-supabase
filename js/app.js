/**
 * Hitman Pekanbaru Hashing Club - Main Application Logic (FINAL v3)
 * File: js/app.js
 * Fix: signInWithPassword error, data tidak muncul, auth flow
 */

// ==========================================
// AUTH STATE
// ==========================================
let currentUser = null;
let isAdminUser = false;

// ==========================================
// INISIALISASI
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Hitman Hash App FINAL v3 Starting...');

    // Verifikasi supabase client tersedia
    if (typeof supabase === 'undefined' || !supabase) {
        console.error('❌ FATAL: supabase client undefined. Cek config.js dan anon key.');
        alert('Error: Supabase tidak terinisialisasi. Cek console untuk detail.');
        return;
    }

    if (!supabase.auth) {
        console.error('❌ FATAL: supabase.auth undefined. Pastikan CDN Supabase v2 sudah di-load.');
        alert('Error: Supabase Auth tidak tersedia. Cek console untuk detail.');
        return;
    }

    console.log('✅ Supabase client ready. Auth available:', !!supabase.auth);

    // Init auth listener
    await initAuthListener();

    // Init event listeners
    initEventListeners();

    // Load public data
    await loadPublicData();

    console.log('✅ App initialization complete.');
});

// ==========================================
// AUTH LOGIC
// ==========================================
async function initAuthListener() {
    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
            console.log('✅ Session found:', session.user.email);
            currentUser = session.user;
            await checkAdminRole(session.user.id);
        } else {
            console.log('ℹ️ No active session.');
        }

        // Listen auth changes
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('🔄 Auth event:', event);
            if (event === 'SIGNED_IN' && session) {
                currentUser = session.user;
                await checkAdminRole(session.user.id);
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                isAdminUser = false;
                updateUIAuthState();
            }
        });
    } catch (err) {
        console.error('❌ Auth init error:', err);
    }
}

async function checkAdminRole(userId) {
    try {
        const { data, error } = await supabase
            .from('admin_profiles')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            console.warn('⚠️ Admin check error:', error.message);
            isAdminUser = false;
        } else if (data) {
            console.log('✅ User is admin.');
            isAdminUser = true;
        } else {
            console.warn('⚠️ User is NOT in admin_profiles.');
            isAdminUser = false;
        }
    } catch (err) {
        console.error('❌ checkAdminRole error:', err);
        isAdminUser = false;
    }
    updateUIAuthState();
}

function updateUIAuthState() {
    const btnLoginNav = document.getElementById('btn-login-nav');
    const btnLogoutNav = document.getElementById('btn-logout-nav');
    const adminSections = document.getElementById('admin-sections');
    const mobileAdminMenu = document.getElementById('mobile-admin-menu');
    const mobileLoginBtn = document.getElementById('mobile-login-btn');

    if (isAdminUser && currentUser) {
        if (btnLoginNav) btnLoginNav.classList.add('hidden');
        if (btnLogoutNav) { btnLogoutNav.classList.remove('hidden'); btnLogoutNav.classList.add('flex'); }
        if (adminSections) adminSections.classList.remove('hidden');
        if (mobileAdminMenu) mobileAdminMenu.classList.remove('hidden');
        if (mobileLoginBtn) mobileLoginBtn.classList.add('hidden');
        loadAdminData();
    } else {
        if (btnLoginNav) btnLoginNav.classList.remove('hidden');
        if (btnLogoutNav) { btnLogoutNav.classList.add('hidden'); btnLogoutNav.classList.remove('flex'); }
        if (adminSections) adminSections.classList.add('hidden');
        if (mobileAdminMenu) mobileAdminMenu.classList.add('hidden');
        if (mobileLoginBtn) mobileLoginBtn.classList.remove('hidden');
    }
}

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    const submitBtn = document.getElementById('btn-login-submit');

    if (errorDiv) errorDiv.classList.add('hidden');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Memproses...';
    }

    try {
        console.log('🔐 Attempting login for:', email);

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error('❌ Login error:', error.message);
            throw error;
        }

        console.log('✅ Login successful:', data.user.email);
        closeLoginModal();
        document.getElementById('form-login').reset();
        alert('Login berhasil! Selamat datang, Admin.');

    } catch (error) {
        console.error('❌ Login failed:', error);
        if (errorDiv) {
            errorDiv.classList.remove('hidden');
            errorDiv.innerHTML = `<i class="fas fa-exclamation-circle mr-1"></i> ${error.message || 'Email atau password salah.'}`;
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i> Masuk';
        }
    }
}

async function logoutAdmin() {
    if (!confirm('Yakin ingin logout?')) return;
    try {
        await supabase.auth.signOut();
        currentUser = null;
        isAdminUser = false;
        updateUIAuthState();
        alert('Anda telah logout.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function isAdminLoggedIn() {
    return isAdminUser && currentUser !== null;
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function initEventListeners() {
    // Login Form
    const loginForm = document.getElementById('form-login');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    // Upload Excel
    const uploadBtn = document.getElementById('btn-upload-excel');
    const fileInput = document.getElementById('excel-file-input');
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleExcelUpload);
    }

    // Export
    attachExportListeners('member');
    attachExportListeners('kas');

    // Run Registration
    const runForm = document.getElementById('form-run-registration');
    if (runForm) runForm.addEventListener('submit', handleRunRegistration);

    // Rekap WA
    const btnRekapDaftar = document.getElementById('btn-rekap-daftar');
    const btnRekapHadir = document.getElementById('btn-rekap-hadir');
    if (btnRekapDaftar) btnRekapDaftar.addEventListener('click', () => generateRekapWA('daftar'));
    if (btnRekapHadir) btnRekapHadir.addEventListener('click', () => generateRekapWA('hadir'));

    // Scanner
    const btnScanner = document.getElementById('btn-open-scanner');
    if (btnScanner) btnScanner.addEventListener('click', openScannerModal);

    // Copy Rekap
    const btnCopy = document.getElementById('btn-copy-rekap');
    if (btnCopy) {
        btnCopy.addEventListener('click', () => {
            const text = document.getElementById('rekap-text').innerText;
            navigator.clipboard.writeText(text).then(() => alert('Rekap berhasil di-copy!'));
        });
    }
}

// ==========================================
// LOAD DATA
// ==========================================
async function loadPublicData() {
    console.log('📦 Loading public data...');
    await Promise.allSettled([
        loadFutureHares(),
        lockRunRegistration(),
        loadGallery(),
        loadKamusHash()
    ]);
    console.log('✅ Public data loaded.');
}

async function loadAdminData() {
    console.log('📦 Loading admin data...');
    await Promise.allSettled([
        loadUltahMembers(),
        loadLogs()
    ]);
    console.log('✅ Admin data loaded.');
}

// ==========================================
// JADWAL RUN
// ==========================================
async function loadFutureHares() {
    const container = document.getElementById('run-list-container');
    if (!container) return;

    try {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('runs')
            .select('*')
            .gte('date', today)
            .order('date', { ascending: true })
            .limit(5);

        if (error) {
            console.error('❌ loadFutureHares error:', error);
            container.innerHTML = `<p class="text-red-500 col-span-2">Gagal memuat: ${error.message}</p>`;
            return;
        }

        if (!data || data.length === 0) {
            container.innerHTML = `<p class="text-gray-500 col-span-2 text-center py-8">Belum ada jadwal run minggu ini.</p>`;
            return;
        }

        console.log(`✅ Loaded ${data.length} runs.`);
        container.innerHTML = data.map(run => `
            <div class="bg-hash-light p-4 rounded-lg border border-green-200 shadow-sm hover:shadow-md transition">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-bold text-hash-green text-lg">${run.name || 'Hash Run'}</h4>
                    <span class="bg-hash-amber text-white text-xs px-2 py-1 rounded-full">Hare</span>
                </div>
                <p class="text-sm text-gray-600 mb-1"><i class="fas fa-calendar mr-2"></i> ${new Date(run.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                <p class="text-sm text-gray-600 mb-1"><i class="fas fa-map-marker-alt mr-2"></i> ${run.location || 'Lokasi TBD'}</p>
                <p class="text-sm text-gray-600"><i class="fas fa-user mr-2"></i> Hare: ${run.hare_name || 'TBA'}</p>
            </div>
        `).join('');
    } catch (err) {
        console.error('❌ loadFutureHares exception:', err);
    }
}

// ==========================================
// KUNCI RUN TERDEKAT
// ==========================================
async function lockRunRegistration() {
    const selectDropdown = document.getElementById('run-select');
    if (!selectDropdown) return;

    try {
        const today = new Date().toISOString().split('T')[0];
        const { data: nextRun, error } = await supabase
            .from('runs')
            .select('id, name, date')
            .gte('date', today)
            .order('date', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error || !nextRun) {
            selectDropdown.innerHTML = '<option value="">Tidak ada run terdekat</option>';
            return;
        }

        const formattedDate = new Date(nextRun.date).toLocaleDateString('id-ID');
        selectDropdown.innerHTML = `<option value="${nextRun.id}" selected>${nextRun.name} - ${formattedDate}</option>`;
        selectDropdown.disabled = true;
        selectDropdown.classList.add('bg-gray-100', 'cursor-not-allowed');
    } catch (err) {
        console.error('❌ lockRunRegistration error:', err);
    }
}

async function handleRunRegistration(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const runId = document.getElementById('run-select').value;
    if (!name || !runId) return alert('Lengkapi data!');

    const isDup = await checkDuplicateNames([name]);
    if (isDup) return;

    const { error } = await supabase.from('run_registrations').insert({
        run_id: runId,
        participant_name: name,
        registered_at: new Date().toISOString()
    });

    if (error) alert('Gagal daftar: ' + error.message);
    else { alert('Berhasil daftar run!'); e.target.reset(); }
}

// ==========================================
// VALIDASI DUPLIKASI
// ==========================================
async function checkDuplicateNames(namesToCheck) {
    if (!namesToCheck || namesToCheck.length === 0) return false;
    try {
        const { data, error } = await supabase
            .from('people')
            .select('name')
            .in('name', namesToCheck);

        if (error) return false;
        if (data && data.length > 0) {
            const dups = data.map(m => m.name).join(', ');
            alert(`Nama ${dups} sudah terdaftar.`);
            return true;
        }
        return false;
    } catch (err) {
        return false;
    }
}

// ==========================================
// GALERI
// ==========================================
async function loadGallery() {
    const container = document.getElementById('gallery-container');
    if (!container) return;

    try {
        const { data, error } = await supabase
            .from('gallery')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(12);

        if (error) {
            container.innerHTML = `<p class="text-red-500 col-span-full">Gagal: ${error.message}</p>`;
            return;
        }
        if (!data || data.length === 0) {
            container.innerHTML = `<p class="text-gray-500 col-span-full text-center py-8">Belum ada foto.</p>`;
            return;
        }

        container.innerHTML = data.map(img => `
            <div class="gallery-item bg-white rounded-lg overflow-hidden shadow-md" onclick="openLightbox('${img.image_url}', '${(img.caption || '').replace(/'/g, "\\'")}')">
                <img src="${img.image_url}" alt="${img.caption || 'Galeri'}" class="w-full h-48 object-cover">
                <div class="p-2 text-center text-sm text-gray-600 truncate">${img.caption || 'Tanpa Judul'}</div>
            </div>
        `).join('');
    } catch (err) {
        console.error('❌ loadGallery error:', err);
    }
}

// ==========================================
// KAMUS HASH
// ==========================================
async function loadKamusHash() {
    const container = document.getElementById('kamus-container');
    if (!container) return;

    try {
        const { data, error } = await supabase
            .from('kamus_hash')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            container.innerHTML = `<p class="text-red-500">Gagal: ${error.message}</p>`;
            return;
        }
        if (data && data.length > 0) {
            container.innerHTML = `<div class="prose max-w-none">${data[0].content}</div>`;
        } else {
            container.innerHTML = `<p class="text-gray-500 text-center py-8">Belum ada konten.</p>`;
        }
    } catch (err) {
        console.error('❌ loadKamusHash error:', err);
    }
}

// ==========================================
// UPLOAD EXCEL
// ==========================================
async function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetsNames[0]];
            const rawJson = XLSX.utils.sheet_to_json(sheet);

            const cleanData = rawJson.map(row => {
                const lr = Object.keys(row).reduce((a, k) => { a[k.toLowerCase().replace(/\s/g, '_')] = row[k]; return a; }, {});
                return {
                    name: lr.nama || lr.name || '',
                    tanggal_lahir: lr.tanggal_lahir || lr.tgl_lahir || null,
                    size: lr.size || lr.ukuran_baju || lr.ukuran || 'L',
                    phone: lr.phone || lr.no_hp || lr.hp || '',
                    type: 'member',
                    qr_token: generateToken()
                };
            }).filter(r => r.name !== '');

            if (cleanData.length === 0) return alert('File kosong atau format salah!');

            const isDup = await checkDuplicateNames(cleanData.map(r => r.name));
            if (isDup) { event.target.value = ''; return; }

            const { data: inserted, error } = await supabase.from('people').insert(cleanData).select();
            if (error) throw error;
            alert(`Berhasil upload ${inserted.length} member!`);
            location.reload();
        } catch (err) {
            alert('Gagal upload: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// EXPORT
// ==========================================
function attachExportListeners(type) {
    const btnE = document.getElementById(`btn-export-${type}-excel`);
    const btnP = document.getElementById(`btn-export-${type}-pdf`);
    if (btnE) btnE.addEventListener('click', () => exportData(type, 'excel'));
    if (btnP) btnP.addEventListener('click', () => exportData(type, 'pdf'));
}

async function exportData(type, format) {
    let data = [], title = 'Data';
    if (type === 'member') {
        const r = await supabase.from('people').select('*').order('name');
        data = r.data || []; title = 'Database Member Hitman Hash';
    } else if (type === 'kas') {
        const r = await supabase.from('kas_transactions').select('*').order('tanggal', { ascending: false });
        data = r.data || []; title = 'Laporan Kas Bank Hitman Hash';
    }
    if (!data.length) return alert('Tidak ada data.');

    if (format === 'excel') {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, type);
        XLSX.writeFile(wb, `${title.replace(/\s/g, '_')}.xlsx`);
    } else {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.text(title, 14, 15);
        const cols = Object.keys(data[0]);
        doc.autoTable({ head: [cols], body: data.map(r => cols.map(c => r[c] || '-')), startY: 25, styles: { fontSize: 8 } });
        doc.save(`${title.replace(/\s/g, '_')}.pdf`);
    }
}

// ==========================================
// KAS
// ==========================================
async function deleteKasTransaction(id) {
    if (!confirm('Hapus transaksi? Iuran akan kembali ke Belum Bayar.')) return;
    const { error } = await supabase.from('kas_transactions').delete().eq('id', id);
    if (error) alert('Gagal: ' + error.message);
    else alert('Dihapus. Iuran otomatis terupdate.');
}

// ==========================================
// ULTAH
// ==========================================
async function loadUltahMembers() {
    const container = document.getElementById('ultah-container');
    if (!container) return;
    try {
        const curMonth = new Date().getMonth() + 1;
        const { data, error } = await supabase.from('people').select('name, tanggal_lahir, phone').not('tanggal_lahir', 'is', null);
        if (error) return;

        const ultah = (data || []).filter(m => m.tanggal_lahir && new Date(m.tanggal_lahir).getMonth() + 1 === curMonth);
        if (!ultah.length) {
            container.innerHTML = `<p class="text-gray-500 col-span-2 text-center py-8">Tidak ada ultah bulan ini.</p>`;
            return;
        }
        container.innerHTML = ultah.map(m => `
            <div class="bg-gradient-to-r from-pink-50 to-purple-50 p-4 rounded-lg border border-pink-200 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center"><i class="fas fa-birthday-cake text-pink-500"></i></div>
                    <div><h5 class="font-bold">${m.name}</h5><p class="text-sm text-gray-600">${new Date(m.tanggal_lahir).getDate()} ${new Date(m.tanggal_lahir).toLocaleDateString('id-ID', { month: 'long' })}</p></div>
                </div>
                <button onclick="sendWishWhatsApp('${m.name}','${m.phone}')" class="bg-green-500 text-white px-3 py-1 rounded-lg text-sm"><i class="fab fa-whatsapp mr-1"></i> Ucapan</button>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

function sendWishWhatsApp(name, phone) {
    const msg = `Selamat Ulang Tahun ${name}! 🎂🎉 On On! - Hitman Pekanbaru`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ==========================================
// REKAP WA
// ==========================================
async function generateRekapWA(type) {
    const rc = document.getElementById('rekap-result');
    const rt = document.getElementById('rekap-text');
    if (!rc || !rt) return;
    rc.classList.remove('hidden');
    rt.innerText = 'Memuat...';

    try {
        const today = new Date().toISOString().split('T')[0];
        const { data: run } = await supabase.from('runs').select('id,name,date').gte('date', today).order('date').limit(1).maybeSingle();
        if (!run) { rt.innerText = 'Tidak ada run terdekat.'; return; }

        let msg = `*REKAP ${type.toUpperCase()} RUN*\n*${run.name}*\n${new Date(run.date).toLocaleDateString('id-ID')}\n\n`;

        if (type === 'daftar') {
            const { data: regs } = await supabase.from('run_registrations').select('participant_name').eq('run_id', run.id);
            if (regs?.length) { msg += `Total: ${regs.length}\n${regs.map((r, i) => `${i + 1}. ${r.participant_name}`).join('\n')}`; }
            else msg += 'Belum ada pendaftar.';
        } else {
            const { data: att } = await supabase.from('attendances').select('people(name)').eq('scan_date', run.date);
            if (att?.length) { msg += `Total: ${att.length}\n${att.map((a, i) => `${i + 1}. ${a.people?.name || '?'}`).join('\n')}`; }
            else msg += 'Belum ada kehadiran.';
        }
        rt.innerText = msg;
    } catch (err) { rt.innerText = 'Error: ' + err.message; }
}

// ==========================================
// LOGS
// ==========================================
async function loadLogs() {
    const tb = document.getElementById('logs-table-body');
    if (!tb) return;
    try {
        const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(20);
        if (error) { tb.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">${error.message}</td></tr>`; return; }
        if (!data?.length) { tb.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">Belum ada log.</td></tr>`; return; }
        tb.innerHTML = data.map(l => `<tr class="border-b hover:bg-gray-50"><td class="px-4 py-2">${new Date(l.created_at).toLocaleString('id-ID')}</td><td class="px-4 py-2 font-semibold">${l.action || '-'}</td><td class="px-4 py-2">${l.user_email || '-'}</td><td class="px-4 py-2">${l.details || '-'}</td></tr>`).join('');
    } catch (err) { console.error(err); }
}

// ==========================================
// QR SCANNER
// ==========================================
let html5QrcodeScanner = null;

function initQRScanner() {
    const el = document.getElementById('qr-reader');
    if (!el) return;
    if (html5QrcodeScanner) html5QrcodeScanner.clear();
    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 },
        async (qr) => { await processAttendance(qr); html5QrcodeScanner.stop().catch(()=>{}); },
        () => {}
    ).catch(err => alert('Gagal akses kamera: ' + err));
}

async function processAttendance(qrToken) {
    const { data: member } = await supabase.from('people').select('id,name').eq('qr_token', qrToken).maybeSingle();
    if (!member) return alert('QR tidak valid!');

    const { error } = await supabase.from('attendances').insert({ people_id: member.id, scan_date: new Date().toISOString().split('T')[0] });
    if (error) {
        if (error.code === '23505') alert(`${member.name} sudah absen hari ini!`);
        else alert('Gagal: ' + error.message);
    } else alert(`Absensi berhasil: ${member.name}`);
}

function closeScannerModal() {
    document.getElementById('scanner-modal')?.classList.remove('active');
    html5QrcodeScanner?.stop().catch(() => {});
}

// ==========================================
// ID CARD
// ==========================================
async function downloadIDCard(elId, name) {
    const el = document.getElementById(elId);
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const a = document.createElement('a');
    a.download = `ID_${name}.png`;
    a.href = canvas.toDataURL();
    a.click();
}

// ==========================================
// HELPERS
// ==========================================
function generateToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Expose to window
window.logoutAdmin = logoutAdmin;
window.isAdminLoggedIn = isAdminLoggedIn;
window.handleLogin = handleLogin;
window.downloadIDCard = downloadIDCard;
window.deleteKasTransaction = deleteKasTransaction;
window.initQRScanner = initQRScanner;
window.closeScannerModal = closeScannerModal;
window.sendWishWhatsApp = sendWishWhatsApp;
window.generateRekapWA = generateRekapWA;