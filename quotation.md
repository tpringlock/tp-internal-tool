# BÁO GIÁ DỰ ÁN

> **Bản nháp nội bộ để review — chưa gửi khách hàng.**
>
> **Cơ sở lập báo giá:** Không có tài liệu scope/proposal/khách hàng bên ngoài nào
> được cung cấp. Báo giá này được lập trên giả định dự án cần báo giá là **"Xây dựng
> Phân hệ Báo giá tự động (Calculate Bill Automatically) cho hệ thống nội bộ
> tp-internal-tool"**, với phạm vi suy ra từ codebase hiện tại và phần phân tích
> khoảng trống trong `docs/quotation-guide.md`. Nếu dự án thực tế khác, cần cung cấp
> tài liệu để lập lại.
>
> **Về giá:** Toàn bộ đơn giá và khối lượng là **ước tính đề xuất dựa trên phạm vi
> và độ phức tạp của dự án**, KHÔNG phải giá thị trường chính xác. Các điểm cần
> quyết định được đánh dấu `[CẦN XÁC NHẬN]`.

---

## 1. Thông tin chung

| Mục | Nội dung |
|---|---|
| Khách hàng | `[CẦN XÁC NHẬN]` — chưa có thông tin khách hàng trong tài liệu |
| Đơn vị báo giá (nhà cung cấp) | `[CẦN XÁC NHẬN]` — điền pháp nhân/đội ngũ thực hiện |
| Dự án | Phân hệ Báo giá tự động ("Calculate Bill Automatically") cho portal nội bộ tp-internal-tool |
| Ngày báo giá | 30/08/2026 |
| Hiệu lực báo giá | 30 ngày kể từ ngày báo giá (đến hết 29/09/2026) |
| Loại tiền tệ | VND |

---

## 2. Tổng quan dự án

Portal nội bộ **tp-internal-tool** hiện đã có các phân hệ: Quản lý tài liệu
(Documents), Đào tạo (Academy), Quản trị (người dùng / khách hàng / dự án) và Hồ sơ
cá nhân. Trên trang chủ đã có sẵn ô chức năng **"Calculate Bill Automatically"** ở
trạng thái *"Coming soon"* nhưng **chưa được triển khai**.

Mục tiêu dự án là **bổ sung phân hệ lập báo giá** vào hệ thống hiện có, cho phép
người dùng nội bộ:

- Tạo và quản lý báo giá gắn với khách hàng / dự án đã có trong hệ thống.
- Chọn sản phẩm/dịch vụ từ một danh mục có đơn giá.
- Tự động tính thành tiền, chiết khấu, thuế và tổng tiền.
- Quản lý trạng thái báo giá và xuất báo giá ra PDF để gửi khách hàng.

Phân hệ được xây dựng **kế thừa nền tảng sẵn có** (đăng nhập & phân quyền, danh mục
khách hàng/dự án, cơ chế chia sẻ link tài liệu, đa ngôn ngữ Việt/Anh), nên không
phải làm lại các phần này.

> **Ghi chú giả định nghiệp vụ** `[CẦN XÁC NHẬN]`: Báo giá này giả định phạm vi ở
> mức "phân hệ lập báo giá tiêu chuẩn". Các yêu cầu nâng cao **chưa được xác nhận là
> có hay không** (xem mục 11): quy trình phê duyệt nhiều cấp, đa tiền tệ, hóa đơn
> điện tử kết nối cơ quan thuế, tích hợp kế toán.

---

## 3. Phạm vi công việc

Các nhóm công việc chính (module hướng tới giá trị khách hàng, không phải task kỹ thuật):

1. **Phân tích nghiệp vụ & thiết kế hệ thống** — chốt yêu cầu, thiết kế cấu trúc dữ
   liệu báo giá, thiết kế luồng và giao diện (wireframe).
2. **Danh mục Sản phẩm/Dịch vụ & Bảng giá** — quản lý danh mục hàng hóa/dịch vụ kèm
   đơn giá làm cơ sở cho báo giá.
3. **Phân hệ Tạo & Quản lý Báo giá (lõi)** — tạo/sửa/sao chép/xóa báo giá; thêm dòng
   sản phẩm; tự động tính số lượng × đơn giá, chiết khấu, thuế, tạm tính, tổng tiền;
   danh sách và tìm kiếm báo giá; gắn với khách hàng/dự án.
