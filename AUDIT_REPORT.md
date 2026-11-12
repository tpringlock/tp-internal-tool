# Báo cáo audit — TP Internal Tool

Ngày: 26/10/2026. Phạm vi: toàn bộ code trong repo (nhánh `main`, commit `cb5d3ee`). Chỉ đọc code và chạy lệnh tĩnh. Không sửa file nào ngoài file báo cáo này, không chạy lệnh ghi DB, không gọi MISA, không upload storage.

> **Lưu ý về giả định ban đầu.** Brief nhắc Prisma và Auth.js, nhưng dự án thực tế dùng **Supabase Auth + `@supabase/ssr` + RLS**, không có Prisma, và video academy là **file self-host trên Supabase Storage** (signed URL 15 phút), không có Bunny.net. Các mục Prisma (singleton, `directUrl`, drift schema) không áp dụng. Phần đó được thay bằng review RLS và migration SQL.

---

## 1. Tóm tắt

**Tình trạng chung: nền tảng tốt, có 1 lỗ hổng phân quyền thật cần sửa trước UAT.**

Điểm tốt (có dẫn chứng):
- Mọi Server Action và route handler nội bộ đều gọi guard ở dòng đầu (bảng mục 3). Trang `/billing/*`, `/admin/*` đều có guard riêng, không chỉ dựa vào layout.
- Role đọc từ DB (`profiles`) ở mọi request (`lib/auth/dal.ts:34-38`), không đọc từ token → đổi role hoặc khóa user có hiệu lực ngay ở tầng trang.
- Bucket `documents`, `billing` private, không có policy cho `authenticated`; mọi file đi qua route có kiểm tra quyền và đều có `Cache-Control: private, no-store`.
- Trigger `prevent_profile_privilege_change` chặn user tự đổi `role`/`is_active`; `handle_new_user` đọc role từ `app_metadata` (migration 0023).
- Mật khẩu do Supabase hash. Không có `console.log`, không có `catch {}` rỗng, chỉ 2 chỗ `any`.
- Kiểm tra tự động: `tsc` sạch, **435/435 test pass**, `next build` thành công.

**5 vấn đề nghiêm trọng nhất:**
1. 🔴 **Employee tạo link chia sẻ cả thư mục khách hàng, lộ tài liệu của dự án họ không thuộc về** (policy `folder_share_links_insert`).
2. 🟠 **User đã bị khóa vẫn tải được tài liệu/video đến khi JWT hết hạn** (route API chỉ dùng `auth.getUser()`, RLS `is_project_member` không kiểm tra `is_active`). Cần xác minh thời gian thực tế.
3. 🟠 **Xóa user thất bại âm thầm** nhưng vẫn ghi log "đã xóa" (FK `uploaded_by`, `actor_user_id`, `created_by` không có `on delete`).
4. 🟠 **Không có `error.tsx`, `not-found.tsx`, `global-error.tsx`** ở bất kỳ route nào. Lỗi runtime ra màn hình lỗi mặc định của Next.
5. 🟠 **Đăng nhập không có chống brute force ở tầng app** và **đổi mật khẩu không yêu cầu mật khẩu cũ**. Phụ thuộc cấu hình Supabase Auth, cần xác minh trên dashboard.

**Sẵn sàng UAT?** Chưa, cho tới khi sửa mục 1 và xác minh mục 2, 5. Các mục còn lại có thể làm song song hoặc sau UAT.

---

## 2. Kết quả kiểm tra tự động

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | ✅ Sạch, không lỗi |
| `npm run lint` | ⚠️ 6 lỗi, đúng bằng "nợ cũ" ghi trong CLAUDE.md (`set-state-in-effect` ở delete-*-button, admin/clients; "Cannot create components during render" ở academy/my-courses). Không có lỗi mới |
| `npm test` | ✅ 46 file, 435 test pass (46s). Các test chỉ dùng logic thuần và fixture, không chạm DB thật |
| `npm run build` | ✅ Thành công (Next 16.4.2, 52 trang). Không có route nào prerender cần DB. Toàn bộ route nghiệp vụ là `ƒ` dynamic, đúng mong muốn. Chỉ `/forgot-password`, `/reset-password`, `/_not-found` và icon là static |
| `npm audit` | ⚠️ 2 moderate: `uuid <11.1.1` kéo theo qua `exceljs`. Lỗ hổng chỉ xảy ra khi truyền `buf` cho `uuid` v3/v5/v6. Rủi ro thực tế thấp. `npm audit fix --force` sẽ hạ `exceljs` xuống 3.4.0 (breaking), **không nên chạy** |
| `npm outdated` | `next` 16.4.2 → 16.4.3, `react-hook-form` 7.90 → 7.91, `eslint-config-next` → 16.4.3. Bản major mới (eslint 10, typescript 7, vitest 5, `@hookform/resolvers` 6) nên để sau |

---

## 3. Bảng phân quyền

Vai trò: **A** = admin, **M** = manager, **Ac** = accountant, **V** = billing_viewer, **E** = employee.
Cột cuối: guard có nằm ở server không (✅/❌).

### 3.1 Server Actions

