# Báo cáo audit UX & Performance — TP Internal Tool

Ngày: 17/11/2026. Nhánh `main`, commit `b05637f`. Giai đoạn này chỉ audit, không sửa file source nào.

**Cách đo**

- Bản build production chạy local (`npm run build && npm run start`, `localhost:3000`), `.env.local` trỏ Supabase production, tài khoản test quyền **admin**.
- Playwright (Chrome 157) đi 45 route × 3 viewport (375 / 768 / 1440), axe-core trên từng route, Lighthouse 13 cho 12 trang chính (mobile + desktop).
- Ảnh chụp: `audit-screenshots/` (192 ảnh; `pages/` và `public/` là ảnh toàn trang theo `<route>-<viewport>.png`, `flow-*/` là ảnh theo kịch bản).
- Bài test ghi dữ liệu dùng tiền tố "TEST AUDIT" và đã xóa lại qua UI (xem Phụ lục A).

**Giới hạn của số đo** (đọc trước khi dùng các con số)

- Đo trên localhost nên không có độ trễ mạng tới Vercel/CDN; TTFB ở đây chủ yếu là thời gian server gọi Supabase từ máy này. Số trên production thật sẽ khác.
- INP không đo trực tiếp được trong lab; dùng TBT của Lighthouse và long task khi tương tác làm chỉ báo thay thế.
- Chỉ test vai trò admin. Giao diện của employee / manager / accountant / billing_viewer chưa được kiểm trên trình duyệt.
- Các thao tác ghi của billing (tính tiền, lưu bảng giá, dữ liệu kỳ, xác nhận) **chưa kiểm chứng trên trình duyệt**, chỉ đọc code.

---

## 1. Tóm tắt điều hành

| Mảng | Điểm | Nhận xét ngắn |
| --- | --- | --- |
| Performance | **9/10** | Lighthouse 95–100 gần như mọi trang, CLS ≈ 0, không long task, truy vấn đã song song hóa, RLS và index đã tối ưu. Trừ điểm vì ảnh thumbnail academy và JS nền ~190KB gzip. |
| UI & thị giác | **7.5/10** | Nhất quán, không tràn ngang ở cả 3 viewport, không màu hardcode. Trừ điểm vì chữ xám nhạt không đạt tương phản, ngày giờ lẫn tiếng Anh, vùng chạm nhỏ trên mobile. |
| UX States | **6.5/10** | Có skeleton, nút pending, chống double-submit, trang lỗi/404 riêng, modal xác nhận xóa. Trừ điểm nặng vì form mất dữ liệu khi báo lỗi, mất mạng làm sập cả trang, xóa xong không có phản hồi. |
| Accessibility | **6/10** | Dùng được bằng bàn phím, có focus ring, dropdown chuẩn. Nhưng modal không quản lý focus, lỗi form không gắn với field, nhiều `select`/`input` thiếu nhãn. |

**Top 5 cần sửa ngay**

1. 🟠 **Form xóa sạch dữ liệu đã nhập khi validation báo lỗi** (V-01). Người dùng nhập 4 ô, sai 1 ô, phải nhập lại cả 4; ở form upload còn mất cả file đã chọn.
2. 🟠 **Mất mạng lúc bấm lưu làm cả trang chuyển sang màn hình "Đã xảy ra lỗi"** (V-02), dữ liệu đang nhập mất hết.
3. 🟠 **Modal không quản lý focus** (V-03): mở ra focus vẫn nằm ở nền, Tab đi ra ngoài modal, đóng lại không trả focus. Ảnh hưởng mọi dialog, kể cả dialog xác nhận xóa.
4. 🟠 **Xóa xong không có thông báo thành công** (V-04) ở cả 3 chỗ đã thử (tài liệu, dự án, khách hàng).
5. 🟠 **Chữ xám nhạt `text-slate-400` tương phản 2.63:1** (V-05, chuẩn AA là 4.5:1) và **nhiều field thiếu nhãn** (V-06).

Không tìm thấy vấn đề 🔴 P0 (chặn người dùng hoặc mất dữ liệu đã lưu).

---

## 2. Core Web Vitals + Lighthouse

Lighthouse 13, build production, localhost. Mobile = giả lập 4G chậm + CPU 4x; desktop = không giới hạn. Thời gian tính bằng ms.

