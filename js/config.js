/**
 * Hitman Pekanbaru Hashing Club - Supabase Configuration
 * File: js/config.js
 */

const SUPABASE_URL = 'https://awpcrceoxddyltasznht.supabase.co';

// ⚠️ PASTE ANON KEY ANDA DI SINI
// Cara dapat: Supabase Dashboard → Settings → API → anon public key
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cGNyY2VveGRkeWx0YXN6bmh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTExMDUsImV4cCI6MjEwMjI2NzEwNX0.SJbTlcxJ19454JVV2Q6lnQm7sNpbCHjgMqGSD7Bo_yE';

// Inisialisasi Supabase Client
// Gunakan destructuring agar tidak konflik dengan window.supabase
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Verifikasi inisialisasi
console.log('✅ Supabase URL:', SUPABASE_URL);
console.log('✅ Supabase Client:', supabase);
console.log('✅ Auth available:', !!supabase.auth);
console.log('✅ Auth.signInWithPassword available:', typeof supabase.auth?.signInWithPassword === 'function');

if (!supabase.auth) {
    console.error('❌ GAGAL: supabase.auth undefined. Pastikan anon key benar dan CDN Supabase sudah di-load.');
}