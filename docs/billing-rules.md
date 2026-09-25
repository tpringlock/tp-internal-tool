# Quy tắc tính tiền thuê thiết bị – TP

> Suy ra từ 3 file thực tế: *Sổ chi tiết vật tư hàng hóa* (MISA), *TOOL Tính tiền thuê tự động TP.xlsx*, *HSTT T08.2026 – Việt Panel*.
> Trạng thái: **đã kiểm chứng bằng số liệu**, còn một số điểm cần anh Dũng xác nhận (mục 11).
> Dữ liệu kiểm thử: `lib/billing/__fixtures__/vietpanel-senci-golden.json` (9 kỳ HSTT thật + dữ liệu MISA tháng 6).

## 0. Kết quả kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| Tính lại từng dòng của 9 kỳ HSTT Việt Panel (12/2025 → 08/2026) theo công thức ở mục 3 | **Khớp từng đồng 9/9 kỳ** (470 dòng) |
| Tồn đầu kỳ mỗi tháng = tồn cuối kỳ trước | Khớp 8/8 lần chuyển kỳ |
| VAT = ROUND(tổng trước thuế × 8%, 0) | Khớp 9/9 kỳ |
| Tồn MISA ngày 01/06 so với HSTT (tồn 26/05 + phát sinh 25–31/05) | Khớp 10/10 mặt hàng |
| Phát sinh MISA 01–30/06 so với dòng HSTT kỳ 06 và 07 (theo mặt hàng + ngày) | Khớp 36/36 |
| Dựng lại HSTT kỳ 06/2026 từ dữ liệu MISA (26/05–25/06) | Tổng 1.210.462.443đ, **khớp từng đồng** |

Kết luận: MISA là nguồn dữ liệu đủ tin cậy cho phần thiết bị. Chỉ riêng vận chuyển và các khoản điều chỉnh là đang nhập tay.

## 1. Quy trình hiện tại

1. Tải *Sổ chi tiết vật tư hàng hóa* trên MISA (Kho: `<<Tất cả>>`).
2. Dán vào sheet `Sổ XNT chi tiết` của tool Excel. Tool tự tính SL-ngày × đơn giá theo kho + mã hàng.
3. Kế toán dùng kết quả đó cùng chi tiết từng phiếu để lập **hồ sơ thanh toán (HSTT)** theo từng dự án/tháng, gồm 4 biểu:
   - BB đối chiếu **khối lượng**: các dòng giống BB giá trị nhưng không có giá.
   - BB đối chiếu **giá trị**: chi tiết từng phiếu, có tiền.
   - BB đối chiếu **công nợ**.
   - **Giấy đề nghị thanh toán**.

HSTT được lập **cộng dồn trong một file cho mỗi dự án**: mỗi tháng nối thêm một khối vào cả 4 sheet.

## 2. Khái niệm và dữ liệu nguồn

- **Kho MISA = một dự án/công trình.** Một khách có thể có nhiều kho. Ví dụ Việt Panel có `VIETPANEL-01` (dự án Senci, KCN Phúc Điền) và `HARMONY`. **Mỗi HSTT lập cho 1 kho.**
- Chiều phát sinh, nhìn từ kho dự án:
  - **Nhập** vào kho dự án = TP giao hàng cho công trình → số lượng đang thuê **tăng** (dấu +).
  - **Xuất** khỏi kho dự án = công trình trả hàng, hoặc **luân chuyển sang dự án khác** → số lượng **giảm** (dấu −). Ví dụ: `HMN-LCH-*` chuyển từ Senci sang Harmony.
- **Ngày dùng để tính** = Ngày hạch toán. Trong toàn bộ dữ liệu, ngày hạch toán luôn bằng ngày chứng từ.
- **Mỗi chứng từ (phiếu) là một dòng** trên HSTT. Nhiều phiếu cùng ngày vẫn là nhiều dòng riêng.
- Chỉ tính tiền cho **kho dự án**. Bỏ qua kho công ty (`KHOTSCĐ`, `ZUHANG-*`, kho đi thuê...). Các kho này có nhiều tồn âm, đó là chuyện bình thường của kho tổng.

