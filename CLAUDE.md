@AGENTS.md

# TP Internal Tool — hướng dẫn cho Claude Code

Portal nội bộ của Ringlock TP (ringlocktp.vn). Một app Next.js duy nhất, gồm 4 module:

| Module                | Route        | Ai vào được                                            |
| --------------------- | ------------ | ------------------------------------------------------ |
| Quản lí tài liệu      | `/documents` | mọi người (employee chỉ thấy dự án mình là thành viên) |
| TP Academy            | `/academy`   | mọi người                                              |
| Tính hóa đơn tự động  | `/billing`   | admin + accountant; billing_viewer chỉ xem và tải HSTT (trang `/billing/compare`: chỉ admin) |
| Admin Panel           | `/admin/*`   | admin + manager (users, activity, docs: chỉ admin)     |

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, lucide-react.
- Supabase: Postgres + Auth + Storage, gọi bằng `@supabase/ssr` / `supabase-js`. **Không dùng Prisma.**
- next-intl (hiện chỉ bật locale `vi`, nhưng `messages/en.json` vẫn phải giữ đồng bộ).
- zod + react-hook-form, vitest.
- UI kit tự viết trong `components/ui/`. **Không dùng shadcn/Radix**, đừng cài thêm thư viện UI.
- Next 16 có thay đổi lớn: `middleware.ts` đổi thành `proxy.ts`, `params`/`searchParams` là Promise. Khi không chắc API, đọc `node_modules/next/dist/docs/` trước khi viết (xem AGENTS.md).

## Lệnh

```bash
npm run dev          # dev server
npx tsc --noEmit     # typecheck (lỗi "LayoutProps" tự hết sau khi chạy dev/build 1 lần)
npm run lint         # ESLint
npm test             # vitest
npm run build        # build production
```

Trước khi báo xong việc: chạy `npx tsc --noEmit`, `npm run lint`, `npm test`. Việc lớn thì chạy thêm `npm run build`.
Lint hiện có sẵn 6 lỗi cũ (`react-hooks/set-state-in-effect` ở admin/clients, delete-\*-button; "Cannot create components during render" ở academy/my-courses). Đó là nợ cũ, chỉ được phép không thêm lỗi mới.

## Cấu trúc

- `app/(app)/`: các trang cần đăng nhập. `layout.tsx` render `TopNav` (logo + `ModuleSwitcher` + `UserMenu`) và `AppMain`.
  - `AppMain` (`components/app-main.tsx`): `/documents/*` full-width, không breadcrumb. Các module khác nằm trong container `max-w-6xl` và có `PageHeader` (breadcrumb).
  - `documents/layout.tsx`: sidebar khách hàng (`client-sidebar.tsx`). `documents/document-table.tsx` là bảng hồ sơ dùng chung.
  - `admin/layout.tsx`: guard `requireContentManager()` + `AdminNav`.
  - `billing/layout.tsx`: guard `requireBillingViewer()` + `BillingNav`. Trang billing dùng `requireBillingViewer()` và ẩn nút sửa theo `canEditBilling()`; mọi action ghi dùng `requireBillingUser()` (admin + kế toán), `lib/auth/billing-guards.test.ts` kiểm tra điều này. Chi tiết module ở `docs/billing-module.md`, quy tắc nghiệp vụ ở `docs/billing-rules.md`.
- `app/(auth)/`: login, quên mật khẩu, đặt lại mật khẩu.
- `app/actions/*.ts`: server actions (mỗi domain 1 file). `app/api/*`: route handlers (tải file, stream video, share link, MISA sync).
- `lib/auth/dal.ts`: `getSessionUser`, `requireUser`, `requireContentManager`, `requireBillingUser`, `requireAdmin` (server-only). `lib/auth/roles.ts`: `canManageContent`, `canUseBilling` (client-safe).
- `lib/app-modules.ts`: danh sách module cho switcher. Thêm module mới thì sửa ở đây và thêm key `AppModules.<id>` trong messages.
- `lib/db/types.ts`: kiểu DB viết tay, **phải cập nhật cùng lúc với migration**. (`types.generated.ts` là file cũ, mã hóa UTF-16, không dùng.)
- `supabase/migrations/NNNN_*.sql`: schema + RLS, đánh số tăng dần. `supabase/revert/`: file revert viết tay (không phải migration, không để `db push` chạy).
- `lib/billing/`: module tính tiền thuê (engine, parser MISA, xuất Excel) + helper của app. **Không sửa logic `engine.ts`, `misa-parser.ts`, `dates.ts`, `merge-ledgers.ts` khi chưa hỏi chủ dự án.**