4. **Quy trình Trạng thái & Phê duyệt báo giá** — vòng đời báo giá (nháp / đã gửi /
   được duyệt / từ chối / hết hạn) và luồng chuyển trạng thái.
5. **Xuất báo giá PDF & Chia sẻ** — sinh file PDF báo giá theo mẫu và chia sẻ cho
   khách hàng qua link có thời hạn (kế thừa cơ chế share-link hiện có).
6. **Phân quyền & Nhật ký hoạt động** — kiểm soát quyền theo vai trò và ghi log thao
   tác (kế thừa hệ thống vai trò & audit log hiện có).
7. **Tích hợp giao diện & Đa ngôn ngữ** — chuyển ô "Calculate Bill Automatically"
   từ *Coming soon* thành chức năng thật; hỗ trợ song ngữ Việt/Anh.
8. **Kiểm thử & Nghiệm thu (QA/UAT)** — kiểm thử chức năng, kiểm thử tính toán, hỗ
   trợ khách hàng nghiệm thu.
9. **Triển khai, Tài liệu & Đào tạo** — đưa lên môi trường chạy thật, cập nhật tài
   liệu hướng dẫn và đào tạo người dùng.
10. **Quản lý dự án** — điều phối, báo cáo tiến độ, quản lý chất lượng trong suốt dự án.

---

## 4. Chi tiết báo giá

> Đơn giá theo **người-ngày (man-day)**. Đơn giá đề xuất **2.000.000 VND/người-ngày**
> `[CẦN XÁC NHẬN]` (mức blended cho đội ngũ phát triển; điều chỉnh theo thỏa thuận).
> Khối lượng (SL) là **ước tính công sức** theo phạm vi và độ phức tạp.

| STT | Hạng mục | Mô tả | Đơn vị | SL | Đơn giá (VND) | Thành tiền (VND) |
|---:|---|---|---:|---:|---:|---:|
| 1 | Phân tích nghiệp vụ & thiết kế hệ thống | Chốt yêu cầu, thiết kế schema dữ liệu báo giá, luồng nghiệp vụ, wireframe giao diện | người-ngày | 8 | 2.000.000 | 16.000.000 |
| 2 | Danh mục Sản phẩm/Dịch vụ & Bảng giá | Quản lý danh mục hàng hóa/dịch vụ, đơn giá; giao diện quản trị | người-ngày | 7 | 2.000.000 | 14.000.000 |
| 3 | Phân hệ Tạo & Quản lý Báo giá (lõi) | Tạo/sửa/sao chép/xóa báo giá, dòng sản phẩm, công cụ tính giá (số lượng × đơn giá, chiết khấu, thuế, tạm tính, tổng tiền), danh sách & tìm kiếm | người-ngày | 20 | 2.000.000 | 40.000.000 |
| 4 | Quy trình Trạng thái & Phê duyệt báo giá | Vòng đời báo giá & chuyển trạng thái (nháp/đã gửi/được duyệt/từ chối/hết hạn) | người-ngày | 7 | 2.000.000 | 14.000.000 |
| 5 | Xuất báo giá PDF & Chia sẻ | Sinh PDF theo mẫu, chia sẻ link có thời hạn cho khách hàng | người-ngày | 9 | 2.000.000 | 18.000.000 |
| 6 | Phân quyền & Nhật ký hoạt động | Kiểm soát quyền theo vai trò, ghi log thao tác | người-ngày | 5 | 2.000.000 | 10.000.000 |
| 7 | Tích hợp giao diện & Đa ngôn ngữ (Việt/Anh) | Kích hoạt ô chức năng trên trang chủ, hỗ trợ song ngữ | người-ngày | 5 | 2.000.000 | 10.000.000 |
| 8 | Kiểm thử & Nghiệm thu (QA/UAT) | Kiểm thử chức năng & tính toán, hỗ trợ nghiệm thu | người-ngày | 10 | 2.000.000 | 20.000.000 |
| 9 | Triển khai, Tài liệu & Đào tạo | Triển khai môi trường thật, cập nhật tài liệu, đào tạo người dùng | người-ngày | 5 | 2.000.000 | 10.000.000 |
| 10 | Quản lý dự án | Điều phối, báo cáo tiến độ, quản lý chất lượng | người-ngày | 8 | 2.000.000 | 16.000.000 |
| | **Tổng khối lượng / Tổng trước VAT** | | **người-ngày** | **84** | | **168.000.000** |

