import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { Card, CardBody } from "@/components/ui/card";

export default async function HomePage() {
  const user = await requireUser();
  const firstName = user.profile.full_name.split(" ")[0] || "there";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Welcome, {firstName}
        </h1>
        <p className="text-sm text-slate-500">Choose an application to open.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/documents" className="group">
          <Card className="h-full transition-colors group-hover:border-slate-300">
            <CardBody className="space-y-2">
              <div className="text-sm font-semibold text-slate-900">
                Document Management
              </div>
              <p className="text-sm text-slate-500">
                Upload, organise and share signed contracts and financial
                records for your projects.
              </p>
            </CardBody>
          </Card>
        </Link>

        <Card className="h-full opacity-60">
          <CardBody className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              Training
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                Coming soon
              </span>
            </div>
            <p className="text-sm text-slate-500">
              Internal employee training courses and progress tracking.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