| File | Action | Vai trò cho phép | Server check |
|---|---|---|---|
| `auth.ts` | `login`, `requestPasswordReset` | công khai | ✅ (Supabase) |
| `auth.ts` | `logout`, `updatePassword` | đã đăng nhập (`updatePassword` kiểm `getUser()`) | ✅ |
| `profile.ts` | `updateProfile`, `changePassword` | đã đăng nhập | ✅ qua `getUser()`/RLS, ⚠️ xem M-3 |
| `documents.ts` | `uploadDocument` | mọi user (E chỉ vào dự án mình là thành viên, M/A mọi dự án) | ✅ `requireUser` + RLS |
| `documents.ts` | `deleteDocument` | A | ✅ `requireAdmin` + RLS |
| `shares.ts` | `createShareLink`, `revokeShareLink` | thành viên dự án / creator / A | ✅ `requireUser` + RLS |
| `folder-shares.ts` | `createFolderShareLink`, `revoke…` | thành viên **bất kỳ dự án nào** của client | ✅ có guard, ❌ **policy quá rộng (C-1)** |
| `clients.ts` | `addClient`, `editClient` | A, M | ✅ `requireContentManager` |
| `clients.ts` | `deleteClient` | A | ✅ |
| `projects.ts` | `addProject`, `editProject` | A, M | ✅ |
| `projects.ts` | `deleteProject(s)`, `assignMember`, `unassignMember` | A | ✅ |
| `users.ts` | `createUser`, `setUserActive`, `deleteUser`, `setUserRole` | **chỉ A** | ✅ `requireAdmin` |
| `academy.ts` | CRUD khóa học, chương, bài, quiz, file, video | A, M (xóa khóa học chỉ A) | ✅ |
| `academy.ts` | `enrollAndStart`, `toggleLessonComplete`, `submitChapterQuiz`, `saveLessonNote` | mọi user | ✅ `requireUser` |
| `misa.ts` | `misaConnect`, `misaRequest` | A | ✅ |
| `misa.ts` | `syncMisaNow` | A, M | ✅ |
| `billing*.ts` | mọi action ghi (tính, xác nhận, hủy, giá, file tháng, HSTT, mẫu, kỳ) | A, Ac | ✅ `requireBillingUser` |
| `billing-hstt.ts` | `saveCompanyProfile` | A | ✅ guard + check role + RLS |
| `billing.ts` | `compareDemoContracts` | A | ✅ |
| `billing-reports.ts` | `runRentReport` | A, Ac, V (chỉ đọc) | ✅ `requireBillingViewer` |
| `billing.ts` | `setShowDemo` | A, Ac, V | ✅ |

### 3.2 Route handlers

| Route | Vai trò cho phép | Server check |
|---|---|---|
| `GET /api/documents/[id]` | thành viên dự án / M / A (RLS) | ✅ `getUser` + RLS, ⚠️ M-1 |
| `GET /api/documents/search` | như trên | ✅ |
| `GET /api/academy/{videos,files,course-files,thumbnails}/…` | đã đăng nhập + RLS (khóa đã publish) | ✅, ⚠️ M-1 |
| `GET /api/share/[token]`, `/api/share/folder/[token]` | **công khai theo token** | ✅ token + hạn + thu hồi; folder token ràng buộc `doc ∈ client` |
| `/api/billing/**` (11 route) | A, Ac, V | ✅ `requireBillingViewer` ở dòng đầu |
| `GET /api/misa/sync` | Vercel Cron, Bearer `CRON_SECRET` | ✅, ⚠️ L-3 |
| `POST /api/misa/sync` | A, M | ✅ `getSessionUser` + `canManageContent` |

### 3.3 Trang

| Nhóm | Vai trò | Server check |
|---|---|---|
| `/documents/*`, `/academy/*`, `/profile` | mọi user đăng nhập | ✅ `requireUser` ở từng page |
| `/admin/*` | A, M (layout `requireContentManager`) | ✅ |
| `/admin/users`, `/admin/activity`, `/admin/docs`, `/admin/company`, `/admin/misa/playground` | **chỉ A** | ✅ `requireAdmin` trong từng page |
| `/billing/*` | A, Ac, V | ✅ `requireBillingViewer` ở layout và từng page |
| `/billing/compare` | A | ✅ (xem L-6, CLAUDE.md ghi chưa khớp) |
| `/share/*` | công khai theo token | ✅ |

**Trả lời các câu hỏi phân quyền trong brief:**
- *Employee xem/tải/sửa tài liệu mình không được thêm vào?* Qua UI/API chính: **không**, RLS `documents_select` chặn, `uploadDocument` và `/api/documents/[id]` đều đi qua RLS. **Có thể gián tiếp** qua folder share link, xem C-1.
- *Manager vào được users/activity?* **Không.** Cả hai trang dùng `requireAdmin`, mọi action trong `users.ts` dùng `requireAdmin`.
- *Matcher của proxy bỏ sót?* Matcher phủ mọi route trừ asset tĩnh. Proxy chỉ kiểm tra đăng nhập (đúng ý), phân quyền theo vai trò nằm ở từng page/action/RLS. Không có đường vòng nào được phát hiện.
- *Session & role:* role lấy từ DB mỗi request. Khóa user → `getSessionUser` trả null ngay. Nhưng các route API không đi qua `getSessionUser` (xem M-1).

---

## 4. Danh sách vấn đề

### 🔴 Critical

#### C-1. Employee tạo được link chia sẻ cả thư mục khách hàng, lộ dự án mình không phải thành viên
- **File:** `supabase/migrations/0015_folder_shares.sql:34-47` (policy `folder_share_links_insert`), `lib/documents/folder-share.ts:76-83` (`resolveFolderShareToken`), `app/actions/folder-shares.ts:33-40`.
- **Vấn đề:** policy cho phép tạo link nếu user là thành viên của **một** dự án thuộc client (`exists … p.client_id = … and is_project_member(p.id)`). Nhưng token lại cấp quyền đọc/tải **mọi tài liệu của mọi dự án** của client đó (`resolveFolderShareToken` dùng service role, chỉ lọc `projects.client_id`). Comment trong migration xác nhận ý đồ: "grants anonymous read/download access to every document across all of a client's projects".
- **Hậu quả với TP:** nhân viên A chỉ thuộc dự án X của khách K. A tạo link thư mục cho K và gửi/mở ra, người cầm link tải được toàn bộ hồ sơ dự án Y, Z của K mà A không được xem. Đây chính là kịch bản "employee chỉ xem tài liệu mình được thêm vào" bị vượt. Link công khai, không cần đăng nhập, hiệu lực 1–30 ngày.
- **Cách sửa đề xuất:** chọn một trong hai:
  1. (Chặt nhất, đơn giản nhất) chỉ cho `private.is_content_manager()` tạo link thư mục: sửa policy insert thành `(select private.is_content_manager())` và ẩn nút với employee.
  2. Giữ cho employee nhưng giới hạn token vào các dự án người tạo là thành viên: thêm bảng `folder_share_link_projects` hoặc lưu `project_ids uuid[]`, và `resolveFolderShareToken`/`resolveFolderShareFile` lọc theo đó.
  Cần migration mới (không sửa 0015). Kiểm tra lại các link thư mục đã tạo trước đây: `select created_by, client_id, created_at from folder_share_links where revoked_at is null and expires_at > now()` (câu lệnh đọc, anh tự chạy).
