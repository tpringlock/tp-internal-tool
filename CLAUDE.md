@AGENTS.md

# TP Internal Tool — hướng dẫn cho Claude Code

Portal nội bộ của Ringlock TP (ringlocktp.vn). Một app Next.js duy nhất, gồm 4 module:

| Module                | Route        | Ai vào được                                            |
| --------------------- | ------------ | ------------------------------------------------------ |
| Quản lí tài liệu      | `/documents` | mọi người (employee chỉ thấy dự án mình là thành viên) |
| TP Academy            | `/academy`   | mọi người                                              |
| Tính hóa đơn tự động  | `/billing`   | admin + accountant (trang `/billing/compare`: chỉ admin) |
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
  - `billing/layout.tsx`: guard `requireBillingUser()` + `BillingNav`. Chi tiết module ở `docs/billing-module.md`, quy tắc nghiệp vụ ở `docs/billing-rules.md`.
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
- `profiles.role`: `employee` | `manager` | `accountant` | `admin`. Role ban đầu lấy từ `app_metadata` (xem migration 0023). `accountant` (kế toán, 0026) chỉ mở thêm `/billing`, không vào Admin Panel; mỗi người chỉ có 1 role.
- Academy: `courses` → `chapters` → `lessons` (+ quiz, notes, files, progress).
- `misa_*`: cache dữ liệu từ MISA AMIS (read-only), xem `docs/misa-integration.md`.
- Billing: `billing_contracts` (1 hợp đồng = 1 kho MISA) → `billing_contract_items` (đơn giá/ngày, mã MISA gộp), `billing_excluded_codes`, `billing_excluded_ranges`, `billing_misa_uploads` (file ở bucket private `billing`), `billing_rent_calculations` (nháp → xác nhận → hủy; `total_amount numeric(20,4)`). RLS: `private.is_billing_user()`.
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
