# Tích hợp MISA AMIS Kế toán (ACT Open API)

> Trạng thái: **Phase 1 — chỉ đọc & đồng bộ master data** (khách hàng, vật tư, kho, tồn kho).
> Chứng từ bán hàng và xuất/nhập kho sẽ làm ở pha sau (đi qua luồng async `request_data`).

Tài liệu API: https://actdocs.misa.vn/g2/graph/ACTOpenAPIHelp/index.html

---

## 1. Biến môi trường

Tất cả là **server-only** (không có tiền tố `NEXT_PUBLIC_`), chỉ đọc trong `lib/env.ts`.

| Biến | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `MISA_APP_ID` | ✅ | App ID do MISA cấp cho ứng dụng đối tác. |
| `MISA_API_URL` | ⛔️ (mặc định `https://actapp.misa.vn`) | Base URL của ACT Open API. |
| `MISA_ACCESS_CODE` | ✅ (cho sync) | Access code do MISA cấp; dùng để lấy token tự động. |
| `MISA_ORG_COMPANY_CODE` | ✅ (cho sync) | Mã công ty/tenant. |
| `CRON_SECRET` | ✅ khi bật cron | Chuỗi bí mật bảo vệ endpoint cron. |

Xem `.env.example` để copy sang `.env.local`.

---

## 2. Luồng token

`lib/misa/client.ts` (server-only) tự quản token — **không** dùng biến toàn cục
(Vercel serverless không giữ state giữa các lần gọi):

- `getAccessToken()` đọc dòng token trong bảng `misa_token` (theo
  `MISA_ORG_COMPANY_CODE`, qua service-role). Nếu còn hạn (trừ margin 5 phút) thì
  dùng lại; nếu hết/thiếu thì gọi `connect()` rồi **upsert** token + `expired_at`
  vào DB.
- `connect()` POST `/api/oauth/actopen/connect` với `app_id/access_code/org_company_code`
  từ env, bóc envelope `{ Success, Data }` (Data là JSON dạng chuỗi).
- `misaFetch()` chèn `app_id`, gắn header `X-MISA-AccessToken`, có **timeout**
  (AbortController, mặc định 30s) và **retry backoff** khi lỗi mạng/5xx; gặp 401
  thì refresh token một lần rồi thử lại.
- `paginate()` lặp `skip/take` (take ≤ 100) đến khi trang ngắn hơn `take`.

Token **không bao giờ** được ghi log.

---

## 3. Chạy sync

Các loại dữ liệu: `customers`, `products`, `stocks`, `inventory_balance`. Sync
theo **từng loại** (mỗi loại có watermark riêng trong `misa_sync_state`), upsert
theo `misa_id` nên chạy lại không tạo trùng.

### Thủ công (UI)
Trang `/admin/misa` (chỉ admin/manager) hiển thị trạng thái đồng bộ từng loại
(lần cuối, số upsert/xoá, lỗi) và có nút **"Đồng bộ ngay"** cho từng loại hoặc
**"Đồng bộ tất cả"** (gọi server action `syncMisaNow`). Dữ liệu xem ở các tab
Khách hàng / Vật tư / Tồn kho. Trang test endpoint chuyển sang
`/admin/misa/playground` (chỉ admin).

### Qua API
`POST /api/misa/sync` — chỉ **admin/manager** (kiểm tra session). Body tùy chọn:

```json
{ "types": ["customers", "products"] }
```

Bỏ `types` để sync tất cả. Trả `{ ok, results: [{ type, status, upserted, deleted, error? }] }`
(HTTP 200 nếu tất cả thành công, 207 nếu có loại lỗi). Với dữ liệu lớn nên gọi
**từng loại một** để tránh vượt giới hạn thời gian hàm Vercel (`maxDuration = 60`).

### Vercel Cron (mặc định TẮT)
`GET /api/misa/sync` chạy sync tất cả loại, chỉ khi header
`Authorization: Bearer <CRON_SECRET>` khớp; thiếu/không set `CRON_SECRET` → 401
(nên mặc định tắt). Để bật, đặt `CRON_SECRET` và thêm vào `vercel.json`:

```json
{
  "crons": [{ "path": "/api/misa/sync", "schedule": "0 * * * *" }]
}
```

Vercel Cron tự gắn header `Authorization: Bearer <CRON_SECRET>` khi biến môi
trường `CRON_SECRET` được cấu hình trên project. Bắt đầu bằng lịch thưa (vd mỗi
giờ) rồi điều chỉnh.

---

## 4. Bắt dữ liệu thật để dựng type/fixture