- **Công sửa:** S (cách 1) / M (cách 2).

---

### 🟠 High

#### H-1. Không có `error.tsx`, `not-found.tsx`, `global-error.tsx`
- **File:** toàn bộ `app/` (chỉ có 5 `loading.tsx`).
- **Hậu quả:** truy cập `/documents/<id-sai>` hoặc lỗi runtime hiện màn hình lỗi mặc định của Next, không có nút quay lại, không đúng tiếng Việt/thương hiệu. Ở UAT người dùng sẽ gặp ngay.
- **Cách sửa:** thêm `app/global-error.tsx`, `app/(app)/error.tsx` (client component, có nút "Thử lại" gọi `reset`) và `app/not-found.tsx`; trang chi tiết gọi `notFound()` khi RLS trả rỗng. Text qua next-intl.
- **Công sửa:** S.

#### H-2. Xóa user thất bại âm thầm nhưng vẫn ghi log "đã xóa"
- **File:** `app/actions/users.ts:92-115`; FK ở `supabase/migrations/0001_init.sql:218` (`documents.uploaded_by`), `:235` (`share_links.created_by`), `:250` (`activity_log.actor_user_id`), `0015_folder_shares.sql:12`.
- **Vấn đề:** xóa `auth.users` cascade sang `profiles`, nhưng các bảng trên tham chiếu `profiles(id)` **không có `on delete`** (mặc định `NO ACTION`). Bất kỳ user nào từng đăng nhập (có dòng `activity_log`) đều khiến lệnh xóa lỗi. `deleteUser` **không kiểm tra `error`** từ `auth.admin.deleteUser`, rồi vẫn `logActivity("admin.user_deleted")` và `revalidatePath`.
- **Hậu quả:** admin bấm "Xóa" thấy như thành công, user vẫn còn (có thể vẫn đăng nhập được), nhật ký ghi sai sự thật. Nguy hiểm nếu dùng khi nhân viên nghỉ việc.
- **Cách sửa:** (a) kiểm tra `error` và trả về thông báo; (b) coi "Vô hiệu hóa" (`setUserActive`) là cách chính, ẩn/đổi nhãn nút xóa; (c) nếu thật sự cần xóa: migration đổi các FK thành `on delete set null` (cột nullable) hoặc giữ xóa mềm. `setUserActive` và `setUserRole` cũng nên kiểm tra `error` của lệnh `update`.
- **Công sửa:** S (a, b) / M (c).

#### H-3. Chống brute force đăng nhập và đổi mật khẩu — cần xác minh
- **File:** `app/actions/auth.ts:27-49`, `app/actions/profile.ts:51-71`, `lib/validation.ts:7-12`.
- **Quan sát:** app không có rate limit riêng. Supabase Auth có giới hạn mặc định theo IP, nhưng chưa thấy cấu hình trong repo (không có `supabase/config.toml`). `changePassword` gọi `updateUser({password})` mà **không yêu cầu mật khẩu hiện tại**: ai mượn được phiên đang mở có thể đổi mật khẩu. Chính sách mật khẩu: tối thiểu 8 ký tự, có chữ và số. `supabase/README.md:37` dặn bật "Leaked password protection" nhưng không có cách xác nhận từ repo.
- **Cần xác minh (dashboard, anh kiểm tra):** Auth → Rate Limits; Sign-ups đã tắt; Leaked password protection đã bật; thời hạn JWT (mặc định 1 giờ); "Secure password change" (Supabase hỗ trợ yêu cầu đăng nhập gần đây).
- **Cách sửa:** yêu cầu nhập mật khẩu cũ (gọi `signInWithPassword` xác thực lại trước `updateUser`), tăng độ dài tối thiểu lên 10–12.
- **Công sửa:** S.

#### H-4. Billing: chưa có test cho `computeRent`/HSTT trên dữ liệu biên (xem mục 5)
- Logic lõi được test tốt (435 test, golden file T08/T09), nhưng một số ca biên ở mục 5 chưa thấy trong test. Không phải lỗi, ghi High vì sai tiền là rủi ro lớn nhất của module billing.
- **Công sửa:** M.

---

### 🟡 Medium

#### M-1. User bị khóa còn truy cập API file đến khi JWT hết hạn — cần xác minh
- **File:** `app/api/documents/[id]/route.ts:22-35`, `app/api/academy/*/route.ts`, `app/api/documents/search/route.ts`; `supabase/migrations/0001_init.sql:191-201` (`is_project_member` không kiểm tra `is_active`).
- **Vấn đề:** các route này chỉ dùng `auth.getUser()` rồi dựa vào RLS. Với employee, policy `documents_select` = `is_project_member(project_id)` và hàm này **không** xét `is_active` (trong khi `documents_insert` có xét). Trang HTML thì an toàn vì `getSessionUser` kiểm `is_active`.
- **Hậu quả:** khóa nhân viên nghỉ việc → họ vẫn tải PDF/xem video từ phiên đang mở cho tới khi access token hết hạn (mặc định 1 giờ; ban chặn refresh). Cần xác minh `getUser()` có từ chối user đã ban hay không.
- **Cách sửa:** trong các route đó dùng `getSessionUser()` thay `auth.getUser()` (đã kiểm `is_active`), hoặc thêm `and p.is_active` vào `is_project_member` bằng migration mới. Nên làm cả hai.
- **Công sửa:** S.

