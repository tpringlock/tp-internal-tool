# Kế hoạch hoàn thiện "Tính hóa đơn tự động" theo góp ý của TP (01/10/2026)

> Nguồn: 9 ý góp ý + bản ghi lời nói của buổi review. Tài liệu này dành cho Claude Code và người duyệt.
> Nguyên tắc giữ nguyên: **engine tính tiền đã khớp từng đồng với HSTT thật và tool Excel, không sửa logic lõi.** Các thay đổi nằm ở dữ liệu, giao diện, báo cáo và xuất file.

## 1. Đối chiếu góp ý với hiện trạng

| #   | Góp ý (tóm tắt, có thêm chi tiết từ bản ghi)                                                                                                                                             | Hiện trạng                                                                                             | Việc cần làm                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Tải về file nguồn** đã upload; xem lại các file theo thời gian để kiểm tra                                                                                                             | Có lưu file trên Storage, chưa có nút tải, chưa có lịch sử                                             | Trang "File nguồn MISA": danh sách theo tháng, các phiên bản, ai tải lên, lúc nào, nút tải về                                                                                                                |
| 1b  | (bản ghi) **File nguồn cố định theo tháng**: mỗi file là 1 tháng trọn (01→cuối tháng). Khi tính tiền thì **chỉ chọn kỳ**, hệ thống tự lấy các file tháng tương ứng, không phải chọn file | Đang phải chọn file thủ công                                                                           | Khi upload, gán "tháng dữ liệu" và kiểm tra file đúng trọn tháng. Mỗi tháng có 1 bản đang dùng, các bản cũ giữ làm lịch sử. Khi tính: tự chọn các tháng phủ kỳ rồi ghép bằng `mergeLedgers` (đã có, đã test) |
| 2   | **Nhập khẩu / xuất khẩu Excel** dữ liệu hợp đồng–đơn giá: mã kho, tên kho, số HĐ, mã VT, tên VT, ĐVT, đơn giá… để báo cáo và kiểm soát                                                   | Chỉ nhập tay từng dòng; danh sách chỉ xem tổng                                                         | Bảng đơn giá dạng phẳng, nhập/xuất Excel theo mẫu cố định, có bước xem trước và báo lỗi từng dòng trước khi ghi                                                                                              |
| 3   | **Mã kho, mã VT, tên kho, tên VT, ĐVT trùng khớp MISA**. Tính tiền theo **mã**, không theo tên                                                                                           | Engine đã tính theo mã. Tên hiển thị đang tự đặt (ví dụ "Kích U Ø38\*(3,0ly - 4,5ly)…"), khác tên MISA | Tên và ĐVT lấy theo MISA (từ file nguồn mới nhất). Khi import, kiểm tra mã có tồn tại trên MISA và tên khớp, lệch thì cảnh báo. Mặc định **1 mã MISA = 1 dòng đơn giá**                                      |
| 4   | **Tìm kiếm dự án** thay vì dropdown                                                                                                                                                      | Dropdown dài                                                                                           | Ô chọn có tìm kiếm (gõ vài ký tự của mã kho, tên kho, khách hàng hoặc số HĐ)                                                                                                                                 |
| 4b  | (bản ghi) **Tự tạo kỳ** bằng nút "+": 26→25, đầu→cuối tháng, 6 tháng, 1 năm…                                                                                                             | Kỳ 26→25 cố định + khoảng ngày tự chọn                                                                 | "Mẫu kỳ" do admin tạo: ngày bắt đầu + độ dài theo tháng. Chọn mẫu + tháng thì ra khoảng ngày                                                                                                                 |
| 5   | **Tích chọn nhiều dự án** để xem lượng hàng và tiền thuê của một nhóm dự án                                                                                                              | Chỉ tính 1 dự án                                                                                       | Chọn nhiều dự án (có "chọn tất cả", có lọc). Có thể lưu nhóm dự án hay dùng                                                                                                                                  |
| 6   | **Tính tất cả dự án cùng lúc**: tổng hợp theo mặt hàng, danh sách tiền thuê theo dự án (sắp giảm dần), bấm vào một dự án thì ra chi tiết, xuất Excel                                     | Chỉ có trang đối chiếu (dữ liệu giả định, chỉ admin)                                                   | Trang **Báo cáo tiền thuê**: (a) tổng theo mã VT trên các dự án đã chọn, (b) bảng dự án sắp giảm dần, (c) bấm vào dự án ra chi tiết từng phiếu, (d) xuất Excel. Tái dùng logic của trang đối chiếu           |
| 7   | **Cảnh báo bất thường**: tồn âm, thiếu đơn giá, thiếu dữ liệu kho                                                                                                                        | Engine báo lỗi/cảnh báo, nhưng chỉ khi tính từng dự án                                                 | **Trung tâm cảnh báo** chạy trên dữ liệu tháng: tồn âm; mã có phát sinh mà chưa có giá; kho có hàng trên MISA mà chưa có hợp đồng; kho trong bảng giá không còn trên MISA (đổi mã); tên hoặc ĐVT lệch MISA   |
| 8   | **Xuất file theo form mẫu TP** (4 biểu). Nếu được thì cho TP **tự đưa mẫu lên** cho khách đặc biệt                                                                                       | Đã có kế hoạch + file mẫu (`docs/hstt/`)                                                               | Giai đoạn 3: làm theo `docs/hstt/hstt-export-plan.md`. Giai đoạn 4: cho upload mẫu riêng, dùng chung cơ chế `{{placeholder}}` + đánh dấu dòng ở cột Z                                                        |
| 9   | **Giữ công thức Excel** trong file xuất để dự án tự kiểm tra                                                                                                                             | File xuất hiện tại ghi số cứng                                                                         | Mọi file xuất ra (chi tiết dự án, HSTT, báo cáo) ghi **công thức kèm giá trị đã tính**                                                                                                                       |
| +   | (bản ghi) **Phân quyền** admin / làm việc / chỉ xem, tránh sửa xóa nhầm                                                                                                                  | Có admin + kế toán                                                                                     | Thêm vai trò **Chỉ xem**, thống nhất bảng quyền ở mục 3                                                                                                                                                      |

