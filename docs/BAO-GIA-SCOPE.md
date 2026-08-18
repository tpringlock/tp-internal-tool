# TP Internal Tool — Tài liệu phạm vi (Scope) phục vụ báo giá

> Tài liệu tham chiếu nội bộ, tổng hợp toàn bộ phạm vi đã xây dựng trong dự án
> `tp-internal-tool` để làm cơ sở lập báo giá. Số liệu effort là **ước lượng tham chiếu**
> (man-day) theo từng module; đơn giá/ngày do bạn tự gán.

---

## 1. Tổng quan dự án

**TP Internal Tool** là một **portal nội bộ công ty** — nền tảng đa ứng dụng, bảo mật cao,
**song ngữ (Tiếng Việt / English)**, phân quyền theo vai trò. Trên cùng một nền tảng dùng
chung (auth, người dùng, vai trò, giao diện) hiện có **2 ứng dụng lớn đã hoàn thiện**:

1. **Quản lý tài liệu (Document Management)** — kho tài liệu PDF (hợp đồng, hoá đơn, biên
   bản...) tổ chức theo Khách hàng → Dự án, có chia sẻ link, tìm kiếm và nhật ký truy cập.
2. **TP Academy (Đào tạo / LMS)** — hệ thống học tập nội bộ với khoá học, chương, bài học,
   video, quiz theo chương, theo dõi tiến độ và ghi chú cá nhân.

**Quy mô codebase (hiện trạng):**

| Chỉ số | Giá trị |
|---|---|
| Số file TypeScript / TSX | ~120+ |
| Số dòng code (TS/TSX) | ~12.000+ |
| Số trang (route) | ~25+ |
| Migration cơ sở dữ liệu | 18 file SQL |
| Số bảng dữ liệu chính | ~19 |
| Ngôn ngữ giao diện | 2 (VI / EN) |
| Vai trò người dùng | 3 (admin / manager / employee) |

---

## 2. Công nghệ sử dụng

| Nhóm | Công nghệ | Phiên bản |
|---|---|---|
| Framework | Next.js (App Router) | 16.3.0 |
| UI runtime | React | 19.2.8 |
| Ngôn ngữ | TypeScript (strict) | 5.x |
| Giao diện | Tailwind CSS | v4 |
| Biểu mẫu + kiểm tra dữ liệu | react-hook-form + Zod | 7.84 / 4.4 |
| Đa ngôn ngữ | next-intl | 4.13 |
| Icon | lucide-react | 1.29 |
| Backend / DB / Auth / Storage | Supabase (PostgreSQL + Auth + Storage + RLS) | js 2.112, ssr 0.12 |
| Kiểm thử | Vitest | 4.1 |

**Ghi chú chi phí:** dự án **không phụ thuộc dịch vụ bên thứ ba trả phí** — không Stripe,
không dịch vụ email riêng (dùng SMTP có sẵn của Supabase Auth), không CDN ngoài. Chi phí vận
hành duy nhất là **Supabase** (và hạ tầng triển khai như Vercel/self-host).

---

## 3. Kiến trúc & Bảo mật *(điểm nhấn giá trị)*

Đây là các hạng mục kỹ thuật làm nên chất lượng và độ an toàn của hệ thống — nên được phản
ánh vào giá trị báo giá:

- **Bảo mật RLS-first**: phân quyền dữ liệu thực thi ngay tại tầng PostgreSQL (Row-Level
  Security), không phụ thuộc tầng ứng dụng. Các hàm nhạy cảm dùng `SECURITY DEFINER` đặt
  trong schema `private` (không lộ qua API).
- **Tách vai trò truy cập**: client thường (áp RLS theo người dùng) và service-role (chỉ dùng
  sau khi đã kiểm tra quyền tường minh — ví dụ stream file, thao tác admin).