| Trang | Thiết bị | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS | TTFB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/login` | mobile | 100 | 100 | 96 | 92 | 758 | 758 | 0 | 0 | 4 |
| `/login` | desktop | 100 | 100 | 96 | 92 | 169 | 169 | 0 | 0 | 4 |
| `/documents` | mobile | 100 | 96 | 100 | 92 | 752 | 1503 | 0 | 0 | 223 |
| `/documents` | desktop | 100 | 96 | 100 | 92 | 203 | 307 | 0 | 0 | 184 |
| `/documents/list` | mobile | 100 | **87** | 100 | 92 | 751 | 1061 | 14 | 0 | 164 |
| `/documents/list` | desktop | 100 | 91 | 100 | 92 | 203 | 291 | 0 | 0 | 152 |
| `/documents/[id]` | mobile | 100 | 91 | 100 | 92 | 750 | 1061 | 13 | 0.053 | 156 |
| `/documents/[id]` | desktop | 95 | 92 | 100 | 92 | 203 | 291 | 0 | **0.141** | 165 |
| `/academy` | mobile | **89** | 94 | 100 | 92 | 751 | **3751** | 0 | 0 | 150 |
| `/academy` | desktop | 100 | 94 | 100 | 92 | 203 | 347 | 0 | 0 | 160 |
| `/academy/[c]/[lesson]` | mobile | 100 | 96 | 100 | 92 | 750 | 1211 | 10 | 0 | 156 |
| `/academy/[c]/[lesson]` | desktop | 100 | 96 | 100 | 92 | 203 | 331 | 0 | 0 | 151 |
| `/billing` | mobile | 100 | 97 | 100 | 92 | 751 | 1286 | 27 | 0 | 147 |
| `/billing` | desktop | 100 | 97 | 100 | 92 | 203 | 402 | 0 | 0 | 154 |
| `/billing/contracts/[id]` | mobile | 100 | 97 | 100 | 92 | 751 | 1211 | 6 | 0 | 348 |
| `/billing/contracts/[id]` | desktop | 100 | 97 | 100 | 92 | 204 | 420 | 0 | 0 | 447 |
| `/billing/calculations/[id]` | mobile | 100 | 97 | 100 | 92 | 901 | 1436 | 0 | 0 | 223 |
| `/billing/calculations/[id]` | desktop | 100 | 97 | 100 | 92 | 245 | 461 | 0 | 0 | 110 |
| `/billing/prices` | mobile | 100 | 96 | 100 | 92 | 750 | 1211 | 5 | 0 | 89 |
| `/billing/prices` | desktop | 100 | 96 | 100 | 92 | 204 | 295 | 0 | 0 | 142 |
| `/billing/reports` | mobile | 100 | 97 | 100 | 92 | 751 | 1061 | 8 | 0 | 91 |
| `/billing/reports` | desktop | 100 | 96 | 100 | 92 | 204 | 292 | 0 | 0 | 80 |
| `/admin/users` | mobile | 100 | 92 | 100 | 92 | 750 | 1061 | 2 | 0 | 152 |
| `/admin/users` | desktop | 100 | 92 | 100 | 92 | 203 | 372 | 0 | 0 | 169 |

Hai chỗ vượt ngưỡng: LCP `/academy` trên mobile (3.75s, ngưỡng 2.5s) và CLS `/documents/[id]` trên desktop (0.141, ngưỡng 0.1).

**Kích thước JS** (`next build` của Next 16/Turbopack không in bảng First Load JS, nên đo bằng lượng JS trình duyệt thực tải):

| Route | JS gzip | JS chưa nén | Ghi chú |
| --- | --- | --- | --- |
| `/login` | 178 KB | 576 KB | nền chung: react-dom 229KB, runtime Next 133KB (chưa nén) |
| Các trang documents / academy / admin | 191–200 KB | 622–647 KB | |
| Các trang billing | 198–206 KB | 642–674 KB | ⚠ chạm ngưỡng 200KB |
| `/admin/academy/[id]` | **269 KB** | 914 KB | ⚠ thêm chunk supabase-js 275KB chưa nén (V-17) |

**Điều kiện xấu (Slow 3G + CPU 4x, mobile):** trang login tải xong sau 5.2s (hiện nội dung sau 1.7s); đăng nhập → chuyển trang 2.4s; chuyển trang trong app hiện skeleton trong vòng 300ms. Chuyển trang trong billing không throttle: URL đổi sau 30–45ms, nội dung xong sau 340–550ms.

**API chỉ đọc:** `/api/documents/search` 258ms, `/api/billing/prices/xlsx` 324ms, `/api/billing/calculations/[id]/xlsx` 285ms. Không có endpoint nào vượt 500ms trong các endpoint đã đo. Server action tạo khách hàng 520ms, upload PDF nhỏ 1047ms (mạng bị giới hạn).

**Console:** không có lỗi, không hydration mismatch, không key warning, không 404 asset trên 45 route.

---

## 3. Danh sách vấn đề

### 🟠 P1 — ảnh hưởng rõ trải nghiệm

#### V-01. Form mất toàn bộ dữ liệu đã nhập khi validation báo lỗi
- **Trang/flow:** mọi form dùng `<form action>` + `useActionState` với input không điều khiển (khách hàng, dự án, user, upload tài liệu, academy, khách hàng billing…).
- **Tái hiện:** `/admin/clients` → "Thêm khách hàng" → nhập Tên, Mã = `mã sai!`, MST, Địa chỉ → bấm lưu. Lỗi hiện dưới ô Mã nhưng cả 4 ô đều trống. Trường hợp mã trùng cũng vậy.
- Ở `/documents/upload`: quên tick "đã ký" → file đã chọn, loại tài liệu và ô chọn khách hàng/dự án đều bị xóa.
- **Bằng chứng:** `audit-screenshots/flow-write/client-create-invalid-code.png`, `flow-write/upload-unsigned-error.png`. Log: `retained name: "" code: "" address: ""`; upload: `file kept: 0 | client kept: false | doc_type: ""`. Code: `app/(app)/admin/clients/client-forms.tsx:35-58` (input không có `defaultValue`), `app/(app)/documents/upload/upload-form.tsx:187`.
- **Nguyên nhân:** React 19 tự reset form không điều khiển sau khi action chạy xong, kể cả khi action trả về lỗi.
- **Đề xuất:** action trả lại giá trị đã gửi khi lỗi, form dùng làm `defaultValue`:
  ```ts
  // action
  if (!parsed.success) return { fieldErrors, values: Object.fromEntries(formData) };
  // form
  <Input name="name" defaultValue={state.values?.name ?? ""} />
  ```
  Hoặc viết một hook dùng chung chặn reset (`onSubmit` → `preventDefault()` → `startTransition(() => action(new FormData(form)))`), cách này giữ được cả file đã chọn.
- **Công sức:** M (hook dùng chung + áp vào các form).

#### V-02. Mất mạng lúc gửi form làm cả trang thành màn hình lỗi
- **Trang/flow:** mọi server action. Đã thử ở `/login`.
- **Tái hiện:** nhập form → tắt mạng → bấm gửi. Toàn bộ trang bị thay bằng "Đã xảy ra lỗi… Thử lại / Về trang chủ". Có mạng lại trang vẫn ở màn hình lỗi, dữ liệu mất.
- **Bằng chứng:** `audit-screenshots/flow-auth/login-offline-submit-desktop.png`; console: `TypeError: Failed to fetch`.
- **Đề xuất:** bắt lỗi mạng trong cùng hook ở V-01 (`try/catch` quanh lời gọi action), hiện toast "Mất kết nối, vui lòng thử lại" và giữ nguyên form. Thêm lắng nghe `offline`/`online` để hiện băng báo mất mạng.
- **Công sức:** S nếu làm chung với V-01.

#### V-03. Modal không quản lý focus
- **Trang/flow:** mọi dialog (`components/ui/dialog.tsx`), gồm cả xác nhận xóa.
- **Tái hiện:** `/documents` → bấm "+" Thêm khách hàng. Focus vẫn ở nút "+" phía sau; bấm Tab 12 lần thì cả 12 lần focus nằm ngoài modal; Esc đóng được nhưng không trả focus về nút mở.
- **Bằng chứng:** log `focus right after open: button[Thêm khách hàng] inDialog=false`, `tab trap: OUT×12`; `audit-screenshots/flow-app/dialog-add-client-desktop.png`; code `components/ui/dialog.tsx:24-37` (chỉ xử lý Esc và khóa cuộn).
- **Đề xuất:** chuyển sang thẻ `<dialog>` gốc với `showModal()` (tự có focus trap, Esc, trả focus, nền `inert`), hoặc thêm vào component hiện tại: lưu `document.activeElement` khi mở, focus phần tử đầu tiên, bắt Tab/Shift+Tab ở hai đầu, trả focus khi đóng. Dialog xóa nên focus vào nút "Hủy".
- **Công sức:** S (sửa 1 component).

#### V-04. Xóa xong không có thông báo thành công
- **Trang/flow:** xóa tài liệu (`/documents`), xóa dự án (`/admin/projects`), xóa khách hàng (`/admin/clients/[id]`).
- **Tái hiện:** xóa một dòng → dialog đóng, dòng biến mất, không có toast (toast tồn tại 5 giây, kiểm tra ở giây 2.5 không thấy, cả 3 lần).
- **Bằng chứng:** `audit-screenshots/flow-write/delete-document-done.png`; log `delete doc: toasts []`. Code: `app/(app)/admin/projects/[id]/delete-document-button.tsx:38-43` gọi `toast()` trong `useEffect`, nhưng dòng chứa nút đã bị gỡ khỏi cây khi danh sách revalidate nên effect không chạy; với khách hàng thì action redirect nên state không bao giờ về (`client-forms.tsx:131-132` có ghi chú điều này).
- **Đề xuất:** với redirect, truyền thông báo qua query (`?deleted=<tên>`) hoặc cookie flash và hiện toast ở trang đích. Với xóa trong danh sách, đặt state xóa ở component cha không bị gỡ, hoặc gọi action trong `startTransition` rồi `toast()` ngay sau `await`.
- **Công sức:** S–M.

#### V-05. Chữ xám nhạt không đạt tương phản AA
- **Trang/flow:** 84/90 lượt trang được quét, 588 phần tử. Chủ yếu nhãn nhỏ viết hoa ("KHÁCH HÀNG", "DỮ LIỆU"), placeholder, chú thích.
- **Bằng chứng:** axe `color-contrast`: `#90a1b9` trên `#ffffff` = **2.63:1**, cỡ 12px (cần 4.5:1). `text-slate-400` xuất hiện 100 lần trong `app/` và `components/`. Ví dụ ảnh: `audit-screenshots/pages/documents-desktop.png` (nhãn "KHÁCH HÀNG" ở sidebar).
- **Đề xuất:** đổi chữ có nội dung từ `text-slate-400` sang `text-slate-500` (≈4.8:1) hoặc `text-slate-600`; chỉ giữ slate-400 cho icon trang trí.
- **Công sức:** S (tìm và thay có kiểm tra).

