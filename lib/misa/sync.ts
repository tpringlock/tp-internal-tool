import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/db/types";
import { paginate } from "@/lib/misa/client";
import { MISA_DATA_TYPE } from "@/lib/misa/types";
import type { MisaRawRecord } from "@/lib/misa/types";
import {
  normalizeCustomer,
  normalizeProduct,
  normalizeStock,
  normalizeInventoryBalance,
  parseDeletedMisaId,
} from "@/lib/misa/normalize";

/**
 * Per-data-type sync from MISA into our normalized tables. All writes use the
 * service-role client (RLS bypass) — callers MUST enforce access first.
 *
 * Idempotent: master data is upserted by misa_id (re-running never duplicates);
 * pulls are incremental via the misa_sync_state watermark; records deleted in
 * MISA are soft-deleted (is_deleted = true). Every run writes a misa_sync_log
 * row. To keep Vercel function time bounded, callers can sync one type at a
 * time — each type is independent and resumes from its own watermark.
 */

type Admin = SupabaseClient<Database>;

export type MisaSyncType =
  | "customers"
  | "products"
  | "stocks"
  | "inventory_balance";

export const MISA_SYNC_TYPES: MisaSyncType[] = [
  "customers",
  "products",
  "stocks",
  "inventory_balance",
];

export type MisaSyncTrigger = "manual" | "cron";

export interface SyncResult {
  type: MisaSyncType;
  status: "success" | "error";
  upserted: number;
  deleted: number;
  error?: string;
}

interface Counts {
  upserted: number;
  deleted: number;
}

/** Minimal shape of a Supabase write response we care about. */
type WriteResponse<Row = unknown> = {
  data: Row[] | null;
  error: { message: string } | null;
};

/** Max rows per Supabase write; master data is small but stay well-bounded. */
const CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/** Upsert rows in bounded batches; the concrete table lives in `write`. */
async function runUpsert<Row>(
  rows: Row[],
  label: string,
  write: (batch: Row[]) => PromiseLike<WriteResponse>,
): Promise<number> {
  let count = 0;
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const { error } = await write(batch);
    if (error) throw new Error(`upsert ${label}: ${error.message}`);
    count += batch.length;
  }
  return count;
}

/** Soft-delete by misa_id in bounded batches; counts rows actually updated. */
async function runSoftDelete(
  ids: string[],
  label: string,
  write: (batch: string[]) => PromiseLike<WriteResponse<{ misa_id: string }>>,
): Promise<number> {
  let count = 0;
  for (const batch of chunk(ids, CHUNK_SIZE)) {
    const { data, error } = await write(batch);
    if (error) throw new Error(`soft-delete ${label}: ${error.message}`);
    count += data?.length ?? 0;
  }
  return count;
}

/** Deleted misa_ids reported by get_dictionary_delete since the watermark. */
async function fetchDeletedIds(
  dataType: number,
  prevDeletedTime: string | null,
): Promise<string[]> {
  const records = await paginate<MisaRawRecord>("get_dictionary_delete", {
    data_type: dataType,
    last_sync_time: prevDeletedTime,
  });
  return [...new Set(records.map(parseDeletedMisaId))];
}

async function syncCustomers(
  admin: Admin,
  prevSyncTime: string | null,
  prevDeletedTime: string | null,
): Promise<Counts> {
  const syncedAt = new Date().toISOString();
  const records = await paginate<MisaRawRecord>("get_dictionary", {
    data_type: MISA_DATA_TYPE.ACCOUNTING_OBJECT,
    last_sync_time: prevSyncTime,
  });
  const rows = records.map((r) => ({
    ...normalizeCustomer(r),
    is_deleted: false,
    synced_at: syncedAt,
  }));
  const upserted = await runUpsert(rows, "misa_customers", (batch) =>
    admin.from("misa_customers").upsert(batch, { onConflict: "misa_id" }),
  );

  const ids = await fetchDeletedIds(MISA_DATA_TYPE.ACCOUNTING_OBJECT, prevDeletedTime);
  const deleted = await runSoftDelete(ids, "misa_customers", (batch) =>
    admin
      .from("misa_customers")
      .update({ is_deleted: true, synced_at: syncedAt })
      .in("misa_id", batch)
      .select("misa_id"),
  );

  return { upserted, deleted };
}

async function syncProducts(
  admin: Admin,
  prevSyncTime: string | null,
  prevDeletedTime: string | null,
): Promise<Counts> {
  const syncedAt = new Date().toISOString();
  const records = await paginate<MisaRawRecord>("get_dictionary", {
    data_type: MISA_DATA_TYPE.INVENTORY_ITEM,
    last_sync_time: prevSyncTime,
  });
  const rows = records.map((r) => ({
    ...normalizeProduct(r),
    is_deleted: false,
    synced_at: syncedAt,
  }));
  const upserted = await runUpsert(rows, "misa_products", (batch) =>
    admin.from("misa_products").upsert(batch, { onConflict: "misa_id" }),
  );

  const ids = await fetchDeletedIds(MISA_DATA_TYPE.INVENTORY_ITEM, prevDeletedTime);
  const deleted = await runSoftDelete(ids, "misa_products", (batch) =>
    admin
      .from("misa_products")
      .update({ is_deleted: true, synced_at: syncedAt })
      .in("misa_id", batch)
      .select("misa_id"),
  );

  return { upserted, deleted };
}

