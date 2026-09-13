"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireUser } from "@/lib/auth/dal";
import { canManageContent } from "@/lib/auth/roles";
import { logActivity } from "@/lib/activity";
import { buildCanonicalName, buildStoragePath } from "@/lib/documents/naming";
import { generateProjectCode } from "@/lib/projects/code";
import { DOC_TYPES, MAX_FILE_SIZE, ACCEPTED_MIME } from "@/lib/documents/constants";
import type { DocType } from "@/lib/db/types";
import type { FormState } from "@/app/actions/auth";

const STORAGE_BUCKET = "documents";
const DOC_TYPE_VALUES = new Set(DOC_TYPES.map((t) => t.value));
/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";
/** Sentinel project_id posted by the upload form's "create new project" option. */
const NEW_PROJECT = "__new__";

interface ProjectForUpload {
  id: string;
  name: string;
  clients: { name: string } | null;
}

export async function uploadDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const t = await getTranslations("Documents");

  let projectId = String(formData.get("project_id") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  const newProjectName = String(formData.get("new_project_name") ?? "").trim();
  const docType = String(formData.get("doc_type") ?? "") as DocType;
  const signed = formData.get("signed") === "on" || formData.get("signed") === "true";
  const file = formData.get("file");

  const creatingProject = projectId === NEW_PROJECT;

  const fieldErrors: Record<string, string[]> = {};
  if (creatingProject) {
    // Only content managers may create a project on the fly during upload.
    if (!canManageContent(user.profile.role) || !clientId) {
      fieldErrors.project_id = [t("errProject")];
    } else if (!newProjectName || newProjectName.length > 120) {
      fieldErrors.new_project_name = [t("errProjectName")];
    }
  } else if (!projectId) {
    fieldErrors.project_id = [t("errProject")];
  }
  if (!DOC_TYPE_VALUES.has(docType)) fieldErrors.doc_type = [t("errDocType")];
  if (!signed) {
    fieldErrors.signed = [t("errSigned")];
  }

  if (!(file instanceof File) || file.size === 0) {
    fieldErrors.file = [t("errFileChoose")];
  } else if (file.type !== ACCEPTED_MIME) {
    fieldErrors.file = [t("errFilePdf")];
  } else if (file.size > MAX_FILE_SIZE) {
    fieldErrors.file = [t("errFileSize")];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }
  const pdf = file as File;

  const supabase = await createClient();

  if (creatingProject) {
    // Code is auto-derived from the name; retry with a numeric suffix on
    // collisions. RLS also enforces the content-manager check done above.
    let createdId: string | null = null;
    for (let attempt = 0; attempt < 5 && !createdId; attempt++) {
      const code = generateProjectCode(newProjectName, attempt);
      const { data: created, error: createError } = await supabase
        .from("projects")
        .insert({
          name: newProjectName,
          code,
          client_id: clientId,
          status: "active",
          created_by: user.id,
        })
        .select("id")
        .single();
      if (created) {
        createdId = created.id;
        await logActivity(supabase, {
          action: "project.created",
          entityType: "project",
          entityId: created.id,
          metadata: { code, via: "document_upload" },
        });
      } else if (createError?.code !== UNIQUE_VIOLATION) {
        return { error: createError?.message ?? t("errSaveFailed") };
      }
    }
    if (!createdId) {
      return { fieldErrors: { new_project_name: [t("errProjectName")] } };
    }
    projectId = createdId;
    revalidatePath("/admin/projects");
  }

  // RLS: this returns the project only if the user is an admin or a member,
  // so it doubles as the upload permission check.
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, clients(name)")
    .eq("id", projectId)
    .single<ProjectForUpload>();

  if (!project) {
    return { error: t("errNoProjectAccess") };
  }

  const fileId = crypto.randomUUID();
  const storagePath = buildStoragePath(projectId, fileId);
  const canonicalName = buildCanonicalName({
    clientName: project.clients?.name ?? "Client",
    projectName: project.name,
    docType,
    date: new Date(),
    disambiguator: fileId.slice(0, 4),
  });

  // Upload the file with the service role (the bucket is private and has no
  // authenticated policies). The row insert below still runs under RLS.
  const admin = createAdminClient();
  const buffer = Buffer.from(await pdf.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: ACCEPTED_MIME,
      upsert: false,
    });
  if (uploadError) {
    return { error: t("errUploadFailed", { message: uploadError.message }) };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("documents")
    .insert({
      project_id: projectId,
      doc_type: docType,
      canonical_name: canonicalName,
      storage_path: storagePath,
      file_size: pdf.size,
      signed_attested: true,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    // Roll back the orphaned file so storage stays consistent with the table.
    await admin.storage.from(STORAGE_BUCKET).remove([storagePath]);
    return {
      error: insertError?.message ?? t("errSaveFailed"),
    };
  }

  await logActivity(supabase, {
    action: "document.uploaded",
    entityType: "document",
    entityId: inserted.id,
    metadata: { project_id: projectId, doc_type: docType, canonical_name: canonicalName },
  });

  redirect(`/documents/${inserted.id}`);
}

/**
 * Delete a document: the row (RLS policy documents_delete_admin, share links
 * cascade away with it) and then the PDF in storage. Admin-only.
 */
export async function deleteDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const id = String(formData.get("id"));
  const supabase = await createClient();
  // select() returns the removed row — both to confirm RLS didn't silently
  // filter the delete and to learn the storage path for cleanup.
  const { data, error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .select("id, project_id, storage_path, canonical_name");

  const t = await getTranslations("Admin");
  if (error) return { error: error.message };
  const doc = data?.[0];
  if (!doc) return { error: t("documentNotFound") };

  // Row is gone; remove the file with the service role (private bucket). A
  // failure here leaves an orphaned file, which is preferable to a dangling row.
  await createAdminClient().storage.from(STORAGE_BUCKET).remove([doc.storage_path]);

  await logActivity(supabase, {
    action: "document.deleted",
    entityType: "document",
    entityId: id,
    metadata: { project_id: doc.project_id, canonical_name: doc.canonical_name },
  });
  revalidatePath(`/admin/projects/${doc.project_id}`);
  revalidatePath("/documents");
  return { success: t("documentDeleted", { name: doc.canonical_name }) };
}
