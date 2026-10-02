# Tính hóa đơn tự động – module tính tiền thuê (`lib/billing`, `/billing`)

Tải file *Sổ chi tiết vật tư hàng hóa* từ MISA → upload lên hệ thống → tính tiền thuê thiết bị của một dự án trong một kỳ (hoặc một khoảng ngày). Quy tắc nghiệp vụ nằm ở `docs/billing-rules.md`.

Engine tính **tiền thuê thiết bị** (mục I của BB đối chiếu giá trị). Từ GĐ3, vận chuyển, VAT, giảm trừ, công nợ được nhập ở khối **Dữ liệu kỳ** và app xuất **HSTT 4 biểu** (ĐNTT, ĐCCN, Giá trị, Khối lượng) từ bản tính đã xác nhận: xem phần [Hồ sơ thanh toán (HSTT)](#hồ-sơ-thanh-toán-hstt-gđ3).

## Quyền

- Chỉ **admin** và **kế toán** (role `accountant`, migration 0026) vào được `/billing`. Manager và nhân viên không thấy card ở trang chủ, không thấy app trong menu "Ứng dụng", gõ URL thì bị đưa về trang chủ.
- Guard: `requireBillingUser()` (`lib/auth/dal.ts`), `canUseBilling()` (`lib/auth/roles.ts`). RLS: `private.is_billing_user()` (0027/0028).
- Kế toán **không** vào Admin Panel. Mỗi người chỉ có một role, nên đổi một manager sang kế toán thì người đó mất Admin Panel.
- Chỉ admin: xóa hợp đồng, xóa file MISA, hủy bản tính đã xác nhận, trang **Đối chiếu Excel**.

## Giao diện `/billing`

| Trang | Nội dung |
|---|---|
| `/billing` | Tính tiền thuê (GĐ2): chọn hợp đồng + **mẫu kỳ** + tháng kết thúc kỳ, hoặc **khoảng ngày**. Hệ thống **tự lấy bản đang dùng của các file tháng phủ kỳ** (`pickMonthFiles` → `mergeLedgers`) và liệt kê trước khi tính; thiếu tháng thì báo "Thiếu file tháng MM/YYYY" và không cho tính. File cũ nhiều tháng chỉ còn ở mục **Dự phòng**. Bấm Tính → tự lưu **bản nháp** và mở trang kết quả. |
| `/billing/calculations/[id]` | Cảnh báo, tổng hợp theo thiết bị, chi tiết từng phiếu (cột Diễn giải = `explain`). Tải Excel · Xác nhận · Xóa nháp · Hủy xác nhận (admin). |
| `/billing/history` | Lịch sử, lọc theo hợp đồng / trạng thái / loại (kỳ HSTT hay khoảng ngày). |
| `/billing/uploads` | File MISA đã tải (kỳ dữ liệu, bản 13/16 cột, cảnh báo). |
| `/billing/contracts`, `/billing/contracts/[id]` | Hợp đồng, đơn giá theo ngày, mã MISA gộp vào từng dòng, mã không tính tiền, ngày miễn tính riêng. Mã chưa khai báo khi tính → link "Thêm các mã này vào hợp đồng". |
| `/billing/excluded-ranges` | Ngày miễn tính chung (Tết…) hoặc riêng hợp đồng. |
| `/billing/reports` | **Báo cáo tiền thuê nhiều dự án** (GĐ2, chỉ tính và xem, không ghi DB; cả "Chỉ xem" dùng được): chọn nhiều dự án (tìm kiếm, lọc trạng thái, chọn tất cả), mẫu kỳ + tháng hoặc khoảng ngày. Tự lấy file tháng đang dùng phủ kỳ, thiếu tháng thì dừng. Kết quả: tổng hợp theo mã VT (đơn giá khác nhau → "Theo dự án"), danh sách dự án giảm dần + tổng, dự án lỗi ở cuối kèm lý do; bấm dự án → `/billing/reports/project/[id]` (từng phiếu). Xuất Excel (`POST /api/billing/reports/xlsx`): Tổng hợp, Danh sách dự án, mỗi dự án 1 sheet, công thức H=E−D+1, J=I×H×G, SUBTOTAL + giá trị tính sẵn. Hợp đồng giả định chỉ hiện khi bật công tắc, có băng đỏ. Code: `rent-report.ts` (thuần), `rent-report-server.ts`, `rent-report-export.ts`, action `app/actions/billing-reports.ts`. Đo 02/10/2026 trên file T08+T09 thật + 209 cấu hình giả định (211 kho): đọc file ~1,1s, tính 0,05s, Excel 199 sheet 0,7s, tổng ~2,2s (`maxDuration = 60`). |
| `/billing/periods` | **Mẫu kỳ** (0040): ngày bắt đầu 1–28 + 1/3/6/12 tháng. Mọi người xem, chỉ admin thêm/sửa/xóa. Hợp đồng gán **mẫu kỳ mặc định** ở tab Chung. |
| `/billing/compare` | **Chỉ admin.** Đối chiếu với tool Excel (xem dưới). |
| `/billing/customers`, `/billing/customers/[id]` | Khách hàng (Bên A) của HSTT. Xóa: chỉ admin, không xóa được khi còn hợp đồng dùng. |
| `/billing/contracts/[id]?tab=hstt` | Tab **HSTT** của hợp đồng: Bên A, loại/ngày ký HĐ, dự án, câu "Căn cứ…", VAT, nợ ban đầu, bảng giá vận chuyển, tạm ứng. |
| `/admin/company` | **Chỉ admin.** Thông tin công ty (Bên B). |

**Vòng đời bản tính:** nháp → đã xác nhận → đã hủy. Bản đã xác nhận bị khóa (trigger `billing_calc_guard`); mỗi hợp đồng + kỳ chỉ có một bản xác nhận. **Không xác nhận được** khi:
- khoảng ngày **không trùng đúng kỳ của hợp đồng** (`period_start_day`, 1 tháng, cắt theo `contract_start`): mẫu kỳ khác hoặc khoảng ngày tự chọn được lưu với `period_month = null`, chỉ để tra cứu (`matchContractMonth` / `presetPeriodFor` trong `period-presets.ts`);
- hợp đồng giả định;
- có mặt hàng **số lượng lẻ** (thường do nguyên vật liệu nằm nhầm trong kho cho thuê): hiện băng đỏ, vẫn lưu nháp được, kế toán sửa mã hàng rồi tính lại.

## Luồng xử lý

```
file .xlsx MISA ──parseMisaLedger──▶ Ledger ──(mergeLedgers nếu nhiều file)──▶ Ledger
                                                        │
               ContractConfig + Period ─────────────────┤
                                                        ▼
                                          buildRentInput   (lọc kho, gộp mã, tồn đầu kỳ, phiếu trong kỳ)
                                                        ▼
                                          calculateRent    (hàm thuần: SL × ngày × đơn giá)
                                                        ▼
                                          RentResult ──exportRentXlsx──▶ .xlsx theo mẫu BB đối chiếu giá trị
```

| File | Vai trò |
|---|---|
| `misa-parser.ts` | Đọc file MISA 13 hoặc 16 cột, tìm cột theo header, kiểm tra tồn cộng dồn. `normalizeCode` gộp dấu cách thừa trong mã kho/mã hàng (MISA có `"INTECH  - 1"`). |
| `merge-ledgers.ts` | Ghép các file tháng liên tiếp (ví dụ T8 + T9 để tính kỳ 26/08–25/09). |
| `engine.ts` | `buildRentInput` (MISA → đầu vào) và `calculateRent` (hàm thuần). |
| `dates.ts` | Ngày dạng chuỗi ISO, không phụ thuộc múi giờ. `billingPeriod("2026-08")` = 26/07–25/08. |
| `export-xlsx.ts` | Xuất mục "I. Thiết bị vật tư" theo cột của HSTT hiện tại. |
| `contracts/vietpanel-senci.ts` | Hợp đồng mẫu (seed 0029, dữ liệu test). |
| `contract-config.ts` | Hàng DB → `ContractConfig`, tách/kiểm tra danh sách mã (dùng được ở client). |
| `ledger-checks.ts` | `findUnknownCodes`, `warningsForWarehouse` (server, vì import parser/exceljs). |
| `periods.ts`, `amounts.ts` | Kỳ/tháng, gợi ý file phủ kỳ; làm tròn 4 số lẻ, phát hiện số lượng lẻ. |
| `server.ts`, `queries.ts` | Đọc file từ Storage, nạp hợp đồng/hợp đồng giả định, truy vấn dùng chung (server-only). |
| `compare.ts` | Tính mọi hợp đồng giả định cho trang đối chiếu. |
| `demo-seed.ts`, `seed/gia-dinh-excel-contracts.json` | Dữ liệu giả định (đơn giá Excel) → hàng DB. |

**Không sửa logic** `engine.ts`, `misa-parser.ts`, `dates.ts`, `merge-ledgers.ts` nếu chưa hỏi chủ dự án. Bản cập nhật của module được so sánh từng file rồi mới chép đè.

## Hồ sơ thanh toán (HSTT, GĐ3)

Kế hoạch và khảo sát file làm tay: `docs/hstt/hstt-export-plan.md` (mục 8 "Đã biết", mục 9 "Việc còn nợ").

**Luồng:** tính tiền (kỳ 26 → 25) → nhập **Dữ liệu kỳ** trên trang bản tính → **xác nhận** → **Tải HSTT (4 biểu)**.

- **Dữ liệu kỳ** (bảng `billing_period_*`, theo hợp đồng + ngày đầu kỳ, dùng chung cho mọi bản tính của kỳ): số chuyến G, lũy kế F, "Tính ngay"/"Tính cuối kỳ" từng loại xe; giảm trừ sau thuế; Bên A đã thanh toán; nợ đầu kỳ (tự tính, có thể ghi đè). Tổng xem trước ngay trên trang: trước thuế, VAT, sau thuế, nợ cuối kỳ, bằng chữ.
- **Khóa:** kỳ đã có bản tính **xác nhận** thì không sửa được dữ liệu kỳ (`periodEditBlock` trong `savePeriodInputs`, kiểm từ DB trước mọi lệnh ghi; test `hstt-lock.test.ts`). Muốn sửa: admin hủy xác nhận. Chỉ xem: xem và tải HSTT, không sửa gì.
- **Nợ đầu kỳ** (`openingDebtFor` / `openingDebtInfo`): các tháng **≤ `opening_debt_month`** của hợp đồng là tháng làm tay → bản tính của các tháng đó (kể cả đã xác nhận) bị bỏ qua và **không tải được HSTT** ("Kỳ … đã làm HSTT bằng tay"). Kỳ đầu tiên sau đó lấy `opening_debt`; các kỳ sau lấy nợ cuối của kỳ trước **đã xác nhận** (thiếu kỳ nào thì báo kỳ đó). Ghi đè nợ đầu kỳ ở một kỳ thì chuỗi bắt đầu lại từ số ghi đè.
- **Tải HSTT** chỉ khi: bản tính đã xác nhận, theo kỳ, không phải hợp đồng giả định, đủ Bên A/Bên B/ngày ký/số HĐ/dự án, tính được nợ đầu kỳ. Thiếu thì trang và route (`/api/billing/calculations/[id]/hstt`, 409) liệt kê từng thứ thiếu, không sinh file.
- **Sinh file** (`hstt-export.ts`): điền `docs/hstt/hstt-template.xlsx` (đi kèm bundle qua `outputFileTracingIncludes` trong `next.config.ts`): nhân bản dòng theo cột Z, dựng lại merge, công thức kèm giá trị tính sẵn + `fullCalcOnLoad`, vùng in đúng khối, chiều cao dòng theo số dòng chữ. Tên file `HSTT T09.2026 - Việt Panel - TP.xlsx`.

| File | Vai trò |
|---|---|
| `number-to-words.ts` | Số tiền bằng chữ theo văn phong HSTT. |
| `hstt-totals.ts` | Vận chuyển, VAT (`ROUND` như Excel), giảm trừ, nợ cuối kỳ, chuỗi nợ đầu kỳ. |
| `hstt-data.ts` | Quy tắc khóa, nguồn nợ đầu kỳ, dòng vận chuyển in ra, danh sách còn thiếu (client-safe). |
| `hstt-server.ts` | Nạp toàn bộ dữ liệu HSTT của một bản tính qua RLS (trang + route). |
| `hstt-export.ts`, `hstt-text.ts` | Điền file mẫu; câu "Căn cứ…" và tên file. |
| `app/actions/billing-hstt.ts` | Action: công ty, khách hàng, tab HSTT hợp đồng, dữ liệu kỳ. |

**Thêm một hợp đồng mới cho HSTT:**
1. **Khách hàng** → thêm Bên A (tên in hoa, tên viết thường dùng trong câu "Căn cứ", tên rút gọn cho tên file, MST, TK, đại diện).
2. Hợp đồng → **tab HSTT**: chọn Bên A, loại HĐ, ngày ký, tên + địa chỉ dự án (số HĐ sửa ở tab Chung), VAT; kiểm tra câu "Căn cứ" xem trước (sửa tay nếu cần).
3. **Nợ ban đầu** = nợ cuối kỳ của tháng cuối cùng làm tay + tháng đó. Các tháng đến hết tháng đó không xuất HSTT trên web.
4. Bảng giá vận chuyển (mỗi loại xe một dòng; xe đã dùng ở kỳ nào thì chỉ "Ngừng dùng", không xóa) và các khoản tạm ứng + ghi chú.
5. Tháng web đầu tiên: tính → nhập dữ liệu kỳ → xác nhận → tải HSTT, so với bản tay một kỳ trước khi gửi khách.

## Nguyên tắc an toàn (đừng bỏ)

- **Dừng hẳn, không tính tiếp** khi: file không phủ trọn kỳ, **không tìm thấy kho** của hợp đồng trong file, hoặc kho có mã hàng chưa có đơn giá và chưa nằm trong danh sách loại trừ. Thông báo lỗi của engine hiện nguyên văn trên giao diện. Tính thiếu tiền một cách âm thầm còn tệ hơn báo lỗi.
- Đơn giá là **số nguyên VND**. Thành tiền có thể **lẻ** khi số lượng lẻ (engine thêm cảnh báo). Tổng tiền lưu ở `numeric(20,4)`, làm tròn 4 số lẻ khi lưu để bỏ sai số số thực, **không làm tròn đến đồng**. Hiển thị và Excel: số nguyên như cũ (`1.055.061.425đ`), chỉ hiện phần lẻ khi có (`-665.017,5đ`).
- Mỗi dòng kết quả có `explain` và `ref` (số chứng từ) để kế toán đối chiếu.
- `warnings` luôn hiển thị: tồn âm, phiếu thuộc kỳ trước, tồn trong file lệch tồn cộng dồn, số lượng lẻ…
- Bản tính lưu kèm `contract_snapshot` (cấu hình hợp đồng lúc tính): sửa giá sau này không đổi lịch sử, file Excel luôn khớp số đã tính.

## Database và deploy

Migration (tạo file mới, không sửa file cũ):

| File | Nội dung |
|---|---|
| `0026_accountant_role_enum.sql` | Role `accountant` (file riêng vì quy tắc enum của Postgres). |
| `0027_billing.sql` | Bảng `billing_*`, `private.is_billing_user()`, trigger vòng đời, bucket Storage **`billing`** (private, 10MB, chỉ .xlsx, không có storage policy: đọc/ghi qua server sau khi kiểm quyền). |
| `0028_billing_rls.sql` | RLS. |
| `0029_billing_seed_vietpanel.sql` | Seed hợp đồng Việt Panel/Senci. |
| `0030_billing_save_contract_config.sql` | RPC lưu đơn giá + mã loại trừ trong 1 transaction. |
| `0031_billing_custom_range.sql` | Tính theo khoảng ngày (`period_month` null, không xác nhận được). |
| `0032_billing_demo_and_decimal.sql` | `is_demo`, unique (`misa_kho`, `is_demo`), `total_amount numeric(20,4)`, trigger chặn xác nhận hợp đồng giả định. |
| `0033`–`0037` | GĐ1: role "Chỉ xem", file MISA theo tháng, bảng giá phẳng, cutover (xem `docs/billing-gd1-trien-khai.md`). |
| `0038_billing_hstt.sql` | GĐ3, chỉ thêm bảng: `company_profile` (Bên B, 1 dòng, chỉ admin sửa), `billing_customers` (Bên A), `billing_contract_hstt` (1:1 hợp đồng, bảng phụ để không đổi `billing_contracts`), `billing_transport_prices`, `billing_contract_advances`, `billing_period_inputs` / `_transport` / `_deductions`. RLS: đọc `is_billing_viewer`, ghi `is_billing_user`. Quay lại: `supabase/revert/0038_billing_hstt.revert.sql`. |
| `0039_billing_hstt_seed_vietpanel.sql` | Seed TP + Việt Panel từ HSTT T08/2026 (nợ ban đầu 2.906.447.532 cuối 08/2026). |
| `0040_billing_period_presets.sql` | GĐ2, chỉ thêm bảng: `billing_period_presets` (seed "26→25 (1 tháng)", "Tháng dương lịch"; ghi: chỉ admin) + bảng phụ `billing_contract_period_presets` (mẫu mặc định của hợp đồng; ghi: admin + kế toán; `on delete restrict`: mẫu đang được hợp đồng dùng thì không xóa được, chỉ "Ngừng dùng"). Bản tính không thêm cột: `upload_ids` đã trỏ đúng phiên bản file tháng. Quay lại: `supabase/revert/0040_billing_period_presets.revert.sql`. |

Không cần biến môi trường mới: dùng `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sẵn có. `exceljs` chạy ở runtime Node (server action, route `/api/billing/calculations/[id]/xlsx`).

> ⚠ **`.env.local` hiện trỏ tới project PRODUCTION `surnokungqebqzzlyrsz`** (không có database dev riêng). `npm run dev` trên localhost ghi thẳng vào dữ liệu thật; các script seed cũng vậy.

`supabase/revert/0032_billing_demo_and_decimal.revert.sql` là bản revert **chỉ để dự phòng**, không phải migration (nằm ngoài `migrations/` để `db push` không chạy). **Không chạy** khi chỉ muốn dọn dữ liệu giả định: code hiện tại cần schema của 0032. `supabase/revert/check-real-contracts.sql` in số lượng + MD5 của hợp đồng thật để so trước/sau khi seed hoặc dọn.

## Dữ liệu giả định (đối chiếu với tool Excel)

`lib/billing/seed/gia-dinh-excel-contracts.json`: 209 "hợp đồng", mỗi kho MISA một hợp đồng, mỗi mã hàng một dòng, **đơn giá GIẢ ĐỊNH** lấy từ sheet DATA ĐƠN GIÁ của tool Excel (7 tổ hợp Excel không có giá → 0đ). Chỉ để so hai hệ thống, **không dùng để lập HSTT**.

- Tách biệt với dữ liệu thật: cờ `is_demo`, tên có tiền tố **"[GIẢ ĐỊNH] "**, chỉ hiện khi bật công tắc **"Hiện dữ liệu giả định"** ở sidebar (cookie, chỉ là tùy chọn hiển thị), băng đỏ trên trang hợp đồng/kết quả, **không xác nhận được** (action + trigger DB).
- Seed / xóa (bắt buộc `--project` trùng với URL đang cấu hình, để không chạy nhầm database):

```bash
npm run seed:gia-dinh -- --project=<project-ref>       # upsert 209 hợp đồng, thay toàn bộ dòng giá
npm run seed:gia-dinh:xoa -- --project=<project-ref>   # xóa mọi bản tính + hợp đồng giả định
npx supabase db query --linked -f supabase/revert/check-real-contracts.sql   # kiểm tra hợp đồng thật không đổi
```

- Mã hợp đồng giả định được chuyển về dạng không dấu (`gia-dinh-319-5`); ĐVT rỗng trong Excel được điền "—" (chỉ để hiển thị).

**Trang `/billing/compare` (chỉ admin):** chọn file MISA đã tải + khoảng ngày → tính toàn bộ hợp đồng giả định → bảng tiền thuê theo kho, sắp giảm dần, dòng **"Tổng các kho có tiền > 0"** để so với sheet "BÁO CÁO TIỀN THUÊ". Không lưu gì, không áp ngày miễn tính (Excel không có). Kho bị engine từ chối nằm cuối bảng kèm thông báo lỗi.

## Test

```bash
npm test          # toàn repo; lib/billing có ~60 test
npx tsc --noEmit
```

- `engine.golden.test.ts`: tái tạo **9 kỳ HSTT thật** của Việt Panel, khớp từng dòng và từng đồng.
- `misa-e2e.test.ts`: 2 file MISA thật (13 và 16 cột), dựng lại kỳ 06/2026 (1.045.798.558đ), các trường hợp phải dừng (kể cả "Không tìm thấy kho", mã kho 2 dấu cách).
- `merge-ledgers.test.ts`: tách một file làm hai rồi ghép lại, kết quả giống hệt.
- `excel-parity.test.ts`: chạy engine cho mọi kho với đơn giá giả định, khớp **100% tổ hợp kho–mã** với số tool Excel (01–30/06 và 01–15/06); VIETPANEL-01 tháng 6 = 1.055.061.425đ.
- `compare.test.ts`: tổng theo kho của trang đối chiếu khớp Excel.
- `seed.test.ts`, `demo-seed.test.ts`: seed Việt Panel (0029) và seed giả định khớp dữ liệu nguồn, qua được validation của app.
- `export-xlsx.test.ts`, `amounts.test.ts`: định dạng số nguyên/số lẻ, làm tròn 4 số lẻ.
- `number-to-words.test.ts` (18 ca thật), `hstt-totals.test.ts`, `hstt-data.test.ts`, `hstt-lock.test.ts`.
- `hstt-export.test.ts`: **golden HSTT T08/2026** so từng ô (giá trị, merge, font, viền, định dạng số, độ rộng cột) với khối T08 của `docs/hstt/hstt-t08-2026-vietpanel.xlsx`.

**Thêm một hợp đồng thật:** lấy 1–2 HSTT đã gửi khách, tạo fixture giống `vietpanel-senci-golden.json`, viết test tương tự để chắc engine ra đúng từng đồng.

## Chạy thử không cần giao diện

```bash
npx tsx scripts/billing-preview.mts <file-misa.xlsx> 2026-09 ra-file.xlsx
```

## Tải file từ MISA

Mở **Sổ chi tiết vật tư hàng hóa**, chọn Kho `<<Tất cả>>`, kỳ **trọn 1 tháng** (01 → cuối tháng), rồi upload ở `/billing/uploads`. Mỗi tháng có 1 bản đang dùng; tải lại tháng đó thì tạo phiên bản mới. Khi tính, hệ thống tự lấy các tháng phủ kỳ (kỳ 26/07–25/08 cần file tháng 7 và tháng 8) và ghép bằng `mergeLedgers`.

Cả bản 13 cột lẫn 16 cột (có cột Giá trị) đều đọc được.

## Chưa làm (theo thứ tự ưu tiên)

1. Ngày Tết chính xác từ kế toán (giao diện nhập ngày miễn tính đã có).
2. HSTT: lưu dữ liệu kỳ trong 1 transaction + khóa ở DB (migration số trống tiếp theo, xem plan mục 9); xuất file cộng dồn nhiều tháng.
3. Phiếu bị sót của kỳ đã chốt: cần cơ chế "dòng điều chỉnh" nhập tay. Engine đã tính đúng số ngày nếu truyền phiếu có ngày trước kỳ.
