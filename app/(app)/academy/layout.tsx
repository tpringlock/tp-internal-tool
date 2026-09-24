import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { canManageContent } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceContent } from "@/components/workspace-content";
import { AcademyNav, type AcademyCategory } from "./academy-nav";

/**
 * TP Academy workspace shell: library/category sidebar + content. Course and
 * lesson pages hide the sidebar (they have their own course outline).
 */
export default async function AcademyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: courseRows }, { data: enrollRows }] = await Promise.all([
    supabase.from("courses").select("category").eq("status", "published"),
    // Inner join drops enrollments whose course is gone or no longer visible,
    // matching how getMyCourses counts them.
    supabase
      .from("course_enrollments")
      .select("completed_at, courses!inner ( id )")
      .eq("user_id", user.id),
  ]);

  const byCategory = new Map<string, number>();
  for (const row of courseRows ?? []) {
    if (row.category) {
      byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + 1);
    }
  }
  const categories: AcademyCategory[] = [...byCategory.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  const enrollments = (enrollRows ?? []) as { completed_at: string | null }[];
  const completed = enrollments.filter((e) => e.completed_at).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <Suspense>
        <AcademyNav
          categories={categories}
          totalCourses={courseRows?.length ?? 0}
          inProgress={enrollments.length - completed}
          completed={completed}
          canManage={canManageContent(user.profile.role)}
        />
      </Suspense>
      <WorkspaceContent>{children}</WorkspaceContent>
    </div>
  );
}