#### V-06. Field thiếu nhãn, lỗi không gắn với field
- **Trang/flow:** `/documents/list` (select dự án, loại), `/admin/activity`, `/documents/[id]` (select thời hạn chia sẻ), `/admin/projects/[id]`, `/admin/clients/[id]`, `/admin/academy/[id]`, `/profile`.
- **Bằng chứng:** axe `select-name` (critical, 14 phần tử) và `label` (critical, 26 phần tử). Ví dụ: `app/(app)/admin/clients/client-forms.tsx:82-90` dùng `<Field label>` nhưng không truyền `htmlFor` và input không có `id`. `components/ui/field.tsx` không đặt `aria-invalid` / `aria-describedby`; log: `aria-invalid on code: null | describedby: null`, sau khi lỗi focus nằm ở `BODY`.
- **Đề xuất:** cho `Field` tự sinh `id` bằng `useId()` và gắn vào input con (`htmlFor`, `aria-invalid`, `aria-describedby` trỏ tới dòng lỗi); sau khi submit lỗi thì focus vào field lỗi đầu tiên.
- **Công sức:** S–M.

### 🟡 P2 — nên sửa

#### V-07. Đăng nhập xong mất query string của trang định vào
- **Tái hiện:** chưa đăng nhập, mở `/documents/list?q=hop-dong&type=contract` → bị chuyển tới `/login?q=hop-dong&type=contract&next=%2Fdocuments%2Flist` → đăng nhập xong về `/documents/list` (mất bộ lọc).
- **Bằng chứng:** `lib/supabase/proxy.ts:68` chỉ lưu `pathname`.
- **Đề xuất:** `url.search = ""; url.searchParams.set("next", pathname + request.nextUrl.search);` (hàm `safeInternalPath` hiện có vẫn chặn open redirect).
- **Công sức:** S.