async function syncStocks(
  admin: Admin,
  prevSyncTime: string | null,
  prevDeletedTime: string | null,
): Promise<Counts> {
  const syncedAt = new Date().toISOString();
  const records = await paginate<MisaRawRecord>("get_dictionary", {
    data_type: MISA_DATA_TYPE.STOCK,
    last_sync_time: prevSyncTime,
  });
  const rows = records.map((r) => ({
    ...normalizeStock(r),
    is_deleted: false,
    synced_at: syncedAt,
  }));
  const upserted = await runUpsert(rows, "misa_stocks", (batch) =>
    admin.from("misa_stocks").upsert(batch, { onConflict: "misa_id" }),
  );

  const ids = await fetchDeletedIds(MISA_DATA_TYPE.STOCK, prevDeletedTime);
  const deleted = await runSoftDelete(ids, "misa_stocks", (batch) =>
    admin
      .from("misa_stocks")
      .update({ is_deleted: true, synced_at: syncedAt })
      .in("misa_id", batch)
      .select("misa_id"),
  );

  return { upserted, deleted };
}

/**
 * Sync the inventory balance snapshot. This endpoint returns the full current
 * balance (no incremental filter), so we upsert every row by (stock, item).
 */
async function syncInventoryBalances(admin: Admin): Promise<Counts> {
  const syncedAt = new Date().toISOString();
  const records = await paginate<MisaRawRecord>(
    "get_list_inventory_balance",
    {},
  );
  const rows = records
    .map((r) => ({ ...normalizeInventoryBalance(r), synced_at: syncedAt }))
    // The upsert conflict target needs both keys; skip incomplete rows.
    .filter((row) => row.stock_misa_id && row.product_misa_id);

  const upserted = await runUpsert(rows, "misa_inventory_balances", (batch) =>
    admin
      .from("misa_inventory_balances")
      .upsert(batch, { onConflict: "stock_misa_id,product_misa_id" }),
  );

  return { upserted, deleted: 0 };
}

function runHandler(
  admin: Admin,
  type: MisaSyncType,
  prevSyncTime: string | null,
  prevDeletedTime: string | null,
): Promise<Counts> {
  switch (type) {
    case "customers":
      return syncCustomers(admin, prevSyncTime, prevDeletedTime);
    case "products":
      return syncProducts(admin, prevSyncTime, prevDeletedTime);
    case "stocks":
      return syncStocks(admin, prevSyncTime, prevDeletedTime);
    case "inventory_balance":
      return syncInventoryBalances(admin);
  }
}

/** Sync a single data type, recording state + a log row. Never throws. */
async function syncOne(
  admin: Admin,
  type: MisaSyncType,
  trigger: MisaSyncTrigger,
  actorUserId: string | null,
): Promise<SyncResult> {
  const runStart = new Date().toISOString();

  const { data: prevState } = await admin
    .from("misa_sync_state")
    .select("last_sync_time, last_deleted_sync_time")
    .eq("data_type", type)
    .maybeSingle();
  const prevSyncTime = prevState?.last_sync_time ?? null;
  const prevDeletedTime = prevState?.last_deleted_sync_time ?? null;

  const { data: logRow } = await admin
    .from("misa_sync_log")
    .insert({
      data_type: type,
      status: "running",
      started_at: runStart,
      triggered_by: trigger,
      actor_user_id: actorUserId,
    })
    .select("id")
    .single();
  const logId = logRow?.id ?? null;

  try {
    const counts = await runHandler(admin, type, prevSyncTime, prevDeletedTime);

    await admin.from("misa_sync_state").upsert(
      {
        data_type: type,
        last_sync_time: runStart,
        last_deleted_sync_time: runStart,
        updated_at: runStart,
      },
      { onConflict: "data_type" },
    );

    if (logId != null) {
      await admin
        .from("misa_sync_log")
        .update({
          status: "success",
          finished_at: new Date().toISOString(),
          records_upserted: counts.upserted,
          records_deleted: counts.deleted,
        })
        .eq("id", logId);
    }

    return { type, status: "success", ...counts };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (logId != null) {
      await admin
        .from("misa_sync_log")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          error: message.slice(0, 2000),
        })
        .eq("id", logId);
    }
    return { type, status: "error", upserted: 0, deleted: 0, error: message };
  }
}

/**
 * Run the sync for the given data types (default: all), sequentially so a slow
 * type doesn't fan out concurrent MISA calls. One type failing does not stop
 * the others. Caller must have verified the user is a content manager (or that
 * the request carries a valid CRON_SECRET).
 */
export async function runSync(
  types: MisaSyncType[] = MISA_SYNC_TYPES,
  options: { trigger?: MisaSyncTrigger; actorUserId?: string | null } = {},
): Promise<SyncResult[]> {
  const admin = createAdminClient();
  const trigger = options.trigger ?? "manual";
  const actorUserId = options.actorUserId ?? null;

  const results: SyncResult[] = [];
  for (const type of types) {
    results.push(await syncOne(admin, type, trigger, actorUserId));
  }
  return results;
}
