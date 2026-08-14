/**
 * Hitman Pekanbaru Hashing Club - Main Application Logic (FINAL)
 * File: js/app.js
 * Deskripsi: Menangani semua logika frontend (Supabase, Export, UI, Galeri, Kamus, Ultah, WA, Logs, QR, ID Card)
 */

// ==========================================
// INISIALISASI & KONFIGURASI
// ==========================================

// Pastikan variabel supabase sudah diinisialisasi di config.js
// Jika belum, uncomment baris di bawah ini:
// const SUPABASE_URL = 'https://awpcrceoxddyltasznht.supabase.co';
// const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
// const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
    console.log('Hitman Hash App FINAL Initialized...');
    initEventListeners();
    loadDashboardData();
});

function initEventListeners() {
    // Req 1: Upload Excel Member
    const uploadBtn = document.getElementById('btn-upload-excel');
    const fileInput = document.getElementById('excel-file-input');
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleExcelUpload);
    }

    // Req 2 & 3: Export Buttons (Member & Kas)
    attachExportListeners('member');
    attachExportListeners('kas');

    // Req 6: Form Registrasi Run
    const runForm = document.getElementById('form-run-registration');
    if (runForm) {
        runForm.addEventListener('submit', handleRunRegistration);
    }

    // Rekap WhatsApp
    const btnRekapDaftar = document.getElementById('btn-rekap-daftar');
    const btnRekapHadir = document.getElementById('btn-rekap-hadir');
    if (btnRekapDaftar) btnRekapDaftar.addEventListener('click', () => generateRekapWA('daftar'));
    if (btnRekapHadir) btnRekapHadir.addEventListener('click', () => generateRekapWA('hadir'));

    // Edit Kamus (Admin Only)
    const btnEditKamus = document.getElementById('btn-edit-kamus');
    if (btnEditKamus) {
        btnEditKamus.addEventListener('click', openKamusEditor);
    }
}

async function loadDashboardData() {
    await loadFutureHares();      // Req 5 & 8
    await lockRunRegistration();  // Req 6
    await loadGallery();          // Opsi C: Galeri
    await loadKamusHash();        // Opsi C: Kamus
    await loadUltahMembers();     // Opsi C: Ultah
    await loadLogs();             // Opsi C: Logs
}

