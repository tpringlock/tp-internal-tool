# Kế hoạch: xuất Hồ sơ thanh toán (HSTT) ra Excel

> Mục tiêu: từ một bản tính tiền thuê đã có trên web, bấm **Tải HSTT** là ra một file `.xlsx` gồm 4 sheet, **định dạng y hệt** file HSTT kế toán đang làm tay (mẫu: `HSTT T08.2026 – Việt Panel`):
> **ĐNTT** (Giấy đề nghị thanh toán) · **ĐCCN** (BB đối chiếu công nợ) · **Giá trị** (BB đối chiếu giá trị thuê thiết bị) · **Khối lượng** (BB đối chiếu khối lượng thuê thiết bị).

Tài liệu đi kèm (trong `docs/hstt/`):
- `hstt-template.xlsx`: file mẫu, cắt nguyên khối tháng 08/2026 của 4 biểu, giữ đủ font, cỡ chữ, viền, merge, độ rộng cột, chiều cao dòng và thiết lập in. Chỗ cần điền là `{{placeholder}}`, loại dòng được đánh dấu ở **cột Z (ẩn)**.
- `hstt-t08-2026-vietpanel.xlsx`: file HSTT thật dùng làm chuẩn đối chiếu (golden).
- `bang-chu-cases.json`: 18 cặp số → chữ lấy từ file thật, dùng làm test.

---

## 1. File HSTT hiện tại hoạt động thế nào (khảo sát)

- Mỗi hợp đồng/dự án có **1 file cộng dồn**. Mỗi tháng, kế toán dán thêm một khối mới xuống cuối từng sheet và dời vùng in (print area) sang khối mới. Thứ gửi khách chỉ là khối của tháng đó.
- Các sheet tham chiếu lẫn nhau: ĐNTT lấy tổng từ Giá trị, ĐCCN lấy phát sinh từ Giá trị và nợ đầu kỳ từ khối ĐCCN tháng trước, Khối lượng lấy thông tin các bên từ Giá trị.
- Font Times New Roman. Phần thân dùng cỡ 13 (ĐCCN dùng cỡ 12), tiêu đề cỡ 16 đậm (ĐNTT cỡ 20). Khổ A4 dọc, fit theo chiều rộng. Số tiền dùng định dạng Accounting `_(* #,##0_)…`, ngày dùng định dạng ngày ngắn (hiển thị dd/mm/yyyy).
- Bảng thiết bị: mỗi mặt hàng gồm dòng **tồn đầu kỳ** (có STT, cột F = SL tồn), các dòng **phát sinh**, rồi dòng **Cộng** (merge B:F). Cột STT được merge dọc cho cả nhóm.
- Công thức trong file: `H = E − D + 1` (kỳ có Tết là `−15`), `J = I × H × G`, `Cộng: G = SUM`, `J = SUBTOTAL(109,…)`. Mục I: `SUBTOTAL(9,…)`. Tổng trước thuế là `SUBTOTAL(9,…)` gồm cả vận chuyển. `VAT = ROUND(tổng × 8%, 0)`. Tổng sau thuế = trước thuế + VAT (trừ thêm giảm trừ nếu có, ví dụ kỳ 02/2026).
- ĐCCN: `Nợ cuối kỳ = Nợ đầu kỳ + Phát sinh tháng − Đã thanh toán trong kỳ`. Dòng "Đã tạm ứng" chỉ để hiển thị.
- ĐNTT: số tiền đề nghị = **tổng thanh toán của BB giá trị tháng đó** (không phải nợ cuối kỳ).

## 2. Dữ liệu cần có và nguồn lấy

