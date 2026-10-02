/**
 * Hand-written database types mirroring supabase/migrations.
 * Keep in sync with the SQL, or regenerate with the Supabase CLI
 * (`supabase gen types typescript`) once the project is linked.
 */

import type { ContractConfig, DateRange, RentResult } from "@/lib/billing/types";
import type { MisaCatalog } from "@/lib/billing/misa-catalog";
import type {
  PriceImportChange,
  PriceImportCounts,
  PriceImportPayload,
  PriceLinePayload,
} from "@/lib/billing/price-import";

/**
 * billing_viewer ("Chỉ xem", 0033): read-only access to /billing; elsewhere
 * the same as an employee.
 */
export type UserRole = "admin" | "employee" | "manager" | "accountant" | "billing_viewer";

export type DocType =
  | "contract"
  | "addendum"
  | "payment_record"
  | "invoice"
  | "debt_reconciliation"
  | "handover_minutes"
  | "correspondence"
  | "meeting_minutes";

export type CourseStatus = "draft" | "published";

export type VideoProvider = "youtube" | "vimeo" | "self_hosted";

// NOTE: these are `type` aliases (not interfaces) on purpose. supabase-js's
// GenericTable constrains Row/Insert/Update to Record<string, unknown>, which
// interfaces do not satisfy (no implicit index signature) but type aliases do.
export type Profile = {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Client = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  tax_code: string | null;
  phone: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  name: string;
  code: string;
  client_id: string;
  status: "active" | "archived";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectMember = {
  project_id: string;
  user_id: string;
  assigned_by: string | null;
  assigned_at: string;
};

export type DocumentRow = {
  id: string;
  project_id: string;
  doc_type: DocType;
  canonical_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  signed_attested: boolean;
  uploaded_by: string;
  created_at: string;
};

export type ShareLink = {
  id: string;
  document_id: string;
  token: string;
  expires_at: string;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
};

export type FolderShareLink = {
  id: string;
  client_id: string;
  token: string;
  expires_at: string;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
};

export type Course = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  instructor: string | null;
  thumbnail_path: string | null;
  status: CourseStatus;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Chapter = {
  id: string;
  course_id: string;
  title: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type Lesson = {
  id: string;
  course_id: string;
  chapter_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  video_provider: VideoProvider | null;
  video_storage_path: string | null;
  video_file_name: string | null;
  video_file_size: number | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type LessonFile = {
  id: string;
  lesson_id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_by: string | null;
  created_at: string;
};

export type CourseEnrollment = {
  user_id: string;
  course_id: string;
  enrolled_at: string;
  completed_at: string | null;
};

export type LessonProgress = {
  user_id: string;
  lesson_id: string;
  course_id: string;
  completed_at: string;
};

export type QuizQuestion = {
  id: string;
  chapter_id: string;
  prompt: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type QuizOption = {
  id: string;
  question_id: string;
  label: string;
  is_correct: boolean;
  position: number;
  created_at: string;
};

export type ChapterQuizPass = {
  user_id: string;
  chapter_id: string;
  course_id: string;
  passed_at: string;
};

export type LessonNote = {
  user_id: string;
  lesson_id: string;
  course_id: string;
  content: string;
  updated_at: string;
};

export type CourseFile = {
  id: string;
  course_id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_by: string | null;
  created_at: string;
};

export type ActivityLog = {
  id: number;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// MISA AMIS Kế toán (ACT Open API) — read-only master data cache.
// Money/quantity columns are `numeric` in Postgres; supabase-js returns them as
// strings, so they are typed as `string | null` to avoid float precision loss.
// ---------------------------------------------------------------------------
export type MisaSyncStatus = "running" | "success" | "error";
export type MisaSyncTrigger = "manual" | "cron";

export type MisaToken = {
  id: string;
  org_company_code: string;
  access_token: string;
  tenant_code: string | null;
  app_name: string | null;
  expired_at: string;
  created_at: string;
  updated_at: string;
};

export type MisaCustomer = {
  id: string;
  misa_id: string;
  code: string | null;
  name: string;
  tax_code: string | null;
  phone: string | null;
  address: string | null;
  object_type: string | null;
  is_deleted: boolean;
  raw: Record<string, unknown>;
  misa_modified_at: string | null;
  synced_at: string;
  created_at: string;
  updated_at: string;
};

export type MisaProduct = {
  id: string;
  misa_id: string;
  code: string | null;
  name: string;
  unit: string | null;
  category: string | null;
  is_deleted: boolean;
  raw: Record<string, unknown>;
  misa_modified_at: string | null;
  synced_at: string;
  created_at: string;
  updated_at: string;
};

export type MisaStock = {
  id: string;
  misa_id: string;
  code: string | null;
  name: string;
  is_deleted: boolean;
  raw: Record<string, unknown>;
  misa_modified_at: string | null;
  synced_at: string;
  created_at: string;
  updated_at: string;
};

export type MisaInventoryBalance = {
  id: string;
  stock_misa_id: string | null;
  product_misa_id: string | null;
  product_code: string | null;
  product_name: string | null;
  stock_code: string | null;
  stock_name: string | null;
  quantity: string | null;
  value: string | null;
  as_of: string | null;
  raw: Record<string, unknown>;
  synced_at: string;
  created_at: string;
  updated_at: string;
};

export type MisaSyncState = {
  data_type: string;
  last_sync_time: string | null;
  last_deleted_sync_time: string | null;
  updated_at: string;
};

export type MisaSyncLog = {
  id: number;
  data_type: string;
  status: MisaSyncStatus;
  started_at: string;
  finished_at: string | null;
  records_upserted: number;
  records_deleted: number;
  error: string | null;
  triggered_by: MisaSyncTrigger;
  actor_user_id: string | null;
};

export type BillingCalcStatus = "draft" | "confirmed" | "voided";

export type BillingContract = {
  id: string;
  code: string;
  customer_name: string;
  project_name: string;
  contract_no: string;
  misa_kho: string;
  period_start_day: number;
  contract_start: string | null;
  active: boolean;
  /** Seeded "giả định" contract (Excel tool prices), for comparison only. */
  is_demo: boolean;
  /** Warehouse name as on MISA (0036); '' until known. */
  misa_kho_name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingContractItem = {
  id: string;
  contract_id: string;
  name: string;
  unit: string;
  unit_price: number;
  ma_hang: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BillingExcludedCode = {
  contract_id: string;
  ma_hang: string;
  created_at: string;
};

export type BillingExcludedRange = {
  id: string;
  /** null = applies to every contract. */
  contract_id: string | null;
  date_from: string;
  date_to: string;
  reason: string;
  created_by: string | null;
  created_at: string;
};

export type BillingMisaUpload = {
  id: string;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  sha256: string;
  file_from: string;
  file_to: string;
  layout: string;
  warehouse_count: number;
  warnings: string[];
  uploaded_by: string;
  created_at: string;
};

export type BillingRentCalculation = {
  id: string;
  contract_id: string;
  /** "YYYY-MM" for a billing-month (HSTT) calculation; null for a custom date range. */
  period_month: string | null;
  period_from: string;
  period_to: string;
  upload_ids: string[];
  /** The contract config the engine ran with (prices may change later). */
  contract_snapshot: ContractConfig;
  excluded_ranges: DateRange[];
  /** numeric(20,4): may arrive as a string; normalise with toAmount(). */
  total_amount: number | string;
  result: RentResult;
  /** Copied from the contract by a trigger (0032); demo calculations can't be confirmed. */
  is_demo: boolean;
  status: BillingCalcStatus;
  created_by: string;
  created_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  voided_by: string | null;
  voided_at: string | null;
};

/** One price row per (warehouse contract, MISA code) (0036). */
export type BillingPriceLine = {
  id: string;
  contract_id: string;
  ma_vt: string;
  /** MISA name / unit ('' = not known yet). */
  ten_vt: string;
  dvt: string;
  /** Integer VND per day; 0 = not billed. */
  unit_price: number;
  /** HSTT overrides; null = use the MISA value. */
  print_name: string | null;
  print_dvt: string | null;
  note: string;
  sort_order: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Audit row of a confirmed Excel import (0036). */
export type BillingPriceImport = {
  id: string;
  mode: "upsert" | "replace";
  file_name: string;
  size_bytes: number;
  sha256: string;
  storage_path: string;
  row_count: number;
  columns: string[];
  contracts_created: number;
  contracts_updated: number;
  lines_inserted: number;
  lines_updated: number;
  lines_deleted: number;
  lines_unchanged: number;
  warnings: string[];
  changes: PriceImportChange[];
  created_by: string;
  created_at: string;
};

export type BillingMonthFileStatus = "active" | "superseded";

/** A MISA upload registered as one version of a data month (0035). */
export type BillingMisaMonthFile = {
  id: string;
  upload_id: string;
  /** "YYYY-MM". */
  month: string;
  version: number;
  status: BillingMonthFileStatus;
  /** null for rows backfilled by 0037 until the file is read again. */
  voucher_count: number | null;
  catalog: MisaCatalog | null;
  created_by: string;
  created_at: string;
  superseded_by: string | null;
  superseded_at: string | null;
};

// ───────────── HSTT export (0038) ─────────────
// Money columns are bigint (integer VND); supabase-js returns them as numbers.

/** Bên B (TP): the single row id = 1. Only admins update it. */
export type CompanyProfile = {
  id: 1;
  ten_in_hoa: string;
  /** ĐNTT header, contains a line break. */
  ten_2_dong: string;
  ten_thuong: string;
  ten_thu_huong: string;
  dia_chi: string;
  dia_chi_ngan: string;
  dien_thoai: string;
  so_tk: string;
  /** Bank + branch, printed after "Tại ". */
  ngan_hang: string;
  mst: string;
  dai_dien: string;
  chuc_vu: string;
  noi_lap: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Bên A. One customer can have several contracts. */
export type BillingCustomer = {
  id: string;
  ten_in_hoa: string;
  ten_thuong: string;
  /** Used in the file name "HSTT T08.2026 - {ten_rut_gon} - TP.xlsx". */
  ten_rut_gon: string;
  dia_chi: string;
  dien_thoai: string;
  so_tk: string;
  ngan_hang: string;
  mst: string;
  dai_dien: string;
  chuc_vu: string;
  note: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** HSTT fields of a contract (1:1 with billing_contracts, optional). */
export type BillingContractHstt = {
  contract_id: string;
  customer_id: string | null;
  contract_type: string;
  contract_date: string | null;
  du_an_ten: string;
  du_an_dia_chi: string;
  /** null = the "Căn cứ" sentence is generated. */
  can_cu_override: string | null;
  vat_percent: number;
  /** One note for the whole ĐCCN "Đã tạm ứng" line. */
  advances_note: string;
  /** Debt at the END of opening_debt_month ("YYYY-MM"); both null or both set. */
  opening_debt: number | null;
  opening_debt_month: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingTransportPrice = {
  id: string;
  contract_id: string;
  name: string;
  unit: string;
  unit_price: number;
  sort_order: number;
  active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** One advance paid by Bên A; the HSTT writes their sum as =a+b+... */
export type BillingContractAdvance = {
  id: string;
  contract_id: string;
  amount: number;
  paid_on: string | null;
  sort_order: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Typed per period, keyed like the confirmed calculation (contract, period_from). */
export type BillingPeriodInput = {
  id: string;
  contract_id: string;
  period_from: string;
  period_to: string;
  paid_in_period: number;
  /** null = computed from the chain of confirmed periods. */
  opening_debt_override: number | null;
  note: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingTransportChargeMode = "now" | "end_of_term";

export type BillingPeriodTransport = {
  id: string;
  period_input_id: string;
  transport_price_id: string;
  /** Column G; null = blank cell. */
  trips: number | null;
  /** Column F ("lũy kế"). */
  cumulative_trips: number | null;
  /** Copied from billing_transport_prices when entered. */
  unit_price: number;
  charge_mode: BillingTransportChargeMode;
  note: string;
  created_at: string;
  updated_at: string;
};

export type BillingPeriodDeduction = {
  id: string;
  period_input_id: string;
  label: string;
  amount: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// --- Period presets (0040) ---------------------------------------------------

/** "Mẫu kỳ": start day (1-28) + length in months (lib/billing/period-presets.ts). */
export type BillingPeriodPreset = {
  id: string;
  name: string;
  start_day: number;
  months: 1 | 3 | 6 | 12;
  sort_order: number;
  active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Default preset of a contract (1:1, optional; side table so billing_contracts is untouched). */
export type BillingContractPeriodPreset = {
  contract_id: string;
  preset_id: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type Insert<T, Optional extends keyof T> = Omit<T, Optional> &
  Partial<Pick<T, Optional>>;

interface Table<Row, Ins, Upd> {
  Row: Row;
  Insert: Ins;
  Update: Upd;
  // Required by supabase-js's schema constraint; we don't type FK joins here.
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        Profile,
        Insert<Profile, "created_at" | "updated_at" | "full_name" | "role" | "is_active">,
        Partial<Profile>
      >;
      clients: Table<
        Client,
        Insert<Client, "id" | "created_at" | "updated_at" | "created_by" | "address" | "tax_code" | "phone">,
        Partial<Client>
      >;
      projects: Table<
        Project,
        Insert<Project, "id" | "created_at" | "updated_at" | "created_by" | "status">,
        Partial<Project>
      >;
      project_members: Table<
        ProjectMember,
        Insert<ProjectMember, "assigned_at" | "assigned_by">,
        Partial<ProjectMember>
      >;
      documents: Table<
        DocumentRow,
        Insert<DocumentRow, "id" | "created_at" | "mime_type">,
        Partial<DocumentRow>
      >;
      share_links: Table<
        ShareLink,
        Insert<ShareLink, "id" | "created_at" | "token" | "revoked_at">,
        Partial<ShareLink>
      >;
      folder_share_links: Table<
        FolderShareLink,
        Insert<FolderShareLink, "id" | "created_at" | "token" | "revoked_at">,
        Partial<FolderShareLink>
      >;
      activity_log: Table<
        ActivityLog,
        Insert<ActivityLog, "id" | "created_at" | "metadata" | "entity_type" | "entity_id" | "ip" | "actor_user_id">,
        Partial<ActivityLog>
      >;
      courses: Table<
        Course,
        Insert<Course, "id" | "created_at" | "updated_at" | "created_by" | "description" | "category" | "instructor" | "thumbnail_path" | "status" | "published_at">,
        Partial<Course>
      >;
      chapters: Table<
        Chapter,
        Insert<Chapter, "id" | "created_at" | "updated_at" | "position">,
        Partial<Chapter>
      >;
      lessons: Table<
        Lesson,
        Insert<Lesson, "id" | "created_at" | "updated_at" | "description" | "video_url" | "video_provider" | "video_storage_path" | "video_file_name" | "video_file_size" | "position">,
        Partial<Lesson>
      >;
      lesson_files: Table<
        LessonFile,
        Insert<LessonFile, "id" | "created_at" | "created_by" | "mime_type">,
        Partial<LessonFile>
      >;
      course_enrollments: Table<
        CourseEnrollment,
        Insert<CourseEnrollment, "enrolled_at" | "completed_at">,
        Partial<CourseEnrollment>
      >;
      lesson_progress: Table<
        LessonProgress,
        Insert<LessonProgress, "completed_at">,
        Partial<LessonProgress>
      >;
      quiz_questions: Table<
        QuizQuestion,
        Insert<QuizQuestion, "id" | "created_at" | "updated_at" | "position">,
        Partial<QuizQuestion>
      >;
      quiz_options: Table<
        QuizOption,
        Insert<QuizOption, "id" | "created_at" | "position" | "is_correct">,
        Partial<QuizOption>
      >;
      chapter_quiz_passes: Table<
        ChapterQuizPass,
        Insert<ChapterQuizPass, "passed_at">,
        Partial<ChapterQuizPass>
      >;
      lesson_notes: Table<
        LessonNote,
        Insert<LessonNote, "content" | "updated_at">,
        Partial<LessonNote>
      >;
      course_files: Table<
        CourseFile,
        Insert<CourseFile, "id" | "created_at" | "created_by" | "mime_type">,
        Partial<CourseFile>
      >;
      misa_token: Table<
        MisaToken,
        Insert<MisaToken, "id" | "created_at" | "updated_at" | "tenant_code" | "app_name">,
        Partial<MisaToken>
      >;
      misa_customers: Table<
        MisaCustomer,
        Insert<
          MisaCustomer,
          | "id"
          | "created_at"
          | "updated_at"
          | "synced_at"
          | "is_deleted"
          | "raw"
          | "name"
          | "code"
          | "tax_code"
          | "phone"
          | "address"
          | "object_type"
          | "misa_modified_at"
        >,
        Partial<MisaCustomer>
      >;
      misa_products: Table<
        MisaProduct,
        Insert<
          MisaProduct,
          | "id"
          | "created_at"
          | "updated_at"
          | "synced_at"
          | "is_deleted"
          | "raw"
          | "name"
          | "code"
          | "unit"
          | "category"
          | "misa_modified_at"
        >,
        Partial<MisaProduct>
      >;
      misa_stocks: Table<
        MisaStock,
        Insert<
          MisaStock,
          | "id"
          | "created_at"
          | "updated_at"
          | "synced_at"
          | "is_deleted"
          | "raw"
          | "name"
          | "code"
          | "misa_modified_at"
        >,
        Partial<MisaStock>
      >;
      misa_inventory_balances: Table<
        MisaInventoryBalance,
        Insert<
          MisaInventoryBalance,
          | "id"
          | "created_at"
          | "updated_at"
          | "synced_at"
          | "raw"
          | "stock_misa_id"
          | "product_misa_id"
          | "product_code"
          | "product_name"
          | "stock_code"
          | "stock_name"
          | "quantity"
          | "value"
          | "as_of"
        >,
        Partial<MisaInventoryBalance>
      >;
      misa_sync_state: Table<
        MisaSyncState,
        Insert<MisaSyncState, "updated_at" | "last_sync_time" | "last_deleted_sync_time">,
        Partial<MisaSyncState>
      >;
      misa_sync_log: Table<
        MisaSyncLog,
        Insert<
          MisaSyncLog,
          | "id"
          | "status"
          | "started_at"
          | "finished_at"
          | "records_upserted"
          | "records_deleted"
          | "error"
          | "triggered_by"
          | "actor_user_id"
        >,
        Partial<MisaSyncLog>
      >;
      billing_contracts: Table<
        BillingContract,
        Insert<
          BillingContract,
          | "id"
          | "contract_no"
          | "period_start_day"
          | "contract_start"
          | "active"
          | "is_demo"
          | "misa_kho_name"
          | "created_by"
          | "created_at"
          | "updated_at"
        >,
        Partial<BillingContract>
      >;
      billing_contract_items: Table<
        BillingContractItem,
        Insert<BillingContractItem, "id" | "sort_order" | "created_at" | "updated_at">,
        Partial<BillingContractItem>
      >;
      billing_excluded_codes: Table<
        BillingExcludedCode,
        Insert<BillingExcludedCode, "created_at">,
        Partial<BillingExcludedCode>
      >;
      billing_excluded_ranges: Table<
        BillingExcludedRange,
        Insert<BillingExcludedRange, "id" | "contract_id" | "created_by" | "created_at">,
        Partial<BillingExcludedRange>
      >;
      billing_misa_uploads: Table<
        BillingMisaUpload,
        Insert<BillingMisaUpload, "id" | "warehouse_count" | "warnings" | "created_at">,
        Partial<BillingMisaUpload>
      >;
      billing_rent_calculations: Table<
        BillingRentCalculation,
        Insert<
          BillingRentCalculation,
          | "id"
          | "period_month"
          | "is_demo"
          | "excluded_ranges"
          | "status"
          | "created_at"
          | "confirmed_by"
          | "confirmed_at"
          | "voided_by"
          | "voided_at"
        >,
        Partial<BillingRentCalculation>
      >;
      billing_price_lines: Table<
        BillingPriceLine,
        Insert<
          BillingPriceLine,
          | "id"
          | "ten_vt"
          | "dvt"
          | "print_name"
          | "print_dvt"
          | "note"
          | "sort_order"
          | "updated_by"
          | "created_at"
          | "updated_at"
        >,
        Partial<BillingPriceLine>
      >;
      billing_price_imports: Table<
        BillingPriceImport,
        Insert<
          BillingPriceImport,
          | "id"
          | "columns"
          | "contracts_created"
          | "contracts_updated"
          | "lines_inserted"
          | "lines_updated"
          | "lines_deleted"
          | "lines_unchanged"
          | "warnings"
          | "changes"
          | "created_at"
        >,
        Record<string, never>
      >;
      billing_misa_month_files: Table<
        BillingMisaMonthFile,
        Insert<
          BillingMisaMonthFile,
          "id" | "status" | "voucher_count" | "catalog" | "created_at" | "superseded_by" | "superseded_at"
        >,
        Partial<Pick<BillingMisaMonthFile, "status" | "voucher_count" | "catalog">>
      >;
      company_profile: Table<
        CompanyProfile,
        // No insert policy: the row is created by 0039.
        Record<string, never>,
        Partial<Omit<CompanyProfile, "id" | "created_at" | "updated_at">>
      >;
      billing_customers: Table<
        BillingCustomer,
        Insert<
          BillingCustomer,
          | "id"
          | "ten_thuong"
          | "ten_rut_gon"
          | "dia_chi"
          | "dien_thoai"
          | "so_tk"
          | "ngan_hang"
          | "mst"
          | "dai_dien"
          | "chuc_vu"
          | "note"
          | "created_by"
          | "updated_by"
          | "created_at"
          | "updated_at"
        >,
        Partial<BillingCustomer>
      >;
      billing_contract_hstt: Table<
        BillingContractHstt,
        Insert<
          BillingContractHstt,
          | "customer_id"
          | "contract_type"
          | "contract_date"
          | "du_an_ten"
          | "du_an_dia_chi"
          | "can_cu_override"
          | "vat_percent"
          | "advances_note"
          | "opening_debt"
          | "opening_debt_month"
          | "updated_by"
          | "created_at"
          | "updated_at"
        >,
        Partial<BillingContractHstt>
      >;
      billing_transport_prices: Table<
        BillingTransportPrice,
        Insert<
          BillingTransportPrice,
          "id" | "unit" | "sort_order" | "active" | "updated_by" | "created_at" | "updated_at"
        >,
        Partial<BillingTransportPrice>
      >;
      billing_contract_advances: Table<
        BillingContractAdvance,
        Insert<BillingContractAdvance, "id" | "paid_on" | "sort_order" | "updated_by" | "created_at" | "updated_at">,
        Partial<BillingContractAdvance>
      >;
      billing_period_inputs: Table<
        BillingPeriodInput,
        Insert<
          BillingPeriodInput,
          "id" | "paid_in_period" | "opening_debt_override" | "note" | "updated_by" | "created_at" | "updated_at"
        >,
        Partial<BillingPeriodInput>
      >;
      billing_period_transport: Table<
        BillingPeriodTransport,
        Insert<
          BillingPeriodTransport,
          "id" | "trips" | "cumulative_trips" | "charge_mode" | "note" | "created_at" | "updated_at"
        >,
        Partial<BillingPeriodTransport>
      >;
      billing_period_deductions: Table<
        BillingPeriodDeduction,
        Insert<BillingPeriodDeduction, "id" | "sort_order" | "created_at" | "updated_at">,
        Partial<BillingPeriodDeduction>
      >;
      billing_period_presets: Table<
        BillingPeriodPreset,
        Insert<BillingPeriodPreset, "id" | "sort_order" | "active" | "updated_by" | "created_at" | "updated_at">,
        Partial<BillingPeriodPreset>
      >;
      billing_contract_period_presets: Table<
        BillingContractPeriodPreset,
        Insert<BillingContractPeriodPreset, "updated_by" | "created_at" | "updated_at">,
        Partial<BillingContractPeriodPreset>
      >;
    };
    Views: {
      // Service-role only (see 0020_user_emails_view.sql).
      user_emails: {
        Row: { id: string; email: string | null };
        Relationships: [];
      };
    };
    Functions: {
      document_counts_by_client: {
        Args: Record<string, never>;
        Returns: { client_id: string; client_name: string; doc_count: number }[];
      };
      document_stats_by_project: {
        Args: { p_client_id: string };
        Returns: { project_id: string; doc_count: number; byte_sum: number }[];
      };
      billing_save_price_lines: {
        Args: { p_contract_id: string; p_lines: PriceLinePayload[] };
        Returns: undefined;
      };
      billing_import_price_lines: {
        Args: { p_import: PriceImportPayload };
        Returns: PriceImportCounts & { import_id: string };
      };
      billing_add_month_file: {
        Args: {
          p_upload: {
            id: string;
            storage_path: string;
            file_name: string;
            size_bytes: number;
            sha256: string;
            file_from: string;
            file_to: string;
            layout: string;
            warehouse_count: number;
            warnings: string[];
          };
          p_voucher_count: number;
          p_catalog: MisaCatalog;
        };
        Returns: { month: string; version: number; replaced_upload_id: string | null };
      };
      /** Revoked from the app by 0037 (old price tables frozen); kept for the revert path. */
      billing_save_contract_config: {
        Args: {
          p_contract_id: string;
          p_items: { name: string; unit: string; unit_price: number; ma_hang: string[] }[];
          p_excluded: string[];
        };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      doc_type: DocType;
      course_status: CourseStatus;
      billing_calc_status: BillingCalcStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
