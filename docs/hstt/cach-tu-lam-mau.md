# Cách tự làm mẫu HSTT cho một khách hàng

Tài liệu cho kế toán. Mẫu HSTT là một file Excel (.xlsx) có sẵn khung 4 biểu: Đề nghị thanh toán (ĐNTT), Đối chiếu công nợ (ĐCCN), Đối chiếu giá trị, Đối chiếu khối lượng. Khi bấm **Tải HSTT**, hệ thống lấy mẫu của hợp đồng, điền số liệu của kỳ và trả về file hoàn chỉnh. Hợp đồng chưa gán mẫu riêng thì dùng **Mẫu chuẩn TP**.

Khách muốn khác mẫu chuẩn (đổi câu chữ, font, thêm logo, bỏ bớt biểu…) thì làm mẫu riêng theo các bước dưới đây.

## 1. Bắt đầu từ mẫu chuẩn

Tải **"Mẫu chuẩn để chỉnh"** (trang Mẫu HSTT). File này giống mẫu chuẩn, chỉ khác 2 điểm:

- **Cột Z hiện ra.** Cột này chứa các "dấu" để hệ thống biết sheet nào là biểu nào, dòng nào là dòng mẫu của bảng. Khi xuất HSTT, cột Z luôn được ẩn và xóa sạch.
- **Có thêm sheet `HUONG_DAN`** liệt kê mọi ô dữ liệu `{{…}}` và các dấu. Sheet này tự bị bỏ khi xuất, không cần xóa.

## 2. Được sửa gì

| Muốn | Làm thế nào |
|---|---|
| Đổi câu chữ cố định | Sửa thẳng trong ô. Ví dụ "GIẤY ĐỀ NGHỊ THANH TOÁN" → "GIẤY ĐỀ NGHỊ THANH TOÁN TIỀN THUÊ". |
| Đổi font, cỡ chữ, màu, đậm/nghiêng, viền, nền | Định dạng như Excel bình thường. Dòng mẫu của bảng định dạng thế nào thì mọi dòng sinh ra giống thế. |
| Tô đậm một phần chữ trong ô | Được. Ví dụ "Kính gửi: **{{a.ten_in_hoa}}**". Chỉ cần định dạng **cả cụm** `{{a.ten_in_hoa}}` giống nhau (không tô đậm nửa cụm). |
| Thêm logo, con dấu, chữ ký scan | Chèn ảnh (Insert → Pictures) **đặt lên vùng ô** của trang tính. Ảnh nằm dưới bảng tự dịch xuống theo số dòng. |
| Đổi độ rộng cột, chiều cao dòng, căn lề, khổ giấy, lề in | Được. |
| Ẩn một cột không muốn in (ví dụ cột Ghi chú) | Ẩn cột (Hide). Không xóa cột. |
| Bỏ hẳn một biểu (ví dụ khách không cần Đối chiếu khối lượng) | Xóa sheet đó. Mẫu chỉ cần còn ít nhất 1 biểu. |
| Đổi tên sheet | Được. Hệ thống nhận biểu theo ô Z1, không theo tên. |
| Đổi vị trí các ô số ở ĐCCN, ĐNTT | Được. Ví dụ đưa cột "Giá trị (vnđ)" của ĐCCN sang trái: công thức nợ cuối kỳ tự theo vị trí mới. |
| Thêm sheet riêng (ghi chú, phụ lục) | Được. Sheet không có dấu ở Z1 được giữ nguyên, không điền gì vào. |

### Lưu ý khi đổi font

Mẫu chuẩn được căn theo font **Times New Roman**. Các font khác như Arial, Calibri… **rộng hơn**, nên cùng một dòng chữ sẽ chiếm nhiều chỗ hơn. Nhãn dài có thể **tràn sang ô bên cạnh** và dính vào dữ liệu. Ví dụ ở biểu ĐCCN: nhãn "Tài khoản ngân hàng số:" (cột A–B) dính liền vào số tài khoản ở cột C.

Cách xử lý (chọn một hoặc kết hợp):

- **Nới độ rộng cột** chứa nhãn (kéo mép cột A/B rộng ra), hoặc
- **Giảm cỡ chữ** của nhãn (ví dụ 13 → 12).

Sau đó **luôn dùng bước "Tải file thử"** (mục 6) và xem bản in (Ctrl+P) từng sheet trước khi lưu mẫu. Hệ thống kiểm tra được chữ, dấu và ô dữ liệu, nhưng **không phát hiện được chữ bị tràn hay bị che**: chỉ nhìn bản in mới thấy.

## 3. Không được làm (hệ thống sẽ báo lỗi, không cho lưu)