### Cấu trúc file MISA (để parse)

- Dòng 1–3: tiêu đề. Dòng 2 ghi kỳ, ví dụ `Kho: <<Tất cả>>, Tháng 9 năm 2026`.
- Dòng 4–5: header 2 tầng. Từ dòng 6 là dữ liệu, gồm các loại dòng:
  - `Mã kho: XXX` → bắt đầu một kho.
  - `Mã hàng: VTxxxx` → bắt đầu một mặt hàng trong kho đó.
  - Dòng có Diễn giải = `Số dư đầu kỳ` → tồn đầu, lấy ở cột Tồn/Số lượng.
  - Dòng có Ngày hạch toán là ngày → một phát sinh (phiếu).
  - `Tổng cộng` → bỏ qua.
- ⚠ **File tháng 9 có 13 cột** (chỉ có Số lượng). **File mẫu đang dán trong tool Excel có 16 cột** (có thêm Giá trị). Parser phải tìm cột theo header, không cố định vị trí. Tool Excel hiện tại sẽ **tính sai** nếu dán file 13 cột vào.

## 3. Công thức tính tiền thuê thiết bị

**Kỳ tính: từ ngày 26 tháng trước đến ngày 25 tháng này.** "HSTT tháng 08/2026" nghĩa là 26/07–25/08/2026.
Kỳ đầu tiên của hợp đồng bắt đầu từ ngày giao đầu tiên (Việt Panel: 20/12–25/12/2025).

Với mỗi dự án, mỗi mặt hàng, có các dòng sau:

| Dòng | Ngày (D) | Số lượng (Q) |
|---|---|---|
| Tồn đầu kỳ | Ngày đầu kỳ (26) | Tồn cuối kỳ trước |
| Mỗi phiếu giao | Ngày phiếu | +SL |
| Mỗi phiếu trả/luân chuyển | Ngày phiếu | −SL |

```
Số ngày   = Ngày cuối kỳ − D + 1
Thành tiền = Q × Số ngày × Đơn giá/ngày      (dòng trả hàng ra số âm)
Tồn cuối  = Σ Q của mặt hàng
```

Hệ quả cần nhớ:
- **Ngày giao được tính tiền.** Giao ngày 25 (ngày cuối kỳ) vẫn tính 1 ngày.
- **Ngày trả không tính tiền.** Trả ngày D thì khách chỉ bị tính đến D−1.

Công thức gộp tương đương (tool Excel đang dùng):
`SL-ngày = Tồn đầu × số ngày của kỳ + Σ (Nhập − Xuất) × (Ngày cuối − Ngày PS + 1)`.

## 4. Mặt hàng hiển thị và đơn giá

HSTT **gộp nhiều mã MISA thành một dòng hiển thị** (cùng quy cách, khác lớp mạ hoặc kiểu ecu). Bảng gộp cho Việt Panel, đã kiểm chứng:

| Dòng trên HSTT | Mã MISA | Đơn giá HĐ (đ/ngày) |
|---|---|---|
| Giáo ringlock 1.0m Kẽm | VT0021 | 85 |
| Giáo ringlock 1.5m Kẽm | VT0020 | 125 |
| Giáo ringlock 2.0m Kẽm | VT0023 | 159 |
| Giáo ringlock 2.5m Kẽm | VT0022 + VT0090 (nhúng nóng 3.2ly) | 185 |
| Giằng ngang ringlock 0.6m | VT0008 | 43 |
| Giằng ngang ringlock 0.9m | VT0069 | 55 |
| Giằng ngang ringlock 1.2m | VT0064 + VT0091 (nhúng nóng) | 71 |
| Kích U Ø38 L=600 | VT0053 + VT0067 (kích **đầu** Eku To / Ecu Tán) | 70 |
| Kích chân Ø38 L=600 | VT0048 + VT0068 | 70 |
| Khóa giáo xoay D48 | CCDC272 (Cùm xoay) | 45 |
| *(không tính tiền)* | PALLET, VT0094 (Pallet) | — |

