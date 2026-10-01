-- READ-ONLY list of every month-file version, one row per version, for a
-- human to check after 0037 (e.g. "is the ACTIVE June file the right one?"):
--   npx supabase db query --linked -f supabase/revert/list-month-files.sql
--
-- Compare file name, upload time and sha256 with the file you consider the
-- reference. If the wrong version is active, an admin can fix it in the app
-- after deployment (upload the right file again, or restore a version).
select
  f.month                                        as thang,
  f.version                                      as phien_ban,
  case f.status when 'active' then 'ĐANG DÙNG' else 'đã thay' end as trang_thai,
  u.file_name                                    as ten_file,
  to_char(u.file_from, 'DD/MM/YYYY') || ' → ' || to_char(u.file_to, 'DD/MM/YYYY') as ky_cua_file,
  coalesce(nullif(p.full_name, ''), u.uploaded_by::text) as nguoi_tai,
  to_char(u.created_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') as luc_tai,
  u.size_bytes                                   as dung_luong,
  u.layout                                       as mau_file,
  u.warehouse_count                              as so_kho,
  left(u.sha256, 12)                             as sha256_dau,
  (select count(*) from public.billing_rent_calculations c
    where f.upload_id = any (c.upload_ids) and c.status <> 'voided') as so_ban_tinh_dung,
  (select count(*) from public.billing_rent_calculations c
    where f.upload_id = any (c.upload_ids) and c.status = 'confirmed') as so_ban_da_xac_nhan
from public.billing_misa_month_files f
join public.billing_misa_uploads u on u.id = f.upload_id
left join public.profiles p on p.id = u.uploaded_by
order by f.month, f.version;