- **Đặt logo/con dấu vào ô trên trang tính, không đặt trong Header/Footer; không dùng biểu đồ, hình vẽ** (shape, text box, WordArt). Những thứ này bị mất khi sinh file nên hệ thống chặn ngay từ đầu.
- File có macro (.xlsm), file Excel cũ (.xls), file lớn hơn 2MB.
- Công thức lấy số từ file Excel khác.
- Gõ sai tên ô dữ liệu, ví dụ `{{a.ten}}` hay `{{ thang }}` (có dấu cách). Danh sách đúng ở sheet `HUONG_DAN` và ở mục 5.
- Viết ô số (`{{cn.no_dau_ky}}`, `{{dntt.so_tien}}`…) chung với chữ. Ô số phải **đứng một mình** trong ô, vì hệ thống ghi vào đó con số (hoặc công thức) để Excel còn cộng trừ được. Ví dụ sai: `Số tiền: {{dntt.so_tien}} đồng`. Đúng: ô E14 chỉ có `{{dntt.so_tien}}`, chữ "Số tiền:" để ô bên cạnh.
- Xóa, sửa hoặc xáo trộn các dấu ở cột Z của bảng (mục 4).

## 4. Hai giới hạn cần biết

**a) Cột dữ liệu của bảng thiết bị là cố định.** Hệ thống luôn ghi số liệu vào đúng các cột sau, không đổi thứ tự được:

| Cột | Biểu Giá trị | Biểu Khối lượng |
|---|---|---|
| A | STT | STT |
| B | Tên thiết bị / loại xe | Tên thiết bị / loại xe |
| C | Đơn vị tính | Đơn vị tính |
| D | Từ ngày | Từ ngày |
| E | Đến ngày | Đến ngày |
| F | Số lượng tồn đầu kỳ / lũy kế chuyến | Số lượng tồn đầu kỳ / lũy kế chuyến |
| G | Số lượng | Số lượng |
| H | Số ngày thuê | Số ngày thuê |
| I | Đơn giá | Ghi chú |
| J | Thành tiền | – |
| K | Ghi chú | – |

Được đổi **chữ tiêu đề** của các cột (ví dụ "SL" thay "Số lượng"), độ rộng, font, hoặc **ẩn** cột. Không được chèn thêm cột vào giữa A–K, không xóa cột, không đổi chỗ hai cột dữ liệu. Phần đầu biểu (thông tin các bên, câu căn cứ) và phần chữ ký thì sắp xếp tự do.

**b) Mục II "Vận chuyển" là bắt buộc** ở biểu Giá trị và Khối lượng. Kỳ không có chuyến nào thì mục II chỉ còn dòng tiêu đề, không thể bỏ hẳn mục này.

## 5. Các dấu và ô dữ liệu

### Ô Z1 của mỗi sheet: sheet này là biểu nào

| Ô Z1 | Biểu |
|---|---|
| `sheet:dntt` | Giấy đề nghị thanh toán |
| `sheet:dccn` | Biên bản đối chiếu công nợ |
| `sheet:gia-tri` | Biên bản đối chiếu giá trị thuê thiết bị |
| `sheet:khoi-luong` | Biên bản đối chiếu khối lượng thuê thiết bị |
| `sheet:huong-dan` | Sheet hướng dẫn (bị bỏ khi xuất) |
| (để trống) | Sheet giữ nguyên, không điền |

Mỗi biểu chỉ được có 1 sheet.

### Cột Z của biểu Giá trị và Khối lượng: dòng mẫu của bảng

Các dấu phải nằm trên **các dòng liền nhau, đúng thứ tự**. Không chèn dòng trống hay dòng khác vào giữa, vì hệ thống dựng lại toàn bộ vùng này từ dòng mẫu.

| Dấu | Dòng | Giá trị | Khối lượng |
|---|---|---|---|
| `section:thiet-bi` | Tiêu đề "I. Thiết bị vật tư" (ở Giá trị, ô J là tổng mục I) | ✔ | ✔ |
| `row:dong-dau` | Dòng đầu của mỗi mặt hàng (tồn đầu kỳ, có STT) | ✔ | ✔ |
| `row:dong-tiep` | Các dòng phát sinh tiếp theo | ✔ | ✔ |
| `row:cong` | Dòng "Cộng" của mặt hàng | ✔ | ✔ |
| `section:van-chuyen` | Tiêu đề "II. Vận chuyển" | ✔ | ✔ |
| `row:van-chuyen` | Mỗi loại xe một dòng | ✔ | ✔ |
| `total:truoc-thue` | Tổng tiền thuê trước thuế | ✔ | |
| `total:vat` | Tiền thuế GTGT (dòng giảm trừ chèn ngay dưới, cùng định dạng) | ✔ | |
| `total:sau-thue` | Tổng tiền sau thuế | ✔ | |
| `bang-chu` | Dòng bằng chữ (không bắt buộc) | tùy | |

### Ô dữ liệu `{{…}}`

Gõ đúng chữ thường, không dấu cách. Danh sách đầy đủ kèm ví dụ ở sheet `HUONG_DAN`.

