/**
 * Catalog of MISA ACT Open API endpoints for the admin test playground.
 *
 * This module holds NO secrets (the `app_id` lives server-side in `lib/env.ts`)
 * so it is safe to import into the client playground to populate the dropdown.
 *
 * Business calls hit `{base}/apir/sync/actopen/<name>` with the
 * `X-MISA-AccessToken` header; the initial connect uses a different path and is
 * handled directly by the `misaConnect` server action.
 *
 * The `bodyTemplate` values are best-effort starting points derived from the
 * MISA docs (https://actdocs.misa.vn/g2/graph/ACTOpenAPIHelp/). Field names may
 * differ per company/tenant — the playground lets you edit the JSON freely, so
 * treat these as convenient defaults rather than a strict contract.
 */

export type MisaEndpoint = {
  /** Short key, e.g. "get_dictionary" — also used as the <option> value. */
  value: string;
  /** Full request path appended to the base URL. */
  path: string;
  method: "POST" | "DELETE";
  /** Human-readable description shown next to the selector. */
  label: string;
  /** Editable JSON body pre-filled when the endpoint is selected. */
  bodyTemplate: string;
};

const SYNC = "/apir/sync/actopen";

export const MISA_ENDPOINTS: MisaEndpoint[] = [
  {
    value: "get_company_info",
    path: `${SYNC}/get_company_info`,
    method: "POST",
    label: "Lấy thông tin công ty (organization info)",
    bodyTemplate: `{
  "branch_id": null
}`,
  },
  {
    value: "get_dictionary",
    path: `${SYNC}/get_dictionary`,
    method: "POST",
    // data_type: 1=đối tượng (KH/NCC/NV) · 2=nhóm đối tượng · 3=vật tư hàng hóa ·
    // 4=nhóm VTHH · 5=kho · 6=ĐVT · 7=TK ngân hàng · 8=ngân hàng · 9=khoản mục CP ·
    // 10=khoản mục ngân sách · 12=đối tượng THCP. app_id được chèn ở server.
    label: "Lấy danh mục / master data (phân trang)",
    bodyTemplate: `{
  "data_type": 1,
  "branch_id": null,
  "skip": 0,
  "take": 100,
  "last_sync_time": null
}`,
  },
  {
    value: "get_dictionary_delete",
    path: `${SYNC}/get_dictionary_delete`,
    method: "POST",
    label: "Lấy danh mục đã xoá",
    bodyTemplate: `{
  "data_type": 1,
  "branch_id": null,
  "skip": 0,
  "take": 100,
  "last_sync_time": null
}`,
  },
  {
    value: "get_option",
    path: `${SYNC}/get_option`,
    method: "POST",
    label: "Lấy tuỳ chọn cấu hình hệ thống",
    bodyTemplate: "{}",
  },
  {
    value: "set_option",
    path: `${SYNC}/set_option`,
    method: "POST",
    label: "Thiết lập tham số kết nối",
    bodyTemplate: "{}",
  },
  {
    value: "get_list_acc_obj_debt",
    path: `${SYNC}/get_list_acc_obj_debt`,
    method: "POST",
    label: "Công nợ phải thu / phải trả",
    bodyTemplate: `{
  "skip": 0,
  "take": 100
}`,
  },
  {
    value: "get_list_inventory_balance",
    path: `${SYNC}/get_list_inventory_balance`,
    method: "POST",
    label: "Tồn kho",
    bodyTemplate: `{
  "skip": 0,
  "take": 100
}`,
  },
  {
    value: "get_list_inventory_balance_delete",
    path: `${SYNC}/get_list_inventory_balance_delete`,
    method: "POST",
    label: "Tồn kho đã xoá",
    bodyTemplate: `{
  "skip": 0,
  "take": 100
}`,
  },
  {
    value: "request_data",
    path: `${SYNC}/request_data`,
    method: "POST",
    label: "Yêu cầu kéo dữ liệu từ hệ thống kế toán",
    bodyTemplate: "{}",
  },
  {
    value: "get_call_back_detail_error",
    path: `${SYNC}/get_call_back_detail_error`,
    method: "POST",
    label: "Kiểm tra kết quả xử lý bất đồng bộ",
    bodyTemplate: "{}",
  },
  {
    value: "save",
    path: `${SYNC}/save`,
    method: "POST",
    label: "Gửi chứng từ (tối đa 100/lần)",
    bodyTemplate: "[]",
  },
  {
    value: "save_dictionary",
    path: `${SYNC}/save_dictionary`,
    method: "POST",
    label: "Tạo master data (tối đa 200/lần)",
    bodyTemplate: "[]",
  },
  {
    value: "delete",
    path: `${SYNC}/delete`,
    method: "DELETE",
    label: "Xoá chứng từ",
    bodyTemplate: "{}",
  },
];

export function findMisaEndpoint(value: string): MisaEndpoint | undefined {
  return MISA_ENDPOINTS.find((e) => e.value === value);
}
