import { cleanText } from "./text";
import type { Ledger } from "./types";

/**
 * MISA names read from a month file, stored on billing_misa_month_files
 * (0035) and used to check the price table: warehouse names, item names and
 * units, and which (warehouse, item) pairs had stock or movements.
 *
 * Client-safe: works on a parsed Ledger, never on the xlsx itself.
 */
export interface MisaCatalog {
  /** Mã kho -> Tên kho. */
  warehouses: Record<string, string>;
  /** Mã VT -> name and unit ('' when the file has no "Số dư đầu kỳ" row for it). */
  items: Record<string, { name: string; dvt: string }>;
  /** "<kho>|<mã VT>" with a non-zero opening or any movement, sorted. */
  pairs: string[];
}

export const EMPTY_CATALOG: MisaCatalog = { warehouses: {}, items: {}, pairs: [] };

export function pairKey(kho: string, maVt: string): string {
  return `${kho}|${maVt}`;
}

/**
 * Catalog of one parsed MISA file. Units only appear on "Số dư đầu kỳ" rows
 * (the parser keeps no unit on movements), so an item that only moved this
 * month gets its name but an empty unit; mergeMisaCatalogs fills it from
 * other months.
 */
export function buildMisaCatalog(ledger: Pick<Ledger, "openings" | "movements" | "warehouses">): MisaCatalog {
  const warehouses: Record<string, string> = {};
  for (const [kho, name] of Object.entries(ledger.warehouses)) warehouses[kho] = cleanText(name);

  const items: MisaCatalog["items"] = {};
  const pairs = new Set<string>();
  const addItem = (ma: string, name: string, dvt: string) => {
    const cur = items[ma];
    if (!cur) items[ma] = { name: cleanText(name), dvt: cleanText(dvt) };
    else {
      if (!cur.name) cur.name = cleanText(name);
      if (!cur.dvt) cur.dvt = cleanText(dvt);
    }
  };
  for (const o of ledger.openings) {
    addItem(o.maHang, o.tenHang, o.dvt);
    if (o.qty !== 0) pairs.add(pairKey(o.kho, o.maHang));
  }
  for (const m of ledger.movements) {
    addItem(m.maHang, m.tenHang, "");
    pairs.add(pairKey(m.kho, m.maHang));
  }
  return { warehouses, items, pairs: [...pairs].sort() };
}

/**
 * One catalog from several months, given OLDEST FIRST: the newest month
 * wins for names; a unit missing in a newer month is kept from an older
 * one; pairs are the union.
 */
export function mergeMisaCatalogs(catalogs: MisaCatalog[]): MisaCatalog {
  const out: MisaCatalog = { warehouses: {}, items: {}, pairs: [] };
  const pairs = new Set<string>();
  for (const c of catalogs) {
    Object.assign(out.warehouses, c.warehouses);
    for (const [ma, it] of Object.entries(c.items)) {
      const prev = out.items[ma];
      out.items[ma] = { name: it.name || prev?.name || "", dvt: it.dvt || prev?.dvt || "" };
    }
    for (const p of c.pairs) pairs.add(p);
  }
  out.pairs = [...pairs].sort();
  return out;
}
