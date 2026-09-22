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
<!-- TODO (Bước 7): nút "Đồng bộ ngay" trên /admin/misa. -->

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

<!-- TODO (Bước 9): endpoint -> type -> normalizer + test -> bảng/migration ->
     hàm sync -> key sync_state -> trang UI. -->
