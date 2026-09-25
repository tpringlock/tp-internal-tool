/** Ngày dạng ISO "YYYY-MM-DD" (không có giờ, không múi giờ). */
export type IsoDate = string;

// ───────────── Dữ liệu đọc từ file MISA "Sổ chi tiết vật tư hàng hóa" ─────────────

export interface LedgerOpening {
  kho: string; // Mã kho, ví dụ "VIETPANEL-01"
  khoName: string; // "VIETPANEL HẢI DƯƠNG"
  maHang: string; // "VT0022"
  tenHang: string;
  dvt: string;
  qty: number; // Số dư đầu kỳ (số lượng) tại ngày bắt đầu của file
}

export interface LedgerMovement {
  kho: string;
  maHang: string;
  tenHang: string;
  date: IsoDate; // Ngày hạch toán
  soCt: string; // Số chứng từ
  dienGiai: string;
  nhap: number; // SL nhập vào kho dự án = giao cho công trình
  xuat: number; // SL xuất khỏi kho dự án = công trình trả / luân chuyển
  sourceRow: number; // Dòng trong file Excel, để truy vết
}

export interface Ledger {
  /** Khoảng ngày mà file bao phủ (đọc từ dòng 2 của file, hoặc do người dùng nhập). */
  from: IsoDate;
  to: IsoDate;
  layout: "13-cot" | "16-cot" | "khac";
  openings: LedgerOpening[];
  movements: LedgerMovement[];
  warehouses: Record<string, string>; // mã kho -> tên kho
  warnings: string[];
}

// ───────────── Cấu hình hợp đồng / dự án ─────────────

export interface ContractItem {
  /** Tên dòng hiển thị trên HSTT. */
  name: string;
  unit: string;
  /** Đơn giá thuê / ngày (VND, số nguyên). */
  unitPrice: number;
  /** Các mã hàng MISA gộp vào dòng này. */
  maHang: string[];
}

export interface ContractConfig {
  id: string;
  customerName: string;
  projectName: string;
  contractNo: string;
  /** Mã kho MISA của dự án. */
  misaKho: string;
  items: ContractItem[];
  /** Mã hàng có trong kho dự án nhưng không tính tiền (pallet...). */
  excludedMaHang: string[];
}

export interface Period {
  from: IsoDate; // ngày đầu kỳ, thường là ngày 26 tháng trước
  to: IsoDate; // ngày cuối kỳ, thường là ngày 25
}

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
  reason: string; // ví dụ "Nghỉ Tết Nguyên đán 2026"
}

// ───────────── Đầu vào / đầu ra của engine (thuần, không phụ thuộc MISA) ─────────────

export interface RentMovement {
  date: IsoDate;
  qty: number; // + giao, − trả
  ref: string; // số chứng từ hoặc ghi chú
}

export interface RentItemInput {
  name: string;
  unit: string;
  unitPrice: number;
  /** Tồn đầu kỳ (tại ngày period.from). */
  opening: number;
  movements: RentMovement[];
}

export interface RentInput {
  period: Period;
  items: RentItemInput[];
  /** Khoảng ngày không tính tiền (nghỉ Tết...). Mỗi dòng trừ số ngày giao nhau. */
  excludedRanges?: DateRange[];
}

export interface RentLine {
  kind: "ton-dau-ky" | "phat-sinh";
  date: IsoDate; // "Ngày nhận/trả trên phiếu"
  endDate: IsoDate; // "Ngày tính thời gian"
  openingQty: number | null; // cột "Số lượng tồn đầu kỳ"
  qty: number; // cột "Số lượng phát sinh trong kỳ nhận (+) trả (−)"
  days: number; // "Thời gian thuê"
  excludedDays: number;
  unitPrice: number;
  amount: number; // "Thành tiền thuê"
  ref: string;
  explain: string;
}

export interface RentItemResult {
  name: string;
  unit: string;
  unitPrice: number;
  lines: RentLine[];
  closingQty: number; // dòng "Cộng" – số lượng
  amount: number; // dòng "Cộng" – thành tiền
}

export interface RentResult {
  period: Period;
  items: RentItemResult[];
  totalAmount: number; // Tổng tiền thuê thiết bị (mục I)
  warnings: string[];
}