| Nhóm | Trường | Dùng ở | Nguồn |
|---|---|---|---|
| **Bên B – TP** (1 bộ, dùng chung) | Tên in hoa; tên 2 dòng (tiêu đề ĐNTT); tên viết thường trong câu; tên đơn vị thụ hưởng; địa chỉ đầy đủ; địa chỉ ngắn (ĐNTT); điện thoại; số TK; ngân hàng + chi nhánh; MST; người đại diện; chức vụ; nơi lập ("Hà Nội") | cả 4 biểu | **Mới:** bảng `company_profile`, admin sửa được |
| **Bên A – khách hàng** | Tên in hoa; tên viết thường (trong câu căn cứ HĐ); địa chỉ; điện thoại; số TK (**lưu dạng text**); ngân hàng; MST (text); người đại diện; chức vụ | cả 4 biểu | **Mới:** bảng `billing_customers` (một khách có thể có nhiều hợp đồng) |
| **Hợp đồng** | Loại HĐ ("Hợp đồng kinh tế"), số HĐ, ngày ký, tên dự án ("Senci"), địa chỉ dự án; câu "Căn cứ…" (tự sinh, cho phép sửa tay) | cả 4 biểu | **Bổ sung cột** vào `billing_contracts` |
| | Dòng thiết bị, đơn giá, mã MISA | Giá trị, Khối lượng | **Đã có** |
| | Bảng giá vận chuyển (loại xe, ĐVT "Chuyến", đơn giá); thuế suất (8%) | Giá trị | **Mới** |
| | Các khoản tạm ứng (số tiền + ghi chú "Tạm ứng PL02+03+04") | ĐCCN dòng 1 | **Mới** |
| | Số dư nợ ban đầu (nợ cuối kỳ của tháng cuối cùng làm tay, ví dụ T08/2026 = 2.906.447.532) | ĐCCN nợ đầu kỳ của tháng đầu tiên chạy trên web | **Mới**, nhập 1 lần |
| **Theo từng kỳ** (nhập tay trên bản tính) | Vận chuyển: số chuyến kỳ này theo từng loại xe, cột F "lũy kế" (tùy chọn), tính tiền ngay hay "Tính cuối kỳ", ghi chú | Giá trị, Khối lượng | **Mới** |
| | Giảm trừ sau thuế (tên khoản + số tiền) | Giá trị | **Mới** |
| | Bên A đã thanh toán trong kỳ | ĐCCN | **Mới** (nhập tay; sau này có thể lấy từ MISA) |
| | Ngày miễn tính (Tết) | Giá trị, Khối lượng | Engine đã hỗ trợ, cần giao diện nhập |
| | Ghi chú từng dòng (biển số xe, số phiếu…) | cột Ghi chú | Tùy chọn; mặc định để trống như T08 |
| **Tính ra** | Các dòng thiết bị, Cộng, tổng trước thuế, VAT, tổng sau thuế | Giá trị, Khối lượng | **Đã có** (engine) + phần tổng mới |
| | Nợ đầu kỳ = nợ cuối kỳ của **bản tính đã xác nhận** kỳ trước (không có thì lấy số dư ban đầu) | ĐCCN | **Mới** |
| | Số tiền bằng chữ | Giá trị, ĐCCN, ĐNTT | **Mới:** hàm đọc số tiếng Việt |

Ngày lập biên bản giữ nguyên dạng "ngày ……tháng……năm 2026" như bản làm tay (ký tay rồi điền). Chỉ tự điền năm.

## 3. Cách sinh file: điền vào file mẫu (không vẽ lại từ đầu)

1. Nạp `hstt-template.xlsx` bằng exceljs.
2. Thay mọi `{{placeholder}}` trong cả 4 sheet bằng dữ liệu (mục 4).
3. Ở sheet **Giá trị** và **Khối lượng**, đọc cột Z để tìm các dòng mẫu, rồi nhân bản dòng mẫu cho từng dòng dữ liệu (chép nguyên style và chiều cao dòng), dịch phần bên dưới xuống, dựng lại merge:
   - `row:dong-dau`: dòng tồn đầu kỳ của mỗi mặt hàng (có STT; nếu mặt hàng không có tồn đầu thì dòng phát sinh đầu tiên dùng style này).
   - `row:dong-tiep`: các dòng phát sinh tiếp theo.
   - `row:cong`: dòng Cộng, merge B:F.
   - Cột A (STT) merge dọc từ dòng đầu đến dòng Cộng của mỗi mặt hàng.
   - `row:van-chuyen`: mỗi loại xe trong bảng giá vận chuyển của HĐ là 1 dòng.
   - Nếu có giảm trừ thì chèn dòng giữa `total:vat` và `total:sau-thue`, dùng style của dòng VAT, giống kỳ 02/2026.
