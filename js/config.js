/**
 * Hitman Pekanbaru Hashing Club - Supabase Configuration (FINAL dengan Retry)
 */
(function() {
    const SUPABASE_URL = 'https://awpcrceoxddyltasznht.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cGNyY2VveGRkeWx0YXN6bmh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTExMDUsImV4cCI6MjEwMjI2NzEwNX0.SJbTlcxJ19454JVV2Q6lnQm7sNpbCHjgMqGSD7Bo_yE';

    console.log('📦 [config.js] Mencoba inisialisasi Supabase...');

    let attempts = 0;
    const maxAttempts = 50; // 50 x 100ms = 5 detik timeout

    function tryInit() {
        attempts++;
        
        // Cek apakah CDN Supabase sudah tersedia
        if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
            if (attempts < maxAttempts) {
                console.log(`⏳ [config.js] CDN belum siap, mencoba lagi... (${attempts}/${maxAttempts})`);
                setTimeout(tryInit, 100); // Coba lagi dalam 100ms
                return;
            } else {
                console.error('❌ [config.js] TIMEOUT: CDN Supabase tidak ter-load setelah 5 detik!');
                console.error('Pastikan <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> ada di <head> index.html');
                window.supabaseReady = false;
                return;
            }
        }

        // CDN sudah siap, buat client
        try {
            window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            window.supabaseReady = true;
            
            console.log('✅ [config.js] Supabase client berhasil dibuat!');
            console.log('✅ [config.js] Auth tersedia:', !!window.sb.auth);
            console.log('✅ [config.js] signInWithPassword:', typeof window.sb.auth?.signInWithPassword === 'function');
            
            // Trigger event untuk memberitahu app.js
            window.dispatchEvent(new Event('supabaseReady'));
            
        } catch (err) {
            console.error('❌ [config.js] Gagal membuat client:', err);
            window.supabaseReady = false;
        }
    }

    // Mulai proses inisialisasi
    tryInit();
})();