## 2. Thay đổi về dữ liệu

### 2.1 Bảng đơn giá phẳng (thay cho "dòng gộp nhiều mã")

Mỗi dòng = **(mã kho, mã VT)**, giống sheet `DATA ĐƠN GIÁ` của tool Excel cũ, nên TP chép dữ liệu sang rất dễ.

| Cột Excel nhập/xuất | Bắt buộc | Ghi chú                                                        |
| ------------------- | -------- | -------------------------------------------------------------- |
| Mã kho              | ✓        | Theo MISA, chuẩn hóa khoảng trắng như engine (`normalizeCode`) |
| Tên kho             |          | Lấy theo MISA. Nếu lệch thì cảnh báo, không chặn               |
| Số hợp đồng         | ✓        | Một kho thuộc một hợp đồng. Một hợp đồng có thể gồm nhiều kho  |
| Khách hàng          | ✓        |                                                                |
| Mã VT               | ✓        | Khóa tính tiền                                                 |
| Tên VT, ĐVT         |          | Theo MISA. Nếu lệch thì cảnh báo                               |
| Đơn giá thuê/ngày   | ✓        | Số nguyên VND. Bằng 0 nghĩa là "không tính tiền" (pallet…)     |
| Tên in trên HSTT    |          | Tùy chọn. Để trống thì dùng tên MISA (xem câu hỏi Q1)          |
| Ghi chú             |          |                                                                |

- Import gồm: tải file → hệ thống kiểm tra từng dòng (thiếu cột, trùng (kho, mã), mã không có trên MISA, đơn giá không hợp lệ) → hiện bảng xem trước, lỗi tô đỏ → người dùng bấm xác nhận → ghi trong một transaction và lưu nhật ký (ai, lúc nào, thêm/sửa/xóa bao nhiêu dòng).
- Export dùng **đúng mẫu này**, nên xuất ra, sửa, rồi nhập lại được.
- Engine không phải đổi: mỗi dòng đơn giá thành một `ContractItem` có `maHang: [mã]`, giống cách dữ liệu giả định đang chạy và đã khớp Excel 100%.