---

## 5. Tổng giá trị

| Nội dung | Giá trị (VND) |
|---|---:|
| Tổng trước VAT | 168.000.000 |
| VAT | `[CẦN XÁC NHẬN VAT]` |
| **Tổng thanh toán** | **168.000.000** *(chưa gồm VAT)* |

> **`[CẦN XÁC NHẬN VAT]`** — Chưa có thông tin về VAT. Báo giá **chưa bao gồm VAT**.
> Minh họa nếu áp dụng VAT (chưa xác nhận thuế suất áp dụng cho dịch vụ phần mềm):
>
> | Kịch bản VAT | Tiền VAT | Tổng thanh toán |
> |---|---:|---:|
> | Không VAT | 0 | 168.000.000 |
> | VAT 8% | 13.440.000 | 181.440.000 |
> | VAT 10% | 16.800.000 | 184.800.000 |
>
> Vui lòng xác nhận thuế suất để chốt con số cuối cùng.

*(Bằng chữ, chưa gồm VAT: Một trăm sáu mươi tám triệu đồng chẵn.)*

---

## 6. Tiến độ triển khai

> Ước tính dựa trên tổng công sức ~84 người-ngày với đội ngũ **~2 người** làm việc
> song song. Đây là **khoảng thời gian ước tính**, phụ thuộc tốc độ phản hồi/nghiệm
> thu của khách hàng. Tổng thời gian dự kiến: **8–10 tuần**.

| Giai đoạn | Nội dung | Thời gian dự kiến |
|---|---|---|
| 1. Phân tích & thiết kế | Chốt yêu cầu, thiết kế dữ liệu, luồng & wireframe | Tuần 1 – 1,5 |
| 2. Phát triển | Danh mục sản phẩm, phân hệ báo giá lõi, trạng thái, PDF, tích hợp giao diện | Tuần 2 – 7 |
| 3. Kiểm thử (QA) | Kiểm thử nội bộ chức năng & tính toán (chạy song song cuối GĐ phát triển) | Tuần 6 – 7 |
| 4. UAT | Khách hàng kiểm thử nghiệm thu, xử lý phản hồi | Tuần 8 |
| 5. Triển khai | Đưa lên môi trường thật, bàn giao | Tuần 8 – 9 |
| 6. Bàn giao & đào tạo | Đào tạo, bàn giao tài liệu & mã nguồn | Tuần 9 – 10 |

---

## 7. Bàn giao (Deliverables)

- Phân hệ Báo giá hoạt động trên hệ thống tp-internal-tool.
- Mã nguồn được tích hợp vào repository của dự án.
- Các script cơ sở dữ liệu (migrations) cho phân hệ báo giá.
- Mẫu xuất báo giá PDF.
- Tài liệu hướng dẫn sử dụng (cập nhật `docs/quotation-guide.md` theo tính năng thực tế).
- 01 buổi đào tạo người dùng (online hoặc trực tiếp) `[CẦN XÁC NHẬN hình thức]`.

---

## 8. Bảo hành và hỗ trợ

- **Thời gian bảo hành:** 60 ngày `[CẦN XÁC NHẬN — đề xuất 60–90 ngày]` kể từ ngày
  nghiệm thu/bàn giao.
- **Phạm vi bảo hành:** Sửa lỗi (bug) của các chức năng đã nghiệm thu, đúng với đặc
  tả đã thống nhất — **miễn phí** trong thời gian bảo hành.
- **Ngoài phạm vi bảo hành:** Yêu cầu chức năng mới, thay đổi phạm vi, lỗi do thay
  đổi hạ tầng/bên thứ ba, hoặc dữ liệu do người dùng nhập sai.
- **Hỗ trợ sau bảo hành / phát triển mới:** Theo gói bảo trì hoặc hợp đồng riêng,
  báo giá theo người-ngày `[CẦN XÁC NHẬN nếu khách hàng có nhu cầu]`.

---

## 9. Điều kiện thanh toán

> Đề xuất — có thể điều chỉnh khi thương thảo hợp đồng. Tỷ lệ tính trên tổng trước VAT
> (168.000.000 VND); VAT cộng theo từng đợt nếu áp dụng.

