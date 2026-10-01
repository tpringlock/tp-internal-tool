# Triển khai Giai đoạn 1 – Nền dữ liệu (billing)

> ⚠ Chỉ có một database và đó là **PRODUCTION** (`surnokungqebqzzlyrsz`). Mọi lệnh `--linked` bên dưới đều chạy trên dữ liệu thật.
> Backup lưu ở `C:\Users\Admin\tp-backups\`, **không** lưu trong repo.

## Migration

| File | Loại | Khi nào apply |
|---|---|---|
| `0033_billing_viewer_role_enum.sql` | thêm giá trị enum `billing_viewer` | Đợt A (ban ngày được) |
| `0034_billing_viewer_rls.sql` | `private.is_billing_viewer()`, 6 policy SELECT | Đợt A |
| `0035_billing_month_files.sql` | bảng `billing_misa_month_files`, RPC `billing_add_month_file`, trigger | Đợt A |
| `0036_billing_price_lines.sql` | bảng `billing_price_lines`, `billing_price_imports`, 2 RPC, cột `misa_kho_name` | Đợt A |
| `0037_billing_gd1_cutover.sql` | backfill file tháng, chép bảng giá, tự kiểm tra, **khóa ghi bảng giá cũ** | Đợt B (ngoài giờ), ngay trước khi deploy code GĐ1 |

**Tính nguyên khối:** `supabase db push` (CLI 2.119.0, đã đọc mã nguồn `pkg/migration/file.go`) gửi mỗi file thành **một batch, kết thúc bằng một Sync**, nên cả file chạy trong một transaction, kể cả dòng ghi lịch sử migration. Chỉ các lệnh `... CONCURRENTLY`, `VACUUM`, `ALTER SYSTEM`, `CLUSTER` mới bị tách ra, và 0033–0037 không có lệnh nào như vậy. Ngoài ra, 0037 được viết thành **một khối `DO` duy nhất** (cả phần khóa ghi), nên nguyên khối với mọi cách chạy.

0033–0036 chỉ **thêm mới**, nên code đang chạy không bị ảnh hưởng. 0037 làm code cũ không sửa được bảng giá nữa, vì vậy phải apply **cùng lúc** với việc deploy code mới.

Đã chạy thử toàn bộ chuỗi 0001→0037 và các file revert trên Postgres tạm (PGlite), với dữ liệu giống production: 76 kiểm tra đều đạt (chuyển dữ liệu, phân quyền 4 vai trò, file tháng, import kể cả file chỉ 3 cột và file mẫu thật `mau-nhap-don-gia.xlsx`, revert, áp lại sau revert).

## Đợt A – chuẩn bị (ban ngày được)

| # | Việc | Lệnh / cách làm | Đạt khi | Nếu hỏng |
|---|---|---|---|---|
| A1 ✅ 01/10 | Backup | `npx supabase db query --linked -f supabase/revert/backup-billing.sql > C:\Users\Admin\tp-backups\billing-A1-<ngày giờ>.json` và `npx supabase db query --linked -f supabase/revert/check-real-contracts.sql` (lưu kết quả) | File JSON có dữ liệu | – |
| A2 ✅ 01/10 | Dọn dữ liệu giả định | `npm run seed:gia-dinh:xoa -- --project=surnokungqebqzzlyrsz` | Script báo đã xóa | Dừng, gửi log |
| A3 ✅ 01/10 | Kiểm tra hợp đồng thật | Chạy lại `check-real-contracts.sql`, so với A1 | `real_contracts`, `real_items`, `real_excluded_codes` và 3 MD5 **giống hệt** A1 | Dừng. Khôi phục từ JSON A1 (nhờ Claude viết lệnh khôi phục từ file backup) |
| A4 | Deploy code v2 (đã merge vào `main`) | `git push origin main`. Vercel tự build bản Production | Vercel báo Ready, `/billing` mở được | Vercel → Deployments → bản trước → **Instant Rollback** |
| A5 | Apply 0033–0036 | `npx supabase migration list` (kiểm tra chỉ còn 0033–0036 chưa apply), rồi `npx supabase db push` | `migration list` báo 0033–0036 đã apply | 0033–0036 không đổi dữ liệu cũ. Muốn gỡ thì chạy revert theo thứ tự 0036 → 0035 → 0034 (xem cuối trang) |
| A6 | Kiểm tra nhanh | Đăng nhập kế toán: tính thử 1 bản nháp, tải 1 file MISA như trước | Mọi thứ chạy như cũ | Như A5 |

**Lưu ý A5:** `db push` apply **mọi** file chưa chạy, nên thư mục `supabase/migrations` lúc đó **không được có 0037**. Cách làm:

- Claude commit 0033–0036 + các file revert/kiểm tra thành một commit riêng, rồi đưa commit đó vào `main`.
- 0037 nằm ở nhánh `feature/billing-gd1`, chỉ vào `main` lúc cutover.
- Chạy A5 từ `main`. Trước khi push, kiểm tra bằng `npx supabase migration list`: chỉ được thấy 0033–0036 là "chưa apply".

## Đợt B – cutover (ngoài giờ)

Điều kiện: code GĐ1 đã review xong, test xanh, build OK, đã merge vào `main` ở máy nhưng **chưa push**.

| # | Việc | Lệnh / cách làm | Đạt khi | Nếu hỏng |
|---|---|---|---|---|
| B1 ✅ 01/10 | Báo kế toán ngừng thao tác | – | Không còn ai đang dùng `/billing` | – |
| B2 ✅ 01/10 | Backup | `backup-billing.sql` và `backup-billing-gd1.sql` (lưu ra `tp-backups`), `check-real-contracts.sql` (lưu kết quả) | Có file | – |
| B3 ✅ 01/10 | Apply 0037 | `npx supabase migration list` (chỉ còn 0037), rồi `npx supabase db push` | Lệnh chạy xong, không lỗi | 0037 chạy trong **một transaction**: lỗi thì không có gì thay đổi. Dừng, giữ code cũ, gửi lỗi cho Claude |
| B4.1 ✅ 01/10 | Kiểm tra bảng giá | `npx supabase db query --linked -f supabase/revert/check-price-lines-migration.sql` | `diff_count = 0`, `groups_with_two_prices = 0`, `price_lines = old_codes + old_excluded`. **Lưu `real_price_lines_md5`** | Chạy `supabase/revert/0037_billing_gd1_cutover.revert.sql`. Code cũ chạy lại bình thường |
| B4.2 ✅ 01/10 | Kiểm tra file tháng và hợp đồng | `check-month-files.sql` và `check-real-contracts.sql` | `months_without_active = 0`, `months_with_two_active = 0`, `not_full_month = 0`. `check-real-contracts` **giống hệt B2** (0037 không sửa bảng cũ) | Như B4.1 |
| B4.3 ✅ 01/10 | Tính lại các bản tính cũ | `npx tsx scripts/billing-verify-recalc.mts` (viết ở bước code; **chỉ đọc**): tính lại mọi bản tính thật chưa hủy bằng bảng giá mới, trên đúng các file đã dùng, rồi so từng dòng, từng đồng với `result` đã lưu | `0 khác biệt`, kể cả các bản tính Việt Panel | Như B4.1 |
| B4.4 ⏳ | **Anh/chị kiểm tra file tháng** | `npx supabase db query --linked -f supabase/revert/list-month-files.sql` → mỗi phiên bản 1 dòng: tháng, phiên bản, ĐANG DÙNG / đã thay, tên file, kỳ của file, người tải, lúc tải, sha256, số bản tính đang dùng | Bản **ĐANG DÙNG** của từng tháng (đặc biệt tháng 06/2026) là đúng file chuẩn | Nếu chỉ chọn sai bản đang dùng: vẫn deploy, sau đó admin tải lại file chuẩn (thành phiên bản mới, tự đang dùng) hoặc khôi phục phiên bản đúng. Nếu file chuẩn không có trong danh sách: tải lên sau deploy |
| B5 | Deploy code GĐ1 | `git push origin main` | Vercel Ready | Build lỗi thì Vercel vẫn giữ bản cũ. **Phải** chạy revert 0037 (code cũ cần bảng giá cũ ghi được) |
| B6 | Kiểm tra trên web | Xem danh sách bên dưới | Tất cả đạt | Vercel **Instant Rollback** về bản trước, rồi chạy revert 0037 |

**Danh sách kiểm tra B6:**

1. **Kế toán:**
   - Mở hợp đồng Việt Panel: 17 dòng giá; Kích U/Kích chân/Giáo 2.5m/Giằng 1.2m hiển thị gộp đúng như cũ; PALLET và VT0094 là "không tính tiền".
   - Mở một bản tính **đã xác nhận**: số liệu không đổi.
   - Tính nháp Việt Panel với các file đã có: tổng tiền bằng bản nháp tương ứng trước cutover.
2. **File nguồn:** danh sách theo tháng, đủ các phiên bản; tải về được 1 file.
3. **Bảng giá:** xuất Excel, rồi nhập lại chính file đó ở chế độ "Thêm/sửa". Xem trước phải báo **0 thay đổi**.
4. **Tài khoản Chỉ xem** (tạo trong Admin → Users):
   - xem được mọi trang, không thấy nút sửa;
   - tải được file, xuất được Excel;
   - mở thẳng URL của trang nhập bảng giá thì bị chặn.
5. **Nhân viên (employee):** không thấy app Tính hóa đơn.
6. Chạy lại `check-price-lines-migration.sql`: `real_price_lines_md5` vẫn bằng giá trị đã lưu ở B4.1 (chưa ai sửa).

## Quay lại sau khi đã chạy thật vài ngày

1. Vercel → Instant Rollback về bản trước GĐ1.
2. `npx supabase db query --linked -f supabase/revert/0037_billing_gd1_cutover.revert.sql`
   - Dựng lại bảng giá cũ **từ bảng giá mới**, nên giữ được các thay đổi và lần import sau cutover. Các dòng cùng "Tên in trên HSTT" gộp lại thành 1 dòng; đơn giá 0 chuyển thành mã không tính tiền.
   - Lưu bản chụp bảng cũ đã khóa vào `private.*_0037_snapshot`.
   - Dừng nếu có nhóm cùng tên in mà khác đơn giá. Khi đó phải sửa trên web trước, hoặc nhờ Claude xử lý.
   - Các file đã tải lên sau cutover vẫn còn (`billing_misa_uploads` và Storage). Chỉ mất phần đánh số tháng/phiên bản.
3. Khi muốn làm lại thì apply lại 0037: file này tự kiểm tra và không chạy trùng.

## Gỡ hẳn 0033–0036 (hiếm khi cần)

Thứ tự: revert 0037 (nếu đã apply) → `0036_billing_price_lines.revert.sql` → `0035_billing_month_files.revert.sql` → `0034_billing_viewer_rls.revert.sql`.

- Mỗi file tự từ chối chạy nếu làm sai thứ tự.
- Giá trị enum `billing_viewer` không xóa được (Postgres không hỗ trợ). Nó nằm yên và vô hại; người đang có role này được chuyển về `employee`.
- File import đã lưu ở `billing/price-imports/` trong Storage không tự xóa.
- Sau khi gỡ hẳn, phải sửa lại tay `supabase_migrations.schema_migrations` (xóa các dòng 0033–0037), nếu không `db push` sẽ coi như chúng vẫn đã apply. Claude sẽ viết lệnh này khi cần.