## Mô hình dữ liệu

- `clients` (khách hàng, = "công ty" trên UI) → `projects` (dự án, = "thư mục") → `documents` (PDF đã ký).
- `project_members`: employee chỉ thấy dự án/tài liệu của dự án mình là thành viên. RLS `project_members` chỉ cho admin đọc toàn bộ.
- `profiles.role`: `employee` | `manager` | `accountant` | `billing_viewer` | `admin`. `billing_viewer` ("Chỉ xem", 0033/0034) xem được toàn bộ `/billing`, tải file và xuất Excel, không sửa gì; ngoài billing như employee. Role ban đầu lấy từ `app_metadata` (xem migration 0023). `accountant` (kế toán, 0026) chỉ mở thêm `/billing`, không vào Admin Panel; mỗi người chỉ có 1 role.
- Academy: `courses` → `chapters` → `lessons` (+ quiz, notes, files, progress).
- `misa_*`: cache dữ liệu từ MISA AMIS (read-only), xem `docs/misa-integration.md`.
- Billing: `billing_contracts` (1 hợp đồng = 1 kho MISA) → `billing_price_lines` (0036: 1 dòng = 1 mã VT; `ten_vt`/`dvt` theo MISA, `print_name`/`print_dvt` ghi đè khi in HSTT, đơn giá 0 = không tính tiền; gộp thành `ContractConfig` bằng `lib/billing/price-lines.ts`), `billing_price_imports` (nhật ký nhập Excel), `billing_excluded_ranges`, `billing_misa_uploads` (file ở bucket private `billing`) + `billing_misa_month_files` (0035: file theo tháng, phiên bản, 1 bản đang dùng/tháng), `billing_rent_calculations` (nháp → xác nhận → hủy; `total_amount numeric(20,4)`). `billing_contract_items` / `billing_excluded_codes` đã **khóa ghi** từ 0037, chỉ giữ để quay lại. RLS: đọc `private.is_billing_viewer()`, ghi `private.is_billing_user()`.
- HSTT (0038): `company_profile` (Bên B, 1 dòng id=1, chỉ admin sửa), `billing_customers` (Bên A), `billing_contract_hstt` (1:1 hợp đồng: Bên A, loại/ngày ký, dự án, câu Căn cứ, VAT, `opening_debt` + `opening_debt_month`), `billing_transport_prices`, `billing_contract_advances`, `billing_period_inputs` + `billing_period_transport` + `billing_period_deductions` (dữ liệu kỳ theo hợp đồng + `period_from`). Tiền là `bigint` (VND nguyên).
- **Dữ liệu giả định** (`is_demo = true`, tên "[GIẢ ĐỊNH] ", đơn giá Excel, chỉ để đối chiếu): ẩn trừ khi bật công tắc, không bao giờ xác nhận được. Seed/xóa: `npm run seed:gia-dinh -- --project=<ref>` / `npm run seed:gia-dinh:xoa -- --project=<ref>`. Kiểm tra hợp đồng thật trước/sau: `supabase/revert/check-real-contracts.sql`.

## Quy tắc bắt buộc

### Bảo mật và phân quyền

- **Mọi server action / route handler đều phải gọi guard ở dòng đầu**: `requireUser`, `requireContentManager`, `requireBillingUser` hoặc `requireAdmin`. Ẩn nút trên UI không phải là phân quyền.
- Truy vấn dữ liệu bằng `createClient()` từ `lib/supabase/server.ts` để RLS được áp dụng.
- `createAdminClient()` (service role, bỏ qua RLS) chỉ dùng **sau khi đã kiểm tra quyền**, và chỉ cho Storage, tạo user Auth, hoặc log truy cập share link.
- Xóa client/project/document chỉ admin được làm. Manager được tạo/sửa client, project và nội dung academy.
- Khi thêm bảng mới: viết migration mới kèm RLS (bật RLS + policy dùng `private.is_admin()`, `private.is_content_manager()`, `private.is_project_member()`).
- **Không bao giờ sửa migration đã có**. Luôn tạo file mới với số tiếp theo.
- Không đọc, in ra hay commit `.env*` (trừ `.env.example`).
- ⚠ `.env.local` đang trỏ tới **PRODUCTION** (`surnokungqebqzzlyrsz`), không có database dev riêng. `npm run dev`, script seed và `supabase db query --linked` đều chạm dữ liệu thật: hỏi trước khi ghi.
- `supabase/revert/0032_billing_demo_and_decimal.revert.sql` chỉ để dự phòng. Dọn dữ liệu giả định thì chỉ dùng `seed:gia-dinh:xoa`, **không** chạy file revert (code cần schema 0032).