#### M-2. Thông báo lỗi kỹ thuật lộ cho người dùng
- **File:** ~79 chỗ dạng `error.message` trong `app/actions/*.ts`, ví dụ `documents.ts:154-158`, `users.ts:44`, `auth.ts:91`, `profile.ts:44,63`.
- **Hậu quả:** người dùng thấy chuỗi tiếng Anh từ Postgres/Supabase (tên constraint, policy…), vừa khó hiểu vừa lộ cấu trúc DB.
- **Cách sửa:** hàm `friendlyError(error, t)` map mã lỗi hay gặp (`23505` trùng, `42501` thiếu quyền, `23503` FK) sang message tiếng Việt, còn lại hiện thông báo chung và `console.error` phía server.
- **Công sửa:** M.

#### M-3. `changePassword` / `updateProfile` không dùng guard chuẩn
- **File:** `app/actions/profile.ts`.
- Không gọi `requireUser()`; `changePassword` không kiểm tra user trước, dựa vào việc Supabase từ chối khi không có phiên. An toàn nhưng lệch quy tắc "mọi action gọi guard ở dòng đầu" trong CLAUDE.md, và user đã bị `is_active=false` vẫn đổi được mật khẩu nếu còn token.
- **Cách sửa:** thêm `await requireUser()` ở dòng đầu cả hai hàm.
- **Công sửa:** S.

#### M-4. MISA sync: không có khóa chống chạy trùng, bản ghi log kẹt `running`
- **File:** `lib/misa/sync.ts:254-344`, `app/api/misa/sync/route.ts:20`.
- **Vấn đề:** hai lần chạy đồng thời (bấm "Đồng bộ ngay" lúc cron chạy, hoặc bấm hai lần) cùng đọc watermark cũ và cùng upsert. Upsert idempotent nên dữ liệu không hỏng, chỉ tốn gấp đôi quota MISA. Nếu hàm bị Vercel cắt ở `maxDuration = 60`, dòng `misa_sync_log` kẹt `status = 'running'` mãi (khối `catch` không chạy khi bị kill), và watermark không tiến.
- **Điểm tốt:** watermark dùng `runStart` (trước khi gọi MISA) nên không mất bản ghi; có timeout/retry/backoff (`lib/misa/client.ts:113-140`); token MISA lưu bảng `misa_token`, không ra client; `MISA_APP_ID` chỉ đọc server-side.
- **Cách sửa:** trước khi chạy, bỏ qua nếu có log `running` bắt đầu cách đây < 5 phút; coi log `running` cũ hơn 5 phút là đã hỏng. Tách đồng bộ từng loại (đã hỗ trợ) để mỗi lần gọi nằm trong 60s.
- **Công sửa:** S–M.

#### M-5. Token share lưu thẳng trong `activity_log.metadata`
- **File:** `app/api/share/[token]/route.ts:43`, `app/api/share/folder/[token]/route.ts:44`, `app/share/[token]/page.tsx:40`, `app/share/folder/[token]/page.tsx:41`.
- **Vấn đề:** bảng này admin đọc được, có thể xem bằng trang `/admin/activity`. Token còn hiệu lực = quyền tải công khai. Admin không nên cần dữ liệu này (đã có `share_id`/`document_id`).
- **Cách sửa:** ghi `share_id` hoặc 6 ký tự cuối của token thay vì toàn bộ.
- **Công sửa:** S.

#### M-6. Activity log chưa đủ và "nuốt lỗi" ghi log
- **File:** `lib/activity.ts:35-40`, `app/actions/shares.ts:57-76`.
- Đã ghi: đăng nhập, đăng xuất, xem/tải tài liệu, tạo/thu hồi share, đổi role, MISA sync, xuất billing. **Thiếu:** đăng nhập thất bại; `revokeShareLink` ghi "share.revoked" kể cả khi RLS lọc mất dòng (không kiểm tra số dòng cập nhật); `deleteUser` ghi sai (H-2). `logActivity` nuốt lỗi theo thiết kế, nhưng chỉ bắt exception chứ không đọc `{ error }` trả về của Supabase client (client này **không throw** khi lỗi), nên log lỗi hầu như không bao giờ được ghi nhận.
- **Cách sửa:** `const { error } = await supabase.from(...).insert(...); if (error) console.error(...)`. Revoke dùng `.select("id")` để biết có dòng nào bị cập nhật (đúng quy tắc "khi xóa dùng `.select`" của dự án).
- **Công sửa:** S.

#### M-7. Số đếm hồ sơ sai khi vượt 1000 dòng (đã biết)
- Đã ghi trong CLAUDE.md. Migration 0025 có RPC đếm, cần xác minh `documents/layout.tsx` đã dùng RPC chưa. Nếu chưa, đây là lỗi hiển thị theo thời gian. Công sửa: S.

#### M-8. Giới hạn thời gian Vercel với file Excel lớn
- **File:** `app/api/billing/alerts/xlsx/route.ts:15`, `reports/xlsx/route.ts:15` (`maxDuration = 60`); `computeRent` (server action) không khai báo `maxDuration`.
- Giới hạn file tháng đã chặn ở 12 file/lần tải (`billing-files.ts:14`), mỗi file ~250KB. Nhưng `computeRent` đọc và gộp nhiều file tháng trong một action không đặt `maxDuration` (mặc định theo plan Pro là 15s nếu không đặt, cần xác minh). Kỳ tính nhiều tháng + tải nhiều file từ Storage có thể chậm.
- **Cách sửa:** đặt `export const maxDuration = 60` ở route/page chứa action; đo thời gian thực tế với kỳ 3 tháng.
- **Công sửa:** S.