- **Đơn giá theo hợp đồng của từng khách/dự án**, và không đổi qua 9 kỳ của Việt Panel.
- ⚠ **Đơn giá trong sheet `DATA ĐƠN GIÁ` của tool Excel là giả định**, như chính file ghi chú. Nếu dùng giá này thì kết quả sai: 2.5m là 195 thay vì 185, giằng 0.6m là 67 thay vì 43, pallet 50 thay vì 0... Hệ thống mới phải lấy đơn giá theo hợp đồng.
- Tên, đơn vị tính (Cây/Cái) và cách gộp mã là **cấu hình theo hợp đồng**. Tên HSTT khác tên MISA ("Kích U" tương ứng "Kích đầu").

## 5. Vận chuyển (mục II trên BB giá trị)

- Tính theo chuyến: **xe sơ mi 30 tấn 5.000.000đ/chuyến**, **xe thùng 15 tấn 4.500.000đ/chuyến** (giá theo HĐ Việt Panel).
- Chỉ tính **chuyến do xe TP chở**. Ví dụ ghi chú kỳ 07/2026: "6 chuyến luân chuyển sang Harmony (4 chuyến xe ctr, 2 chuyến TP), 1 chuyến về kho PT (xe TP)". Kết quả chỉ tính 3 chuyến.
- Đến kỳ 05/2026, vận chuyển ghi "Tính cuối kỳ" (chỉ đếm, chưa thu tiền). Từ kỳ 06/2026 thu theo tháng (kỳ 06 thu 15 chuyến = 8 của tháng 5 + 7 của tháng 6).
- Dữ liệu này **không nằm gọn trong MISA**. Cột diễn giải có loại xe và biển số ("sơmi 30 tấn 15H-145.57 xe khôi"), nhưng không nói rõ xe của ai. Giai đoạn đầu nên **nhập tay số chuyến**, hệ thống gợi ý danh sách phiếu kèm loại xe để kế toán tick chọn.

## 6. Tổng tiền, VAT, giảm trừ

```
Tổng trước thuế = Σ tiền thuê thiết bị + Σ vận chuyển
VAT            = ROUND(Tổng trước thuế × 8%, 0)      // làm tròn 1 lần trên tổng
Tổng thanh toán = Tổng trước thuế + VAT − Giảm trừ sau thuế
```

Thuế suất 8% là mức áp dụng cho HĐ này và cần để dạng cấu hình, vì mức giảm thuế GTGT có thể thay đổi.

## 7. Các điều chỉnh tay đã gặp (hệ thống phải hỗ trợ)

| Kỳ | Điều chỉnh | Cách làm hiện tại |
|---|---|---|
| 02/2026 | **Trừ ngày nghỉ Tết** ("Đã giảm 15 ngày nghỉ lễ Tết Nguyên đán 2026") | Mọi dòng: Số ngày = (Cuối − D + 1) − 15 |
| 02/2026 | **Giảm trừ sau thuế** "Cty TP gửi tặng quà hội nghị NCC" 10.000.000đ | Trừ sau VAT, không làm đổi VAT |
| 06/2026 | **Phiếu bị sót kỳ trước**: trả ngày 25/05 nhưng kỳ 05 chưa ghi | Đưa vào kỳ 06 với ngày 25/05 → 32 ngày (31 ngày kỳ 06 + 1 ngày 25/05 của kỳ trước) |

Đề xuất cho hệ thống:
- Ngày miễn tính là **một khoảng ngày theo hợp đồng/kỳ**. Mỗi dòng trừ số ngày giao nhau với khoảng đó (đừng hard-code "−15").
- Giảm trừ là các dòng tự do, có lý do.
- Phiếu nằm ngoài kỳ vẫn được đưa vào kỳ hiện tại theo đúng ngày gốc. Công thức ở mục 3 tự ra đúng 32 ngày.