4. **Ghi công thức như file gốc, kèm sẵn giá trị đã tính** (exceljs `{ formula, result }`) và bật `fullCalcOnLoad`. Mở ra thấy số ngay, kế toán vẫn sửa tay được như Excel cũ. Các công thức:
   - `H = E−D+1` (trừ ngày miễn tính nếu có, ghi chú vào K), `J = I*H*G`, dòng đầu `G = F`.
   - Cộng: `G = SUM(...)`, `J = SUBTOTAL(109,...)`. Mục I: `J = SUBTOTAL(9,...)`.
   - Vận chuyển: `J = G*I` khi tính tiền ngay, để trống và ghi "Tính cuối kỳ" khi dồn.
   - Tổng trước thuế `SUBTOTAL(9, …)`, VAT `ROUND(x*8%,0)`, sau thuế `= trước thuế + VAT − giảm trừ`.
   - ĐCCN: `G(nợ cuối) = G(nợ đầu) + G(phát sinh) − G(thanh toán)`, phát sinh `='Giá trị'!J<tổng sau thuế>`.
   - ĐNTT: số tiền `='Giá trị'!J<tổng sau thuế>`.
   - Khối lượng: cùng các dòng như Giá trị nhưng không có cột đơn giá và thành tiền. Mục II vận chuyển chỉ ghi số chuyến.
5. Đặt print area cho từng sheet đúng vùng đã sinh. Xóa nội dung cột Z. Tên file: `HSTT T{MM}.{YYYY} - {tên khách rút gọn} - TP.xlsx`.

**Phạm vi giai đoạn này:** mỗi lần xuất ra **1 file cho 1 tháng** (4 sheet, mỗi sheet chỉ có khối của tháng đó). Xuất file cộng dồn nhiều tháng như hiện tại để sau.

## 4. Danh sách placeholder trong file mẫu

`{{thang}}` "08/2026" · `{{nam}}` · `{{ky.tu}}` / `{{ky.den}}` (dd/mm/yyyy) · `{{can_cu_hd}}` · `{{du_an.ten}}` · `{{du_an.dia_chi}}` · `{{vat_phan_tram}}` · `{{bang_chu}}`
Bên A: `{{a.ten_in_hoa}}` `{{a.dia_chi}}` `{{a.dien_thoai}}` `{{a.so_tk}}` `{{a.ngan_hang}}` `{{a.mst}}` `{{a.dai_dien}}` `{{a.chuc_vu}}`
Bên B: `{{b.ten_in_hoa}}` `{{b.ten_2_dong}}` `{{b.ten_thuong}}` `{{b.ten_thu_huong}}` `{{b.dia_chi}}` `{{b.dia_chi_ngan}}` `{{b.dien_thoai}}` `{{b.so_tk}}` `{{b.ngan_hang}}` `{{b.mst}}` `{{b.dai_dien}}` `{{b.chuc_vu}}` `{{b.noi_lap}}`
ĐCCN: `{{cn.tam_ung}}` `{{cn.no_dau_ky}}` `{{cn.phat_sinh}}` `{{cn.thanh_toan}}` `{{cn.no_cuoi_ky}}` `{{cn.bang_chu}}` · ĐNTT: `{{dntt.so_tien}}` `{{dntt.bang_chu}}`

Các ô chứa số (tiền, nợ) phải ghi **kiểu số** (hoặc công thức), không ghi chuỗi. Placeholder chỉ đánh dấu vị trí. Riêng số TK và MST thì ghi dạng **text**.

Dữ liệu Việt Panel để điền thử lấy từ file gốc, ví dụ Bên A: CÔNG TY TNHH XÂY DỰNG VIỆT PANEL · Thôn Đông Phù, Xã Tiên Du, Tỉnh Bắc Ninh, Việt Nam · 0222 6535 699 · TK 616139999 tại MB Ngân hàng quân đội · MST 2300856941 · Ông Lưu Đình Cải, Giám đốc. Bên B: CÔNG TY CỔ PHẦN TẬP ĐOÀN THIẾT BỊ XÂY DỰNG TP · Thôn Trung, xã Ô Diên, Thành phố Hà Nội, Việt Nam · 02433250143 · TK 8331100096008 tại Ngân hàng TMCP Quân đội – CN Hoàng Quốc Việt · MST 0105204346 · Ông Hữu Minh Tiến, Phó Tổng giám đốc.