---

### 🟢 Low

- **L-1. Tên file tải về bị mã hóa phần trăm.** `app/api/documents/[id]/route.ts:60`, `share/[token]/route.ts:55`, `share/folder/[token]/route.ts:55`: `filename="${encodeURIComponent(name)}"` làm tên tiếng Việt thành `%C4%90…` khi người dùng lưu file. Billing đã làm đúng (`filename` ASCII + `filename*=UTF-8''`). Nên dùng cùng helper. Công sửa: S.
- **L-2. Lọc tìm kiếm nhận ký tự `%` `_`.** `ilike` ở `documents/list/page.tsx:58`, `api/documents/search/route.ts:28`, `academy/queries.ts:64` không escape wildcard; không phải injection (đã tham số hóa), chỉ làm kết quả tìm kiếm lạ. Các chỗ `.or()` đã loại `, ( )` đúng cách (`admin/clients/page.tsx:32-37`). Công sửa: S.
- **L-3. So sánh `CRON_SECRET` không hằng thời gian** (`api/misa/sync/route.ts:82`). Rủi ro thấp; nên dùng `crypto.timingSafeEqual`. Cron chưa bật trong `vercel.json`.
- **L-4. `profiles_select_authenticated` cho mọi user đọc mọi profile** (`0002_rls.sql:28`), gồm cả `role`, `is_active`. Chấp nhận được cho tool nội bộ (cần để hiển thị tên người tải lên), chỉ ghi nhận.
- **L-5. File rác trong repo:** `academy-admin-redesign.patch`, `header-documents-redesign.patch`, `quotation.md`, `bash.exe.stackdump` (trong thư mục làm việc), `tsconfig.tsbuildinfo`. Nên xóa/gitignore. Công sửa: S.
- **L-6. CLAUDE.md lệch code ở `/billing/compare`:** tài liệu ghi "chỉ admin"; code đúng là admin (kiểm tra role sau `requireBillingUser`), khớp. Nhưng `saveCompanyProfile` nằm trong `requireBillingUser` rồi mới kiểm tra admin, vẫn đúng. Không phải lỗi, chỉ nhắc để tài liệu và code tiếp tục khớp.
- **L-7. Mô tả `uploadDocument` cho phép PDF theo `file.type`** (`documents.ts:62`) — MIME do client gửi, có thể giả. Bucket không đặt `allowed_mime_types` cho `documents` (billing thì có, `0027`/`0041`). Nên kiểm tra magic bytes `%PDF-` ở server. Công sửa: S.
- **L-8. Lint 6 lỗi cũ và `npm outdated`** như mục 2.
- **L-9. Hydration/Date:** `formatDate`/`formatDateTime` đã cố định timezone ICT (`lib/format.ts`), không thấy `new Date()` dùng trực tiếp trong render. Không có vấn đề phát hiện.

---

## 5. Module Billing và MISA — nhận xét và danh sách test case nên có

**Đánh giá logic (chỉ đọc, không sửa `engine.ts`, `misa-parser.ts`, `dates.ts`, `merge-ledgers.ts`):**
- Ngày: `dates.ts` làm việc bằng `Date.UTC` + chuỗi ISO `YYYY-MM-DD`, không phụ thuộc timezone máy chủ → không có lỗi lệch múi giờ UTC vs ICT cho ngày thuê.
- Tiền: cột `total_amount numeric(20,4)`, HSTT dùng `bigint` VND; làm tròn tập trung tại `hstt-totals.ts:41` (`Math.sign(x) * Math.round(Math.abs(x))`, làm tròn nửa ra xa 0). Tính trong JS bằng `number`; ở quy mô hợp đồng hiện tại (~800 triệu) sai số float không đáng kể, nhưng cần test tổng nhiều dòng (xem dưới).
- Parser: dựa vào hàng tiêu đề; đã có kiểm tra file sai cấu trúc ("dừng còn hơn tính thiếu tiền"), phát hiện trùng nội dung bằng SHA-256, và kiểm tra tháng/kỳ.
- HSTT: có golden test từng ô với khối T08 và T09 = 800.796.900 từ bản làm tay. Đây là kiểm soát tốt nhất hiện có.
- Số tiền bằng chữ: `number-to-words.ts` có file riêng và test; đề nghị bổ sung ca biên bên dưới.

**Danh sách test case nên bổ sung** (chưa viết code, chỉ liệt kê; chỗ nào đã có test thì bỏ qua sau khi đối chiếu):

*Tính tiền*
1. Thiết bị trả một phần (xuất trả 3/10 cái) giữa kỳ → số ngày × số lượng đổi đúng từ ngày trả.
2. Trả hết rồi thuê lại cùng mã trong cùng kỳ → hai đoạn riêng, không cộng chồng.
3. Kỳ vắt qua tháng (26/07→25/08) khi file tháng 07 và 08 cùng có chứng từ cuối/đầu tháng → không đếm trùng ngày giao nhau; một chứng từ xuất hiện ở cả hai file.
4. Kỳ có tháng thiếu file → dừng với thông báo "Thiếu file tháng…", không tính ra số thấp.
5. Số lượng âm / điều chỉnh / phiếu ghi giảm → không làm tiền âm ngoài ý muốn.
6. Ngày đầu và ngày cuối: kiểm tra quy ước tính cả hai đầu (kỳ 26→25 = đúng 31 hoặc 30 ngày). Năm nhuận (tháng 2 có 29 ngày).
7. Đơn giá 0 = không tính tiền; mã bị loại trừ (`excluded`) và khoảng ngày loại trừ chồng với kỳ.
8. Đơn giá thập phân và số lượng thập phân: tổng của 1000 dòng nhỏ so với làm tròn một lần (kiểm tra sai số tích lũy).
9. Hai file cùng tháng (phiên bản 1 và 2): chỉ bản `active` được dùng; đổi bản sau khi đã xác nhận phải bị chặn (`needsAdmin`).

