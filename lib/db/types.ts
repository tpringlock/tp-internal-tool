/**
 * Hand-written database types mirroring supabase/migrations.
 * Keep in sync with the SQL, or regenerate with the Supabase CLI
 * (`supabase gen types typescript`) once the project is linked.
 */

export type UserRole = "admin" | "employee";

export type DocType =
  | "contract"
  | "addendum"
  | "payment_record"
  | "invoice"
  | "debt_reconciliation"
  | "handover_minutes"
  | "correspondence"
  | "meeting_minutes";

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
        Insert<Client, "id" | "created_at" | "updated_at" | "created_by">,
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
      activity_log: Table<
        ActivityLog,
        Insert<ActivityLog, "id" | "created_at" | "metadata" | "entity_type" | "entity_id" | "ip" | "actor_user_id">,
        Partial<ActivityLog>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      doc_type: DocType;
    };
    CompositeTypes: Record<string, never>;
  };
}
