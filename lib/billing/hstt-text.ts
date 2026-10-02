/**
 * HSTT texts shared by the export and the pages (client-safe, no exceljs).
 */
import type { IsoDate } from "./types";

export interface CanCuInput {
  contract: { type: string; no: string; date: IsoDate | null; canCuOverride: string | null };
  customer: { ten_thuong: string };
  company: { ten_thuong: string };
}

export const dmy = (iso: IsoDate) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const monthLabel = (month: string) => `${month.slice(5, 7)}/${month.slice(0, 4)}`;

/** "- Căn cứ Hợp đồng kinh tế số ... ký ngày dd/mm/yyyy giữa {A} và {B} về việc cho thuê thiết bị xây dựng." */
export function canCuText(input: CanCuInput): string {
  const c = input.contract;
  if (c.canCuOverride) return c.canCuOverride;
  const date = c.date ? dmy(c.date) : "……";
  return (
    `- Căn cứ ${c.type} số ${c.no} ký ngày ${date} giữa ${input.customer.ten_thuong} và ` +
    `${input.company.ten_thuong} về việc cho thuê thiết bị xây dựng.`
  );
}

/** "HSTT T08.2026 - Việt Panel - TP.xlsx" */
export function hsttFileName(month: string, customerShortName: string): string {
  return `HSTT T${month.slice(5, 7)}.${month.slice(0, 4)} - ${customerShortName.trim()} - TP.xlsx`;
}