## 5. Đọc số thành chữ

Theo đúng văn phong trong file: `"Tám trăm chín mươi triệu, năm trăm linh lăm nghìn, bảy trăm sáu mươi chín đồng./."`
- Viết hoa chữ đầu. Ngăn các nhóm tỷ/triệu/nghìn bằng `", "`. Kết thúc bằng `" đồng./."`
- Nhóm 0 ở giữa: `"không trăm tám mươi tám nghìn"`; `"linh"` khi hàng chục bằng 0 (`"hai trăm linh bảy"`).
- Hàng đơn vị: `"mốt"` sau "mươi" (ba mươi mốt), `"tư"` sau "mươi" (sáu mươi tư), `"lăm"` sau "mươi"/"mười" (mười lăm, hai mươi lăm). File gốc có một chỗ viết "linh lăm": giữ theo file gốc.
- Nhóm toàn 0 thì bỏ (1.000.000.000 → "Một tỷ đồng./."). Số âm thì thêm "Âm " ở đầu.
- Test: `bang-chu-cases.json` (18 ca). Có 1 ca trong file gốc thiếu dấu cách sau dấu phẩy ("nghìn,bảy"), khi so thì chuẩn hóa khoảng trắng.

## 6. Tiêu chí nghiệm thu (golden test)

Sinh HSTT **tháng 08/2026 của Việt Panel** từ: các dòng trong `vietpanel-senci-golden.json` (kỳ 08/2026), vận chuyển 4 chuyến sơ mi (F = 68) + dòng xe thùng 15T (F = 1, không tính tiền), thanh toán trong kỳ 1.550.000.000, nợ đầu kỳ 3.565.941.763, tạm ứng 1.679.373.734, cùng thông tin các bên ở mục 4. So với khối T08 trong `hstt-t08-2026-vietpanel.xlsx`:
- **Giá trị** từng ô (text, số, ngày) của 4 sheet phải khớp; số tiền khớp từng đồng: tổng trước thuế 824.542.379 · VAT 65.963.390 · sau thuế 890.505.769 · nợ cuối kỳ 2.906.447.532.
- **Định dạng**: font, cỡ, đậm/nghiêng, viền, merge, number format, độ rộng cột của các ô tương ứng phải giống bản gốc (so bằng script đọc style).
- Render ra PDF (LibreOffice) để xem bằng mắt: bố cục giống bản gốc.

## 7. Các bước làm

1. **Dữ liệu:** migration cho `company_profile`, `billing_customers`, cột mới của `billing_contracts`, bảng giá vận chuyển, tạm ứng, số dư ban đầu, và dữ liệu nhập theo kỳ trên `billing_rent_calculations` (vận chuyển, giảm trừ, thanh toán). Seed dữ liệu Việt Panel + TP từ mục 4. Dừng lại để duyệt.
2. **Lõi thuần (có test):** `number-to-words.ts`; `hstt-totals.ts` (vận chuyển, VAT, giảm trừ, công nợ); `hstt-export.ts` (điền template → Buffer). Không đụng 4 file lõi của engine. Golden test mục 6 phải xanh.
3. **Giao diện:**
   - Trang sửa hợp đồng: thêm thông tin bên A, bảng giá vận chuyển, tạm ứng, số dư ban đầu.
   - Trang cài đặt công ty (chỉ admin).
   - Trang bản tính: form nhập vận chuyển, giảm trừ, đã thanh toán; nút **Tải HSTT (4 biểu)**.
   - **Khóa theo kỳ:** khi kỳ đã có bản tính **đã xác nhận** thì không cho sửa `billing_period_inputs` / `billing_period_transport` / `billing_period_deductions` của kỳ đó (chặn ở server action, có test). Muốn sửa phải hủy xác nhận trước. Nợ đầu kỳ chỉ lấy từ chuỗi các kỳ **đã xác nhận** (không có thì lấy số dư ban đầu của hợp đồng).
   - Chỉ cho tải HSTT khi bản tính theo kỳ 26→25, không phải hợp đồng giả định, và đủ dữ liệu bắt buộc. Thiếu thì liệt kê rõ còn thiếu gì.