#### V-08. Lỗi thô của Supabase/Postgres trả thẳng cho người dùng
- **Bằng chứng:** 44 chỗ `return { error: error.message }` trong `app/actions/` (academy 10, billing 6, billing-hstt 5, projects 5, billing-periods 4, clients 3…). Ví dụ `app/actions/clients.ts:47`. Chưa tái hiện được trên trình duyệt vì các lỗi thường gặp (trùng mã, FK) đã có thông báo riêng.
- **Đề xuất:** một hàm `toUserError(error, t)` ghi log lỗi gốc ở server và trả câu tiếng Việt chung kèm mã, dùng thay cho `error.message`.
- **Công sức:** M.

#### V-09. ID sai định dạng ở `/documents/clients/<id>` ra trang lỗi thay vì 404
- **Tái hiện:** mở `/documents/clients/khong-phai-uuid` → "Đã xảy ra lỗi, Mã lỗi: 3260753020". Các route khác (`/documents/<id>`, `/academy/<id>`, `/billing/contracts/<id>`…) đều ra "Không tìm thấy trang" đúng.
- **Bằng chứng:** `audit-screenshots/flow-errors/_documents_clients_khong_phai_uuid.png`; `lib/documents/counts.ts:50` (`throw error` khi RPC nhận uuid sai) chạy trước `notFound()` ở `app/(app)/documents/clients/[clientId]/page.tsx:125`.
- **Đề xuất:** kiểm tra định dạng uuid đầu trang rồi `notFound()`.
- **Công sức:** S.

#### V-10. Mọi trang chung một tiêu đề tab
- **Bằng chứng:** cả 51 trang đều có `<title>Internal Ringlock TP</title>`; chỉ có 1 `generateMetadata` ở `app/layout.tsx:18`. Mở nhiều tab không phân biệt được, lịch sử trình duyệt vô dụng.
- **Đề xuất:** `title: { template: "%s · Ringlock TP", default: … }` ở root layout, thêm `metadata.title` cho từng trang (trang chi tiết dùng tên hợp đồng/tài liệu).
- **Công sức:** S–M.

