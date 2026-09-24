/**
 * Hand-written database types mirroring supabase/migrations.
 * Keep in sync with the SQL, or regenerate with the Supabase CLI
 * (`supabase gen types typescript`) once the project is linked.
 */

export type UserRole = "admin" | "employee" | "manager";

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
    };
    Enums: {
      user_role: UserRole;
      doc_type: DocType;
      course_status: CourseStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
