/**
 * HSTT template convention (client-safe, no exceljs): sheet roles, row
 * markers and placeholders. Plan: docs/hstt/hstt-export-plan.md sections 3–4;
 * guide for accountants: docs/hstt/cach-tu-lam-mau.md.
 *
 * - Cell Z1 of a sheet declares its role ("sheet:gia-tri"). Sheets without a
 *   role are copied untouched; "sheet:huong-dan" sheets are dropped from the
 *   generated file.
 * - Column Z (rows 2+) marks the template rows of the equipment / transport
 *   tables and the totals.
 * - {{key}} marks where the data goes.
 */

export const MARKER_COLUMN = 26; // Z
export const ROLE_PREFIX = "sheet:";

export const SHEET_ROLES = ["dntt", "dccn", "gia-tri", "khoi-luong"] as const;
export type SheetRole = (typeof SHEET_ROLES)[number];
/** Z1 value of a guide sheet (removed from the generated file). */
export const GUIDE_ROLE = "huong-dan";

export const ROLE_LABELS: Record<SheetRole, string> = {
  dntt: "Giấy đề nghị thanh toán (ĐNTT)",
  dccn: "Biên bản đối chiếu công nợ (ĐCCN)",
  "gia-tri": "Biên bản đối chiếu giá trị thuê thiết bị",
  "khoi-luong": "Biên bản đối chiếu khối lượng thuê thiết bị",
};

export const MARKERS = {
  "section:thiet-bi": "Dòng tiêu đề mục I (Thiết bị vật tư); ở biểu Giá trị ô J là tổng mục I",
  "row:dong-dau": "Dòng đầu của mỗi mặt hàng (tồn đầu kỳ, có STT)",
  "row:dong-tiep": "Các dòng phát sinh tiếp theo của mặt hàng",
  "row:cong": "Dòng Cộng của mỗi mặt hàng",
  "section:van-chuyen": "Dòng tiêu đề mục II (Vận chuyển)",
  "row:van-chuyen": "Mỗi loại xe vận chuyển một dòng",
  "total:truoc-thue": "Dòng tổng tiền thuê trước thuế",
  "total:vat": "Dòng tiền thuế GTGT (dòng giảm trừ, nếu có, chèn ngay dưới và dùng định dạng của dòng này)",
  "total:sau-thue": "Dòng tổng tiền sau thuế",
  "bang-chu": "Dòng số tiền bằng chữ (chỉ để dễ nhìn, không bắt buộc)",
} as const;
export type MarkerKey = keyof typeof MARKERS;

const TABLE_MARKERS = [
  "section:thiet-bi",
  "row:dong-dau",
  "row:dong-tiep",
  "row:cong",
  "section:van-chuyen",
  "row:van-chuyen",
] as const satisfies readonly MarkerKey[];

/**
 * Row markers each role needs, in order, on CONSECUTIVE rows: the generator
 * rebuilds the rows from the first to the last marker, so any other row in
 * between would be lost.
 */
export const ROLE_MARKERS: Record<SheetRole, readonly MarkerKey[]> = {
  dntt: [],
  dccn: [],
  "gia-tri": [...TABLE_MARKERS, "total:truoc-thue", "total:vat", "total:sau-thue"],
  "khoi-luong": TABLE_MARKERS,
};
/** Markers allowed on a role sheet besides the required ones. */
export const ROLE_OPTIONAL_MARKERS: Record<SheetRole, readonly MarkerKey[]> = {
  dntt: [],
  dccn: [],
  "gia-tri": ["bang-chu"],
  "khoi-luong": [],
};

export type PlaceholderKind = "text" | "number";
export interface PlaceholderSpec {
  key: string;
  /** "number" placeholders must be alone in their cell (written as a number or formula). */
  kind: PlaceholderKind;
  group: string;
  label: string;
  example: string;
}

const p = (key: string, group: string, label: string, example: string, kind: PlaceholderKind = "text"): PlaceholderSpec => ({
  key,
  kind,
  group,
  label,
  example,
});

const KY = "Kỳ và hợp đồng";
const A = "Bên A (khách hàng)";
const B = "Bên B (TP)";
const CN = "Đối chiếu công nợ";
const DN = "Đề nghị thanh toán";

