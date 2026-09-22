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

### Thủ công (UI)
<!-- TODO (Bước 7): nút "Đồng bộ ngay" trên /admin/misa. -->

### Qua API
<!-- TODO (Bước 6): POST /api/misa/sync với body { types?: string[] }. -->

### Vercel Cron (mặc định TẮT)
<!-- TODO (Bước 6/9): snippet vercel.json + header Authorization: Bearer CRON_SECRET. -->

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