### 2.2 File nguồn theo tháng

- Bảng `misa_monthly_files`: tháng (YYYY-MM), phiên bản, file trên Storage, sha256, người tải, thời gian, trạng thái (đang dùng / thay thế), số kho, số phiếu, cảnh báo khi đọc file.
- Khi upload: parser đọc kỳ của file và **bắt buộc trọn 1 tháng** (dòng 2 dạng "Tháng M năm YYYY", hoặc khoảng ngày 01→cuối tháng). Không đúng thì từ chối và giải thích. Upload lại cùng tháng thì tạo phiên bản mới, bản cũ vẫn tải về được.
- Khi tính kỳ [từ, đến]: lấy bản đang dùng của **mọi tháng từ tháng chứa "từ" đến tháng chứa "đến"**. Thiếu tháng nào thì báo rõ "Thiếu file tháng 08/2026". Ghép bằng `mergeLedgers` (đã kiểm tra nối tiếp ngày và tồn đầu khớp tồn cuối).
- Bản tính lưu lại **phiên bản file nào đã dùng**, để sau này biết con số được tính từ dữ liệu nào.

### 2.3 Mẫu kỳ

Bảng `billing_period_presets`: tên, ngày bắt đầu (1–28), số tháng (1, 3, 6, 12). Mặc định có "26→25 (1 tháng)" và "Tháng dương lịch". Hợp đồng có thể gán mẫu kỳ mặc định.

## 3. Phân quyền

| Thao tác                                                                            | Chỉ xem | Kế toán | Admin |
| ----------------------------------------------------------------------------------- | ------- | ------- | ----- |
| Xem dự án, bảng giá, báo cáo, cảnh báo; tải file nguồn, xuất Excel                  | ✓       | ✓       | ✓     |
| Tính tiền, lưu nháp                                                                 |         | ✓       | ✓     |
| Upload file nguồn tháng                                                             |         | ✓       | ✓     |
| Nhập khẩu / sửa bảng giá                                                            |         | ✓       | ✓     |
| Xác nhận bản tính                                                                   |         | ✓       | ✓     |
| Thay phiên bản file đã dùng cho bản tính đã xác nhận; xóa dữ liệu; mẫu kỳ; mẫu biểu |         |         | ✓     |

Mọi quyền kiểm tra ở **server**. Ẩn nút trên giao diện chỉ để tiện dùng, không phải lớp bảo vệ.

## 4. Báo cáo tiền thuê nhiều dự án (ý 5, 6)

- Bộ lọc: mẫu kỳ + tháng (hoặc khoảng ngày), ô chọn nhiều dự án có tìm kiếm, "chọn tất cả", nhóm đã lưu.
- Kết quả:
  1. **Tổng hợp theo mã VT** trên các dự án đã chọn: tồn đầu, nhập, trả, tồn cuối, SL-ngày, tiền thuê. Đơn giá khác nhau giữa các dự án thì ghi "Theo dự án", tiền thì cộng từ từng dự án.
  2. **Danh sách dự án** sắp theo tiền thuê giảm dần, có dòng tổng. Dự án có lỗi (thiếu giá, không có kho) nằm cuối bảng kèm lý do, giống trang đối chiếu.
  3. Bấm vào dự án ra **chi tiết từng phiếu**, giống trang bản tính hiện tại.
- **Xuất Excel có công thức**: sheet Tổng hợp, sheet Danh sách dự án, mỗi dự án một sheet chi tiết (các công thức `H=E−D+1`, `J=I*H*G`, `SUBTOTAL` như HSTT).
- Chỉ tính và xem, không lưu. Muốn lưu, xác nhận hoặc lập HSTT thì vào bản tính của từng dự án.

## 5. Trung tâm cảnh báo (ý 7)

Chạy theo tháng dữ liệu, hoặc theo kỳ đang xem:

