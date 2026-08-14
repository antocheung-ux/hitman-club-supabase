/**
 * Hitman Pekanbaru Hashing Club - App Logic (FINAL dengan Event Listener)
 */
(function() {
    console.log('🚀 [app.js] Menunggu Supabase siap...');

    // Fungsi untuk inisialisasi app setelah Supabase ready
    function initApp() {
        const sb = window.sb;

        if (!sb || !window.supabaseReady) {
            console.error('❌ [app.js] Supabase tidak siap. Cek config.js dan CDN.');
            alert('Database belum siap. Pastikan:\n1. Anon key di config.js sudah benar\n2. Koneksi internet lancar\n3. Refresh halaman (Ctrl+Shift+R)');
            return;
        }

        if (!sb.auth) {
            console.error('❌ [app.js] sb.auth tidak tersedia. Cek anon key!');
            alert('Auth error. Cek anon key di config.js');
            return;
        }

        console.log('✅ [app.js] Supabase siap! Memulai aplikasi...');

        let currentUser = null;
        let isAdminUser = false;

        // ========== INIT ==========
        document.addEventListener('DOMContentLoaded', async () => {
            await initAuth();
            initEvents();
            await loadPublic();
        });

        // Jika DOM sudah ready sebelum script ini jalan
        if (document.readyState === 'loading') {
            // DOM masih loading, tunggu event
        } else {
            // DOM sudah ready, langsung init
            initAuth().then(() => {
                initEvents();
                loadPublic();
            });
        }

        // ========== AUTH ==========
        async function initAuth() {
            try {
                const { data: { session } } = await sb.auth.getSession();
                if (session) {
                    currentUser = session.user;
                    await checkAdmin(session.user.id);
                }

                sb.auth.onAuthStateChange(async (event, session) => {
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
                console.error('❌ [app.js] Auth init error:', err);
            }
        }

        async function checkAdmin(userId) {
            try {
                const { data, error } = await sb.from('admin_profiles').select('id').eq('user_id', userId).maybeSingle();
                isAdminUser = !error && !!data;
            } catch (e) {
                isAdminUser = false;
            }
            updateUI();
        }

        function updateUI() {
            const el = (id) => document.getElementById(id);
            if (isAdminUser && currentUser) {
                el('btn-login-nav')?.classList.add('hidden');
                el('btn-logout-nav')?.classList.remove('hidden');
                el('btn-logout-nav')?.classList.add('flex');
                el('admin-sections')?.classList.remove('hidden');
                el('mobile-admin-menu')?.classList.remove('hidden');
                el('mobile-login-btn')?.classList.add('hidden');
                loadAdmin();
            } else {
                el('btn-login-nav')?.classList.remove('hidden');
                el('btn-logout-nav')?.classList.add('hidden');
                el('btn-logout-nav')?.classList.remove('flex');
                el('admin-sections')?.classList.add('hidden');
                el('mobile-admin-menu')?.classList.add('hidden');
                el('mobile-login-btn')?.classList.remove('hidden');
            }
        }

        async function handleLogin(e) {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const errDiv = document.getElementById('login-error');
            const btn = document.getElementById('btn-login-submit');

            errDiv?.classList.add('hidden');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Memproses...'; }

            try {
                const { data, error } = await sb.auth.signInWithPassword({ email, password });
                if (error) throw error;
                closeLoginModal();
                document.getElementById('form-login').reset();
                alert('Login berhasil!');
            } catch (err) {
                if (errDiv) {
                    errDiv.classList.remove('hidden');
                    errDiv.innerHTML = `<i class="fas fa-exclamation-circle mr-1"></i> ${err.message || 'Login gagal'}`;
                }
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i> Masuk'; }
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
        window.isAdminLoggedIn = () => isAdminUser && currentUser !== null;

        // ========== EVENTS ==========
        function initEvents() {
            document.getElementById('form-login')?.addEventListener('submit', handleLogin);
            
            const uploadBtn = document.getElementById('btn-upload-excel');
            const fileInput = document.getElementById('excel-file-input');
            if (uploadBtn && fileInput) {
                uploadBtn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', handleExcelUpload);
            }

            attachExport('member');
            attachExport('kas');

            document.getElementById('form-run-registration')?.addEventListener('submit', handleRunReg);
            document.getElementById('btn-rekap-daftar')?.addEventListener('click', () => rekapWA('daftar'));
            document.getElementById('btn-rekap-hadir')?.addEventListener('click', () => rekapWA('hadir'));
            document.getElementById('btn-open-scanner')?.addEventListener('click', openScanner);
            
            document.getElementById('btn-copy-rekap')?.addEventListener('click', () => {
                const text = document.getElementById('rekap-text').innerText;
                navigator.clipboard.writeText(text).then(() => alert('Rekap di-copy!'));
            });
        }

        // ========== DATA LOADING ==========
        async function loadPublic() {
            await Promise.allSettled([loadRuns(), lockRun(), loadGallery(), loadKamus()]);
        }

        async function loadAdmin() {
            await Promise.allSettled([loadUltah(), loadLogs()]);
        }

        async function loadRuns() {
            const c = document.getElementById('run-list-container');
            if (!c) return;
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await sb.from('runs').select('*').gte('date', today).order('date', { ascending: true }).limit(5);
            if (error) { c.innerHTML = `<p class="text-red-500 col-span-2">${error.message}</p>`; return; }
            if (!data?.length) { c.innerHTML = `<p class="text-gray-500 col-span-2 text-center py-8">Belum ada jadwal.</p>`; return; }
            c.innerHTML = data.map(r => `
                <div class="bg-hash-light p-4 rounded-lg border border-green-200 shadow-sm hover:shadow-md transition">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-bold text-hash-green text-lg">${r.name || 'Hash Run'}</h4>
                        <span class="bg-hash-amber text-white text-xs px-2 py-1 rounded-full">Hare</span>
                    </div>
                    <p class="text-sm text-gray-600 mb-1"><i class="fas fa-calendar mr-2"></i>${new Date(r.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    <p class="text-sm text-gray-600 mb-1"><i class="fas fa-map-marker-alt mr-2"></i>${r.location || 'TBD'}</p>
                    <p class="text-sm text-gray-600"><i class="fas fa-user mr-2"></i>Hare: ${r.hare_name || 'TBA'}</p>
                </div>`).join('');
        }

        async function lockRun() {
            const sel = document.getElementById('run-select');
            if (!sel) return;
            const today = new Date().toISOString().split('T')[0];
            const { data: run } = await sb.from('runs').select('id,name,date').gte('date', today).order('date').limit(1).maybeSingle();
            if (!run) { sel.innerHTML = '<option value="">Tidak ada run</option>'; return; }
            sel.innerHTML = `<option value="${run.id}" selected>${run.name} - ${new Date(run.date).toLocaleDateString('id-ID')}</option>`;
            sel.disabled = true;
            sel.classList.add('bg-gray-100', 'cursor-not-allowed');
        }

        async function handleRunReg(e) {
            e.preventDefault();
            const name = document.getElementById('reg-name').value.trim();
            const runId = document.getElementById('run-select').value;
            if (!name || !runId) return alert('Lengkapi data!');
            if (await checkDup([name])) return;
            const { error } = await sb.from('run_registrations').insert({ run_id: runId, participant_name: name, registered_at: new Date().toISOString() });
            if (error) alert('Gagal: ' + error.message);
            else { alert('Berhasil daftar!'); e.target.reset(); }
        }

        async function checkDup(names) {
            if (!names?.length) return false;
            const { data } = await sb.from('people').select('name').in('name', names);
            if (data?.length) { alert(`Nama ${data.map(m => m.name).join(', ')} sudah terdaftar.`); return true; }
            return false;
        }

        async function loadGallery() {
            const c = document.getElementById('gallery-container');
            if (!c) return;
            const { data, error } = await sb.from('gallery').select('*').order('created_at', { ascending: false }).limit(12);
            if (error) { c.innerHTML = `<p class="text-red-500 col-span-full">${error.message}</p>`; return; }
            if (!data?.length) { c.innerHTML = `<p class="text-gray-500 col-span-full text-center py-8">Belum ada foto.</p>`; return; }
            c.innerHTML = data.map(img => `
                <div class="gallery-item bg-white rounded-lg overflow-hidden shadow-md" onclick="openLightbox('${img.image_url}', '${(img.caption||'').replace(/'/g, "\\'")}')">
                    <img src="${img.image_url}" alt="${img.caption||''}" class="w-full h-48 object-cover">
                    <div class="p-2 text-center text-sm text-gray-600 truncate">${img.caption || 'Tanpa Judul'}</div>
                </div>`).join('');
        }

        async function loadKamus() {
            const c = document.getElementById('kamus-container');
            if (!c) return;
            const { data } = await sb.from('kamus_hash').select('*').order('created_at', { ascending: false }).limit(1);
            if (data?.length) c.innerHTML = `<div class="prose max-w-none">${data[0].content}</div>`;
            else c.innerHTML = `<p class="text-gray-500 text-center py-8">Belum ada konten.</p>`;
        }

        async function handleExcelUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const data = new Uint8Array(ev.target.result);
                    const wb = XLSX.read(data, { type: 'array' });
                    const sheet = wb.Sheets[wb.SheetsNames[0]];
                    const json = XLSX.utils.sheet_to_json(sheet);
                    const clean = json.map(r => {
                        const lr = Object.keys(r).reduce((a, k) => { a[k.toLowerCase().replace(/\s/g, '_')] = r[k]; return a; }, {});
                        return { name: lr.nama || lr.name || '', tanggal_lahir: lr.tanggal_lahir || null, size: lr.size || lr.ukuran || 'L', phone: lr.phone || lr.no_hp || '', type: 'member', qr_token: genToken() };
                    }).filter(r => r.name);
                    if (!clean.length) return alert('File kosong!');
                    if (await checkDup(clean.map(r => r.name))) return;
                    const { data: ins, error } = await sb.from('people').insert(clean).select();
                    if (error) throw error;
                    alert(`Berhasil upload ${ins.length} member!`);
                    location.reload();
                } catch (err) { alert('Gagal: ' + err.message); }
            };
            reader.readAsArrayBuffer(file);
        }

        function attachExport(type) {
            document.getElementById(`btn-export-${type}-excel`)?.addEventListener('click', () => doExport(type, 'excel'));
            document.getElementById(`btn-export-${type}-pdf`)?.addEventListener('click', () => doExport(type, 'pdf'));
        }

        async function doExport(type, fmt) {
            let data = [], title = 'Data';
            if (type === 'member') { const r = await sb.from('people').select('*').order('name'); data = r.data || []; title = 'Database_Member'; }
            else { const r = await sb.from('kas_transactions').select('*').order('tanggal', { ascending: false }); data = r.data || []; title = 'Laporan_Kas'; }
            if (!data.length) return alert('Tidak ada data.');
            if (fmt === 'excel') {
                const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, type); XLSX.writeFile(wb, `${title}.xlsx`);
            } else {
                const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.text(title, 14, 15);
                const cols = Object.keys(data[0]); doc.autoTable({ head: [cols], body: data.map(r => cols.map(c => r[c] || '-')), startY: 25, styles: { fontSize: 8 } }); doc.save(`${title}.pdf`);
            }
        }

        async function deleteKasTransaction(id) {
            if (!confirm('Hapus?')) return;
            const { error } = await sb.from('kas_transactions').delete().eq('id', id);
            if (error) alert('Gagal: ' + error.message); else alert('Dihapus.');
        }
        window.deleteKasTransaction = deleteKasTransaction;

        async function loadUltah() {
            const c = document.getElementById('ultah-container');
            if (!c) return;
            const curMonth = new Date().getMonth() + 1;
            const { data } = await sb.from('people').select('name,tanggal_lahir,phone').not('tanggal_lahir', 'is', null);
            const ultah = (data || []).filter(m => m.tanggal_lahir && new Date(m.tanggal_lahir).getMonth() + 1 === curMonth);
            if (!ultah.length) { c.innerHTML = `<p class="text-gray-500 col-span-2 text-center py-8">Tidak ada ultah.</p>`; return; }
            c.innerHTML = ultah.map(m => `
                <div class="bg-gradient-to-r from-pink-50 to-purple-50 p-4 rounded-lg border border-pink-200 flex items-center justify-between">
                    <div class="flex items-center gap-3"><div class="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center"><i class="fas fa-birthday-cake text-pink-500"></i></div><div><h5 class="font-bold">${m.name}</h5><p class="text-sm text-gray-600">${new Date(m.tanggal_lahir).getDate()} ${new Date(m.tanggal_lahir).toLocaleDateString('id-ID', { month: 'long' })}</p></div></div>
                    <button onclick="sendWish('${m.name}','${m.phone}')" class="bg-green-500 text-white px-3 py-1 rounded-lg text-sm"><i class="fab fa-whatsapp mr-1"></i>Ucapan</button>
                </div>`).join('');
        }

        function sendWish(name, phone) { window.open(`https://wa.me/${phone}?text=${encodeURIComponent(`Selamat Ulang Tahun ${name}! 🎂 On On!`)}`, '_blank'); }
        window.sendWishWhatsApp = sendWish;

        async function rekapWA(type) {
            const rc = document.getElementById('rekap-result'); const rt = document.getElementById('rekap-text');
            if (!rc || !rt) return; rc.classList.remove('hidden'); rt.innerText = 'Memuat...';
            const today = new Date().toISOString().split('T')[0];
            const { data: run } = await sb.from('runs').select('id,name,date').gte('date', today).order('date').limit(1).maybeSingle();
            if (!run) { rt.innerText = 'Tidak ada run.'; return; }
            let msg = `*REKAP ${type.toUpperCase()} RUN*\n*${run.name}*\n${new Date(run.date).toLocaleDateString('id-ID')}\n\n`;
            if (type === 'daftar') {
                const { data: regs } = await sb.from('run_registrations').select('participant_name').eq('run_id', run.id);
                msg += regs?.length ? `Total: ${regs.length}\n${regs.map((r, i) => `${i+1}. ${r.participant_name}`).join('\n')}` : 'Belum ada.';
            } else {
                const { data: att } = await sb.from('attendances').select('people(name)').eq('scan_date', run.date);
                msg += att?.length ? `Total: ${att.length}\n${att.map((a, i) => `${i+1}. ${a.people?.name||'?'}`).join('\n')}` : 'Belum ada.';
            }
            rt.innerText = msg;
        }
        window.generateRekapWA = rekapWA;

        async function loadLogs() {
            const tb = document.getElementById('logs-table-body'); if (!tb) return;
            const { data, error } = await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(20);
            if (error) { tb.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">${error.message}</td></tr>`; return; }
            if (!data?.length) { tb.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">Belum ada log.</td></tr>`; return; }
            tb.innerHTML = data.map(l => `<tr class="border-b hover:bg-gray-50"><td class="px-4 py-2">${new Date(l.created_at).toLocaleString('id-ID')}</td><td class="px-4 py-2 font-semibold">${l.action||'-'}</td><td class="px-4 py-2">${l.user_email||'-'}</td><td class="px-4 py-2">${l.details||'-'}</td></tr>`).join('');
        }

        let scanner = null;
        function openScanner() {
            document.getElementById('scanner-modal').classList.add('active');
            if (scanner) scanner.clear();
            scanner = new Html5Qrcode("qr-reader");
            scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, async (qr) => {
                const { data: member } = await sb.from('people').select('id,name').eq('qr_token', qr).maybeSingle();
                if (!member) { alert('QR tidak valid!'); return; }
                const { error } = await sb.from('attendances').insert({ people_id: member.id, scan_date: new Date().toISOString().split('T')[0] });
                if (error) alert(error.code === '23505' ? `${member.name} sudah absen!` : 'Gagal: ' + error.message);
                else alert(`Absensi berhasil: ${member.name}`);
                scanner.stop().catch(()=>{});
            }, () => {}).catch(err => alert('Gagal akses kamera: ' + err));
        }
        window.initQRScanner = openScanner;

        function closeScanner() { document.getElementById('scanner-modal')?.classList.remove('active'); scanner?.stop().catch(()=>{}); }
        window.closeScannerModal = closeScanner;

        async function downloadIDCard(elId, name) {
            const el = document.getElementById(elId); if (!el) return;
            const canvas = await html2canvas(el, { scale: 2, useCORS: true });
            const a = document.createElement('a'); a.download = `ID_${name}.png`; a.href = canvas.toDataURL(); a.click();
        }
        window.downloadIDCard = downloadIDCard;

        function genToken() { return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15); }
    }

    // Tunggu event supabaseReady dari config.js
    if (window.supabaseReady) {
        console.log('✅ [app.js] Supabase sudah siap, langsung init app');
        initApp();
    } else {
        console.log('⏳ [app.js] Menunggu event supabaseReady...');
        window.addEventListener('supabaseReady', initApp);
        
        // Timeout fallback
        setTimeout(() => {
            if (!window.supabaseReady) {
                console.error('❌ [app.js] TIMEOUT: Supabase tidak siap setelah 10 detik');
                alert('Database gagal dimuat. Cek:\n1. Anon key di config.js\n2. Koneksi internet\n3. Buka Console (F12) untuk detail error');
            }
        }, 10000);
    }
})();