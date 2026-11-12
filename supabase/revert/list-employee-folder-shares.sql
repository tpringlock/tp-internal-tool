-- READ-ONLY. Lists client-level (folder) share links created by users who are
-- not admin/manager, with how much they expose beyond the creator's own
-- projects. Does not output the token. Run in the Supabase SQL editor.

select
  l.id,
  c.name                                  as khach_hang,
  p.full_name                             as nguoi_tao,
  p.role                                  as vai_tro,
  p.is_active                             as nguoi_tao_con_hoat_dong,
  l.created_at,
  l.expires_at,
  l.revoked_at,
  (l.revoked_at is null and l.expires_at > now()) as con_hieu_luc,
  (select count(*) from public.projects pr
    where pr.client_id = l.client_id)     as so_du_an_cua_khach,
  (select count(*) from public.projects pr
    join public.project_members m
      on m.project_id = pr.id and m.user_id = l.created_by
    where pr.client_id = l.client_id)     as so_du_an_nguoi_tao_la_thanh_vien,
  (select count(*) from public.documents d
    join public.projects pr on pr.id = d.project_id
    where pr.client_id = l.client_id
      and not exists (
        select 1 from public.project_members m
        where m.project_id = pr.id and m.user_id = l.created_by
      ))                                  as so_tai_lieu_ngoai_quyen_nguoi_tao,
  -- Anonymous opens/downloads recorded against this link (token is stored in
  -- activity_log.metadata; see audit M-5). Counts only.
  (select count(*) from public.activity_log a
    where a.action like 'folder_share.%'
      and a.actor_user_id is null
      and a.metadata ->> 'token' = l.token) as so_luot_truy_cap_an_danh,
  (select max(a.created_at) from public.activity_log a
    where a.action like 'folder_share.%'
      and a.actor_user_id is null
      and a.metadata ->> 'token' = l.token) as lan_truy_cap_cuoi
from public.folder_share_links l
join public.clients  c on c.id = l.client_id
join public.profiles p on p.id = l.created_by
where p.role not in ('admin', 'manager')
order by con_hieu_luc desc, l.created_at desc;
