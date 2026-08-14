/* =====================================================================
   HITMAN PEKANBARU HASHING CLUB - js/config.js (VERSI 3 - FINAL)
   =====================================================================
   ATURAN: SATU-SATUNYA baris yang boleh Anda edit adalah baris dengan
   tanda  >>>  . Paste anon key DI ANTARA dua tanda kutip (').
   JANGAN mengubah baris lain dalam bentuk apa pun.
   ===================================================================== */
(function () {
  'use strict';

  var PROJECT_URL = 'https://awpcrceoxddyltasznht.supabase.co';

  /* >>> EDIT BARIS INI SAJA - paste anon key di antara tanda kutip <<< */
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cGNyY2VveGRkeWx0YXN6bmh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTExMDUsImV4cCI6MjEwMjI2NzEwNX0.SJbTlcxJ19454JVV2Q6lnQm7sNpbCHjgMqGSD7Bo_yE';
  /* >>> JANGAN EDIT BARIS LAIN >>> */

  // Guard 1: pastikan key terisi (typeof aman, tidak akan throw ReferenceError)
  if (typeof ANON_KEY === 'undefined' || !ANON_KEY || ANON_KEY.indexOf('PASTE_') === 0) {
    console.error('❌ [config.js] ANON_KEY kosong / masih placeholder / barisnya rusak. Buka Supabase Dashboard > Project Settings > API > salin "anon public", lalu paste DI ANTARA tanda kutip pada baris >>> di file js/config.js.');
    window.supabaseReady = false;
    return;
  }

  var attempts = 0;
  var MAX_ATTEMPTS = 50;

  function tryInit() {
    attempts++;

    // Guard 2: CDN supabase-js harus sudah termuat
    if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
      if (attempts < MAX_ATTEMPTS) { setTimeout(tryInit, 100); return; }
      console.error('❌ [config.js] CDN supabase-js tidak termuat setelah 5 detik. Periksa koneksi internet.');
      window.supabaseReady = false;
      return;
    }

    try {
      window.sb = window.supabase.createClient(PROJECT_URL, ANON_KEY);
      window.supabaseReady = true;
      console.log('✅ [config.js] Supabase client BERHASIL dibuat.');
      console.log('✅ [config.js] auth tersedia:', !!window.sb.auth);
      window.dispatchEvent(new Event('supabaseReady'));
    } catch (err) {
      console.error('❌ [config.js] createClient melempar error:', err);
      window.supabaseReady = false;
    }
  }

  tryInit();
})();