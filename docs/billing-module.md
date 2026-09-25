# Module tính tiền thuê (`lib/billing`)

Tải file *Sổ chi tiết vật tư hàng hóa* từ MISA → upload lên hệ thống → tính tiền thuê thiết bị của một dự án trong một kỳ. Quy tắc nghiệp vụ nằm ở `docs/billing-rules.md`.

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
| `misa-parser.ts` | Đọc file MISA 13 cột hoặc 16 cột, tìm cột theo header, kiểm tra tồn cộng dồn từng dòng |
| `merge-ledgers.ts` | Ghép các file tháng liên tiếp (ví dụ T8 + T9 để tính kỳ 26/08–25/09) |
| `engine.ts` | `buildRentInput` (MISA → đầu vào) và `calculateRent` (hàm thuần, không đụng DB hay file) |
| `dates.ts` | Ngày dạng chuỗi ISO, không phụ thuộc múi giờ. `billingPeriod("2026-08")` = 26/07–25/08 |
| `export-xlsx.ts` | Xuất mục "I. Thiết bị vật tư" theo cột của HSTT hiện tại |
| `contracts/vietpanel-senci.ts` | Hợp đồng mẫu, dùng để seed DB và làm dữ liệu test |

## Nguyên tắc an toàn (đừng bỏ)

- **Dừng hẳn, không tính tiếp** khi: file không bao phủ trọn kỳ, hoặc kho có mã hàng chưa có đơn giá và chưa nằm trong danh sách loại trừ. Tính thiếu tiền một cách âm thầm còn tệ hơn báo lỗi.
- Tiền là **số nguyên VND**. Engine kiểm tra đơn giá nguyên và thành tiền nằm trong giới hạn an toàn của số nguyên.
- Mỗi dòng kết quả có `explain` (ví dụ "1.600 cây × 30 ngày × 85đ = 4.080.000đ") và `ref` (số chứng từ) để kế toán đối chiếu.
- `warnings` luôn phải hiển thị cho người dùng: tồn âm, phiếu thuộc kỳ trước, tồn trong file lệch với tồn cộng dồn...

## Test

```bash
npm test          # gồm 22 test của lib/billing
npx tsc --noEmit  # type-check
```

- `engine.golden.test.ts`: tái tạo **9 kỳ HSTT thật** của Việt Panel, khớp từng dòng và từng đồng.
- `misa-e2e.test.ts`: đọc 2 file MISA thật (13 và 16 cột), dựng lại kỳ 06/2026 từ dữ liệu MISA (1.045.798.558đ), kiểm tra các trường hợp phải dừng.
- `merge-ledgers.test.ts`: tách một file làm hai rồi ghép lại, kết quả phải giống hệt.

**Thêm một hợp đồng mới:** lấy 1–2 HSTT đã gửi khách, tạo fixture giống `vietpanel-senci-golden.json`, rồi viết test tương tự để chắc chắn engine ra đúng từng đồng.

## Chạy thử không cần giao diện

```bash
npx tsx scripts/billing-preview.mts <file-misa.xlsx> 2026-09 ra-file.xlsx
```

## Tải file từ MISA

Mở **Sổ chi tiết vật tư hàng hóa**, chọn Kho `<<Tất cả>>`, rồi làm một trong hai cách:
- Chọn kỳ **tùy chọn từ ngày 26 tháng trước đến ngày 25 tháng tính tiền** (nếu MISA cho phép). Chỉ cần 1 file.
- Hoặc tải **2 file theo tháng**, ví dụ tháng 8 và tháng 9, rồi upload cả hai. Hệ thống sẽ ghép lại bằng `mergeLedgers`.

Cả bản 13 cột lẫn 16 cột (có cột Giá trị) đều đọc được.

## Chưa làm (theo thứ tự ưu tiên)

1. Ngày miễn tính (Tết): engine đã hỗ trợ `excludedRanges`. Còn thiếu giao diện nhập và ngày Tết chính xác từ kế toán.
2. Vận chuyển, VAT, giảm trừ, BB công nợ, giấy đề nghị thanh toán: nằm ngoài phạm vi giai đoạn này.
3. Phiếu bị sót của kỳ đã chốt: cần cơ chế "dòng điều chỉnh" nhập tay. Engine đã tính đúng số ngày nếu truyền phiếu có ngày trước kỳ.