*Parse Excel*
10. File sai định dạng (CSV đổi đuôi, xlsx hỏng, file rỗng, file rất lớn).
11. Cột đổi tên hoặc đổi thứ tự; dòng tiêu đề lùi xuống; ô gộp; dòng tổng cuối bảng.
12. Số kiểu text ("1.234,5" và "1,234.5"), ngày kiểu serial Excel, ngày kiểu chuỗi `dd/mm/yyyy`, ô trống giữa các dòng.
13. Mã vật tư có khoảng trắng đầu/cuối hoặc khác hoa thường.

*HSTT*
14. Tổng thuế VAT làm tròn: 8% và 10% của tổng lẻ; giảm trừ sau thuế; nợ đầu kỳ ghi đè.
15. Số tiền bằng chữ: 0, 1, 10, 11, 15, 21, 101, 1.000, 1.001, 1.000.000, 1.500.000.000, số âm; "lăm/nhăm/mốt/tư/linh".
16. Kỳ đã xác nhận thì từ chối sửa dữ liệu kỳ (đã có `hstt-lock.test.ts`); hủy xác nhận rồi sửa lại.
17. Mẫu HSTT riêng: thiếu ô Z1, có biểu đồ/ảnh (phải báo lỗi), mục II Vận chuyển vắng.

*Phân quyền billing (nên có test tích hợp)*
18. `billing_viewer` gọi mọi action ghi → bị từ chối; vẫn tải được HSTT và Excel.
19. Employee/manager gọi `/api/billing/*` → chuyển hướng, không trả file.

---

## 6. Phần còn lại của checklist

**Next.js App Router**
- 78 file `"use client"`. Chưa thấy server-only code lọt vào client bundle: `lib/auth/dal.ts`, `lib/activity.ts`, `lib/documents/share.ts` đều có `import "server-only"`; `createAdminClient` chỉ import ở action/route/server lib. Không có biến `NEXT_PUBLIC_` nào chứa secret (chỉ URL, anon key, site URL — `lib/env.ts`).
- Cache: mọi trang nghiệp vụ là dynamic (`ƒ`), dữ liệu theo user không bị cache chung. Các route file có `Cache-Control: private, no-store`. `getSessionUser` dùng `cache()` của React (theo request), an toàn.
- `revalidatePath("/documents", "layout")` được gọi sau upload/xóa; chưa kiểm tra từng action còn lại, cần xác minh khi UAT (thêm khách hàng/dự án có cập nhật sidebar ngay không).
- `loading.tsx` có 5 file; `error.tsx`/`not-found.tsx` thiếu (H-1).

**Database / Supabase (thay cho phần Prisma)**
- Đã đọc RLS cho `profiles`, `clients`, `projects`, `project_members`, `documents`, `share_links`, `folder_share_links`, `activity_log` và policy storage. Chưa thấy bảng nào bật RLS thiếu policy; helper RLS nằm ở schema `private`, không lộ qua REST (0004).
- **Cần xác minh trên DB thật** (anh chạy được bằng đọc): chạy Supabase Security Advisor, và với anon key thử `GET /rest/v1/<bảng>` với từng bảng để chắc chắn trả rỗng/401. Tôi không gọi REST thật theo quy tắc an toàn. Lưu ý `rls_auto_enable` tồn tại ngoài repo (0004, mục 6) — TODO cũ chưa làm.
- Index: đã có `project_members_user_id_idx`, `folder_share_links_client_id_idx`; chưa rà hết các bảng billing/academy. Cần xác minh bằng `EXPLAIN` trên dữ liệu thật khi bảng lớn.
- Transaction: tạo tài liệu = upload storage + insert row, có rollback thủ công khi insert lỗi (`documents.ts:128-134`) — tốt, nhưng nếu process chết giữa chừng sẽ để lại file mồ côi (nhẹ). Phần "lưu dữ liệu kỳ trong một transaction" đã được ghi nhận là nợ trong CLAUDE.md.
- Xóa: xóa cứng; `documents.project_id` là `on delete restrict` (an toàn); xem H-2 cho user.

**Vận hành**
- Staging/backup: dự án chỉ có production. Đề xuất: tạo một project Supabase thứ hai (free/Pro) làm staging, chạy lại toàn bộ `supabase/migrations`, và Vercel preview trỏ vào đó; bật Point-in-Time Recovery hoặc backup hằng ngày trên production trước UAT; giữ các script `backup-billing*.sql` đã có và chạy trước mỗi lần apply migration.
- Sửa mục 1, 2, 5 trước khi mời người dùng thật.

**Chất lượng code / UX**
- Dead code: chưa chạy công cụ phát hiện (knip/depcheck). `driver.js`, `exceljs`, `xlsx` đều được dùng. Có hai thư viện đọc Excel (`exceljs` và `xlsx`) — cần xác minh có thật sự cần cả hai không (giảm bundle và bề mặt lỗ hổng).
- Double submit: các form dùng `useActionState` + `pending`; chưa rà từng form. Cần xác minh khi UAT với form tạo hợp đồng, xác nhận bản tính.
- Mobile: bảng có `responsive-table`, sidebar thành drawer (theo CLAUDE.md); chưa kiểm tra trực quan ở 375px, cần xác minh bằng trình duyệt.

---

## 7. Kế hoạch sửa

**Phải xong trước UAT**
| # | Việc | Công | Cần migration |
|---|---|---|---|
| C-1 | Siết quyền tạo link thư mục (và rà các link đã tạo) | S–M | Có (mới) |
| M-1 | Route API dùng `getSessionUser()`; `is_project_member` xét `is_active` | S | Có (nhỏ) |
| H-2 | `deleteUser`/`setUserActive`/`setUserRole` kiểm tra lỗi; ưu tiên "Vô hiệu hóa" | S | Không (hoặc có nếu đổi FK) |
| H-1 | Thêm `error.tsx`, `not-found.tsx`, `global-error.tsx` | S | Không |
| H-3 | Xác minh cấu hình Auth trên dashboard; yêu cầu mật khẩu cũ khi đổi | S | Không |
| M-3 | `requireUser()` ở `profile.ts` | S | Không |
| — | Bật backup/PITR production; dựng staging | M | Không |

