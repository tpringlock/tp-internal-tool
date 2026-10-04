import type { UserRole } from "@/lib/db/types";

/**
 * Product tours of the billing module ("Hướng dẫn sử dụng"): every step's
 * wording lives here so it can be reviewed in one place. Steps point at
 * elements by their `data-tour` attribute (never a CSS class), so a restyle
 * does not break a tour; `lib/billing/tours.test.ts` checks that every
 * target exists in the source. A step whose element is not on the page
 * (no data yet, hidden on mobile) is skipped at run time.
 *
 * Bump a tour's `version` whenever its content changes: users who already
 * saw it get it again once (the "seen" flag is keyed by user + tour + version).
 */

export type TourLocale = "vi" | "en";
export type TourText = Record<TourLocale, string>;

/**
 * Who sees a step: "view" = every billing role, "edit" = accountant + admin
 * (upload, calculate, save, confirm), "admin" = admin only (void, restore,
 * upload templates), "viewer" = "Chỉ xem" accounts only (the read-only
 * counterpart of an "edit" step).
 */
export type TourAccess = "view" | "edit" | "admin" | "viewer";

/** Billing pages that have a tour. */
export type TourPageId =
  | "calculate"
  | "uploads"
  | "prices"
  | "pricesImport"
  | "reports"
  | "alerts"
  | "templates"
  | "contractHstt"
  | "calculation";

export interface TourStep {
  /** Stable id, unique within the tour. */
  id: string;
  /** `data-tour` value of the element to highlight; absent = centred box. */
  target?: string;
  /** Default "view". */
  access?: TourAccess;
  title: TourText;
  body: TourText;
  /** Workflow tour only: the page this step runs on. */
  page?: TourPageId;
}

export interface Tour {
  id: string;
  version: number;
  title: TourText;
  /** Page tours: the page it belongs to (auto-starts there on first visit). */
  page?: TourPageId;
  steps: TourStep[];
}

interface PageMatch {
  path: RegExp;
  /** Required `?tab=` value; absent = the page without a tab parameter. */
  tab?: string;
  /** Fixed URL the workflow tour can navigate to; absent = dynamic (user opens it). */
  href?: string;
}

export const TOUR_PAGES: Record<TourPageId, PageMatch> = {
  calculate: { path: /^\/billing$/, href: "/billing" },
  uploads: { path: /^\/billing\/uploads$/, href: "/billing/uploads" },
  prices: { path: /^\/billing\/prices$/, href: "/billing/prices" },
  pricesImport: { path: /^\/billing\/prices\/import$/, href: "/billing/prices/import" },
  reports: { path: /^\/billing\/reports$/, href: "/billing/reports" },
  alerts: { path: /^\/billing\/alerts$/, href: "/billing/alerts" },
  templates: { path: /^\/billing\/templates$/, href: "/billing/templates" },
  contractHstt: { path: /^\/billing\/contracts\/[^/]+$/, tab: "hstt" },
  calculation: { path: /^\/billing\/calculations\/[^/]+$/ },
};

const tx = (vi: string, en: string): TourText => ({ vi, en });

// ---------------------------------------------------------------------------
// Page tours
// ---------------------------------------------------------------------------

