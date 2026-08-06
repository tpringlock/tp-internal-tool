import { requireUser } from "@/lib/auth/dal";
import {
  ProfileDetailsForm,
  ChangePasswordForm,
} from "./profile-forms";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Profile</h1>
        <p className="text-sm text-slate-500">
          Manage your personal details and password.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileDetailsForm
          email={user.email ?? ""}
          fullName={user.profile.full_name}
        />
        <ChangePasswordForm />
      </div>
    </div>
  );
}