## 8. BB đối chiếu công nợ và Giấy đề nghị thanh toán

```
Nợ cuối kỳ = Nợ đầu kỳ (= nợ cuối kỳ trước) + Phát sinh tháng (= Tổng thanh toán BB giá trị) − Bên A đã thanh toán trong kỳ
```
- "Giá trị bên A đã tạm ứng" chỉ để hiển thị (ví dụ 1.255.054.014 + 424.319.720 "tạm ứng PL02+03+04"), **không tham gia công thức**.
- Số tiền đã thanh toán trong kỳ đang nhập tay. Có thể lấy từ MISA (công nợ / phiếu thu) ở giai đoạn sau.
- Giấy đề nghị thanh toán = Tổng thanh toán của BB giá trị tháng đó, kèm số tiền bằng chữ.
- Header các biên bản lấy từ hợp đồng: số HĐ, thông tin bên A và bên B, tên và địa chỉ dự án.

## 9. Điểm lệch cần lưu ý khi làm tool

1. **MISA xuất theo tháng dương lịch, còn kỳ tính là 26→25.** Muốn tính kỳ 26/08–25/09 cần dữ liệu từ 26/08. Cách xử lý: đồng bộ MISA liên tục vào DB (qua API), rồi tính tồn đầu kỳ bằng tồn đầu + phát sinh trước ngày 26. Tool Excel cũng làm đúng như vậy.
2. **Tool Excel chỉ ra tổng theo mã hàng**, còn HSTT cần **từng phiếu một dòng**. Hệ thống mới phải giữ chi tiết phiếu.
3. **Đối chiếu nhanh MISA tháng 9:** tồn 01/09 khớp tồn cuối HSTT 08 ở 6/10 mặt hàng. 4 mặt hàng lệch (1.5m −600, 2.0m −500, 2.5m −700, giằng 1.2m −2.772) trông giống **một chuyến trả hàng trong khoảng 26–31/08**, tức sẽ nằm trong HSTT kỳ 09. Cần xác nhận.

## 10. Việc hệ thống mới cần có

- Danh mục **hợp đồng/dự án**: kho MISA, khách, số HĐ, ngày kỳ (26→25), đơn giá theo dòng hiển thị, bảng gộp mã, mã loại trừ, giá vận chuyển, thuế suất.
- **Engine tính** theo mục 3 và 7, ra danh sách dòng kèm diễn giải. Test bằng `vietpanel-senci-golden.json`: phải khớp **từng đồng cả 9 kỳ**.
- Nhập tay: số chuyến vận chuyển, ngày miễn tính, giảm trừ, số tiền đã thanh toán.
- Xuất 4 biểu HSTT (Excel/PDF) đúng mẫu hiện tại.

## 11. Câu hỏi còn mở cho anh Dũng

1. Kỳ 26→25 áp dụng cho **mọi khách**, hay tùy hợp đồng?
2. Tết 2026 trừ 15 ngày là **những ngày nào**? Có áp cho mọi hợp đồng không, và có ngày lễ nào khác được trừ không?
3. Cách nhận biết chuyến nào là **xe TP** (tính tiền) và chuyến nào là xe công trình? "xe khôi", "xe sang" là tài xế TP phải không?
4. Pallet có bao giờ tính tiền không, hay luôn miễn?
5. Mất/hỏng thiết bị xử lý thế nào (chưa thấy trong HSTT Việt Panel)?
6. Luân chuyển giữa 2 dự án của **cùng một khách**: có miễn tiền ngày luân chuyển không? (Phía Senci hiện tính như trả hàng bình thường. Phía Harmony chưa có HSTT để kiểm chứng.)
7. Bảng gộp mã (mục 4) có dùng chung cho mọi khách, hay mỗi HĐ đặt tên dòng riêng?