export const PLACEHOLDERS: readonly PlaceholderSpec[] = [
  p("thang", KY, "Tháng của kỳ", "09/2026"),
  p("nam", KY, "Năm của kỳ", "2026"),
  p("ky.tu", KY, "Ngày đầu kỳ", "26/08/2026"),
  p("ky.den", KY, "Ngày cuối kỳ", "25/09/2026"),
  p("can_cu_hd", KY, "Câu “Căn cứ hợp đồng…”", "- Căn cứ Hợp đồng kinh tế số 0412/HĐKT2025/TP-VIETPANEL ký ngày 04/12/2025 giữa …"),
  p("du_an.ten", KY, "Tên dự án", "Senci"),
  p("du_an.dia_chi", KY, "Địa chỉ dự án", "KCN Phúc Điền, Hải Dương"),
  p("vat_phan_tram", KY, "Thuế suất GTGT (không có dấu %)", "8"),
  p("bang_chu", KY, "Tổng tiền sau thuế bằng chữ", "Tám trăm triệu, bảy trăm chín mươi sáu nghìn, chín trăm đồng./."),
  p("a.ten_in_hoa", A, "Tên in hoa", "CÔNG TY TNHH XÂY DỰNG VIỆT PANEL"),
  p("a.dia_chi", A, "Địa chỉ", "Thôn Đông Phù, Xã Tiên Du, Tỉnh Bắc Ninh, Việt Nam"),
  p("a.dien_thoai", A, "Điện thoại", "0222 6535 699"),
  p("a.so_tk", A, "Số tài khoản", "616139999"),
  p("a.ngan_hang", A, "Ngân hàng", "MB Ngân hàng quân đội"),
  p("a.mst", A, "Mã số thuế", "2300856941"),
  p("a.dai_dien", A, "Người đại diện", "Ông Lưu Đình Cải"),
  p("a.chuc_vu", A, "Chức vụ người đại diện", "Giám đốc"),
  p("b.ten_in_hoa", B, "Tên in hoa", "CÔNG TY CỔ PHẦN TẬP ĐOÀN THIẾT BỊ XÂY DỰNG TP"),
  p("b.ten_2_dong", B, "Tên in hoa, ngắt 2 dòng (tiêu đề ĐNTT, chỗ ký)", "CÔNG TY CỔ PHẦN TẬP ĐOÀN / THIẾT BỊ XÂY DỰNG TP"),
  p("b.ten_thuong", B, "Tên viết thường (trong câu)", "Công ty Cổ phần Tập đoàn Thiết bị xây dựng TP"),
  p("b.ten_thu_huong", B, "Tên đơn vị thụ hưởng", "Công ty Cổ phần Tập đoàn Thiết bị Xây dựng TP"),
  p("b.dia_chi", B, "Địa chỉ đầy đủ", "Thôn Trung, xã Ô Diên, Thành phố Hà Nội, Việt Nam"),
  p("b.dia_chi_ngan", B, "Địa chỉ ngắn", "Thôn Trung, Xã Ô Diên, Thành phố Hà Nội"),
  p("b.dien_thoai", B, "Điện thoại", "02433250143"),
  p("b.so_tk", B, "Số tài khoản", "8331100096008"),
  p("b.ngan_hang", B, "Ngân hàng", "Ngân hàng Thương mại cổ phần Quân đội - Chi nhánh Hoàng Quốc Việt"),
  p("b.mst", B, "Mã số thuế", "0105204346"),
  p("b.dai_dien", B, "Người đại diện", "Ông Hữu Minh Tiến"),
  p("b.chuc_vu", B, "Chức vụ người đại diện", "Phó Tổng giám đốc"),
  p("b.noi_lap", B, "Nơi lập biên bản", "Hà Nội"),
  p("cn.tam_ung", CN, "Bên A đã tạm ứng (số)", "1.679.373.734", "number"),
  p("cn.no_dau_ky", CN, "Nợ đầu kỳ (số)", "2.906.447.532", "number"),
  p("cn.phat_sinh", CN, "Phát sinh trong kỳ = tổng sau thuế (số)", "800.796.900", "number"),
  p("cn.thanh_toan", CN, "Bên A đã thanh toán trong kỳ (số)", "1.550.000.000", "number"),
  p("cn.no_cuoi_ky", CN, "Nợ cuối kỳ (số)", "2.157.244.432", "number"),
  p("cn.bang_chu", CN, "Nợ cuối kỳ bằng chữ", "Hai tỷ, một trăm năm mươi bảy triệu, …"),
  p("dntt.so_tien", DN, "Số tiền đề nghị = tổng sau thuế (số)", "800.796.900", "number"),
  p("dntt.bang_chu", DN, "Số tiền đề nghị bằng chữ", "Tám trăm triệu, bảy trăm chín mươi sáu nghìn, chín trăm đồng./."),
];

export const PLACEHOLDER_KEYS: ReadonlySet<string> = new Set(PLACEHOLDERS.map((x) => x.key));
export const NUMBER_PLACEHOLDERS: ReadonlySet<string> = new Set(
  PLACEHOLDERS.filter((x) => x.kind === "number").map((x) => x.key),
);

/** Placeholders a role sheet normally has; missing ones are a warning only. */
export const ROLE_EXPECTED_PLACEHOLDERS: Record<SheetRole, readonly string[]> = {
  dntt: ["dntt.so_tien"],
  dccn: ["cn.no_dau_ky", "cn.phat_sinh", "cn.thanh_toan", "cn.no_cuoi_ky"],
  "gia-tri": [],
  "khoi-luong": [],
};

export const PLACEHOLDER_RE = /\{\{([^{}]*)\}\}/g;

/** Keys of the {{placeholders}} of a text, in order. */
export function placeholderKeys(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
}

export function parseRole(value: unknown): SheetRole | typeof GUIDE_ROLE | "unknown" | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  if (!v.startsWith(ROLE_PREFIX)) return "unknown";
  const role = v.slice(ROLE_PREFIX.length);
  if (role === GUIDE_ROLE) return GUIDE_ROLE;
  return (SHEET_ROLES as readonly string[]).includes(role) ? (role as SheetRole) : "unknown";
}
