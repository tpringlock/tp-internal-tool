import type { ContractConfig } from "../types";

/**
 * Hợp đồng Việt Panel – dự án Senci (kho MISA VIETPANEL-01).
 * Đơn giá lấy từ HSTT thật (không đổi qua 9 kỳ 12/2025 → 08/2026).
 * Sau này chuyển sang bảng trong DB; file này dùng làm seed và cho test.
 */
export const vietpanelSenci: ContractConfig = {
  id: "vietpanel-senci",
  customerName: "CÔNG TY TNHH XÂY DỰNG VIỆT PANEL",
  projectName: "Senci – KCN Phúc Điền, Hải Dương",
  contractNo: "0412/HĐKT2025/TP-VIETPANEL",
  misaKho: "VIETPANEL-01",
  items: [
    { name: "Giáo ringlock 1.0m Kẽm", unit: "Cây", unitPrice: 85, maHang: ["VT0021"] },
    { name: "Giáo ringlock 1.5m Kẽm", unit: "Cây", unitPrice: 125, maHang: ["VT0020"] },
    { name: "Giáo ringlock 2.0m Kẽm", unit: "Cây", unitPrice: 159, maHang: ["VT0023"] },
    { name: "Giáo ringlock 2.5m Kẽm", unit: "Cây", unitPrice: 185, maHang: ["VT0022", "VT0090"] },
    { name: "Giằng ngang ringlock 0.6m", unit: "Cái", unitPrice: 43, maHang: ["VT0008"] },
    { name: "Giằng ngang ringlock 0.9m", unit: "Cái", unitPrice: 55, maHang: ["VT0069"] },
    { name: "Giằng ngang ringlock 1.2m", unit: "Cái", unitPrice: 71, maHang: ["VT0064", "VT0091"] },
    { name: "Kích U Ø38*(3,0ly - 4,5ly), L=600mm", unit: "Cái", unitPrice: 70, maHang: ["VT0053", "VT0067"] },
    { name: "Kích chân Ø38*(3,0ly - 4,5ly), L=600mm", unit: "Cái", unitPrice: 70, maHang: ["VT0048", "VT0068"] },
    { name: "Khóa giáo xoay D48", unit: "Cái", unitPrice: 45, maHang: ["CCDC272"] },
  ],
  excludedMaHang: ["PALLET", "VT0094"],
};
