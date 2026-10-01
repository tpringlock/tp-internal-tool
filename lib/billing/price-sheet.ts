import { cleanText } from "./text";

/**
 * Layout of the price Excel file (docs/mau-nhap-don-gia.xlsx), shared by the
 * import parser, the export and scripts/make-price-template.mts so the three
 * can never drift apart. Client-safe.
 */

export const PRICE_SHEET = "DON_GIA";
export const GUIDE_SHEET = "HUONG_DAN";

export type PriceColumnKey =
  | "misa_kho"
  | "misa_kho_name"
  | "contract_no"
  | "customer_name"
  | "ma_vt"
  | "ten_vt"
  | "dvt"
  | "unit_price"
  | "print_name"
  | "print_dvt"
  | "note";

export interface PriceColumn {
  key: PriceColumnKey;
  header: string;
  /** "required": every row; "new-warehouse": only rows of a warehouse not yet in the system. */
  need: "required" | "new-warehouse" | "optional";
  width: number;
}

/** In file order (A..K). */
export const PRICE_COLUMNS: readonly PriceColumn[] = [
  { key: "misa_kho", header: "Mã kho", need: "required", width: 16 },
  { key: "misa_kho_name", header: "Tên kho", need: "optional", width: 24 },
  { key: "contract_no", header: "Số hợp đồng", need: "new-warehouse", width: 30 },
  { key: "customer_name", header: "Khách hàng", need: "new-warehouse", width: 36 },
  { key: "ma_vt", header: "Mã VT", need: "required", width: 11 },
  { key: "ten_vt", header: "Tên VT", need: "optional", width: 46 },
  { key: "dvt", header: "ĐVT", need: "optional", width: 8 },
  { key: "unit_price", header: "Đơn giá thuê/ngày (đ)", need: "required", width: 14 },
  { key: "print_name", header: "Tên in trên HSTT", need: "optional", width: 38 },
  { key: "print_dvt", header: "ĐVT in trên HSTT", need: "optional", width: 12 },
  { key: "note", header: "Ghi chú", need: "optional", width: 18 },
];

export const REQUIRED_COLUMNS = PRICE_COLUMNS.filter((c) => c.need === "required").map((c) => c.key);

export function columnHeader(key: PriceColumnKey): string {
  return PRICE_COLUMNS.find((c) => c.key === key)!.header;
}

function headerKey(s: string): string {
  return cleanText(s).toLocaleLowerCase("vi");
}

/** Extra spellings accepted on import (exports always use the canonical header). */
const ALIASES: Record<string, PriceColumnKey> = {
  "đơn giá": "unit_price",
  "đơn giá thuê/ngày": "unit_price",
  "đơn giá (đ)": "unit_price",
  "số hđ": "contract_no",
  "tên in hstt": "print_name",
  "đvt in hstt": "print_dvt",
};

const BY_HEADER = new Map<string, PriceColumnKey>([
  ...PRICE_COLUMNS.map((c) => [headerKey(c.header), c.key] as const),
  ...Object.entries(ALIASES),
]);

/** Column key for a header cell (case/spacing-insensitive), or null if unknown. */
export function matchPriceHeader(text: string): PriceColumnKey | null {
  return BY_HEADER.get(headerKey(text)) ?? null;
}

/** Instructions sheet (HUONG_DAN), row by row; "" = empty row. */
export const GUIDE_TITLE = "HƯỚNG DẪN ĐIỀN FILE ĐƠN GIÁ THUÊ";
export const GUIDE_LINES: readonly string[] = [
  "• Mỗi dòng = 1 mã vật tư trong 1 kho (dự án). Hệ thống tính tiền theo MÃ, không theo tên.",
  "• Bắt buộc: Mã kho, Mã VT, Đơn giá. Kho mới (chưa có trên hệ thống) cần thêm Số hợp đồng và Khách hàng.",
  "• Mã kho, Mã VT, Tên kho, Tên VT, ĐVT: chép đúng như trên MISA (Sổ chi tiết vật tư hàng hóa). Mã kho là mã kho CHO THUÊ (ví dụ 'HÀ MINH chothue').",
  "• Đơn giá: số nguyên, đồng/ngày, không gõ dấu chấm phân cách. Đơn giá = 0 nghĩa là KHÔNG tính tiền (pallet, vật tư không cho thuê).",
  "• Một (Mã kho, Mã VT) chỉ xuất hiện 1 lần. Một kho thuộc 1 số hợp đồng.",
  "• Tên in trên HSTT: chỉ điền khi khách yêu cầu tên khác tên MISA (để trống = dùng tên MISA). Các dòng có cùng tên in sẽ được gộp thành 1 dòng trên HSTT.",
  "• Sheet DON_GIA đang có sẵn ví dụ dự án Việt Panel – Senci với đơn giá THẬT lấy từ HSTT T08/2026. Điền tiếp các dự án khác bên dưới.",
  "• ĐVT in trên HSTT: chỉ điền khi HSTT cần in đơn vị khác MISA (ví dụ MISA 'cây' nhưng HSTT in 'Cái'). Để trống = dùng ĐVT của MISA.",
  "• Khi nhập: cột KHÔNG có trong file thì giữ nguyên dữ liệu cũ; cột CÓ trong file mà ô trống thì xóa giá trị đó. Muốn chỉ sửa giá, có thể gửi file chỉ gồm Mã kho, Mã VT, Đơn giá.",
];
/** The guide line that only makes sense in the template (it describes the sample rows). */
export const GUIDE_SAMPLE_LINE = 6;
