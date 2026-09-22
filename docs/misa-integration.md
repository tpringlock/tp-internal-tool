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

<!-- TODO (Bước 3): mô tả getAccessToken() — đọc bảng misa_token, kiểm tra hạn,
     refresh bằng connect() khi hết hạn, lưu lại DB. Không log token. -->

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

<!-- TODO (Bước 3): npx tsx --env-file=.env scripts/misa-test.ts — che MST/SĐT,
     ghi fixture vào lib/misa/__fixtures__/. -->

---

## 5. Thêm một loại dữ liệu mới

<!-- TODO (Bước 9): endpoint -> type -> normalizer + test -> bảng/migration ->
     hàm sync -> key sync_state -> trang UI. -->