#### V-11. Ngày giờ hiện tháng tiếng Anh trong giao diện tiếng Việt
- **Bằng chứng:** "6 Oct 2026, 10:00", "17 Nov 2026, 00:50" ở `/billing`, `/documents/[id]` (`audit-screenshots/pages/billing-mobile.png`, `flow-write/upload-success.png`). `lib/format.ts:17` `DISPLAY_LOCALE = "en-GB"` với `month: "short"` (`lib/format.ts:37-46`).
- **Đề xuất:** `formatDateTime` dùng dạng số `dd/MM/yyyy HH:mm` (giữ `en-GB`, đổi `month: "2-digit"`) cho thống nhất với `formatDate`.
- **Công sức:** S (kiểm tra lại test của `format.ts`).

#### V-12. Ảnh bìa khóa học tải bản gốc, LCP mobile 3.75s
- **Bằng chứng:** `/api/academy/thumbnails/<id>` trả 476KB cho ô ảnh rộng ~340px; Lighthouse mobile `/academy` LCP 3751ms, tổng trang 517KB. `app/(app)/academy/course-card.tsx:17` dùng `<img>` không `width`/`height`/`loading`; route tải nguyên file từ Storage (`app/api/academy/thumbnails/[courseId]/route.ts:39`), cache `private, max-age=300`.
- **Đề xuất:** nén và thu nhỏ ảnh lúc upload (tối đa ~800px, WebP), hoặc dùng `next/image` với loader qua route này; thêm `loading="lazy"` cho thẻ từ thứ 2, `fetchpriority="high"` cho thẻ đầu; tăng `max-age`.
- **Công sức:** M.

#### V-13. Trang xem tài liệu bị nhảy layout (CLS 0.141 desktop)
- **Bằng chứng:** Lighthouse `/documents/[id]` desktop CLS 0.141 (`cls-culprits-insight`), mobile 0.053.
- **Đề xuất:** đặt chiều cao cố định/`aspect-ratio` cho khung xem trước và khối "Chia sẻ" trước khi dữ liệu về. Cần xem trace Lighthouse để xác định đúng phần tử gây nhảy trước khi sửa.
- **Công sức:** S.

#### V-14. Upload không có thanh tiến trình
- **Bằng chứng:** nút chuyển "Đang tải lên…" và bị khóa (tốt), nhưng `progress el: 0`; file tối đa 25MB gửi qua server action (`next.config.ts` `bodySizeLimit: "26mb"`), mạng chậm người dùng không biết còn bao lâu và không hủy được. `audit-screenshots/flow-write/upload-pending-slow.png`.
- **Đề xuất:** upload bằng `XMLHttpRequest`/signed upload URL để có `progress` và nút hủy; tối thiểu là hiện dung lượng file và dòng "đừng đóng trang".
- **Công sức:** M–L.

#### V-15. Vùng chạm nhỏ trên mobile
- **Bằng chứng (375px):** link "Quản lý" 48×16px ở `/admin/clients` (50 phần tử), "Xem" 29×16px ở `/billing/history`, checkbox 13–16px ở `/billing/prices`, `/billing/compare`, nút tour "Đóng hướng dẫn" 32×28px, nút di chuyển/xóa chương 16×16px ở `/admin/academy/[id]`. Lighthouse `target-size` fail ở `/documents/list`.
- **Đề xuất:** link hành động trong bảng thêm `inline-flex min-h-11 items-center px-2` ở breakpoint mobile; checkbox bọc trong `label` có padding; nút icon tối thiểu 40–44px.
- **Công sức:** S–M.

#### V-16. Trình sửa lớn không cảnh báo khi rời trang chưa lưu *(chỉ đọc code)*
- **Bằng chứng:** không có `beforeunload` nào trong repo; trang `/billing/contracts/[id]` có 146 ô nhập. Bấm nhầm link hoặc Back là mất thay đổi.
- **Đề xuất:** hook `useUnsavedChanges(dirty)` (bắt `beforeunload` + chặn điều hướng trong app) cho editor bảng giá, dữ liệu kỳ, soạn khóa học.
- **Công sức:** M.

### ⚪ P3 — đánh bóng

