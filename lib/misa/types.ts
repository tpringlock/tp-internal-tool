/**
 * TypeScript shapes for MISA ACT Open API responses.
 *
 * The connect + envelope shapes below are stable (already exercised by the
 * admin playground). The per-record shapes (dictionary objects, inventory
 * balances) are PROVISIONAL: MISA's field set varies per tenant, so they are
 * kept permissive (`MisaRawRecord`) with documented candidate keys. Capture
 * real responses with `scripts/misa-test.ts` and refine as needed; the
 * normalizers (`lib/misa/normalize.ts`) tolerate key variants.
 */

/** A single MISA record with an open field set (varies per tenant). */
export type MisaRawRecord = Record<string, unknown>;

/**
 * MISA wraps every response in `{ Success, Data }`, where `Data` is usually a
 * *stringified* JSON value (object for connect, array for list endpoints).
 */
export interface MisaEnvelope<T = unknown> {
  Success?: boolean;
  success?: boolean;
  Data?: T | string;
  ErrorCode?: number | string;
  ErrorMessage?: string;
  [key: string]: unknown;
}

/** Payload returned by `/api/oauth/actopen/connect` (inside `Data`). */
export interface MisaConnectPayload {
  access_token?: string;
  AccessToken?: string;
  tenant_code?: string;
  TenantCode?: string;
  expired_time?: string;
  ExpiredTime?: string;
  app_name?: string;
  AppName?: string;
  [key: string]: unknown;
}

/** Normalized result of a successful connect. */
export interface MisaConnection {
  accessToken: string;
  tenantCode: string | null;
  appName: string | null;
  /** ISO-8601 UTC instant when the token expires. */
  expiredAt: string;
}

/**
 * `get_dictionary` data_type values (see lib/misa/endpoints.ts). Phase 1 syncs
 * customers/products/stocks; the rest are here for future reference.
 */
export const MISA_DATA_TYPE = {
  /** Đối tượng: khách hàng / nhà cung cấp / nhân viên. */
  ACCOUNTING_OBJECT: 1,
  /** Vật tư hàng hoá. */
  INVENTORY_ITEM: 3,
  /** Kho. */
  STOCK: 5,
} as const;

export type MisaDataType = (typeof MISA_DATA_TYPE)[keyof typeof MISA_DATA_TYPE];