| Đợt | Điều kiện | Tỷ lệ | Số tiền (VND, chưa VAT) |
|---|---|---:|---:|
| Đợt 1 | Khi ký hợp đồng | 30% | 50.400.000 |
| Đợt 2 | Khi hoàn thành phát triển & bàn giao UAT | 40% | 67.200.000 |
| Đợt 3 | Khi nghiệm thu & bàn giao | 30% | 50.400.000 |
| | **Tổng** | **100%** | **168.000.000** |

---

## 10. Phạm vi bao gồm (In-scope)

- Toàn bộ 10 hạng mục tại Mục 4.
- Xây dựng phân hệ báo giá **kế thừa nền tảng hiện có** (đăng nhập, phân quyền, danh
  mục khách hàng & dự án, cơ chế chia sẻ link, đa ngôn ngữ Việt/Anh).
- Tính toán báo giá: số lượng × đơn giá, chiết khấu, thuế, tạm tính, tổng tiền.
- Xuất PDF và chia sẻ báo giá cho khách hàng.
- Kiểm thử, hỗ trợ nghiệm thu, triển khai, tài liệu và 01 buổi đào tạo.
- Bảo hành sửa lỗi theo Mục 8.

---

## 11. Phạm vi không bao gồm (Out-of-scope)

Các hạng mục sau **không nằm** trong báo giá này; nếu cần sẽ báo giá bổ sung:

- Chi phí hạ tầng: hosting / cloud / cơ sở dữ liệu (ví dụ Supabase), tên miền.
- Dịch vụ email/SMS và phí bên thứ ba liên quan.
- **Hóa đơn điện tử kết nối cơ quan thuế** (e-invoice) — `[CẦN XÁC NHẬN có yêu cầu không]`.
- **Đa tiền tệ / quy đổi ngoại tệ** — `[CẦN XÁC NHẬN]` (mặc định giả định chỉ VND).
- **Quy trình phê duyệt nhiều cấp phức tạp** ngoài vòng đời trạng thái tiêu chuẩn — `[CẦN XÁC NHẬN]`.
- Tích hợp phần mềm kế toán / ERP / cổng thanh toán.
- Nhập/di trú (migration) khối lượng lớn dữ liệu báo giá cũ.
- Thiết kế thương hiệu/mẫu PDF tùy biến sâu ngoài 01 mẫu tiêu chuẩn.
- Các chức năng phát sinh ngoài phạm vi đã thống nhất.

---

## 12. Điều khoản báo giá

1. Báo giá có **hiệu lực 30 ngày** kể từ ngày báo giá (đến hết 29/09/2026); sau thời
   hạn này giá có thể được điều chỉnh.
2. Giá là **ước tính đề xuất dựa trên phạm vi và độ phức tạp của dự án**; khối lượng
   người-ngày có thể thay đổi khi phạm vi được chốt chi tiết ở giai đoạn phân tích.
3. Báo giá **chưa bao gồm VAT**; thuế suất áp dụng cần được xác nhận (`[CẦN XÁC NHẬN VAT]`).
4. Mọi thay đổi/bổ sung ngoài phạm vi tại Mục 10 sẽ được báo giá riêng theo người-ngày.
5. Tiến độ phụ thuộc vào thời gian phản hồi, cung cấp thông tin và nghiệm thu của
   khách hàng.
6. Các mục `[CẦN XÁC NHẬN]` cần được làm rõ trước khi ký hợp đồng để chốt giá và tiến độ cuối cùng.

---

### Phụ lục A — Danh sách điểm cần xác nhận `[CẦN XÁC NHẬN]`

1. **Xác nhận đối tượng báo giá**: đây có đúng là dự án "xây dựng phân hệ báo giá cho
   tp-internal-tool" không? (Không có tài liệu scope bên ngoài được cung cấp.)
2. Thông tin khách hàng và nhà cung cấp (tên, pháp nhân, liên hệ).
3. Đơn giá người-ngày (đang đề xuất 2.000.000 VND).
4. Thuế suất VAT áp dụng (0% / 8% / 10%).
5. Có yêu cầu: hóa đơn điện tử, đa tiền tệ, phê duyệt nhiều cấp, tích hợp kế toán không?
6. Thời gian bảo hành (60 hay 90 ngày) và nhu cầu gói bảo trì sau bảo hành.
7. Hình thức đào tạo (online/trực tiếp) và quy mô người dùng.