| Mã | Vấn đề | Bằng chứng | Đề xuất | CS |
| --- | --- | --- | --- | --- |
| V-17 | `supabase-js` (275KB chưa nén) nằm trong bundle trang soạn khóa học | `app/(app)/admin/academy/[id]/video-upload-form.tsx:10`; route này 269KB gzip | `await import("@/lib/supabase/client")` khi bắt đầu upload | S |
| V-18 | `driver.js` (63KB chưa nén + CSS) import tĩnh ở thanh trên | `components/top-nav.tsx:4`, `components/billing-tour.tsx:7-8` | `next/dynamic` hoặc `import()` khi tour thật sự chạy | S |
| V-19 | Favicon SVG nặng 105KB | `app/icon0.svg` (104.941 byte), tải ở mọi trang | tối ưu SVG hoặc dùng PNG 32px | S |
| V-20 | Text tiếng Anh hardcode cho trình đọc màn hình | `components/ui/dialog.tsx:61` "Close", `components/ui/page-skeleton.tsx:9` "Loading…", `components/ui/spinner.tsx:18` "Loading", `components/page-header.tsx:74` "Breadcrumb" | đưa vào messages | S |
| V-21 | Empty state sai ngữ cảnh khi tìm không ra | `/admin/clients?q=…` hiện "Chưa có khách hàng nào. Hãy thêm khách hàng đầu tiên ở trên." (`app/(app)/admin/clients/page.tsx:96`, `flow-write/client-list-empty-search.png`) | khi có `q`: "Không tìm thấy khách hàng phù hợp" + nút xóa bộ lọc | S |
| V-22 | Ô lọc khách hàng ở sidebar mất khi refresh | state cục bộ, `app/(app)/documents/client-sidebar.tsx:129` | lưu vào `sessionStorage` hoặc query | S |
| V-23 | Tour billing tự bật ở từng trang lần đầu vào, che gần hết màn hình mobile | tự mở ở `/billing`, `/prices`, `/reports`, `/alerts`, `/uploads`; `pages/billing-mobile.png` | chỉ tự bật 1 lần ở trang chính, các trang khác để nút "?" | S |
| V-24 | Lỗi a11y nhỏ | không có skip link; trang login/share/404 thiếu `<main>` (axe `region`, `landmark-one-main`); 14 `<th>` rỗng cho cột hành động; logo `alt` trùng chữ bên cạnh; `aria-label` trên `<span>` (`app/(app)/admin/users/page.tsx:126`); `/academy` nhảy h1 → h3; login không autofocus ô email | sửa từng mục | S |
| V-25 | Không có `robots.txt`/`noindex` | Lighthouse SEO 92 do `robots-txt`; trang share công khai không có meta robots | `app/robots.ts` chặn toàn bộ; `robots: { index: false }` ở root metadata | S |
| V-26 | Vài trang còn gọi DB nối tiếp | `app/(app)/billing/calculations/[id]/page.tsx:45,52,82,83` (4 lượt), `billing/history/page.tsx:38,39,60` (3 lượt); TTFB `/billing/contracts/[id]` 348–447ms | gộp các lượt độc lập vào `Promise.all` | S |
| ~~V-27~~ | ~~Sidebar Admin không dính khi cuộn trang dài~~ **Rút lại (17/11):** phát hiện sai. Sidebar đã `sticky`; ảnh chụp toàn trang `pages/admin_clients-desktop.png` vẽ nó một lần ở đầu trang nên trông như bị cụt. Kiểm tra lại bằng cách cuộn 1400px: menu vẫn ở `top: 64px` (`batch-1/before/V-27-admin-nav-scrolled.png`) | – | không cần sửa | – |
| V-28 | Skeleton chung không khớp bố cục từng trang | cả 5 `loading.tsx` dùng `PageSkeleton` (tiêu đề + 6 thẻ) dù trang là bảng | skeleton dạng bảng cho trang danh sách. CLS đo được vẫn = 0 nên ưu tiên thấp | S |

---

## 4. Những gì đã làm tốt (nên giữ)

- **Hiệu năng nền:** Lighthouse Performance 100 trên 22/24 lượt đo; CLS = 0 ở hầu hết trang; không có long task; TBT mobile ≤ 27ms.
- **Tầng dữ liệu đã được tối ưu:** session xác thực JWT tại chỗ bằng `getClaims()` và `cache()` theo request (`lib/auth/dal.ts:24`); số đếm hồ sơ đã chuyển sang RPC (`lib/documents/counts.ts`); policy RLS bọc `(select private.is_admin())` và `(select auth.uid())`; 49 index gồm đủ các cột FK chính; các danh sách đều phân trang bằng `.range()`.
  - Ghi chú: mục "Lưu ý đã biết" trong `CLAUDE.md` về số đếm sai khi vượt 1000 dòng có vẻ đã lỗi thời, nên cập nhật.
