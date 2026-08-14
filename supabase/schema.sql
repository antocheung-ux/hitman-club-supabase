-- =====================================================================
-- HITMAN PEKANBARU HASHING CLUB - SUPABASE SCHEMA
-- Versi: 1.0.0
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- TABLE: ADMIN
-- =====================================================================

create table if not exists admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text default 'admin',
  created_at timestamptz default now()
);

-- =====================================================================
-- TABLE: PEOPLE (MEMBER & VISITOR)
-- =====================================================================

create table if not exists people (
  id text primary key,
  type text not null default 'member' check (type in ('member','visitor')),
  nama text not null,
  hashname text default '-',
  phone text,
  size text default 'L',
  qr_token text unique not null default gen_random_uuid()::text,
  status_member text check (status_member is null or status_member in ('Aktif','Non Aktif')),
  foto_path text,
  attendance_count int not null default 0,
  registered_at date default current_date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================================================================
-- TABLE: IURAN
-- =====================================================================

create table if not exists iuran_periods (
  id uuid primary key default gen_random_uuid(),
  periode_key text unique not null,
  bulan int not null check (bulan between 1 and 12),
  tahun int not null,
  tarif numeric not null default 0,
  jatuh_tempo date,
  status text not null default 'open' check (status in ('draft','open','closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (bulan, tahun)
);

create table if not exists iuran_bills (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references iuran_periods(id) on delete cascade,
  member_id text not null references people(id) on delete cascade,
  amount numeric not null default 0,
  status text not null default 'belum_bayar'
    check (status in ('belum_bayar','proses_verifikasi','lunas','dibebaskan')),
  due_date date,
  paid_at timestamptz,
  payment_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (period_id, member_id)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references people(id),
  total_amount numeric not null default 0,
  payment_method text default 'QRIS',
  reference_no text,
  status text not null default 'menunggu_verifikasi'
    check (status in ('menunggu_verifikasi','disetujui','ditolak','dibatalkan')),
  requested_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  kas_transaction_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists payment_items (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  bill_id uuid not null references iuran_bills(id),
  amount numeric not null default 0,
  created_at timestamptz default now(),
  unique (payment_id, bill_id)
);

-- =====================================================================
-- TABLE: KAS
-- =====================================================================

create table if not exists kas_transactions (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null default current_date,
  tipe text not null check (tipe in ('Masuk','Keluar')),
  kategori text not null default 'lainnya',
  keterangan text,
  jumlah numeric not null default 0,
  member_id text references people(id),
  payment_id uuid references payments(id),
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

-- =====================================================================
-- TABLE: RUN / HARE
-- =====================================================================

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  run_number int,
  nama text not null,
  foto_path text,
  tanggal_acara date,
  lokasi text,
  deskripsi text,
  status text not null default 'published' check (status in ('draft','published','completed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists run_registrations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  tanggal date not null default current_date,
  person_id text references people(id),
  nama text not null,
  tipe text not null default 'visitor' check (tipe in ('member','visitor')),
  created_at timestamptz default now()
);

create unique index if not exists uq_run_reg_run_nama
on run_registrations(run_id, lower(nama));

-- =====================================================================
-- TABLE: ABSENSI
-- =====================================================================

create table if not exists attendances (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null default current_date,
  person_id text not null references people(id) on delete cascade,
  keterangan text default 'Berhasil scan',
  scanned_at timestamptz default now(),
  unique (tanggal, person_id)
);

create table if not exists scan_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  qr_token text,
  person_id text,
  result text,
  message text,
  scan_date date
);

-- =====================================================================
-- TABLE: GALERI, KAMUS, SETTINGS, WA LOG, AUDIT
-- =====================================================================

create table if not exists gallery (
  id uuid primary key default gen_random_uuid(),
  image_path text not null,
  caption text,
  submitter text default 'Anonim',
  created_at timestamptz default now()
);

create table if not exists kamus_hash (
  id text primary key,
  term text not null,
  def text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists settings (
  key text primary key,
  value text,
  is_public boolean default false,
  updated_at timestamptz default now()
);

create table if not exists wa_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  phone text,
  target_name text,
  message_type text,
  status text,
  mode text,
  link text
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_values jsonb,
  new_values jsonb
);

-- =====================================================================
-- FUNCTION: UPDATED AT
-- =====================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_people_updated on people;
create trigger trg_people_updated
before update on people
for each row execute function set_updated_at();

drop trigger if exists trg_iuran_periods_updated on iuran_periods;
create trigger trg_iuran_periods_updated
before update on iuran_periods
for each row execute function set_updated_at();

drop trigger if exists trg_iuran_bills_updated on iuran_bills;
create trigger trg_iuran_bills_updated
before update on iuran_bills
for each row execute function set_updated_at();

drop trigger if exists trg_payments_updated on payments;
create trigger trg_payments_updated
before update on payments
for each row execute function set_updated_at();

drop trigger if exists trg_kas_updated on kas_transactions;
create trigger trg_kas_updated
before update on kas_transactions
for each row execute function set_updated_at();

drop trigger if exists trg_runs_updated on runs;
create trigger trg_runs_updated
before update on runs
for each row execute function set_updated_at();

-- =====================================================================
-- FUNCTION: ATTENDANCE COUNT
-- =====================================================================

create or replace function update_people_attendance_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update people
    set attendance_count = coalesce(attendance_count, 0) + 1
    where id = NEW.person_id;
  end if;

  if TG_OP = 'DELETE' then
    update people
    set attendance_count = greatest(coalesce(attendance_count, 0) - 1, 0)
    where id = OLD.person_id;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_attendance_count on attendances;
create trigger trg_attendance_count
after insert or delete on attendances
for each row execute function update_people_attendance_count();

-- =====================================================================
-- FUNCTION: IS ADMIN
-- =====================================================================

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from admin_profiles
    where user_id = auth.uid()
  );
$$;

-- =====================================================================
-- FUNCTION: AUDIT TRIGGER
-- =====================================================================

create or replace function audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id text;
begin
  if TG_OP = 'INSERT' then
    v_entity_id := NEW.id::text;
  elsif TG_OP = 'UPDATE' then
    v_entity_id := NEW.id::text;
  else
    v_entity_id := OLD.id::text;
  end if;

  insert into audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) values (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    to_jsonb(OLD),
    to_jsonb(NEW)
  );

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists audit_people on people;
create trigger audit_people
after insert or update or delete on people
for each row execute function audit_trigger();

drop trigger if exists audit_iuran_periods on iuran_periods;
create trigger audit_iuran_periods
after insert or update or delete on iuran_periods
for each row execute function audit_trigger();

drop trigger if exists audit_iuran_bills on iuran_bills;
create trigger audit_iuran_bills
after insert or update or delete on iuran_bills
for each row execute function audit_trigger();

drop trigger if exists audit_payments on payments;
create trigger audit_payments
after insert or update or delete on payments
for each row execute function audit_trigger();

drop trigger if exists audit_kas on kas_transactions;
create trigger audit_kas
after insert or update or delete on kas_transactions
for each row execute function audit_trigger();

drop trigger if exists audit_runs on runs;
create trigger audit_runs
after insert or update or delete on runs
for each row execute function audit_trigger();

drop trigger if exists audit_gallery on gallery;
create trigger audit_gallery
after insert or update or delete on gallery
for each row execute function audit_trigger();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

alter table admin_profiles enable row level security;
alter table people enable row level security;
alter table iuran_periods enable row level security;
alter table iuran_bills enable row level security;
alter table payments enable row level security;
alter table payment_items enable row level security;
alter table kas_transactions enable row level security;
alter table runs enable row level security;
alter table run_registrations enable row level security;
alter table attendances enable row level security;
alter table scan_logs enable row level security;
alter table gallery enable row level security;
alter table kamus_hash enable row level security;
alter table settings enable row level security;
alter table wa_logs enable row level security;
alter table audit_logs enable row level security;

-- admin_profiles: user hanya bisa cek dirinya sendiri
drop policy if exists admin_profiles_select_own on admin_profiles;
create policy admin_profiles_select_own
on admin_profiles
for select
using (auth.uid() = user_id);

-- people: admin only
drop policy if exists people_admin_all on people;
create policy people_admin_all
on people
for all
using (is_admin())
with check (is_admin());

-- iuran: admin only
drop policy if exists iuran_periods_admin_all on iuran_periods;
create policy iuran_periods_admin_all
on iuran_periods
for all
using (is_admin())
with check (is_admin());

drop policy if exists iuran_bills_admin_all on iuran_bills;
create policy iuran_bills_admin_all
on iuran_bills
for all
using (is_admin())
with check (is_admin());

drop policy if exists payments_admin_all on payments;
create policy payments_admin_all
on payments
for all
using (is_admin())
with check (is_admin());

drop policy if exists payment_items_admin_all on payment_items;
create policy payment_items_admin_all
on payment_items
for all
using (is_admin())
with check (is_admin());

-- kas: admin only
drop policy if exists kas_admin_all on kas_transactions;
create policy kas_admin_all
on kas_transactions
for all
using (is_admin())
with check (is_admin());

-- runs: public read, admin all
drop policy if exists runs_public_select on runs;
create policy runs_public_select
on runs
for select
using (true);

drop policy if exists runs_admin_all on runs;
create policy runs_admin_all
on runs
for all
using (is_admin())
with check (is_admin());

-- run registrations: public read & insert, admin all
drop policy if exists run_reg_public_select on run_registrations;
create policy run_reg_public_select
on run_registrations
for select
using (true);

drop policy if exists run_reg_public_insert on run_registrations;
create policy run_reg_public_insert
on run_registrations
for insert
with check (
  run_id is not null
  and nama is not null
  and tipe in ('member','visitor')
);

drop policy if exists run_reg_admin_all on run_registrations;
create policy run_reg_admin_all
on run_registrations
for all
using (is_admin())
with check (is_admin());

-- attendances: admin only
drop policy if exists attendances_admin_all on attendances;
create policy attendances_admin_all
on attendances
for all
using (is_admin())
with check (is_admin());

-- scan logs: admin select
drop policy if exists scan_logs_admin_select on scan_logs;
create policy scan_logs_admin_select
on scan_logs
for select
using (is_admin());

-- gallery: public read, admin all
drop policy if exists gallery_public_select on gallery;
create policy gallery_public_select
on gallery
for select
using (true);

drop policy if exists gallery_admin_all on gallery;
create policy gallery_admin_all
on gallery
for all
using (is_admin())
with check (is_admin());

-- kamus: public read, admin all
drop policy if exists kamus_public_select on kamus_hash;
create policy kamus_public_select
on kamus_hash
for select
using (true);

drop policy if exists kamus_admin_all on kamus_hash;
create policy kamus_admin_all
on kamus_hash
for all
using (is_admin())
with check (is_admin());

-- settings: public hanya is_public, admin all
drop policy if exists settings_public_select on settings;
create policy settings_public_select
on settings
for select
using (is_public = true);

drop policy if exists settings_admin_all on settings;
create policy settings_admin_all
on settings
for all
using (is_admin())
with check (is_admin());

-- wa logs: admin select
drop policy if exists wa_logs_admin_select on wa_logs;
create policy wa_logs_admin_select
on wa_logs
for select
using (is_admin());

-- audit logs: admin select only
drop policy if exists audit_logs_admin_select on audit_logs;
create policy audit_logs_admin_select
on audit_logs
for select
using (is_admin());

-- =====================================================================
-- STORAGE BUCKETS
-- =====================================================================

insert into storage.buckets (id, name, public)
values
  ('member-photos', 'member-photos', true),
  ('run-photos', 'run-photos', true),
  ('gallery-photos', 'gallery-photos', true)
on conflict (id) do nothing;

drop policy if exists member_photos_public_read on storage.objects;
create policy member_photos_public_read
on storage.objects
for select
using (bucket_id = 'member-photos');

drop policy if exists member_photos_admin_write on storage.objects;
create policy member_photos_admin_write
on storage.objects
for insert
with check (bucket_id = 'member-photos' and is_admin());

drop policy if exists member_photos_admin_update on storage.objects;
create policy member_photos_admin_update
on storage.objects
for update
using (bucket_id = 'member-photos' and is_admin());

drop policy if exists member_photos_admin_delete on storage.objects;
create policy member_photos_admin_delete
on storage.objects
for delete
using (bucket_id = 'member-photos' and is_admin());

drop policy if exists run_photos_public_read on storage.objects;
create policy run_photos_public_read
on storage.objects
for select
using (bucket_id = 'run-photos');

drop policy if exists run_photos_admin_write on storage.objects;
create policy run_photos_admin_write
on storage.objects
for insert
with check (bucket_id = 'run-photos' and is_admin());

drop policy if exists run_photos_admin_update on storage.objects;
create policy run_photos_admin_update
on storage.objects
for update
using (bucket_id = 'run-photos' and is_admin());

drop policy if exists run_photos_admin_delete on storage.objects;
create policy run_photos_admin_delete
on storage.objects
for delete
using (bucket_id = 'run-photos' and is_admin());

drop policy if exists gallery_photos_public_read on storage.objects;
create policy gallery_photos_public_read
on storage.objects
for select
using (bucket_id = 'gallery-photos');

drop policy if exists gallery_photos_admin_write on storage.objects;
create policy gallery_photos_admin_write
on storage.objects
for insert
with check (bucket_id = 'gallery-photos' and is_admin());

drop policy if exists gallery_photos_admin_update on storage.objects;
create policy gallery_photos_admin_update
on storage.objects
for update
using (bucket_id = 'gallery-photos' and is_admin());

drop policy if exists gallery_photos_admin_delete on storage.objects;
create policy gallery_photos_admin_delete
on storage.objects
for delete
using (bucket_id = 'gallery-photos' and is_admin());

-- =====================================================================
-- FUNCTION: PUBLIC PRESTASI
-- =====================================================================

create or replace function get_public_prestasi()
returns table(hashname text, attendance_count int)
language sql
stable
security definer
set search_path = public
as $$
  select hashname, attendance_count
  from people
  where type = 'member'
    and status_member = 'Aktif'
  order by attendance_count desc;
$$;

-- =====================================================================
-- FUNCTION: REGISTER RUN PUBLIC
-- =====================================================================

create or replace function register_run_public(p_run_id uuid, p_nama text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run runs;
  v_person people;
  v_tipe text := 'visitor';
  v_person_id text := null;
begin
  select * into v_run
  from runs
  where id = p_run_id;

  if not found then
    return json_build_object('status','error','message','Run tidak ditemukan.');
  end if;

  select * into v_person
  from people
  where lower(trim(nama)) = lower(trim(p_nama))
     or lower(trim(hashname)) = lower(trim(p_nama))
  limit 1;

  if found then
    v_tipe := v_person.type;
    v_person_id := v_person.id;
  end if;

  begin
    insert into run_registrations (run_id, nama, tipe, person_id, tanggal)
    values (p_run_id, trim(p_nama), v_tipe, v_person_id, current_date);
  exception when unique_violation then
    return json_build_object('status','duplicate','message','Nama sudah terdaftar.');
  end;

  return json_build_object(
    'status','success',
    'message','Pendaftaran berhasil.',
    'nama', trim(p_nama),
    'tipe', v_tipe
  );
end;
$$;

-- =====================================================================
-- FUNCTION: RECORD ATTENDANCE
-- =====================================================================

create or replace function record_attendance(p_qr text, p_tanggal date default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person people;
  v_date date := coalesce(p_tanggal, current_date);
  v_count int;
begin
  if not is_admin() then
    return json_build_object('status','error','message','Akses ditolak. Login admin diperlukan.');
  end if;

  select * into v_person
  from people
  where qr_token = trim(p_qr)
     or id = upper(trim(p_qr))
  limit 1;

  if not found then
    insert into scan_logs (qr_token, result, message, scan_date)
    values (p_qr, 'not_found', 'QR tidak ditemukan', v_date);

    return json_build_object('status','error','message','QR tidak ditemukan.');
  end if;

  if v_person.type = 'member' and v_person.status_member = 'Non Aktif' then
    insert into scan_logs (qr_token, person_id, result, message, scan_date)
    values (p_qr, v_person.id, 'nonaktif', 'Member non aktif', v_date);

    return json_build_object('status','error','message','Member sedang Non Aktif.');
  end if;

  begin
    insert into attendances (tanggal, person_id)
    values (v_date, v_person.id);
  exception when unique_violation then
    insert into scan_logs (qr_token, person_id, result, message, scan_date)
    values (p_qr, v_person.id, 'duplicate', 'Sudah absen', v_date);

    return json_build_object('status','duplicate','message','Sudah absen hari ini.');
  end;

  select attendance_count into v_count
  from people
  where id = v_person.id;

  insert into scan_logs (qr_token, person_id, result, message, scan_date)
  values (p_qr, v_person.id, 'success', 'Berhasil scan', v_date);

  return json_build_object(
    'status','success',
    'message','Absensi berhasil.',
    'nama', v_person.nama,
    'hashname', v_person.hashname,
    'type', v_person.type,
    'count', v_count
  );
end;
$$;

-- =====================================================================
-- FUNCTION: GENERATE IURAN BILLS
-- =====================================================================

create or replace function generate_iuran_bills(p_period_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period iuran_periods;
  v_count int;
begin
  if not is_admin() then
    raise exception 'Akses ditolak.';
  end if;

  select * into v_period
  from iuran_periods
  where id = p_period_id;

  if not found then
    raise exception 'Periode tidak ditemukan.';
  end if;

  insert into iuran_bills (period_id, member_id, amount, due_date)
  select
    p_period_id,
    id,
    v_period.tarif,
    coalesce(v_period.jatuh_tempo, make_date(v_period.tahun, v_period.bulan, 1))
  from people
  where type = 'member'
    and status_member = 'Aktif'
  on conflict (period_id, member_id) do nothing;

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

-- =====================================================================
-- FUNCTION: SUBMIT PAYMENT
-- =====================================================================

create or replace function submit_payment(
  p_member_id text,
  p_period_keys text[],
  p_payment_method text default 'QRIS',
  p_reference_no text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member people;
  v_payment_id uuid;
  v_bill iuran_bills;
  v_period iuran_periods;
  v_key text;
  v_total numeric := 0;
begin
  if not is_admin() then
    raise exception 'Akses ditolak.';
  end if;

  select * into v_member
  from people
  where id = p_member_id
    and type = 'member';

  if not found then
    raise exception 'Member tidak ditemukan.';
  end if;

  insert into payments (member_id, total_amount, payment_method, reference_no, status, requested_by)
  values (p_member_id, 0, p_payment_method, p_reference_no, 'menunggu_verifikasi', auth.uid())
  returning id into v_payment_id;

  foreach v_key in array p_period_keys loop
    select b.* into v_bill
    from iuran_bills b
    join iuran_periods p on p.id = b.period_id
    where p.periode_key = v_key
      and b.member_id = p_member_id;

    if not found then
      continue;
    end if;

    if v_bill.status <> 'belum_bayar' then
      continue;
    end if;

    insert into payment_items (payment_id, bill_id, amount)
    values (v_payment_id, v_bill.id, v_bill.amount);

    update iuran_bills
    set status = 'proses_verifikasi'
    where id = v_bill.id;

    v_total := v_total + v_bill.amount;
  end loop;

  if v_total = 0 then
    delete from payments where id = v_payment_id;
    raise exception 'Tidak ada tagihan valid yang bisa dibayar.';
  end if;

  update payments
  set total_amount = v_total
  where id = v_payment_id;

  return v_payment_id;
end;
$$;

-- =====================================================================
-- FUNCTION: APPROVE PAYMENT
-- =====================================================================

create or replace function approve_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments;
  v_member people;
  v_periods text;
  v_kas_id uuid;
begin
  if not is_admin() then
    raise exception 'Akses ditolak.';
  end if;

  update payments
  set status = 'disetujui',
      approved_at = now(),
      approved_by = auth.uid()
  where id = p_payment_id
    and status = 'menunggu_verifikasi'
  returning * into v_payment;

  if not found then
    raise exception 'Payment tidak ditemukan atau sudah diproses.';
  end if;

  select * into v_member
  from people
  where id = v_payment.member_id;

  select string_agg(p.periode_key, ', ' order by p.periode_key) into v_periods
  from payment_items pi
  join iuran_bills b on b.id = pi.bill_id
  join iuran_periods p on p.id = b.period_id
  where pi.payment_id = p_payment_id;

  insert into kas_transactions (
    tanggal,
    tipe,
    kategori,
    keterangan,
    jumlah,
    member_id,
    payment_id,
    created_by
  ) values (
    current_date,
    'Masuk',
    'iuran',
    'Pembayaran iuran ' || coalesce(v_member.nama, v_member.id) || ' untuk periode: ' || coalesce(v_periods, '-'),
    v_payment.total_amount,
    v_payment.member_id,
    p_payment_id,
    auth.uid()
  )
  returning id into v_kas_id;

  update payments
  set kas_transaction_id = v_kas_id
  where id = p_payment_id;

  update iuran_bills b
  set status = 'lunas',
      paid_at = now(),
      payment_id = p_payment_id
  from payment_items pi
  where pi.payment_id = p_payment_id
    and pi.bill_id = b.id;
end;
$$;

-- =====================================================================
-- FUNCTION: REJECT PAYMENT
-- =====================================================================

create or replace function reject_payment(p_payment_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments;
begin
  if not is_admin() then
    raise exception 'Akses ditolak.';
  end if;

  update payments
  set status = 'ditolak',
      rejected_reason = p_reason,
      approved_at = now(),
      approved_by = auth.uid()
  where id = p_payment_id
    and status = 'menunggu_verifikasi'
  returning * into v_payment;

  if not found then
    raise exception 'Payment tidak ditemukan atau sudah diproses.';
  end if;

  update iuran_bills b
  set status = 'belum_bayar'
  from payment_items pi
  where pi.payment_id = p_payment_id
    and pi.bill_id = b.id
    and b.status = 'proses_verifikasi';
end;
$$;

-- =====================================================================
-- FUNCTION: LOG WA
-- =====================================================================

create or replace function log_wa(
  p_phone text,
  p_target_name text,
  p_message_type text,
  p_status text,
  p_mode text,
  p_link text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Akses ditolak.';
  end if;

  insert into wa_logs (phone, target_name, message_type, status, mode, link)
  values (p_phone, p_target_name, p_message_type, p_status, p_mode, p_link);
end;
$$;

-- =====================================================================
-- SEED SETTINGS
-- =====================================================================

insert into settings (key, value, is_public)
values
  ('tarifBulanan', '50000', true),
  ('runTarget', '20', true),
  ('emergencyWA', '', true),
  ('waGroupNumber', '', false),
  ('sejarahKlub', 'Sejarah Hitman Pekanbaru Hashing Club belum ditambahkan.', true)
on conflict (key) do nothing;

-- =====================================================================
-- SEED KAMUS HASH
-- =====================================================================

insert into kamus_hash (id, term, def, sort_order)
values
  ('d01', 'Hash House Harriers', 'Klub olahraga lari lintas alam dengan jalur yang diberi tanda oleh Hare.', 1),
  ('d02', 'Hasher', 'Anggota resmi Hash Club.', 2),
  ('d03', 'Harriete', 'Sebutan bagi Hasher wanita.', 3),
  ('d04', 'Puppy', 'Hasher kecil berusia antara 3 - 12 tahun.', 4),
  ('d05', 'MisManagement Committee', 'Jajaran pengurus Hash Club.', 5),
  ('d06', 'Hash Master / Mistress', 'Pimpinan Hash Club.', 6),
  ('d07', 'Down Down', 'Ritual meminum habis segelas minuman dalam satu tegukan.', 7),
  ('d08', 'On On', 'Panggilan khas Hasher bahwa rute benar.', 8),
  ('d09', 'Hare', 'Hasher yang merancang dan menebar jejak rute.', 9),
  ('d10', 'Hound', 'Peserta yang mengikuti jejak Hare.', 10),
  ('d11', 'FRB''s', 'Front Running Bastards, kelompok pelari depan.', 11),
  ('d12', 'RRB''s', 'Rear Running Bastards, kelompok santai di belakang.', 12),
  ('d13', 'Check', 'Tanda lingkaran agar pelari berhenti sejenak.', 13),
  ('d14', 'False Trail', 'Jejak palsu untuk mengecoh pelari depan.', 14),
  ('d15', 'On-On Site', 'Lokasi berkumpul awal dan akhir run.', 15)
on conflict (id) do nothing;