// ==========================================
// FITUR 1: UPLOAD EXCEL MEMBER (Req 1)
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

            // Mapping kolom Excel ke Database
            const cleanData = rawJson.map(row => {
                const lowerRow = Object.keys(row).reduce((acc, key) => {
                    acc[key.toLowerCase().replace(/\s/g, '_')] = row[key];
                    return acc;
                }, {});

                return {
                    name: lowerRow.nama || lowerRow.name || '',
                    tanggal_lahir: lowerRow.tanggal_lahir || lowerRow.tgl_lahir || null,
                    size: lowerRow.size || lowerRow.ukuran_baju || lowerRow.ukuran || 'L',
                    phone: lowerRow.phone || lowerRow.no_hp || lowerRow.hp || '',
                    type: 'member',
                    qr_token: generateToken()
                };
            }).filter(r => r.name !== '');

            if (cleanData.length === 0) {
                alert('File Excel kosong atau format kolom tidak sesuai!');
                return;
            }

            // Cek Duplikasi sebelum insert (Req 7)
            const namesToCheck = cleanData.map(r => r.name);
            const isDuplicate = await checkDuplicateNames(namesToCheck);
            if (isDuplicate) {
                alert('Upload dibatalkan karena ada nama yang sudah terdaftar.');
                event.target.value = '';
                return;
            }

            // Bulk Insert
            const { data: insertedData, error } = await supabase.from('people').insert(cleanData).select();
            if (error) throw error;

            alert(`Berhasil mengupload ${insertedData.length} data member!`);
            location.reload();
        } catch (error) {
            console.error('Error upload Excel:', error);
            alert('Gagal upload: ' + error.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// FITUR 2 & 3: EXPORT EXCEL & PDF (Req 2, 3)
// ==========================================
function attachExportListeners(type) {
    const btnExcel = document.getElementById(`btn-export-${type}-excel`);
    const btnPdf = document.getElementById(`btn-export-${type}-pdf`);

    if (btnExcel) btnExcel.addEventListener('click', () => exportData(type, 'excel'));
    if (btnPdf) btnPdf.addEventListener('click', () => exportData(type, 'pdf'));
}

async function fetchExportData(type) {
    if (type === 'member') {
        const { data, error } = await supabase.from('people').select('*').order('name');
        return { data, title: 'Database Member Hitman Hash' };
    } else if (type === 'kas') {
        const { data, error } = await supabase.from('kas_transactions').select('*').order('tanggal', { ascending: false });
        return { data, title: 'Laporan Kas Bank Hitman Hash' };
    }
    return { data: [], title: 'Data' };
}

async function exportData(type, format) {
    const { data, title } = await fetchExportData(type);
    if (!data || data.length === 0) {
        alert('Tidak ada data untuk di-export.');
        return;
    }

    if (format === 'excel') {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, type === 'member' ? 'Members' : 'Kas');
        XLSX.writeFile(wb, `${title.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else if (format === 'pdf') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(16);
        doc.setTextColor(22, 101, 52);
        doc.text(title, 14, 15);
        
        const columns = Object.keys(data[0]);
        const rows = data.map(row => columns.map(col => row[col] || '-'));

        doc.autoTable({
            head: [columns],
            body: rows,
            startY: 25,
            theme: 'grid',
            headStyles: { fillColor: [22, 101, 52] },
            styles: { fontSize: 8 }
        });

        doc.save(`${title.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    }
}

// ==========================================
// FITUR 4: KAS BANK & IURAN LOGIC (Req 4)
// ==========================================
async function deleteKasTransaction(id) {
    if (!confirm('Yakin ingin menghapus transaksi ini? Status iuran member akan otomatis kembali ke Belum Bayar.')) return;
    
    const { error } = await supabase.from('kas_transactions').delete().eq('id', id);
    if (error) {
        alert('Gagal menghapus: ' + error.message);
    } else {
        alert('Transaksi dihapus. Database iuran otomatis terupdate.');
        // Reload UI kas jika ada fungsi render
        if (typeof loadKasTransactions === 'function') loadKasTransactions();
    }
}

// ==========================================
// FITUR 5 & 8: JADWAL RUN / HARE (Req 5, 8)
// ==========================================
async function loadFutureHares() {
    const container = document.getElementById('run-list-container');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
        .from('runs')
        .select('*')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(5);

    if (error) {
        container.innerHTML = `<p class="text-red-500 col-span-2">Gagal memuat jadwal: ${error.message}</p>`;
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = `<p class="text-gray-500 col-span-2 text-center py-8">Belum ada jadwal run minggu ini yang terdaftar.</p>`;
        return;
    }

    container.innerHTML = data.map(run => `
        <div class="bg-hash-light p-4 rounded-lg border border-green-200 shadow-sm hover:shadow-md transition animate-fade-in">
            <div class="flex justify-between items-start mb-2">
                <h4 class="font-bold text-hash-green text-lg">${run.name || 'Hash Run'}</h4>
                <span class="bg-hash-amber text-white text-xs px-2 py-1 rounded-full">Hare</span>
            </div>
            <p class="text-sm text-gray-600 mb-1"><i class="fas fa-calendar mr-2"></i> ${new Date(run.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p class="text-sm text-gray-600 mb-1"><i class="fas fa-map-marker-alt mr-2"></i> ${run.location || 'Lokasi TBD'}</p>
            <p class="text-sm text-gray-600"><i class="fas fa-user mr-2"></i> Hare: ${run.hare_name || 'TBA'}</p>
        </div>
    `).join('');
}

// ==========================================
// FITUR 6: KUNCI RUN TERDEKAT (Req 6)
// ==========================================
async function lockRunRegistration() {
    const selectDropdown = document.getElementById('run-select');
    if (!selectDropdown) return;

    const today = new Date().toISOString().split('T')[0];
    const { data: nextRun, error } = await supabase
        .from('runs')
        .select('id, name, date')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(1)
        .single();

    if (error || !nextRun) {
        selectDropdown.innerHTML = '<option value="">Tidak ada run terdekat</option>';
        selectDropdown.disabled = true;
        return;
    }

    const formattedDate = new Date(nextRun.date).toLocaleDateString('id-ID');
    selectDropdown.innerHTML = `<option value="${nextRun.id}" selected>${nextRun.name} - ${formattedDate}</option>`;
    selectDropdown.disabled = true;
    selectDropdown.classList.add('bg-gray-100', 'cursor-not-allowed');
}

async function handleRunRegistration(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const runId = document.getElementById('run-select').value;

    if (!name || !runId) return alert('Lengkapi data!');

    // Req 7: Cek Duplikasi Spesifik
    const isDup = await checkDuplicateNames([name]);
    if (isDup) return;

    const { error } = await supabase.from('run_registrations').insert({
        run_id: runId,
        participant_name: name,
        registered_at: new Date().toISOString()
    });

    if (error) alert('Gagal daftar: ' + error.message);
    else {
        alert('Berhasil daftar run!');
        e.target.reset();
    }
}

// ==========================================
// FITUR 7: VALIDASI DUPLIKASI NAMA (Req 7)
// ==========================================
async function checkDuplicateNames(namesToCheck) {
    if (!namesToCheck || namesToCheck.length === 0) return false;

    const { data: existingMembers, error } = await supabase
        .from('people')
        .select('name')
        .in('name', namesToCheck);

    if (error) {
        console.error('Error cek duplikasi:', error);
        return false;
    }

    if (existingMembers && existingMembers.length > 0) {
        const duplicateNames = existingMembers.map(m => m.name).join(', ');
        alert(`Nama ${duplicateNames} sudah terdaftar.`);
        return true;
    }
    return false;
}

// ==========================================
// FITUR GALERI & LIGHTBOX (Opsi C)
// ==========================================
async function loadGallery() {
    const container = document.getElementById('gallery-container');
    if (!container) return;

    const { data, error } = await supabase
        .from('gallery')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(12);

    if (error) {
        container.innerHTML = `<p class="text-red-500 col-span-full">Gagal memuat galeri: ${error.message}</p>`;
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = `<p class="text-gray-500 col-span-full text-center py-8">Belum ada foto di galeri.</p>`;
        return;
    }

    container.innerHTML = data.map(img => `
        <div class="gallery-item bg-white rounded-lg overflow-hidden shadow-md" onclick="openLightbox('${img.image_url}', '${img.caption || ''}')">
            <img src="${img.image_url}" alt="${img.caption || 'Galeri Hitman'}" class="w-full h-48 object-cover">
            <div class="p-2 text-center text-sm text-gray-600 truncate">${img.caption || 'Tanpa Judul'}</div>
        </div>
    `).join('');
}

// ==========================================
// FITUR KAMUS HASH (Opsi C)
// ==========================================
async function loadKamusHash() {
    const container = document.getElementById('kamus-container');
    if (!container) return;

    const { data, error } = await supabase
        .from('kamus_hash')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        container.innerHTML = `<p class="text-red-500">Gagal memuat kamus: ${error.message}</p>`;
        return;
    }

    if (data && data.length > 0) {
        container.innerHTML = `<div class="prose max-w-none">${data[0].content}</div>`;
    } else {
        container.innerHTML = `<p class="text-gray-500 text-center py-8">Belum ada konten kamus hash.</p>`;
    }
}

function openKamusEditor() {
    // Logika untuk membuka editor kamus (admin only)
    alert('Fitur edit kamus hanya tersedia untuk admin. Pastikan Anda sudah login sebagai admin.');
    // Di sini Anda bisa menambahkan modal editor atau redirect ke halaman admin
}

// ==========================================
// FITUR ULTAH MEMBER (Opsi C)
// ==========================================
async function loadUltahMembers() {
    const container = document.getElementById('ultah-container');
    if (!container) return;

    const currentMonth = new Date().getMonth() + 1; // 1-12
    
    // Query untuk member yang lahir di bulan ini
    // Asumsi kolom tanggal_lahir bertipe DATE
    const { data, error } = await supabase
        .from('people')
        .select('name, tanggal_lahir, phone')
        .not('tanggal_lahir', 'is', null)
        .order('tanggal_lahir');

    if (error) {
        container.innerHTML = `<p class="text-red-500 col-span-2">Gagal memuat data ultah: ${error.message}</p>`;
        return;
    }

    // Filter bulan ini di JavaScript (karena Supabase tidak mendukung EXTRACT langsung di query sederhana)
    const ultahMembers = data.filter(m => {
        if (!m.tanggal_lahir) return false;
        const birthDate = new Date(m.tanggal_lahir);
        return birthDate.getMonth() + 1 === currentMonth;
    });

    if (ultahMembers.length === 0) {
        container.innerHTML = `<p class="text-gray-500 col-span-2 text-center py-8">Tidak ada member yang berulang tahun bulan ini.</p>`;
        return;
    }

    container.innerHTML = ultahMembers.map(m => `
        <div class="bg-gradient-to-r from-pink-50 to-purple-50 p-4 rounded-lg border border-pink-200 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center">
                    <i class="fas fa-birthday-cake text-pink-500"></i>
                </div>
                <div>
                    <h5 class="font-bold text-gray-800">${m.name}</h5>
                    <p class="text-sm text-gray-600">${new Date(m.tanggal_lahir).getDate()} ${new Date(m.tanggal_lahir).toLocaleDateString('id-ID', { month: 'long' })}</p>
                </div>
            </div>
            <button onclick="sendWishWhatsApp('${m.name}', '${m.phone}')" class="bg-green-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-green-600 transition">
                <i class="fab fa-whatsapp mr-1"></i> Ucapan
            </button>
        </div>
    `).join('');
}

function sendWishWhatsApp(name, phone) {
    const message = `Selamat Ulang Tahun ${name}! 🎂🎉 Semoga sehat selalu, panjang umur, dan sukses terus. On On! - Hitman Pekanbaru Hashing Club`;
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
}

// ==========================================
// FITUR REKAP WHATSAPP (Opsi C)
// ==========================================
async function generateRekapWA(type) {
    const resultContainer = document.getElementById('rekap-result');
    const rekapText = document.getElementById('rekap-text');
    if (!resultContainer || !rekapText) return;

    resultContainer.classList.remove('hidden');
    rekapText.innerText = 'Memuat data...';

    try {
        // Ambil run terdekat
        const today = new Date().toISOString().split('T')[0];
        const { data: nextRun } = await supabase
            .from('runs')
            .select('id, name, date')
            .gte('date', today)
            .order('date', { ascending: true })
            .limit(1)
            .single();

        if (!nextRun) {
            rekapText.innerText = 'Tidak ada run terdekat untuk di-rekap.';
            return;
        }

        let rekapMessage = `*REKAP ${type === 'daftar' ? 'DAFTAR' : 'HADIR'} RUN*\n`;
        rekapMessage += `*${nextRun.name}*\n`;
        rekapMessage += `Tanggal: ${new Date(nextRun.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n\n`;

        if (type === 'daftar') {
            const { data: registrations } = await supabase
                .from('run_registrations')
                .select('participant_name')
                .eq('run_id', nextRun.id);

            if (registrations && registrations.length > 0) {
                rekapMessage += `Total Terdaftar: ${registrations.length}\n`;
                rekapMessage += `-------------------\n`;
                registrations.forEach((r, i) => {
                    rekapMessage += `${i + 1}. ${r.participant_name}\n`;
                });
            } else {
                rekapMessage += 'Belum ada yang mendaftar.';
            }
        } else if (type === 'hadir') {
            // Ambil attendances yang scan_date = tanggal run
            const { data: attendances } = await supabase
                .from('attendances')
                .select('people_id, people(name)')
                .eq('scan_date', nextRun.date);

            if (attendances && attendances.length > 0) {
                rekapMessage += `Total Hadir: ${attendances.length}\n`;
                rekapMessage += `-------------------\n`;
                attendances.forEach((a, i) => {
                    rekapMessage += `${i + 1}. ${a.people?.name || 'Unknown'}\n`;
                });
            } else {
                rekapMessage += 'Belum ada data kehadiran.';
            }
        }

        rekapText.innerText = rekapMessage;
    } catch (error) {
        console.error('Error generate rekap:', error);
        rekapText.innerText = 'Gagal membuat rekap: ' + error.message;
    }
}

// ==========================================
// FITUR LOGS (Opsi C)
// ==========================================
async function loadLogs() {
    const tableBody = document.getElementById('logs-table-body');
    if (!tableBody) return;

    const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        tableBody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-red-500">Gagal memuat logs: ${error.message}</td></tr>`;
        return;
    }

    if (!data || data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-gray-500">Belum ada log aktivitas.</td></tr>`;
        return;
    }

    tableBody.innerHTML = data.map(log => `
        <tr class="border-b hover:bg-gray-50">
            <td class="px-4 py-2 text-sm">${new Date(log.created_at).toLocaleString('id-ID')}</td>
            <td class="px-4 py-2 text-sm font-semibold">${log.action || '-'}</td>
            <td class="px-4 py-2 text-sm">${log.user_email || 'System'}</td>
            <td class="px-4 py-2 text-sm text-gray-600">${log.details || '-'}</td>
        </tr>
    `).join('');
}

// ==========================================
// FITUR QR SCANNER (Req 13)
// ==========================================
let html5QrcodeScanner = null;

function initQRScanner() {
    const scannerContainer = document.getElementById('qr-reader');
    if (!scannerContainer) {
        alert('Container QR Reader tidak ditemukan di halaman ini.');
        return;
    }

    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
    }

    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    
    html5QrcodeScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (qrCodeMessage) => {
            console.log("QR Terdeteksi:", qrCodeMessage);
            await processAttendance(qrCodeMessage);
            
            html5QrcodeScanner.stop().then(() => {
                // Optional: auto close modal after scan
                // closeScannerModal();
            }).catch(err => console.error("Gagal stop scanner:", err));
        },
        (errorMessage) => {
            // Ignore scan errors
        }
    ).catch((err) => {
        console.error("Gagal memulai kamera:", err);
        alert("Gagal mengakses kamera. Pastikan izin kamera diberikan dan Anda menggunakan HTTPS atau localhost.");
    });
}

