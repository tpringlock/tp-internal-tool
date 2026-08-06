import { requireUser } from "@/lib/auth/dal";
import { Card, CardBody } from "@/components/ui/card";

export default async function DocumentsPage() {
  await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Documents</h1>
        <p className="text-sm text-slate-500">
          Contracts and financial records for your projects.
        </p>
      </div>

      <Card>
        <CardBody className="text-sm text-slate-500">
          The document management tool is being built. Uploading, sharing and
          the project repositories arrive in the next phase.
        </CardBody>
      </Card>
    </div>
  );
}