`scripts/misa-test.ts` kết nối MISA, gọi từng endpoint đọc một lần, **che**
MST/SĐT/email/số tài khoản rồi ghi mẫu vào `lib/misa/__fixtures__/`. Script
**không** đụng tới DB.

```bash
# Node 22.18+/23+ chạy .ts trực tiếp (repo đang dùng Node 24):
node scripts/misa-test.ts
# Node cũ hơn: npx tsx scripts/misa-test.ts
```

Credential đọc từ `process.env`; nếu chưa có, script tự nạp `.env.local` (rồi
`.env`) ở thư mục gốc. Sau khi có fixture, tinh chỉnh type ở `lib/misa/types.ts`
và normalizer ở `lib/misa/normalize.ts` (Bước 4).

---

## 5. Thêm một loại dữ liệu mới

Ví dụ thêm "đơn vị tính" (`get_dictionary` data_type = 4). Các bước:

1. **Bắt dữ liệu thật:** thêm target vào `scripts/misa-test.ts`, chạy
   `node scripts/misa-test.ts`, kiểm fixture đã che ở `lib/misa/__fixtures__/`.
2. **data_type:** nếu là `get_dictionary`, thêm hằng vào `MISA_DATA_TYPE`
   (`lib/misa/types.ts`) — **map bằng dữ liệu thật**, đừng tin comment cũ
   (xem §6).
3. **Bảng + type:** thêm bảng `misa_<x>` vào một migration mới
   `supabase/migrations/00xx_*.sql` (giữ `misa_id` unique + `raw jsonb`, RLS
   SELECT cho content-manager, không policy write). Thêm type vào
   `lib/db/types.ts` và đăng ký trong `Database.Tables`.
4. **Normalizer + test:** thêm `normalize<X>` (pure) vào `lib/misa/normalize.ts`
   và ca test trong `normalize.test.ts` dựa trên fixture.
5. **Sync:** thêm nhánh vào `lib/misa/sync.ts` (`MisaSyncType`,
   `MISA_SYNC_TYPES`, handler upsert theo `misa_id` + soft-delete nếu có
   `get_dictionary_delete`).
6. **UI:** thêm nhãn vào `MisaSync.types` / `MisaData` (vi + en), một tab trong
   `misa-tabs.tsx` và trang `app/(app)/admin/misa/<x>/page.tsx` (copy mẫu từ
   `customers/page.tsx`).

`misa_sync_state` không cần seed: watermark khởi tạo `null` (lần đầu = full
sync), các lần sau tăng dần.

---

## 6. Bản đồ data_type (đã verify bằng dữ liệu thật)

Comment trong `lib/misa/endpoints.ts` **không chính xác** cho tenant hiện tại.
Mapping thật (probe bằng `scripts/misa-test.ts`), nguồn chuẩn là hằng
`MISA_DATA_TYPE`:

| data_type | Thực thể | Field id chính |
| --- | --- | --- |
| 1 | Đối tượng (KH/NCC/NV) | `account_object_id` |
| 2 | Vật tư hàng hoá | `inventory_item_id` |
| 3 | Kho | `stock_id` |
| 4 | Đơn vị tính | `unit_id` |
| 5 | Tài khoản | `account_id` |
| 6 | Đơn vị tổ chức | `organization_unit_id` |
| 7 | Công việc (jobs) | `job_id` |
| 8 | Tài khoản ngân hàng | `bank_account_id` |
| 9 | Khoản mục chi phí | `expense_item_id` |
| 10 | Công trình/dự án | `project_work_id` |

Lưu ý: field `dictionary_type` trong response **không** trùng với `data_type`
gửi đi — luôn dựa vào `data_type` request và tên field để xác định thực thể.

---

## 7. Áp dụng migration & pha sau

- **Migration:** trước khi sync/UI chạy thật, apply
  `supabase/migrations/0024_misa_master_data.sql` bằng `supabase db push`
  (hoặc `supabase db reset` ở local). Bảng `misa_token` chỉ service-role chạm
  được; các bảng còn lại content-manager được SELECT.
- **Pha sau (chưa làm):** chứng từ **bán hàng** và **xuất/nhập kho** (kèm dòng
  chi tiết). Chúng không có GET phân trang trực tiếp mà đi qua luồng async
  `request_data` → `get_call_back_detail_error`; cần bắt response thật trước rồi
  thêm bảng `misa_sales_vouchers` / `misa_stock_vouchers` (+ `*_lines`) theo
  quy trình §5. Xoá của tồn kho (`get_list_inventory_balance_delete`) cũng để
  lại pha sau (chưa rõ shape).