- **Kỳ, hợp đồng:** `{{thang}}` (09/2026), `{{nam}}`, `{{ky.tu}}`, `{{ky.den}}`, `{{can_cu_hd}}` (câu "Căn cứ hợp đồng…"), `{{du_an.ten}}`, `{{du_an.dia_chi}}`, `{{vat_phan_tram}}` (8), `{{bang_chu}}` (tổng sau thuế bằng chữ).
- **Bên A (khách):** `{{a.ten_in_hoa}}`, `{{a.dia_chi}}`, `{{a.dien_thoai}}`, `{{a.so_tk}}`, `{{a.ngan_hang}}`, `{{a.mst}}`, `{{a.dai_dien}}`, `{{a.chuc_vu}}`.
- **Bên B (TP):** `{{b.ten_in_hoa}}`, `{{b.ten_2_dong}}`, `{{b.ten_thuong}}`, `{{b.ten_thu_huong}}`, `{{b.dia_chi}}`, `{{b.dia_chi_ngan}}`, `{{b.dien_thoai}}`, `{{b.so_tk}}`, `{{b.ngan_hang}}`, `{{b.mst}}`, `{{b.dai_dien}}`, `{{b.chuc_vu}}`, `{{b.noi_lap}}`.
- **Công nợ (ô số, đứng một mình):** `{{cn.tam_ung}}`, `{{cn.no_dau_ky}}`, `{{cn.phat_sinh}}`, `{{cn.thanh_toan}}`, `{{cn.no_cuoi_ky}}`; bằng chữ: `{{cn.bang_chu}}`.
- **Đề nghị thanh toán:** `{{dntt.so_tien}}` (ô số), `{{dntt.bang_chu}}`.

Ví dụ câu ghép: `Hai bên cùng nhau đối chiếu công nợ tiền thuê thiết bị dự án {{du_an.ten}}, {{du_an.dia_chi}} như sau:` → "… dự án Senci, KCN Phúc Điền, Hải Dương như sau:".

## 6. Tải mẫu lên, kiểm tra, tải thử, gán cho hợp đồng

Trang **Tính hóa đơn → Mẫu HSTT** (`/billing/templates`). Ai có quyền billing cũng xem và tải mẫu được; chỉ **admin** tải mẫu lên, ngừng dùng, xóa.

1. **Chọn file.** Hệ thống kiểm tra ngay và hiện báo cáo:
   - **Lỗi** (đỏ): phải sửa file rồi chọn lại, chưa lưu được. Ví dụ: `Ô dữ liệu lạ {{a.ten}}: gõ sai tên hoặc có dấu cách`, `Thiếu dấu dòng "row:cong" ở cột Z`, `Mẫu có ảnh trong Header/Footer. Đặt logo/con dấu vào ô trên trang tính, không đặt trong Header/Footer; không dùng biểu đồ, hình vẽ.`
   - **Cảnh báo** (vàng): vẫn lưu được, nhưng nên xem. Ví dụ: sheet không có Z1 mà lại có `{{…}}` (sẽ không được điền), ĐNTT không có ô `{{dntt.so_tien}}`, dấu lạ ở cột Z.
   - Danh sách sheet và vai trò hệ thống nhận ra (ví dụ "Giá trị: Đối chiếu giá trị", "Ghi chú: không vai trò, giữ nguyên").
2. **Tải file thử.** Hệ thống sinh HSTT bằng số liệu kỳ 09/2026 của Việt Panel (tổng sau thuế **800.796.900đ**) từ chính file vừa chọn, chưa lưu gì. Mở ra, xem bản in (Ctrl+P) từng sheet, so số tiền.
3. **Lưu mẫu.** Chọn **Mẫu mới** (đặt tên, ví dụ "Mẫu Việt Panel") hoặc **Phiên bản mới của mẫu có sẵn** (sửa mẫu cũ). Ghi chú phiên bản để sau này biết đã đổi gì ("đổi font, thêm logo").
4. **Gán cho hợp đồng.** Mở hợp đồng → tab **HSTT** → ô **Mẫu HSTT** → chọn mẫu → Lưu (kế toán hoặc admin). Chọn lại "Mẫu chuẩn TP" để bỏ mẫu riêng. Trang bản tính ghi rõ "Mẫu: … (v…)" ngay dưới nút **Tải HSTT**.

**Phiên bản.** Mỗi lần lưu là một phiên bản mới; hợp đồng luôn dùng **phiên bản mới nhất** của mẫu. Phiên bản cũ vẫn tải về được (mục "Lịch sử phiên bản"). Lỡ lưu nhầm: bấm **Dùng lại phiên bản này** ở phiên bản cũ, hệ thống tạo một phiên bản mới cùng nội dung file cũ (không sửa lịch sử).

**Ngừng dùng / xóa.** Mẫu đang gán cho hợp đồng thì không ngừng dùng được: bỏ gán trước. Chỉ xóa được mẫu chưa gán và chưa từng dùng để tải HSTT (mẫu TEST); mẫu đã dùng thì chỉ ngừng dùng.

**Truy vết.** Mỗi lần bấm Tải HSTT, hệ thống ghi lại hợp đồng, kỳ, mẫu và phiên bản (hoặc mẫu chuẩn), mã băm file mẫu, số tiền sau thuế, nợ cuối kỳ, người tải và thời gian, để biết file đã gửi khách sinh từ mẫu nào.