export const PAGE_TOURS: Tour[] = [
  {
    id: "calculate",
    version: 1,
    page: "calculate",
    title: tx("Tính tiền thuê", "Rent calculation"),
    steps: [
      {
        id: "intro",
        title: tx("Tính tiền thuê", "Rent calculation"),
        body: tx(
          "Trang này tính tiền thuê thiết bị của một hợp đồng trong một kỳ, từ file MISA đã tải lên.",
          "This page calculates the equipment rent of one contract for one period, from the uploaded MISA files.",
        ),
      },
      {
        id: "read-only",
        target: "billing-read-only",
        title: tx("Tài khoản Chỉ xem", "View-only account"),
        body: tx(
          "Bạn xem được mọi bản tính và tải được file, nhưng không tính hay sửa được.",
          "You can open every calculation and download files, but cannot calculate or edit.",
        ),
      },
      {
        id: "upload",
        target: "billing-upload-card",
        access: "edit",
        title: tx("Tải file MISA", "Upload the MISA file"),
        body: tx(
          "Kéo thả file Sổ chi tiết vật tư hàng hóa của tháng vào đây. Mỗi file đúng trọn 1 tháng.",
          "Drop the month's inventory ledger (Sổ chi tiết vật tư hàng hóa) here. One file = one whole month.",
        ),
      },
      {
        id: "contract",
        target: "billing-calc-contract",
        access: "edit",
        title: tx("Chọn hợp đồng", "Pick the contract"),
        body: tx(
          "Gõ mã kho, tên khách hàng hoặc số hợp đồng để tìm.",
          "Type a warehouse code, customer name or contract number to search.",
        ),
      },
      {
        id: "period",
        target: "billing-calc-period",
        access: "edit",
        title: tx("Chọn kỳ", "Pick the period"),
        body: tx(
          "Chọn mẫu kỳ và tháng kết thúc. Chỉ khi khung báo xanh (đúng kỳ hợp đồng) thì bản tính mới xác nhận được. Khoảng ngày tùy chọn chỉ để xem.",
          "Pick a period template and its end month. Only a green notice (the contract's own period) can be confirmed later. A custom date range is for viewing only.",
        ),
      },
      {
        id: "files",
        target: "billing-calc-files",
        access: "edit",
        title: tx("File MISA được dùng", "MISA files used"),
        body: tx(
          "Hệ thống tự lấy bản đang dùng của từng tháng trong kỳ. Thiếu tháng nào thì chưa tính được: tải bổ sung ở trang File MISA.",
          "The active file of every month in the period is picked automatically. If a month is missing, upload it on the MISA files page first.",
        ),
      },
      {
        id: "submit",
        target: "billing-calc-submit",
        access: "edit",
        title: tx("Tính tiền", "Calculate"),
        body: tx(
          "Bấm để tạo bản tính nháp. Bản nháp chưa chốt số, phải xác nhận ở trang bản tính.",
          "Creates a draft. A draft is not final until it is confirmed on the calculation page.",
        ),
      },
      {
        id: "recent",
        target: "billing-recent",
        title: tx("Bản tính gần đây", "Recent calculations"),
        body: tx(
          "Mở một bản tính để xem chi tiết, nhập dữ liệu kỳ và tải HSTT.",
          "Open a calculation to see the details, enter period data and download the HSTT.",
        ),
      },
    ],
  },
  {
    id: "uploads",
    version: 1,
    page: "uploads",
    title: tx("File MISA theo tháng", "Monthly MISA files"),
    steps: [
      {
        id: "intro",
        title: tx("File MISA theo tháng", "Monthly MISA files"),
        body: tx(
          "Nơi lưu file Sổ chi tiết vật tư từ MISA, mỗi tháng một file. Tính tiền, báo cáo và cảnh báo đều đọc từ đây.",
          "Where the MISA inventory ledgers are kept, one file per month. Calculations, reports and alerts all read from here.",
        ),
      },
      {
        id: "dropzone",
        target: "uploads-dropzone",
        access: "edit",
        title: tx("Tải file tháng", "Upload a month"),
        body: tx(
          "Kéo thả một hoặc nhiều file .xlsx (Sổ chi tiết vật tư hàng hóa, chọn Kho: «Tất cả», kỳ trọn tháng). Tải lại một tháng đã có thì thành phiên bản mới, bản cũ ngừng dùng.",
          "Drop one or more .xlsx files (inventory ledger, Warehouse: «All», a whole month). Uploading a month again creates a new version and retires the old one.",
        ),
      },
      {
        id: "how-to",
        target: "uploads-how-to",
        access: "edit",
        title: tx("Cách xuất từ MISA", "How to export from MISA"),
        body: tx(
          "Mở mục này để xem cần xuất báo cáo nào: chọn Kho: «Tất cả», kỳ trọn tháng (không chọn 26 → 25).",
          "Open this to see which MISA report to export: Warehouse: «All», a whole month (never 26 → 25).",
        ),
      },
      {
        id: "months",
        target: "uploads-months",
        title: tx("Danh sách theo tháng", "Files by month"),
        body: tx(
          "Mỗi tháng liệt kê các phiên bản. Nhãn xanh là bản đang dùng khi tính. Dòng vàng là tháng còn thiếu file.",
          "Each month lists its versions. The green badge marks the one used for calculations. A yellow row is a missing month.",
        ),
      },
      {
        id: "used",
        target: "uploads-used",
        title: tx("Đã dùng ở đâu", "Where it was used"),
        body: tx(
          "Cột này cho biết file đã nằm trong bao nhiêu bản tính, bao nhiêu bản đã xác nhận.",
          "Shows how many calculations used the file, and how many of them are confirmed.",
        ),
      },
      {
        id: "restore",
        target: "uploads-restore",
        access: "admin",
        title: tx("Dùng lại bản cũ", "Restore an old version"),
        body: tx(
          "Admin có thể đặt lại một phiên bản cũ làm bản đang dùng.",
          "Admins can make an older version the active one again.",
        ),
      },
    ],
  },
  {
    id: "prices",
    version: 1,
    page: "prices",
    title: tx("Bảng đơn giá", "Price table"),
    steps: [
      {
        id: "intro",
        title: tx("Bảng đơn giá", "Price table"),
        body: tx(
          "Mỗi dòng là một mã vật tư trong một kho (hợp đồng) và đơn giá thuê. Đơn giá 0 nghĩa là không tính tiền. Mã có phát sinh mà chưa có dòng giá sẽ bị báo thiếu giá.",
          "Each row is one item code in one warehouse (contract) with its rent price. A price of 0 means not billed. A code with movements but no price row is reported as missing a price.",
        ),
      },
      {
        id: "filters",
        target: "prices-filters",
        title: tx("Lọc", "Filters"),
        body: tx(
          "Tìm theo mã, tên; lọc theo hợp đồng; hoặc chỉ hiện các dòng lệch với MISA.",
          "Search by code or name, filter by contract, or show only rows that differ from MISA.",
        ),
      },
      {
        id: "table",
        target: "prices-table",
        title: tx("Cảnh báo lệch MISA", "Differences from MISA"),
        body: tx(
          "Dòng chữ vàng báo tên, ĐVT hoặc mã không khớp danh mục MISA. Cột “Tên in HSTT” là tên sẽ in ra hồ sơ. Các mã cùng Tên in HSTT gộp thành 1 dòng trên HSTT nên phải cùng đơn giá.",
          "Yellow notes flag a name, unit or code that differs from the MISA catalog. The “printed name” column is what the HSTT shows. Codes with the same printed name become one HSTT line, so they must have the same price.",
        ),
      },
      {
        id: "export",
        target: "prices-export",
        title: tx("Xuất Excel", "Export to Excel"),
        body: tx(
          "Tải đúng các dòng đang lọc. Có thể sửa trên file này rồi nhập lại.",
          "Downloads exactly the filtered rows. You can edit this file and import it back.",
        ),
      },
      {
        id: "import",
        target: "prices-import",
        access: "edit",
        title: tx("Nhập từ Excel", "Import from Excel"),
        body: tx(
          "Sửa giá hàng loạt bằng file Excel. Lấy file mẫu ở nút “Tải mẫu” bên cạnh.",
          "Change many prices at once with an Excel file. Get the template from the button next to it.",
        ),
      },
      {
        id: "history",
        target: "prices-imports",
        title: tx("Lịch sử nhập", "Import history"),
        body: tx(
          "Mỗi lần nhập được lưu kèm file gốc và số dòng thêm, sửa, xóa.",
          "Every import is kept with its original file and the number of rows added, changed and removed.",
        ),
      },
    ],
  },
  {
    id: "prices-import",
    version: 1,
    page: "pricesImport",
    title: tx("Nhập đơn giá từ Excel", "Import prices from Excel"),
    steps: [
      {
        id: "intro",
        access: "edit",
        title: tx("Nhập đơn giá từ Excel", "Import prices from Excel"),
        body: tx(
          "Cột không có trong file thì giữ nguyên; ô để trống thì xóa giá trị đó.",
          "A column missing from the file is left as is; an empty cell clears that value.",
        ),
      },
      {
        id: "file",
        target: "price-import-file",
        access: "edit",
        title: tx("Chọn file", "Choose the file"),
        body: tx(
          "Dùng file mẫu hoặc file vừa xuất từ bảng đơn giá.",
          "Use the template or a file exported from the price table.",
        ),
      },
      {
        id: "mode",
        target: "price-import-mode",
        access: "edit",
        title: tx("Chế độ nhập", "Import mode"),
        body: tx(
          "“Thêm/sửa” không xóa dòng nào. “Thay toàn bộ” xóa thêm các dòng của kho có trong file mà file không có.",
          "“Add/update” never removes rows. “Replace” also removes rows of the warehouses in the file that the file does not list.",
        ),
      },
      {
        // No target: the preview only appears after a file is chosen.
        id: "preview",
        access: "edit",
        title: tx("Xem trước rồi mới lưu", "Preview before saving"),
        body: tx(
          "Kiểm tra số dòng thêm, sửa, xóa và các lỗi. Còn lỗi thì chưa nhập được.",
          "Check the rows added, changed and removed, and any errors. Errors block the import.",
        ),
      },
    ],
  },
  {
    id: "reports",
    version: 1,
    page: "reports",
    title: tx("Báo cáo tiền thuê", "Rent report"),
    steps: [
      {
        id: "intro",
        title: tx("Báo cáo tiền thuê", "Rent report"),
        body: tx(
          "Tính nhanh tiền thuê nhiều dự án cùng lúc. Chỉ để xem, không tạo bản tính.",
          "Quickly calculates the rent of many projects at once. View only: no calculation is saved.",
        ),
      },
      {
        id: "projects",
        target: "reports-projects",
        title: tx("Chọn dự án", "Pick projects"),
        body: tx(
          "Tìm và tích chọn dự án, hoặc lọc theo trạng thái rồi chọn tất cả.",
          "Search and tick projects, or filter by status and select all.",
        ),
      },
      {
        id: "period",
        target: "reports-period",
        title: tx("Chọn kỳ", "Pick the period"),
        body: tx(
          "Theo mẫu kỳ và tháng kết thúc, hoặc một khoảng ngày bất kỳ.",
          "A period template and end month, or any date range.",
        ),
      },
      {
        id: "run",
        target: "reports-run",
        title: tx("Xem báo cáo", "Run the report"),
        body: tx(
          "Nhiều dự án có thể mất đến 1 phút.",
          "With many projects this can take up to a minute.",
        ),
      },
      {
        id: "result",
        target: "reports-result",
        title: tx("Kết quả", "Result"),
        body: tx(
          "Tổng tiền, xem theo mã vật tư hoặc theo dự án, và xuất Excel.",
          "The total, by item code or by project, and Excel export.",
        ),
      },
    ],
  },
  {
    id: "alerts",
    version: 1,
    page: "alerts",
    title: tx("Trung tâm cảnh báo", "Alert center"),
    steps: [
      {
        id: "intro",
        title: tx("Trung tâm cảnh báo", "Alert center"),
        body: tx(
          "Rà toàn bộ kho trong kỳ để tìm sai sót trước khi tính tiền: tồn âm, mã chưa có giá, kho chưa có hợp đồng, lệch MISA.",
          "Checks every warehouse in the period before billing: negative stock, codes without a price, warehouses without a contract, MISA differences.",
        ),
      },
      {
        id: "period",
        target: "alerts-period",
        title: tx("Chọn kỳ", "Pick the period"),
        body: tx(
          "Đổi kỳ rồi bấm xem. Kỳ phải đủ file MISA các tháng.",
          "Change the period and apply. Every month of it needs a MISA file.",
        ),
      },
      {
        id: "summary",
        target: "alerts-summary",
        title: tx("Số cảnh báo theo loại", "Count by type"),
        body: tx(
          "Bấm vào một ô để chỉ xem loại đó.",
          "Click a tile to show only that type.",
        ),
      },
      {
        id: "filters",
        target: "alerts-filters",
        title: tx("Tìm và xuất Excel", "Search and export"),
        body: tx(
          "Tìm theo kho hoặc mã, bật/tắt kho công ty, và xuất danh sách ra Excel.",
          "Search by warehouse or code, show or hide company warehouses, and export the list to Excel.",
        ),
      },
      {
        id: "rules",
        target: "alerts-rules",
        title: tx("Quy tắc", "Rules"),
        body: tx(
          "Giải thích từng loại cảnh báo. Kho công ty (kho tổng, kho đi thuê) được tách thành nhóm riêng.",
          "Explains each alert type. Company warehouses (main warehouse, rented-in stock) are grouped separately.",
        ),
      },
    ],
  },
  {
    id: "templates",
    version: 1,
    page: "templates",
    title: tx("Mẫu HSTT", "HSTT templates"),
    steps: [
      {
        id: "intro",
        title: tx("Mẫu HSTT", "HSTT templates"),
        body: tx(
          "Mẫu Excel của hồ sơ thanh toán. Hợp đồng chưa gán mẫu riêng thì dùng mẫu chuẩn TP.",
          "Excel templates for the payment file (HSTT). Contracts without their own template use the TP standard one.",
        ),
      },
      {
        id: "standard",
        target: "templates-standard",
        title: tx("Tải mẫu chuẩn", "Download the standard template"),
        body: tx(
          "Muốn làm mẫu riêng cho khách thì bắt đầu từ file này.",
          "Start from this file to build a customer's own template.",
        ),
      },
      {
        id: "how-to",
        target: "templates-how-to",
        title: tx("Cách tự làm mẫu", "How to build a template"),
        body: tx(
          "Giữ ô Z1 của từng sheet. Logo, con dấu đặt trong ô thì được; không đặt ảnh trong Header/Footer, không dùng biểu đồ hay hình vẽ.",
          "Keep cell Z1 on every sheet. A logo or stamp placed in the cells is fine; no pictures in the Header/Footer, no charts or drawings.",
        ),
      },
      {
        id: "upload",
        target: "templates-upload",
        access: "admin",
        title: tx("Tải mẫu lên", "Upload a template"),
        body: tx(
          "Hệ thống kiểm tra file trước khi lưu. Mẫu có lỗi không lưu được; cảnh báo vẫn lưu được.",
          "The file is checked before saving. A template with errors is refused; warnings are allowed.",
        ),
      },
      {
        id: "list",
        target: "templates-list",
        title: tx("Danh sách mẫu", "Templates"),
        body: tx(
          "Mỗi mẫu có phiên bản, hợp đồng đang dùng và số lần đã xuất. Gán mẫu cho hợp đồng ở tab HSTT của hợp đồng.",
          "Each template shows its versions, the contracts using it and how often it was exported. Assign it in the contract's HSTT tab.",
        ),
      },
    ],
  },
  {
    id: "contract-hstt",
    version: 1,
    page: "contractHstt",
    title: tx("Thông tin HSTT của hợp đồng", "Contract HSTT details"),
    steps: [
      {
        id: "intro",
        title: tx("Thông tin HSTT của hợp đồng", "Contract HSTT details"),
        body: tx(
          "Thông tin cố định, nhập một lần và dùng cho mọi kỳ của hợp đồng này.",
          "Fixed details, entered once and used for every period of this contract.",
        ),
      },
      {
        id: "parties",
        target: "hstt-contract-form",
        title: tx("Bên A và hợp đồng", "Customer and contract"),
        body: tx(
          "Chọn Bên A, loại và ngày ký hợp đồng, dự án, VAT. Câu “Căn cứ” để trống thì tự sinh.",
          "Pick the customer, contract type and date, project and VAT. Leave the “Căn cứ” sentence empty to generate it.",
        ),
      },
      {
        id: "opening-debt",
        target: "hstt-opening-debt",
        title: tx("Nợ đầu kỳ", "Opening balance"),
        body: tx(
          "Nhập nợ cuối kỳ của tháng cuối cùng làm tay. Từ tháng sau, hệ thống tự nối nợ từ các kỳ đã xác nhận.",
          "Enter the closing balance of the last month done by hand. From the next month on, balances carry over from confirmed periods.",
        ),
      },
      {
        id: "template",
        target: "hstt-template",
        title: tx("Mẫu HSTT", "HSTT template"),
        body: tx(
          "Chọn mẫu riêng của khách. Để trống thì dùng mẫu chuẩn TP.",
          "Pick the customer's own template. Leave empty for the TP standard one.",
        ),
      },
      {
        id: "transport",
        target: "hstt-transport",
        title: tx("Giá vận chuyển", "Transport prices"),
        body: tx(
          "Các loại xe và đơn giá mỗi chuyến. Số chuyến nhập theo từng kỳ ở trang bản tính.",
          "Vehicle types and the price per trip. The trips are entered per period on the calculation page.",
        ),
      },
      {
        id: "advances",
        target: "hstt-advances",
        title: tx("Tạm ứng", "Advances"),
        body: tx(
          "Các khoản Bên A đã tạm ứng. Chỉ hiển thị ở dòng đầu Biên bản đối chiếu công nợ, không trừ vào nợ.",
          "Advances paid by the customer. Shown only on the first line of the debt reconciliation sheet; not deducted from the balance.",
        ),
      },
    ],
  },
  {
    id: "calculation",
    version: 1,
    page: "calculation",
    title: tx("Bản tính", "Calculation"),
    steps: [
      {
        id: "intro",
        title: tx("Bản tính", "Calculation"),
        body: tx(
          "Kết quả tính tiền thuê của một hợp đồng trong một kỳ. Nháp → Đã xác nhận; chỉ bản đã xác nhận mới được dùng làm HSTT chính thức.",
          "The rent of one contract for one period. Draft → Confirmed; only a confirmed calculation is final.",
        ),
      },
      {
        id: "status",
        target: "calc-status",
        title: tx("Trạng thái", "Status"),
        body: tx(
          "Nháp, Đã xác nhận hoặc Đã hủy.",
          "Draft, Confirmed or Voided.",
        ),
      },
      {
        id: "period-inputs",
        target: "calc-period-inputs",
        access: "edit",
        title: tx("Dữ liệu kỳ", "Period data"),
        body: tx(
          "Nhập vận chuyển, giảm trừ, số đã thanh toán và nợ đầu kỳ (nếu cần ghi đè), rồi bấm Lưu. Kỳ đã xác nhận thì bị khóa.",
          "Enter transport, deductions, the amount paid and, if needed, an opening balance override, then save. A confirmed period is locked.",
        ),
      },
      {
        id: "period-inputs-view",
        target: "calc-period-inputs",
        access: "viewer",
        title: tx("Dữ liệu kỳ", "Period data"),
        body: tx(
          "Dữ liệu kỳ do kế toán nhập; bạn chỉ xem.",
          "Period data is entered by the accountants; you can only view it.",
        ),
      },
      {
        id: "totals",
        target: "calc-totals",
        title: tx("Tổng HSTT", "HSTT totals"),
        body: tx(
          "Tiền thiết bị, vận chuyển, VAT, giảm trừ và nợ cuối kỳ. Đối chiếu số ở đây trước khi xác nhận.",
          "Equipment, transport, VAT, deductions and closing balance. Check these figures before confirming.",
        ),
      },
      {
        id: "confirm",
        target: "calc-confirm",
        access: "edit",
        title: tx("Xác nhận", "Confirm"),
        body: tx(
          "Chốt số của kỳ. Sau khi xác nhận, bản tính và dữ liệu kỳ bị khóa; muốn sửa phải nhờ admin hủy xác nhận.",
          "Makes the figures final. The calculation and period data are then locked; only an admin can void it.",
        ),
      },
      {
        id: "hstt",
        target: "calc-hstt",
        title: tx("Tải HSTT", "Download the HSTT"),
        body: tx(
          "File Excel 4 biểu theo mẫu đã gán cho hợp đồng. Chỉ tải được khi bản tính đã xác nhận. Các kỳ làm tay (đến 08/2026) không tải từ web. Nếu thiếu thông tin, khung vàng chỉ chỗ cần bổ sung.",
          "The 4-sheet Excel file, using the contract's template. Only available once the calculation is confirmed. Periods done by hand (up to 08/2026) are not downloaded from the web. If something is missing, a yellow box says what.",
        ),
      },
      {
        id: "void",
        target: "calc-void",
        access: "admin",
        title: tx("Hủy xác nhận", "Void"),
        body: tx(
          "Chỉ admin. Dùng khi cần sửa dữ liệu kỳ đã chốt; sau đó tính và xác nhận lại.",
          "Admins only. Use it to correct a confirmed period, then calculate and confirm again.",
        ),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Workflow tour: the monthly HSTT, across pages
// ---------------------------------------------------------------------------

export const WORKFLOW_TOUR: Tour = {
  id: "workflow",
  version: 1,
  title: tx("Quy trình làm HSTT hằng tháng", "Monthly HSTT workflow"),
  steps: [
    {
      id: "intro",
      page: "uploads",
      title: tx("Quy trình làm HSTT hằng tháng", "Monthly HSTT workflow"),
      body: tx(
        "5 bước: tải file tháng → tính kỳ → nhập dữ liệu kỳ → xác nhận → tải HSTT. Hướng dẫn sẽ chuyển trang theo từng bước.",
        "5 steps: upload the month → calculate the period → enter period data → confirm → download the HSTT. The guide moves between pages with you.",
      ),
    },
    {
      id: "upload",
      page: "uploads",
      target: "uploads-dropzone",
      access: "edit",
      title: tx("1. Tải file MISA của tháng", "1. Upload the month's MISA file"),
      body: tx(
        "Xuất Sổ chi tiết vật tư hàng hóa từ MISA (chọn Kho: «Tất cả», kỳ trọn tháng) rồi kéo thả vào đây.",
        "Export the inventory ledger from MISA (Warehouse: «All», a whole month) and drop it here.",
      ),
    },
    {
      id: "months",
      page: "uploads",
      target: "uploads-months",
      title: tx("Kiểm tra đủ tháng", "Check every month is there"),
      body: tx(
        "Các tháng của kỳ phải có bản đang dùng (nhãn xanh). Dòng vàng là tháng còn thiếu.",
        "Every month of the period needs an active file (green badge). A yellow row is missing.",
      ),
    },
    {
      id: "alerts",
      page: "alerts",
      target: "alerts-summary",
      title: tx("Rà cảnh báo", "Review the alerts"),
      body: tx(
        "Xem nhóm Âm mới trong kỳ và Thiếu đơn giá của kỳ; xử lý trên MISA hoặc bảng giá trước khi tính.",
        "Look at the “Negative in period” and “Missing price” groups of the period; fix them in MISA or the price table before calculating.",
      ),
    },
    {
      id: "calc-contract",
      page: "calculate",
      target: "billing-calc-contract",
      access: "edit",
      title: tx("2. Chọn hợp đồng", "2. Pick the contract"),
      body: tx(
        "Tìm theo mã kho, tên khách hoặc số hợp đồng.",
        "Search by warehouse code, customer or contract number.",
      ),
    },
    {
      id: "calc-period",
      page: "calculate",
      target: "billing-calc-period",
      access: "edit",
      title: tx("Chọn kỳ", "Pick the period"),
      body: tx(
        "Dùng mẫu kỳ của hợp đồng. Khung phải báo xanh “đúng kỳ hợp đồng” thì mới xác nhận được.",
        "Use the contract's period template. The notice must be green (“contract period”) to be confirmable.",
      ),
    },
    {
      id: "calc-submit",
      page: "calculate",
      target: "billing-calc-submit",
      access: "edit",
      title: tx("Tính tiền", "Calculate"),
      body: tx(
        "Bấm Tính tiền. Trang bản tính mở ra và hướng dẫn chạy tiếp ở đó.",
        "Click Calculate. The calculation page opens and the guide continues there.",
      ),
    },
    {
      id: "open-recent",
      page: "calculate",
      target: "billing-recent",
      title: tx("Hoặc mở bản tính có sẵn", "Or open an existing one"),
      body: tx(
        "Bấm vào một bản tính trong danh sách; hướng dẫn chạy tiếp ở trang bản tính.",
        "Click a calculation in the list; the guide continues on its page.",
      ),
    },
    {
      id: "period-inputs",
      page: "calculation",
      target: "calc-period-inputs",
      access: "edit",
      title: tx("3. Nhập dữ liệu kỳ", "3. Enter the period data"),
      body: tx(
        "Số chuyến vận chuyển, giảm trừ, số đã thanh toán; kiểm tra nợ đầu kỳ. Bấm Lưu.",
        "Transport trips, deductions, amount paid; check the opening balance. Save.",
      ),
    },
    {
      id: "totals",
      page: "calculation",
      target: "calc-totals",
      title: tx("Đối chiếu tổng", "Check the totals"),
      body: tx(
        "So tổng trước thuế, VAT, sau thuế với số dự kiến trước khi chốt.",
        "Compare the totals before and after VAT with what you expect before finalising.",
      ),
    },
    {
      id: "confirm",
      page: "calculation",
      target: "calc-confirm",
      access: "edit",
      title: tx("4. Xác nhận", "4. Confirm"),
      body: tx(
        "Chốt số của kỳ. Sau đó không sửa được nữa, trừ khi admin hủy xác nhận.",
        "Makes the period final. It can no longer be edited unless an admin voids it.",
      ),
    },
    {
      id: "download",
      page: "calculation",
      target: "calc-hstt",
      title: tx("5. Tải HSTT", "5. Download the HSTT"),
      body: tx(
        "Tải file Excel 4 biểu để gửi khách. Khung vàng nghĩa là còn thiếu thông tin ở tab HSTT của hợp đồng.",
        "Download the 4-sheet Excel file for the customer. A yellow box means details are missing in the contract's HSTT tab.",
      ),
    },
  ],
};

export const ALL_TOURS: Tour[] = [...PAGE_TOURS, WORKFLOW_TOUR];

// ---------------------------------------------------------------------------
// Helpers (pure; the runner in components/billing-tour.tsx uses them)
// ---------------------------------------------------------------------------

const ACCESS_RANK: Record<Exclude<TourAccess, "viewer">, number> = { view: 0, edit: 1, admin: 2 };

/** The highest step access a role has; null = no billing access at all. */
export function tourAccessOf(role: UserRole): Exclude<TourAccess, "viewer"> | null {
  if (role === "admin") return "admin";
  if (role === "accountant") return "edit";
  if (role === "billing_viewer") return "view";
  return null;
}

/** The steps a role may see, in order. */
export function stepsForRole(steps: TourStep[], role: UserRole): TourStep[] {
  const access = tourAccessOf(role);
  if (!access) return [];
  return steps.filter((s) => {
    const need = s.access ?? "view";
    if (need === "viewer") return access === "view";
    return ACCESS_RANK[need] <= ACCESS_RANK[access];
  });
}

/** Whether a URL (pathname + `?tab=` value) is the given page. */
export function isTourPage(page: TourPageId, pathname: string, tab: string | null): boolean {
  const m = TOUR_PAGES[page];
  return m.path.test(pathname) && (m.tab ?? null) === (tab || null);
}

/** The tour page a URL is, if any. */
export function tourPageOf(pathname: string, tab: string | null): TourPageId | null {
  return (Object.keys(TOUR_PAGES) as TourPageId[]).find((p) => isTourPage(p, pathname, tab)) ?? null;
}

/** The page tour of a URL, if any. */
export function pageTourFor(pathname: string, tab: string | null): Tour | null {
  return PAGE_TOURS.find((t) => t.page && isTourPage(t.page, pathname, tab)) ?? null;
}

/**
 * Where the workflow tour continues on `page`: from the saved step if it is
 * on this page, else from the first later step that is (the user may skip
 * ahead, e.g. click "Tính tiền" before the last step of the form). Returns
 * the inclusive index range of the consecutive steps on this page, or null
 * when the next steps are elsewhere.
 */
export function workflowSegment(
  steps: TourStep[],
  savedStepId: string | null,
  page: TourPageId | null,
): { start: number; end: number } | null {
  if (!page) return null;
  const from = Math.max(0, savedStepId ? steps.findIndex((s) => s.id === savedStepId) : 0);
  const start = steps.findIndex((s, i) => i >= from && s.page === page);
  if (start < 0) return null;
  let end = start;
  while (end + 1 < steps.length && steps[end + 1].page === page) end++;
  return { start, end };
}

/** localStorage key of the "seen" flag: per user, tour and tour version. */
export function tourSeenKey(userId: string, tour: Pick<Tour, "id" | "version">): string {
  return `tp.billing-tour.${userId}.${tour.id}.v${tour.version}`;
}