- **File luôn stream qua route server** (không tải trực tiếp từ Storage) → **mọi lượt truy
  cập đều được ghi log**. Ngoại lệ có kiểm soát: video lớn dùng signed URL 15 phút để hỗ trợ
  tua/seek.
- **Nhật ký hoạt động toàn hệ thống** (activity log) kèm địa chỉ IP cho mọi thao tác quan trọng.
- **Middleware `proxy.ts`**: làm mới session mỗi request và bảo vệ route (chuyển hướng đăng nhập).
- **Link chia sẻ có thời hạn, thu hồi được** (revocable) như một thực thể dữ liệu độc lập.

---

## 4. Chi tiết các module chức năng

### 4.1. Nền tảng dùng chung (Foundation)

- Xác thực **Supabase Auth** (email + mật khẩu). **Admin tạo tài khoản**, không có đăng ký
  công khai.
- Luồng **quên / đặt lại mật khẩu** qua email + xác nhận token.
- **3 vai trò**: `admin` (toàn quyền), `manager` (tạo nội dung), `employee` (người dùng cơ
  bản); RBAC kết hợp RLS.
- **Portal shell**: thanh điều hướng trên (top-nav), menu người dùng, thanh điều hướng quản
  trị (admin-nav), trang chủ dashboard, trang hồ sơ cá nhân.
- **Song ngữ VI/EN** (next-intl) áp dụng cho toàn bộ chuỗi giao diện, nhãn biểu mẫu, thông
  báo lỗi; có nút chuyển ngôn ngữ.
- **Thư viện UI dùng chung** (~12 component: button, input, card, dialog, pagination, PDF
  viewer, spinner, skeleton...).

### 4.2. Quản lý tài liệu (Document Management)

- **Upload PDF** (kèm xác nhận "đã ký" bắt buộc), lưu tại Supabase Storage bucket riêng tư.
- **Tổ chức theo Khách hàng → Dự án**; tên file được **chuẩn hoá tự động** theo Khách
  hàng + Dự án + loại tài liệu.
- **Xem PDF nhúng** + tải xuống; **tìm kiếm typeahead** theo tên tài liệu.
- **Chia sẻ**:
  - Link tài liệu đơn với thời hạn tuỳ chọn (1 / 3 / 7 / 14 / 30 ngày).
  - Chia sẻ **cả thư mục khách hàng** (toàn bộ tài liệu của một khách hàng qua 1 token).
  - Truy cập công khai không cần đăng nhập; có thể **thu hồi**; mọi lượt xem/tải được log.
- **Phân quyền**: `employee` chỉ thấy tài liệu thuộc dự án được gán; `manager`/`admin` thấy tất cả.
- **8 loại tài liệu**: hợp đồng, phụ lục, phiếu thanh toán, hoá đơn, biên bản đối chiếu công
  nợ, biên bản bàn giao, công văn, biên bản họp.

### 4.3. TP Academy (Đào tạo / LMS)

- **Cấu trúc phân cấp**: Khoá học → Chương → Bài học; trạng thái **nháp / xuất bản**.
- **Metadata khoá học**: mô tả, danh mục, giảng viên, ảnh bìa.
- **Video bài học**:
  - Nhúng **YouTube / Vimeo** (có validate URL chống injection/XSS).
  - **Video tự lưu trữ**: upload trực tiếp trình duyệt → Storage qua signed upload URL (file
    lớn không đi qua server), phát lại qua route stream + signed URL 15 phút (hỗ trợ tua).
- **Ghi danh tự phục vụ** + **theo dõi tiến độ từng bài**; khoá **tự hoàn thành khi đạt 100%**.
- **Quiz theo chương** (trắc nghiệm 1 đáp án đúng): chấm điểm phía server; **chặn/mở khoá
  chương kế tiếp** theo kết quả.
- **Ghi chú cá nhân theo bài học** (tự lưu, riêng tư từng người).
- **Tài liệu PDF**: cấp bài học và cấp khoá học.
- Trang **"Khoá học của tôi"** (đang học / đã hoàn thành).

