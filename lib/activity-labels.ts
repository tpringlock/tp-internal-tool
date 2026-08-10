/** Friendly labels for activity_log action codes. */
export const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.password_reset": "Reset password",
  "profile.update": "Updated profile",
  "profile.change_password": "Changed password",
  "admin.user_created": "Created a user",
  "admin.user_activated": "Activated a user",
  "admin.user_deactivated": "Deactivated a user",
  "admin.user_role_changed": "Changed a user's role",
  "client.created": "Created a client",
  "client.updated": "Updated a client",
  "project.created": "Created a project",
  "project.updated": "Updated a project",
  "project.member_added": "Added a project member",
  "project.member_removed": "Removed a project member",
  "document.uploaded": "Uploaded a document",
  "document.viewed": "Viewed a document",
  "document.downloaded": "Downloaded a document",
  "share.created": "Created a share link",
  "share.revoked": "Revoked a share link",
  "share.opened": "Opened via share link",
  "share.downloaded": "Downloaded via share link",
  "folder_share.created": "Created a folder share link",
  "folder_share.revoked": "Revoked a folder share link",
  "folder_share.opened": "Opened a shared folder",
  "folder_share.downloaded": "Downloaded from a shared folder",
  "course.created": "Created a course",
  "course.updated": "Updated a course",
  "course.published": "Published a course",
  "course.unpublished": "Unpublished a course",
  "course.deleted": "Deleted a course",
  "course.enrolled": "Enrolled in a course",
  "course.completed": "Completed a course",
  "lesson.created": "Added a lesson",
  "lesson.updated": "Updated a lesson",
  "lesson.deleted": "Deleted a lesson",
  "lesson_file.uploaded": "Uploaded a lesson PDF",
  "lesson_file.deleted": "Deleted a lesson PDF",
};

/** Minimal shape of a next-intl translator (from useTranslations/getTranslations). */
type Translator = ((key: string) => string) & { has: (key: string) => boolean };

/** Translate an action code via the "Activity" message namespace. Action codes
 *  use dots (next-intl's key separator), so they map to underscore keys. */
export function labelForAction(t: Translator, action: string): string {
  const key = action.replace(/\./g, "_");
  return t.has(key) ? t(key) : action;
}

/** Actions offered in the admin activity filter, in a sensible order. */
export const FILTERABLE_ACTIONS = Object.keys(ACTION_LABEL);