**Nên làm trong hoặc ngay sau UAT**
M-2 (thông báo lỗi tiếng Việt), M-4 (khóa MISA sync), M-5 (token trong log), M-6 (log đầy đủ), M-8 (`maxDuration`), L-1 (tên file), L-7 (kiểm tra PDF), H-4 (bổ sung test billing).

**Để sau**
L-2, L-3, L-4, L-5, L-8; dọn lint nợ cũ; nâng phiên bản `next` 16.4.3, `react-hook-form` 7.91; đánh giá bỏ một trong hai thư viện Excel.

---

## 8. Việc đã làm và chưa làm

**Đã làm:** đọc `package.json`, `next.config.ts`, `proxy.ts`, `lib/supabase/proxy.ts`, `lib/auth/dal.ts`, `lib/env.ts`, `vercel.json`; migration 0001–0004, 0015, 0022, 0023 và phần RLS liên quan; toàn bộ file `app/actions/*.ts` (grep guard) và đọc kỹ `auth`, `profile`, `users`, `documents`, `shares`, `folder-shares`, `billing-files`, một phần `billing`/`billing-hstt`; toàn bộ route handler; `lib/documents/share*.ts`, `lib/misa/sync.ts`, `lib/misa/client.ts`; chạy `tsc`, `lint`, `test`, `build`, `npm audit`, `npm outdated`.

**Chưa làm / cần xác minh thêm:** không đọc từng dòng các file engine billing (theo quy tắc không sửa, và đã có golden test); không đọc hết RLS billing (0027, 0028, 0034–0041) và academy (0005–0013); không đọc nội dung `.env.local`; không gọi Supabase REST bằng anon key; không kiểm tra trực quan mobile; không chạy knip/depcheck. Những chỗ trên đã đánh dấu "cần xác minh".

*(Đoạn này mô tả trạng thái lúc audit ban đầu. Xem mục 9 và 10 cho phần bổ sung và các sửa đã duyệt.)*

---

## 9. Bổ sung: RLS của Billing và Academy (đã đọc nốt)

Đã đọc: `0027`, `0028`, `0030`, `0034`–`0041` (billing) và `0005`–`0013`, `0014`, `0017` (academy). Kết luận chung: **không có bảng nào thiếu RLS, không có đường ghi cho `billing_viewer`, bucket `billing`/`billing-templates` private và chỉ nhận `.xlsx`.**

### 9.1 Billing — những điểm đạt
- Mọi bảng billing đều `enable row level security`. Đọc dùng `private.is_billing_viewer()`, ghi dùng `private.is_billing_user()` (admin + kế toán) hoặc `private.is_admin()`. Các hàm này đều xét `is_active` (`0027:37`, `0034`).
- Viewer chỉ có SELECT (và INSERT log tải HSTT `billing_hstt_exports`). Không ghi được kể cả gọi thẳng PostgREST.
- Các RPC `billing_save_price_lines`, `billing_import_price_lines`, `billing_add_month_file` tự kiểm `private.is_billing_user()` bên trong; `billing_add_hstt_template_version` kiểm `is_admin()`; đều `revoke … from public, anon`. `billing_save_contract_config` đã bị thu quyền thực thi ở `0037:221`.
- Vòng đời bản tính được khóa ở DB: `billing_calc_guard` (`0027:181`) cấm sửa bản đã xác nhận (kể cả tổng tiền, snapshot, file nguồn), cấm hủy bản nháp, chỉ cho `confirmed → voided`; RLS chỉ cho admin hủy. File nguồn của bản đã xác nhận không xóa được (`billing_upload_delete_guard`, `billing_month_file_delete_guard`). Đây là thiết kế audit tốt.
- Xóa hợp đồng, file MISA, mẫu kỳ, mẫu HSTT: chỉ admin.

### 9.2 Billing — vấn đề

**B-1 🟡 Medium: dữ liệu kỳ HSTT không bị khóa ở DB khi kỳ đã xác nhận.**
`0038:255-290`: các bảng `billing_period_inputs`, `billing_period_transport`, `billing_period_deductions`, `billing_contract_hstt`, `billing_contract_advances`, `billing_customers`, `billing_transport_prices` cho `is_billing_user()` ghi toàn quyền. Việc "kỳ đã xác nhận thì không sửa" chỉ có ở server action `savePeriodInputs` (`periodEditBlock`). Một kế toán (hoặc script dùng JWT của họ) gọi thẳng PostgREST sửa được vận chuyển, giảm trừ, tạm ứng của kỳ đã xác nhận, làm HSTT tải lại khác với bản đã gửi khách. Đã ghi trong CLAUDE.md là nợ ("trigger khóa kỳ đã xác nhận ở DB"). **Khuyến nghị: làm trước khi mở billing cho nhiều người dùng**, dùng trigger `before insert/update/delete` kiểm tra có bản tính `confirmed` cùng hợp đồng và `period_from`. Công sửa M, cần migration (gửi SQL duyệt trước).

**B-2 🟡 Medium: DB không kiểm lại số tiền khi xác nhận.**
`billing_rent_calculations_update` cho kế toán sửa mọi cột của bản **nháp** (`0028`), và `billing_calc_guard` chỉ đóng dấu người xác nhận, không đối chiếu `total_amount` với `result`. Qua API thẳng, kế toán có thể sửa `total_amount`/`result` của bản nháp rồi xác nhận. Qua app thì không (action tính lại từ file). Rủi ro nội bộ, cần người có token hợp lệ và biết PostgREST; nhưng đây là dữ liệu tài chính. Hướng xử lý: hạn chế cột được UPDATE (chỉ `status`) bằng trigger từ chối đổi `total_amount`/`result`/`contract_snapshot` của nháp ngoài đường tạo, hoặc chuyển "tính" và "xác nhận" thành RPC. Công sửa M–L, ưu tiên sau B-1.