async function processAttendance(qrToken) {
    const { data: member, error } = await supabase
        .from('people')
        .select('id, name')
        .eq('qr_token', qrToken)
        .single();

    if (!member) {
        alert('QR Code tidak valid!');
        return;
    }

    const { error: attError } = await supabase.from('attendances').insert({
        people_id: member.id,
        scan_date: new Date().toISOString().split('T')[0]
    });

    if (attError) {
        if (attError.code === '23505') {
            alert(`Member ${member.name} sudah melakukan absensi hari ini!`);
        } else {
            alert('Gagal menyimpan absensi: ' + attError.message);
        }
    } else {
        alert(`Absensi berhasil untuk ${member.name}!`);
        // Optional: update attendance_count
        // await supabase.rpc('increment_attendance', { p_id: member.id });
    }
}

function closeScannerModal() {
    const modal = document.getElementById('scanner-modal');
    if (modal) modal.classList.remove('active');
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().catch(console.error);
    }
}

// ==========================================
// FITUR ID CARD (Req 13)
// ==========================================
async function downloadIDCard(elementId, memberName) {
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
        const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: null });
        const link = document.createElement('a');
        link.download = `ID_Card_${memberName.replace(/\s/g, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (error) {
        console.error('Gagal generate ID Card:', error);
        alert('Gagal membuat ID Card.');
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function generateToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Expose functions ke window agar bisa dipanggil dari onclick di HTML
window.loadFutureHares = loadFutureHares;
window.downloadIDCard = downloadIDCard;
window.deleteKasTransaction = deleteKasTransaction;
window.initQRScanner = initQRScanner;
window.closeScannerModal = closeScannerModal;
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
window.sendWishWhatsApp = sendWishWhatsApp;
window.generateRekapWA = generateRekapWA;
window.openKamusEditor = openKamusEditor;