### Server actions

- Validate input bằng zod (`lib/validation.ts`), trả về `FormState` (`{ error?, success?, fieldErrors? }` từ `app/actions/auth.ts`).
- Ghi log bằng `logActivity(supabase, { action: "<entity>.<verb>", ... })`.
- Sau khi thay đổi dữ liệu tài liệu, dự án hoặc khách hàng: gọi `revalidatePath("/documents", "layout")` (sidebar và số đếm nằm trong layout), cùng với các path admin liên quan.
- Khi xóa: `.delete().select(...)` để biết RLS có lọc mất dòng nào không.

### UI

- Label và text hiển thị đều qua next-intl (`useTranslations` / `getTranslations`). Thêm key vào **cả** `messages/vi.json` **và** `messages/en.json`.
- Màu chính: `text-primary` / `bg-primary` / `hover:bg-primary-hover` (#0b76ba, trùng màu logo). Nền `bg-background`.
- Dùng `cn()` từ `lib/utils.ts`. Icon dùng lucide-react.
- Dropdown dùng `components/ui/dropdown-menu.tsx`, modal dùng `components/ui/dialog.tsx`, toast dùng `components/ui/toast.tsx`.
- Bảng: class `responsive-table` + `data-label` trên mỗi `td` để tự thành card trên mobile. Ô hành động không có `data-label`.
- Header sticky cao 64px: phần tử sticky bên dưới dùng `top-16` hoặc `top-24`.
- Mobile-first: không được có cuộn ngang ở 375px. Sidebar chuyển thành drawer dưới `lg` (AdminNav dưới `md`).
- Ngày giờ dùng `formatDate` / `formatDateTime` / `formatBytes` / `formatVND` trong `lib/format.ts` (đã cố định timezone ICT để tránh hydration mismatch). Số lượng/đơn giá/tiền của billing dùng `formatNumber` (kiểu Việt Nam, chỉ hiện phần lẻ khi có).
- Text trong messages đi qua ICU (next-intl): không viết `<<…>>` hay `<` trần (bị hiểu là thẻ). `lib/messages.test.ts` kiểm tra vi/en đồng bộ key và parse được.
- Theo quy tắc React 19 / eslint: không `setState` đồng bộ trong `useEffect`. Nếu cần reset state khi prop hoặc pathname đổi thì so sánh ngay trong lúc render.

### Code style

- File dùng line ending **CRLF**, giữ nguyên, đừng chuyển sang LF.
- Comment trong code viết tiếng Anh, text UI viết tiếng Việt.
- Ưu tiên Server Components. Chỉ dùng `"use client"` khi cần state, event hoặc hook trình duyệt.
- Thêm test vitest cho logic thuần mới (đặt `*.test.ts` cạnh file).

## Lưu ý đã biết

- Supabase giới hạn mặc định 1000 dòng mỗi query. Số đếm hồ sơ ở `documents/layout.tsx` và trang khách hàng đang tính bằng cách tải hết các dòng, nên sẽ sai khi vượt 1000 (nên chuyển sang RPC đếm).
- `package-lock.json` từng lệch với `package.json`. Nếu `npm ci` lỗi thì chạy `npm install` rồi commit file lock.

## Cách làm việc

- Việc lớn (nhiều file, đụng DB/RLS): lên kế hoạch trước, liệt kê file sẽ sửa và migration cần có, chờ duyệt rồi mới code.
- Không tự `git push`, không chạy `supabase db push` lên project thật. Migration để người dùng tự apply.
- Cuối việc: tóm tắt file đã sửa, những chỗ kiểm tra quyền đã thêm, và các lệnh kiểm tra đã chạy.

## Billing – quy tắc bắt buộc

- ⚠ `.env.local` trỏ tới **PRODUCTION** (`surnokungqebqzzlyrsz`). Không có môi trường dev. `npm run dev`, mọi script và `supabase db query --linked` đều chạm dữ liệu thật: **mọi lệnh ghi lên DB phải hỏi trước** (đọc thì được).
- Migration:
  - gửi SQL cho chủ dự án duyệt trước;
  - backup (`supabase/revert/backup-billing.sql`, `backup-billing-gd1.sql`, `backup-billing-hstt.sql` (HSTT 0038 + mẫu kỳ 0040, có dữ liệu thật Bên A/B, dữ liệu kỳ)) và `check-real-contracts.sql` (so MD5) **trước và sau** khi apply. Cả 3 file backup chỉ đọc; output để ở `C:\Users\Admin\tp-backups\`, không để trong repo;
  - `npx supabase db push` do chủ dự án tự chạy; `--dry-run` phải chỉ liệt kê đúng file mới.
- Không sửa 4 file lõi: `lib/billing/engine.ts`, `misa-parser.ts`, `dates.ts`, `merge-ledgers.ts`.
- Không chạy `supabase/revert/0032_billing_demo_and_decimal.revert.sql`. Dọn dữ liệu giả định chỉ bằng `npm run seed:gia-dinh:xoa -- --project=surnokungqebqzzlyrsz`.
- Không sửa giá hợp đồng Việt Panel thật (`vietpanel-senci`, kho `VIETPANEL-01`). Số chuẩn: kỳ 08/2026 (26/07→25/08) = **806.342.923đ** (tiền thiết bị); HSTT kỳ 09/2026 sau thuế = **800.796.900đ** (thiết bị 656.478.611, khớp bản làm tay). Sau mọi thay đổi đụng giá/tính tiền: `npx tsx scripts/billing-verify-recalc.mts --project=surnokungqebqzzlyrsz` phải ra **0 khác biệt**.
- Không tự `git push`. Dữ liệu tạo khi test đặt tiền tố **"TEST"** và liệt kê lại để xóa.
- **Mốc `check-real-contracts.sql`** (từ 03/10/2026, sau khi chủ dự án xóa hợp đồng test `dungtest`; còn 1 hợp đồng thật Việt Panel): `contracts_md5` = `0390eeadc39371b91175ee1d91438e5a`, `items_md5` = `847f33c34875e21e4b8e41b2e8839264`, `excluded_md5` = `9b5309eb401e895b097cd9b983e6ffff`. Trước/sau mỗi migration phải ra đúng mốc này (trừ khi chủ dự án chủ động sửa hợp đồng thật).

### Trạng thái: GĐ1 (nền dữ liệu) đã xong

Migration 0033–0037 đã apply trên production (0037 = cutover, bảng giá cũ khóa ghi). Kế hoạch: `docs/ke-hoach-feedback-tp-2026-10.md`; triển khai/quay lại: `docs/billing-gd1-trien-khai.md`. Code GĐ1 nằm ở nhánh `feature/billing-gd1` (merge vào `main` để deploy).

- **Vai trò:** `billing_viewer` ("Chỉ xem"). `canViewBilling` / `canEditBilling` (`lib/auth/roles.ts`); `requireBillingViewer` (trang, route tải) / `requireBillingUser` (mọi action ghi) (`lib/auth/dal.ts`); RLS `private.is_billing_viewer()` / `is_billing_user()`; `lib/auth/billing-guards.test.ts`.
- **File nguồn theo tháng:**
  - Bảng `billing_misa_month_files` (tháng, phiên bản, 1 bản `active`/tháng, `catalog` MISA), RPC `billing_add_month_file`.
  - `lib/billing/month-files.ts` (`checkMonthFile`, `pickMonthFiles`, `planMonthUpload`, `uploadsForPicker`), `month-files-server.ts`, `misa-catalog.ts`, `misa-title.ts`.
  - Actions `app/actions/billing-files.ts`; trang `/billing/uploads`; route tải `/api/billing/uploads/[id]`.
- **Bảng giá phẳng:**
  - Bảng `billing_price_lines` (1 dòng = kho + mã VT; `ten_vt`/`dvt` theo MISA, `print_name`/`print_dvt` ghi đè khi in HSTT, giá 0 = không tính tiền) và `billing_price_imports` (nhật ký). RPC `billing_save_price_lines`, `billing_import_price_lines`.
  - Gộp thành `ContractConfig`: `lib/billing/price-lines.ts` (`toContractConfigFromLines`, `groupPriceLines`), dùng trong `loadContract` (`lib/billing/server.ts`).
  - Nhập/xuất Excel: `price-import.ts` (cột vắng = giữ, ô trống = xóa), `price-export.ts`, `price-sheet.ts` (bố cục cột), `price-template.ts` + `scripts/make-price-template.mts` (sinh `docs/mau-nhap-don-gia.xlsx`), `price-table.ts`.
  - Actions `app/actions/billing-prices.ts`; trang `/billing/prices`, `/billing/prices/import`; editor `billing/contracts/price-lines-editor.tsx`.
- **Ô chọn có tìm kiếm:** `components/ui/combobox.tsx` + `lib/search.ts`.
- **Kiểm tra/quay lại:** `scripts/billing-verify-recalc.mts`; `supabase/revert/check-price-lines-migration.sql`, `check-month-files.sql`, `list-month-files.sql`, các file `003x_*.revert.sql`.
- **GĐ2 (nhánh `feature/billing-gd2`):** Phần A xong ở code: màn tính tiền tự lấy file tháng (`computeRent` → `loadActiveMonthUploads` + `pickMonthFiles`), mẫu kỳ (`lib/billing/period-presets.ts`, migration 0040 `billing_period_presets` + `billing_contract_period_presets`, trang `/billing/periods`, actions `app/actions/billing-periods.ts`). Chỉ xác nhận được khi khoảng ngày trùng đúng kỳ hợp đồng. Phần B xong ở code: báo cáo tiền thuê nhiều dự án `/billing/reports` (chỉ đọc; `lib/billing/rent-report*.ts`, action `billing-reports.ts`, route `/api/billing/reports/xlsx`, `components/ui/multi-select.tsx`). Phần C xong ở code: trung tâm cảnh báo `/billing/alerts` (chỉ đọc; `lib/billing/alerts.ts`, `alert-list.ts`, `alerts-server.ts`, `alerts-export.ts`; kho công ty chỉ theo danh sách `lib/billing/company-warehouses.ts`). Việc còn nợ GĐ2: nhóm dự án đã lưu (cần bảng DB).

### Trạng thái: GĐ3 (HSTT 4 biểu) đã xong

Migration 0038 (bảng HSTT, chỉ thêm) + 0039 (seed TP + Việt Panel) đã apply. Code ở nhánh `feature/billing-hstt` (merge vào `main` để deploy). Kế hoạch, khảo sát, "Đã biết", "Việc còn nợ": `docs/hstt/hstt-export-plan.md`; tổng quan: `docs/billing-module.md` phần HSTT.

- **Luồng:** tính (kỳ 26→25) → **Dữ liệu kỳ** trên trang bản tính (vận chuyển G/F/tính ngay–cuối kỳ, giảm trừ sau thuế, đã thanh toán, nợ đầu kỳ tự tính hoặc ghi đè) → xác nhận → **Tải HSTT** (`/api/billing/calculations/[id]/hstt`; Chỉ xem tải được).
- **Khóa:** kỳ đã có bản tính xác nhận thì `savePeriodInputs` từ chối (`periodEditBlock`, `lib/billing/hstt-lock.test.ts`); muốn sửa phải hủy xác nhận (admin).
- **Nợ đầu kỳ:** tháng ≤ `opening_debt_month` = tháng làm tay: bỏ qua bản tính của chúng, không tải HSTT. Kỳ đầu sau đó lấy `opening_debt`, các kỳ sau lấy nợ cuối kỳ trước đã xác nhận (`openingDebtFor` trong `hstt-totals.ts`, `openingDebtInfo` trong `hstt-data.ts`).
- **Code:** `lib/billing/number-to-words.ts`, `hstt-totals.ts`, `hstt-data.ts`, `hstt-server.ts`, `hstt-export.ts` (điền `docs/hstt/hstt-template.xlsx`, file mẫu vào bundle qua `outputFileTracingIncludes` trong `next.config.ts`), `hstt-text.ts`; actions `app/actions/billing-hstt.ts`; trang `/admin/company`, `/billing/customers`, tab HSTT ở `/billing/contracts/[id]?tab=hstt`, khối dữ liệu kỳ `billing/calculations/[id]/period-inputs-form.tsx`.
- **Golden:** `hstt-export.test.ts` so từng ô với khối T08 của `docs/hstt/hstt-t08-2026-vietpanel.xlsx`. Sửa file mẫu thì chạy lại test này.
- **Việc còn nợ:** migration số trống tiếp theo (0040 đã dùng cho mẫu kỳ GĐ2) – lưu dữ liệu kỳ trong 1 transaction (RPC) + trigger khóa kỳ đã xác nhận ở DB (hiện chỉ khóa ở server action, các lệnh ghi chạy nối tiếp). Gửi SQL duyệt trước. Xuất file cộng dồn nhiều tháng: để sau.