- **Chống double-submit hoạt động:** bấm 3 lần liên tiếp ở login, tạo khách hàng, upload đều chỉ gửi 1 request; nút khóa và đổi chữ ("Đang đăng nhập…", "Đang tải lên…").
- **Responsive:** không có tràn ngang ở 375 / 768 / 1440 trên toàn bộ 45 route; bảng tự chuyển thành thẻ trên mobile.
- **Trang lỗi và 404:** có `error.tsx`, `global-error.tsx`, `not-found.tsx`; thông điệp tiếng Việt, có "Thử lại" / "Về trang chủ", giữ thanh điều hướng, chỉ hiện mã lỗi chứ không lộ lỗi thô.
- **Bảo vệ phiên:** deep link khi chưa đăng nhập được chuyển về login rồi quay lại đúng trang; `next=https://example.com`, `//example.com`, `/\example.com` đều bị chặn; xóa cookie giữa chừng rồi bấm link thì về login kèm `next`.
- **Thao tác phá hủy đều có modal xác nhận** nêu rõ tên đối tượng và hậu quả ("Các liên kết chia sẻ sẽ ngừng hoạt động… không thể hoàn tác").
- **Dữ liệu đặc biệt được xử lý đúng:** emoji, tiếng Việt, `<b>`, dấu nháy hiển thị nguyên văn (đã escape), tên file được làm sạch; chuỗi quá dài bị từ chối với thông báo rõ.
- **Bàn phím:** thứ tự Tab hợp lý, 59/60 phần tử có focus ring rõ; dropdown mở bằng Enter, di chuyển bằng mũi tên, Esc đóng và trả focus.
- **Bộ lọc nằm trên URL** ở `/documents/list`, `/admin/clients`, `/admin/activity`, `/billing/history` (chia sẻ link và refresh không mất); phân trang bằng link.
- **Chi tiết khác:** `next/font` (Geist), `next/image` cho ảnh nền login, `autocomplete` đúng cho email / mật khẩu / mật khẩu mới, validate file ngay khi chọn (sai loại là khóa nút gửi), link chia sẻ hết hiệu lực ngay khi tài liệu bị xóa, không có màu hardcode ngoài bảng màu Tailwind, màu ngữ nghĩa dùng đúng (đỏ lỗi, xanh lá thành công, vàng cảnh báo).

---

## 5. Kế hoạch sửa đề xuất

**Đợt 1 — Quick wins (mỗi việc S, tổng khoảng 1 ngày)**
- V-03 focus cho Dialog (1 component, sửa cho mọi modal).
- V-05 đổi `text-slate-400` → `text-slate-500` cho chữ có nội dung.
- V-07 giữ query string khi đăng nhập.
- V-09 404 cho uuid sai.
- V-11 định dạng ngày giờ.
- V-20, V-21, V-25 (text tiếng Anh, empty state, robots). V-27 đã rút lại.

**Đợt 2 — Độ tin cậy của form (M, 2–3 ngày)**
- V-01 + V-02 làm chung một hook gửi form (giữ dữ liệu khi lỗi, bắt lỗi mạng).
- V-04 toast sau khi xóa.
- V-06 `Field` tự gắn nhãn / lỗi, focus field lỗi đầu tiên.
- V-08 hàm chuyển lỗi thô thành thông báo thân thiện.
- V-05 (bổ sung): đo tương phản trang chi tiết khóa học (`text-white/70`, `text-white/85` ở `app/(app)/academy/[courseId]/page.tsx:80,86`) và dòng tagline trang login (`text-white/80` trên ảnh nền, `app/(auth)/layout.tsx:44`); sửa nếu dưới 4.5:1. Hai chỗ này chưa nằm trong các trang đã đo ở Đợt 1.
- Kiểm thử thật toast hiển thị trong dialog đang mở (thay đổi của V-03): cần một thao tác ghi thành công, chủ dự án tự bấm thử.

Quy tắc test Đợt 2 (chạy localhost, database production): chỉ test các luồng không ghi dữ liệu (validation lỗi, mất mạng, mở/đóng dialog). Không submit thành công form nào, không xóa gì; các luồng ghi thật chỉ viết code + test tự động rồi ghi lại để chủ dự án tự bấm thử.

**Đợt 3 — Hoàn thiện (M)**
- V-10 tiêu đề từng trang.
- V-12 ảnh bìa khóa học; V-13 CLS trang xem tài liệu.
- V-15 vùng chạm mobile; V-24 các lỗi a11y nhỏ.
- V-17, V-18, V-19 giảm JS và favicon; V-26 gộp truy vấn.

**Đợt 4 — Cân nhắc sau (M–L)**
- V-14 upload có tiến trình và hủy.
- V-16 cảnh báo thay đổi chưa lưu.
- V-22, V-23, V-28.

---

## Phụ lục A — Dữ liệu test đã tạo

Tất cả đã xóa qua UI và đã kiểm tra lại không còn:

| Đối tượng | Giá trị | Trạng thái |
| --- | --- | --- |
| Khách hàng | `TEST AUDIT 🚀 Đặng Thị Ánh <b>đậm</b> & "nháy"`, mã `TEST-AUDIT-01` | đã xóa |
| Dự án | `TEST AUDIT dự án 🚀 thử nghiệm`, mã `TEST_AUDIT_DU_AN` | đã xóa |
| Tài liệu | PDF 193 byte `…_20261116_931c.pdf` | đã xóa (cả file Storage) |
| Link chia sẻ | 1 link, hạn 3 ngày | mất hiệu lực theo tài liệu |

