/**
 * Hitman Pekanbaru Hashing Club - Supabase Configuration (FIXED)
 * File: js/config.js
 * Fix: Menghindari "Identifier has already been declared" error
 */

const SUPABASE_URL = 'https://awpcrceoxddyltasznht.supabase.co';

// ⚠️ PASTE ANON KEY ANDA DI SINI
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cGNyY2VveGRkeWx0YXN6bmh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTExMDUsImV4cCI6MjEwMjI2NzEwNX0.SJbTlcxJ19454JVV2Q6lnQm7sNpbCHjgMqGSD7Bo_yE';

console.log('📦 Initializing Supabase...');
console.log('URL:', SUPABASE_URL);
console.log('Key present:', !!SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'PASTE_ANON_KEY_ANDA_DI_SINI');

// Cek apakah CDN Supabase sudah di-load
if (typeof window.supabase === 'undefined') {
    console.error('❌ FATAL: CDN Supabase belum di-load!');
    console.error('Pastikan <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> ada di <head>');
} else if (typeof window.supabase.createClient !== 'function') {
    console.error('❌ FATAL: window.supabase.createClient tidak tersedia!');
} else {
    // Gunakan IIFE untuk menghindari re-declaration error
    (function() {
        // Cek apakah sudah ada instance sebelumnya
        if (window.supabaseClient) {
            console.log('ℹ️ Supabase client sudah ada, skip initialization');
            return;
        }
        
        const { createClient } = window.supabase;
        
        try {
            window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('✅ Supabase client berhasil dibuat');
            console.log('✅ Auth available:', !!window.supabaseClient.auth);
            console.log('✅ signInWithPassword available:', typeof window.supabaseClient.auth?.signInWithPassword === 'function');
        } catch (err) {
            console.error('❌ Gagal membuat Supabase client:', err);
        }
    })();
}

// Verifikasi akhir
if (!window.supabaseClient) {
    console.error('❌ window.supabaseClient undefined setelah initialization');
} else if (!window.supabaseClient.auth) {
    console.error('❌ window.supabaseClient.auth undefined. Cek anon key!');
}