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
};

export function labelForAction(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

/** Actions offered in the admin activity filter, in a sensible order. */
export const FILTERABLE_ACTIONS = Object.keys(ACTION_LABEL);