4. **Tài liệu:** cập nhật `docs/billing-module.md` và `CLAUDE.md`.

## 8. Đã biết

- **T08/2026 Việt Panel: bản tính web lệch HSTT làm tay 1.800.544đ** (phần thiết bị: web 806.342.923, HSTT 804.542.379). Mặt hàng, tồn đầu kỳ, số lượng và đơn giá khớp hết; chỉ khác **ngày phiếu trả** ở 3 phiếu: HSTT ghi sớm hơn MISA 1 ngày.

  | Phiếu MISA | Ngày trên MISA (ngày HT = ngày CT), web dùng | Ngày trên HSTT làm tay |
  |---|---|---|
  | VIETPANEL-HD-N19 | 04/08/2026 | 03/08/2026 |
  | VIETPANEL-HD-N18 | 20/08/2026 | 19/08/2026 |
  | VIETPANEL-HD-N17 | 21/08/2026 | 20/08/2026 |
  | VIETPANEL-HD-N20 ("khách trả đêm 25") | 25/08/2026 | 25/08/2026 (khớp) |

  Mỗi dòng lệch = 1 ngày × SL × đơn giá; tổng đúng 1.800.544đ.
- **Quyết định (02/10/2026):** giữ **MISA là nguồn đúng**, không đổi engine. Nếu ngày trả thực tế khác, kế toán sửa ngày phiếu trong MISA rồi tải lại file tháng.
- Golden test (mục 6) dựng từ các dòng của kỳ "08/2026" trong `lib/billing/__fixtures__/vietpanel-senci-golden.json` (= số làm tay), nên không bị ảnh hưởng.
- **T09/2026 Việt Panel (02/10/2026): HSTT web khớp bản làm tay.** Giá trị + Khối lượng khớp từng đồng: thiết bị 656.478.611, sau thuế **800.796.900**. ĐNTT/ĐCCN đúng công thức, nợ đầu kỳ 2.906.447.532 (nợ ban đầu cuối 08/2026). Đây là số chuẩn của kỳ 09/2026.
- **T09: 2 cặp phiếu cùng ngày 25/09 bị đảo thứ tự** giữa web và bản tay (web xếp theo thứ tự trong file MISA). Cùng ngày, cùng số ngày thuê nên không ảnh hưởng tiền.
- **Bản tay T09 ghi nhầm nhãn** "Tổng tiền thuê tháng 08/2026" (đúng ra là 09/2026). File web ghi đúng tháng của kỳ.

## 9. Việc còn nợ

- **Migration số trống tiếp theo (0040 đã dùng cho mẫu kỳ GĐ2) – lưu dữ liệu kỳ trong 1 transaction + khóa ở DB.** Hiện `savePeriodInputs` (app/actions/billing-hstt.ts) chạy nhiều lệnh nối tiếp (upsert kỳ, xóa/chèn vận chuyển, xóa/chèn giảm trừ) và chỉ kiểm khóa "kỳ đã có bản tính xác nhận" ở server action. Nếu lỗi giữa chừng có thể lưu dở; nếu có người xác nhận đúng lúc người khác đang lưu thì vẫn lọt. Cần: RPC `billing_save_period_inputs` (một transaction) + trigger trên `billing_period_inputs` / `billing_period_transport` / `billing_period_deductions` từ chối khi kỳ đã xác nhận. Gửi SQL cho chủ dự án duyệt trước khi làm.
- **Quy tắc kỳ làm tay (02/10/2026):** các tháng <= `opening_debt_month` của hợp đồng đã làm HSTT bằng tay: không tải HSTT trên web, bản tính xác nhận của các tháng đó không tham gia chuỗi nợ; kỳ đầu tiên sau đó lấy `opening_debt`.