- **Tồn âm**: kho dự án có tồn âm tại bất kỳ thời điểm nào trong kỳ, kèm phiếu gây âm. Kho công ty (kho tổng, kho đi thuê) thì gom riêng hoặc ẩn.
- **Thiếu đơn giá**: (kho, mã) có phát sinh hoặc có tồn mà chưa có trong bảng giá.
- **Thiếu dữ liệu kho**: kho có hàng trên MISA mà chưa gán hợp đồng.
- **Kho, mã không còn trên MISA**: có trong bảng giá nhưng không thấy trong file mới nhất (thường do MISA đổi mã, ví dụ ZUHANG → ZUHANG-chothue).
- **Lệch tên hoặc ĐVT** so với MISA.

Có thể lọc theo loại, theo dự án, và xuất Excel.

## 6. Xuất file theo mẫu (ý 8, 9)

- **Giai đoạn 3:** HSTT 4 biểu (ĐNTT, ĐCCN, Giá trị, Khối lượng) theo `docs/hstt/hstt-export-plan.md`: điền vào file mẫu, giữ công thức, golden test với HSTT T08/2026.
- **Giai đoạn 4 – mẫu riêng của khách:** admin upload file `.xlsx` theo **quy ước mẫu** (`{{placeholder}}` cho ô dữ liệu, cột Z đánh dấu dòng lặp `row:dong-dau`, `row:dong-tiep`, `row:cong`…). Hệ thống kiểm tra mẫu (placeholder lạ, thiếu dòng bắt buộc) rồi lưu lại, gán cho hợp đồng. Viết tài liệu "Cách tự làm mẫu" kèm danh sách placeholder. Không nhận macro (.xlsm).

## 7. Lộ trình

| Giai đoạn              | Nội dung                                                                                                                                                              | Ý góp ý                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **1. Nền dữ liệu**     | Vai trò Chỉ xem + bảng quyền; file nguồn theo tháng (phiên bản, lịch sử, tải về); bảng đơn giá phẳng + nhập/xuất Excel + đối chiếu tên MISA; ô chọn dự án có tìm kiếm | 1, 1b, 2, 3, 4, phân quyền |
| **2. Tính và báo cáo** | Tự lấy file theo kỳ; mẫu kỳ; chọn nhiều dự án; báo cáo tiền thuê nhiều dự án + xuất Excel có công thức; trung tâm cảnh báo                                            | 4b, 5, 6, 7, 9             |
| **3. HSTT**            | 4 biểu theo mẫu TP, giữ công thức                                                                                                                                     | 8, 9                       |
| **4. Mẫu riêng**       | Upload mẫu biểu riêng cho khách                                                                                                                                       | 8 (mở rộng)                |

Mỗi giai đoạn kết thúc bằng test xanh, build OK, và bản demo cho TP xem trước khi sang giai đoạn sau.

## 8. Câu hỏi cần TP chốt

- **Q1. Tên trên HSTT gửi khách:** theo tên MISA, mỗi mã một dòng (đúng tinh thần ý 3)? Hay vẫn được gộp/đổi tên như HSTT Việt Panel hiện tại ("Giáo ringlock 2.5m Kẽm" gộp cả loại nhúng nóng; "Kích U" thay cho "Kích đầu")? Đề xuất: mặc định tên MISA, mỗi mã một dòng; có cột "Tên in trên HSTT" để ghi đè khi khách yêu cầu.
- **Q2. Đơn giá có đổi giữa chừng hợp đồng không?** Nếu có thì cần thêm cột "áp dụng từ ngày" (engine phải tách dòng theo mốc giá; đây là thay đổi logic, cần thiết kế và test riêng).
- **Q3. Tháng chưa kết thúc:** có cần tính tạm (ví dụ ngày 15 xem số tạm) không? Nếu có thì cho upload file "tháng hiện tại, đến ngày X", đánh dấu là bản tạm, và thay khi đủ tháng.
- **Q4. Ai thuộc vai trò nào** (Admin / Kế toán / Chỉ xem)?
- **Q5. Bảng giá thật:** đơn giá trong tool Excel cũ là **giả định**. Cần kế toán cung cấp file đơn giá thật theo mẫu ở mục 2.1 để import.