Còn lại và không xóa được qua UI: các dòng nhật ký hoạt động (`client.created`, `document.uploaded`, `document.deleted`, `client.deleted`… và vài lượt đăng nhập sai với `audit-khong-ton-tai@example.com`) trong `/admin/activity`, phát sinh đêm 16–17/11/2026.

**Không đụng tới billing:** không tính tiền, không lưu giá, không xác nhận/hủy bản tính, không tải HSTT. Mốc `check-real-contracts` không bị ảnh hưởng bởi lần audit này (chưa chạy lại file kiểm tra để đối chiếu).

## Phụ lục B — Chưa kiểm được

- Vai trò khác admin (employee, manager, accountant, billing_viewer).
- Thao tác ghi của billing trên trình duyệt; video academy và quiz (chỉ mở trang, không làm bài).
- Email quên mật khẩu / đặt lại mật khẩu thật (chỉ kiểm tra form).
- Scroll restoration khi Back: phép thử cho kết quả không rõ ràng (cuộn 600px, quay lại ở 1859px, nhưng link được bấm là phân trang của chính trang đó), cần thử lại bằng tay.
- Dark mode: app không có, không áp dụng.
- Số đo trên Vercel production (CDN, cold start, khoảng cách tới Supabase).

## Phụ lục C — Ghi chú môi trường

- `npm ci` trên máy này (npm 12.2) từ chối gói `xlsx` vì nó lấy từ tarball `cdn.sheetjs.com`; phải chạy `npm ci --allow-remote=all`. Người mới clone repo sẽ gặp lỗi này, nên ghi vào README.
- Playwright, axe-core, Lighthouse cài ở thư mục tạm ngoài repo; `package.json` và lock file không đổi. Thay đổi trong repo chỉ gồm `UX_AUDIT.md` và `audit-screenshots/` (35MB, chưa commit; cân nhắc thêm vào `.gitignore`).

## Phụ lục D — Đợt 2: việc chủ dự án cần tự bấm thử

Đợt 2 (nhánh `ux/batch-2`) chỉ được test bằng các luồng **không ghi dữ liệu** (lỗi validation, mất mạng, mở/đóng dialog). Các luồng dưới đây cần một thao tác ghi thành công nên chưa ai bấm thử; code và test tự động đã có.

Ưu tiên cao (hook `useFormAction` thay cho `useActionState` ở 45 form):

1. **Đăng nhập thành công**: vào được đúng trang, kể cả khi mở từ link sâu có `?next=`. Đây là form có redirect; phần cho redirect đi qua mới có unit test.
2. **Lưu một form bất kỳ thành công** (ví dụ sửa tên khách hàng ở `/admin/clients/[id]`): có thông báo thành công, ô nhập hiện giá trị mới.
3. **Tạo mới thành công trong dialog** ("Thêm khách hàng"): form trống lại sau khi tạo, danh sách có dòng mới.
4. **Tính tiền thuê** ở `/billing`: bấm tính, được chuyển tới trang bản tính (action này redirect).
5. **Upload tài liệu thành công** ở `/documents/upload`: được chuyển tới trang tài liệu.
6. **Lưu bảng giá / dữ liệu kỳ** của một hợp đồng test (`thacons-01`): lưu được, số liệu giữ nguyên sau khi lưu.

Toast sau khi xóa (V-04):

7. Xóa một tài liệu test ở `/documents`: hiện toast "Đã xóa…".
8. Xóa một dự án test ở `/admin/projects`: hiện toast.
9. Xóa một khách hàng test ở `/admin/clients/[id]`: được chuyển về danh sách **và** hiện toast.
10. Xóa nhiều dự án cùng lúc ở trang quản lý khách hàng: hiện toast, ô chọn được bỏ.

Khác:

11. **Toast trong dialog đang mở** (V-03): thao tác nào đó báo lỗi bằng toast trong lúc dialog còn mở; toast phải hiện phía trên lớp nền mờ và bấm đóng được.
12. **Thông báo lỗi thân thiện** (V-08): tạo khách hàng trùng mã vẫn báo "Mã đó đã được sử dụng"; xóa khách hàng còn dự án báo câu tiếng Việt, không còn câu tiếng Anh của Postgres.

Chưa chuyển sang hook mới (vẫn có thể văng trang lỗi khi mất mạng): ba luồng upload nhiều bước ở billing (`upload-dropzone.tsx`, `prices/import/import-form.tsx`, `templates/template-upload.tsx`) và các form chỉ có một nút dùng thẳng server action (đổi thứ tự/xóa chương, bài học, khóa/xóa tài khoản).
