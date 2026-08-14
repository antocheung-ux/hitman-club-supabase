/**
 * Hitman Pekanbaru Hashing Club - Supabase Configuration (MUTLAK FINAL)
 * File: js/config.js
 */

(function() {
    const URL = 'https://awpcrceoxddyltasznht.supabase.co';
    
    // ⚠️ PASTE ANON KEY ANDA DI SINI
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cGNyY2VveGRkeWx0YXN6bmh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTExMDUsImV4cCI6MjEwMjI2NzEwNX0.SJbTlcxJ19454JVV2Q6lnQm7sNpbCHjgMqGSD7Bo_yE';

    console.log('📦 [config.js] Memulai inisialisasi Supabase...');

    if (window.supabase && typeof window.supabase.createClient === 'function') {
        // Simpan ke window.supabaseClient agar bisa diambil oleh app.js
        window.supabaseClient = window.supabase.createClient(URL, KEY);
        
        console.log('✅ [config.js] Supabase client berhasil dibuat!');
        console.log('✅ [config.js] Auth tersedia:', !!window.supabaseClient.auth);
    } else {
        console.error('❌ [config.js] FATAL: CDN Supabase belum ter-load! Pastikan script CDN ada di <head> index.html.');
    }
})();