/**
 * Hitman Pekanbaru Hashing Club - Supabase Configuration
 * Menggunakan window.sb untuk menghindari konflik
 */
(function() {
    const SUPABASE_URL = 'https://awpcrceoxddyltasznht.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cGNyY2VveGRkeWx0YXN6bmh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTExMDUsImV4cCI6MjEwMjI2NzEwNX0.SJbTlcxJ19454JVV2Q6lnQm7sNpbCHjgMqGSD7Bo_yE';

    if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
        console.error('❌ CDN Supabase belum ter-load!');
        return;
    }

    try {
        window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('✅ Supabase client ready (window.sb)');
        console.log('✅ Auth available:', !!window.sb.auth);
    } catch (err) {
        console.error('❌ Gagal create client:', err);
    }
})();