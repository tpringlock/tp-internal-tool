import { getTranslations } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/", error } = await searchParams;
  const t = await getTranslations("Auth");

  return (
    <Card>
      <CardBody className="space-y-4">
        {error === "link" && <Alert tone="error">{t("linkInvalid")}</Alert>}
        <LoginForm next={next} />
      </CardBody>
    </Card>
  );
}