### 4.4. Quản trị (Admin)

- **Quản lý Khách hàng**: tạo / sửa / danh sách (phân trang), mã khách hàng duy nhất.
- **Quản lý Dự án**: tạo / sửa, **gán thành viên**, trạng thái active / archived.
- **Quản lý Người dùng**: tạo, đổi vai trò, kích hoạt / vô hiệu hoá.
- **CMS Academy đầy đủ**: CRUD khoá / chương / bài học / video / file / quiz; xuất bản.
- **Nhật ký hoạt động** (activity log): lọc theo loại hành động + phân trang (chỉ admin).

---

## 5. Mô hình dữ liệu

**~19 bảng chính** (Supabase PostgreSQL):

`profiles`, `clients`, `projects`, `project_members`, `documents`, `share_links`,
`folder_share_links`, `activity_log`, `courses`, `chapters`, `lessons`, `lesson_files`,
`course_files`, `course_enrollments`, `lesson_progress`, `quiz_questions`, `quiz_options`,
`chapter_quiz_passes`, `lesson_notes`.

**Enum:** `user_role` (admin/manager/employee), `doc_type` (8 loại tài liệu),
`course_status` (draft/published), `video_provider` (youtube/vimeo/self_hosted).

**Storage bucket:** `documents` (PDF riêng tư), `academy` (PDF + ảnh + video, giới hạn 1 GB/file).

**Bảo mật:** 18 migration SQL bao trùm schema + chính sách RLS cho toàn bộ bảng.

---

## 6. Bảng tổng hợp effort & độ phức tạp *(phục vụ báo giá)*

> Ước lượng theo man-day (dạng khoảng). Bạn tự gán đơn giá/ngày và điều chỉnh theo thực tế.

| Hạng mục | Độ phức tạp | Ước lượng (man-day) |
|---|---|---|
| Nền tảng: Auth, RBAC, RLS, portal shell, UI kit | Cao | ~15–20 |
| Song ngữ VI/EN (i18n) | Trung bình | ~3–5 |
| Quản lý tài liệu (upload, tổ chức, xem, tìm kiếm) | Cao | ~12–16 |
| Chia sẻ tài liệu + thư mục (token, hết hạn, thu hồi) | Trung bình–Cao | ~6–9 |
| TP Academy — cấu trúc khoá/chương/bài + CMS | Cao | ~14–18 |
| TP Academy — video (nhúng + tự lưu trữ/stream) | Cao | ~6–9 |
| TP Academy — quiz, tiến độ, ghi chú, tài liệu | Cao | ~10–14 |
| Quản trị (clients, projects, users, activity log) | Trung bình | ~8–12 |
| Bảo mật, hardening, kiểm thử, migration DB | Cao | ~8–12 |
| **Tổng cộng (ước lượng)** | | **~82–115 man-day** |

*Lưu ý: effort thực tế đã bao gồm thiết kế RLS, kiểm thử (Vitest) và nhiều vòng lặp UI/UX —
không chỉ là code chức năng đơn thuần.*

---

## 7. Ghi chú cho báo giá

- **Đã hoàn thành & build xanh**: toàn bộ **Quản lý tài liệu** (5 phase) + **TP Academy**
  (v1–v4, gồm chương, quiz, ghi chú, tài liệu khoá, video tự lưu trữ).
- **Đã hoãn / ngoài phạm vi hiện tại**: chứng chỉ hoàn thành khoá học (certificate), thời
  lượng bài học, và một "ứng dụng đào tạo" tách riêng (đã gộp thành module bên trong portal).
- **Công việc còn lại thực tế**: kiểm thử trên Supabase live + triển khai (deployment).
- **Không phát sinh chi phí dịch vụ bên thứ ba** (chỉ phụ thuộc Supabase + hạ tầng triển khai).