**B-3 🟢 Low:** `billing_hstt_exports_insert` cho viewer ghi log tải với `exported_by = chính mình`, nhưng các cột `after_tax`, `closing_debt`, `file_name` do client điền. Log tải HSTT có thể bị làm giả nội dung (không giả được người). Chấp nhận được; nếu muốn tin cậy, ghi log bằng RPC `security definer` tính số từ DB.

**B-4 🟢 Low:** `billing_calc_guard` không `security definer` và không kiểm `is_active`, nhưng đã nằm sau RLS (có `is_billing_user()`), nên không có lỗ hổng.

### 9.3 Academy — những điểm đạt
- Mọi bảng có RLS. Khóa học/chương/bài/quiz/file chỉ đọc được khi `published` (hoặc admin/manager theo 0017); ghi chỉ admin/manager. Tiến độ, ghi chú, đăng ký chỉ thấy bản của chính mình (admin xem tất cả).
- Video: `createSignedUrl` 900 giây, qua route đã kiểm quyền; bucket private.

### 9.4 Academy — vấn đề

**A-1 🟡 Medium: người học đọc được đáp án đúng của quiz.**
`0011_academy_quiz_rls.sql:6-7` thừa nhận việc này: `quiz_options_select` cho mọi user đăng nhập đọc cả cột `is_correct` của khóa học đã publish. Code giao diện cố ý không chọn cột đó (`lib/academy/queries.ts:201`), nhưng gọi `GET /rest/v1/quiz_options?select=*` bằng JWT của chính mình là lấy được. Quiz mất ý nghĩa với người cố tình. **Sửa:** `revoke select (is_correct) on public.quiz_options from authenticated` (column privilege) và chấm điểm ở server bằng service role/RPC; hoặc tách `is_correct` sang bảng riêng chỉ admin/manager đọc được. Cần kiểm tra `submitChapterQuiz` đang đọc `is_correct` bằng client nào trước khi thu quyền. Công sửa S–M.

**A-2 🟡 Medium: người học tự ghi "đã qua quiz".**
`chapter_quiz_passes_insert` (`0014:135`) cho `user_id = auth.uid()` insert thẳng, không cần làm bài. Gọi PostgREST `POST /rest/v1/chapter_quiz_passes` là chương được đánh dấu đạt, `recomputeCourseCompletion` có thể đánh dấu hoàn thành khóa. **Sửa:** bỏ policy INSERT/DELETE của `authenticated` cho bảng này và ghi bằng service role sau khi chấm ở `submitChapterQuiz` (hoặc RPC). Phối hợp với A-1. Công sửa S–M.

**A-3 🟢 Low:** `lesson_progress_insert` và `course_enrollments_update` không ràng buộc bài/khóa thuộc khóa đã publish hoặc các cột được sửa (người học tự sửa tiến độ của chính mình). Tác động chỉ lên số liệu cá nhân.

**A-4 🟢 Low:** policy academy dùng `user_id = auth.uid()` và `status = 'published'`, không xét `is_active`; user bị khóa còn token vẫn đọc nội dung. Đã được chặn ở tầng route nhờ mục 2; các truy vấn trang đã qua `getSessionUser`.

> A-1 và A-2 không ảnh hưởng dữ liệu tài chính hay tài liệu khách hàng, chỉ ảnh hưởng độ tin cậy của đào tạo. Có thể xếp sau B-1.

---

## 10. Tiến độ sửa (đã được duyệt: mục 1, 2, 4; mục 5 hoãn)

| Mục | Trạng thái | Chi tiết |
|---|---|---|
| 1. Folder share (C-1) | Code xong, **migration 0042 chờ duyệt** | Chỉ admin/manager tạo link thư mục; select giới hạn creator hoặc content manager. Rollback `supabase/revert/0042_…revert.sql`. Câu SELECT rà link cũ: `supabase/revert/list-employee-folder-shares.sql` |
| 2. User bị khóa (M-1) | Code xong, **migration 0043 chờ duyệt** | 6 route API dùng `getSessionUser()`; `private.is_project_member` xét `is_active`. Rollback `supabase/revert/0043_…revert.sql` |
| 4. Trang lỗi (H-1) | Xong | `error.tsx` (app và (app)), `not-found.tsx` (2), `global-error.tsx`, namespace `Errors` (vi/en) |
| B-1 Khóa kỳ HSTT ở DB | **Migration 0044 chờ duyệt** | Trigger chặn insert/update/delete `billing_period_inputs`, `_transport`, `_deductions` khi kỳ có bản tính đã xác nhận. Rollback `supabase/revert/0044_…revert.sql` |
| B-2 Toàn vẹn bản tính | **Migration 0045 chờ duyệt** | Nội dung bản nháp bất biến; `total_amount` phải khớp `result.totalAmount` (sai số < 0,5đ) khi tạo và khi xác nhận. Rollback `supabase/revert/0045_…revert.sql`. Rà dữ liệu cũ trước: `supabase/revert/check-calc-total-consistency.sql` |
| A-1, A-2 Quiz academy | Đã duyệt, làm sau B-1/B-2 | |
| 3. Xóa user (H-2) | Chưa duyệt | |
| 5. Đăng nhập/đổi mật khẩu (H-3) | Hoãn theo yêu cầu | Chờ kết quả kiểm tra dashboard Auth |

Kiểm tra sau sửa: `tsc` sạch, lint đúng 6 lỗi cũ, 435/435 test, `next build` thành công.
