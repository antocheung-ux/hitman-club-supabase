-- =============================================
-- UPDATE 1: Tambah kolom tanggal lahir & ukuran baju
-- =============================================
ALTER TABLE people ADD COLUMN IF NOT EXISTS tanggal_lahir date;
ALTER TABLE people ADD COLUMN IF NOT EXISTS ukuran_baju text default 'L';

-- =============================================
-- UPDATE 2: Fungsi auto-generate tagihan bulan berjalan
-- (Otomatis membuat periode & tagihan jika belum ada)
-- =============================================
CREATE OR REPLACE FUNCTION auto_generate_current_month_bills()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periode_key text;
  v_bulan int;
  v_tahun int;
  v_period_id uuid;
  v_tarif numeric;
  v_count int := 0;
BEGIN
  IF NOT is_admin() THEN
    RETURN json_build_object('status','error','message','Akses ditolak.');
  END IF;

  v_bulan := EXTRACT(MONTH FROM CURRENT_DATE);
  v_tahun := EXTRACT(YEAR FROM CURRENT_DATE);
  v_periode_key := v_tahun || '-' || LPAD(v_bulan::text, 2, '0');

  -- Cek apakah periode sudah ada
  SELECT id INTO v_period_id FROM iuran_periods WHERE periode_key = v_periode_key;

  IF v_period_id IS NULL THEN
    -- Ambil tarif dari settings
    SELECT COALESCE(NULLIF(value, ''), '50000')::numeric INTO v_tarif
    FROM settings WHERE key = 'tarifBulanan';
    
    IF v_tarif IS NULL THEN v_tarif := 50000; END IF;

    -- Buat periode baru
    INSERT INTO iuran_periods (periode_key, bulan, tahun, tarif, status)
    VALUES (v_periode_key, v_bulan, v_tahun, v_tarif, 'open')
    RETURNING id INTO v_period_id;
  END IF;

  -- Generate tagihan untuk member aktif yang belum punya tagihan bulan ini
  INSERT INTO iuran_bills (period_id, member_id, amount, status)
  SELECT v_period_id, id, 
         (SELECT tarif FROM iuran_periods WHERE id = v_period_id),
         'belum_bayar'
  FROM people
  WHERE type = 'member' 
    AND status_member = 'Aktif'
    AND id NOT IN (
      SELECT member_id FROM iuran_bills WHERE period_id = v_period_id
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN json_build_object(
    'status','success',
    'periode', v_periode_key,
    'new_bills', v_count
  );
END;
$$;

-- =============================================
-- UPDATE 3: Fungsi ambil member ulang tahun hari ini
-- =============================================
CREATE OR REPLACE FUNCTION get_birthdays_today()
RETURNS TABLE (
  id text,
  nama text,
  hashname text,
  phone text,
  tanggal_lahir date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, nama, hashname, phone, tanggal_lahir
  FROM people
  WHERE type = 'member'
    AND status_member = 'Aktif'
    AND tanggal_lahir IS NOT NULL
    AND EXTRACT(MONTH FROM tanggal_lahir) = EXTRACT(MONTH FROM CURRENT_DATE)
    AND EXTRACT(DAY FROM tanggal_lahir) = EXTRACT(DAY FROM CURRENT_DATE)
  ORDER BY nama;
$$;

-- =============================================
-- UPDATE 4: Auto-update iuran_bills saat member baru terdaftar
-- =============================================
CREATE OR REPLACE FUNCTION trigger_new_member_bills()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_period_id uuid;
  v_tarif numeric;
  v_bulan int;
  v_tahun int;
  v_periode_key text;
BEGIN
  -- Hanya untuk member aktif baru
  IF NEW.type = 'member' AND NEW.status_member = 'Aktif' THEN
    v_bulan := EXTRACT(MONTH FROM CURRENT_DATE);
    v_tahun := EXTRACT(YEAR FROM CURRENT_DATE);
    v_periode_key := v_tahun || '-' || LPAD(v_bulan::text, 2, '0');

    SELECT id INTO v_current_period_id FROM iuran_periods WHERE periode_key = v_periode_key;

    IF v_current_period_id IS NOT NULL THEN
      SELECT tarif INTO v_tarif FROM iuran_periods WHERE id = v_current_period_id;
      
      INSERT INTO iuran_bills (period_id, member_id, amount, status)
      VALUES (v_current_period_id, NEW.id, v_tarif, 'belum_bayar')
      ON CONFLICT (period_id, member_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_member_bills ON people;
CREATE TRIGGER trg_new_member_bills
AFTER INSERT ON people
FOR EACH ROW
EXECUTE FUNCTION trigger_new_member_bills();