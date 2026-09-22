"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { MISA_ENDPOINTS, findMisaEndpoint } from "@/lib/misa/endpoints";
import { misaConnect, misaRequest, type MisaResult } from "@/app/actions/misa";

type Connection = {
  token: string;
  tenantCode?: string;
  expiredTime?: string;
  appName?: string;
};

function pretty(data: unknown): string {
  if (typeof data === "string") return data;
  // MISA wraps the real payload in a stringified `Data` field. Unwrap it for a
  // readable view while keeping the rest of the envelope (Success, ErrorCode…).
  let view = data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const env = data as Record<string, unknown>;
    if (typeof env.Data === "string") {
      try {
        view = { ...env, Data: JSON.parse(env.Data) };
      } catch {
        // leave as-is if it isn't JSON
      }
    }
  }
  try {
    return JSON.stringify(view, null, 2);
  } catch {
    return String(data);
  }
}

/** Renders the HTTP status + raw upstream payload, or an app-level error. */
function ResultView({ result }: { result: MisaResult }) {
  const t = useTranslations("MisaTest");
  if (result.error) {
    return <Alert tone="error">{result.error}</Alert>;
  }
  const success =
    (result.data as { Success?: boolean } | null)?.Success ?? undefined;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={
            result.ok
              ? "rounded-md bg-green-50 px-2 py-1 font-medium text-green-700"
              : "rounded-md bg-red-50 px-2 py-1 font-medium text-red-700"
          }
        >
          {t("status")}: {result.status}
        </span>
        {success !== undefined && (
          <span
            className={
              success
                ? "rounded-md bg-green-50 px-2 py-1 font-medium text-green-700"
                : "rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-700"
            }
          >
            Success: {String(success)}
          </span>
        )}
      </div>
      <pre className="max-h-96 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
        {pretty(result.data)}
      </pre>
    </div>
  );
}

export function MisaPlayground() {
  const t = useTranslations("MisaTest");

  const [accessCode, setAccessCode] = useState("");
  const [orgCompanyCode, setOrgCompanyCode] = useState("");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [connectResult, setConnectResult] = useState<MisaResult | null>(null);
  const [connecting, startConnect] = useTransition();

  const [selected, setSelected] = useState(MISA_ENDPOINTS[0].value);
  const [body, setBody] = useState(MISA_ENDPOINTS[0].bodyTemplate);
  const [requestResult, setRequestResult] = useState<MisaResult | null>(null);
  const [sending, startSend] = useTransition();

  const endpoint = findMisaEndpoint(selected) ?? MISA_ENDPOINTS[0];

  function handleConnect() {
    startConnect(async () => {
      const res = await misaConnect(accessCode, orgCompanyCode);
      setConnectResult(res);
      if (res.token) {
        setConnection({
          token: res.token,
          tenantCode: res.tenantCode,
          expiredTime: res.expiredTime,
          appName: res.appName,
        });
      }
    });
  }

  function handleEndpointChange(value: string) {
    setSelected(value);
    const next = findMisaEndpoint(value);
    if (next) setBody(next.bodyTemplate);
    setRequestResult(null);
  }

  function handleSend() {
    if (!connection) return;
    startSend(async () => {
      const res = await misaRequest(
        endpoint.path,
        endpoint.method,
        connection.token,
        body,
      );
      setRequestResult(res);
    });
  }

  return (
    <div className="space-y-6">
      {/* Connect */}
      <Card>
        <CardHeader>
          <CardTitle>{t("connectTitle")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Alert tone="info">{t("appIdNote")}</Alert>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("accessCode")} htmlFor="access_code" hint={t("accessCodeHint")}>
              <Input
                id="access_code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label={t("orgCompanyCode")} htmlFor="org_company_code">
              <Input
                id="org_company_code"
                value={orgCompanyCode}
                onChange={(e) => setOrgCompanyCode(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>
          <Button
            onClick={handleConnect}
            loading={connecting}
            disabled={!accessCode.trim() || !orgCompanyCode.trim()}
          >
            {t("getToken")}
          </Button>

          {connection && (
            <div className="space-y-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <p className="font-medium">{t("connected")}</p>
              <dl className="grid gap-1 text-xs sm:grid-cols-2">
                {connection.appName && (
                  <div className="sm:col-span-2">
                    <dt className="inline font-medium">app_name: </dt>
                    <dd className="inline break-all">{connection.appName}</dd>
                  </div>
                )}
                {connection.tenantCode && (
                  <div>
                    <dt className="inline font-medium">tenant_code: </dt>
                    <dd className="inline break-all">{connection.tenantCode}</dd>
                  </div>
                )}
                {connection.expiredTime && (
                  <div>
                    <dt className="inline font-medium">expired_time: </dt>
                    <dd className="inline break-all">{connection.expiredTime}</dd>
                  </div>
                )}
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowToken((v) => !v)}
                >
                  {showToken ? t("hideToken") : t("showToken")}
                </Button>
                {showToken && (
                  <code className="break-all rounded bg-white px-2 py-1 text-[11px] text-slate-700">
                    {connection.token}
                  </code>
                )}
              </div>
            </div>
          )}

          {connectResult && !connection && <ResultView result={connectResult} />}
        </CardBody>
      </Card>

      {/* Request */}
      <Card>
        <CardHeader>
          <CardTitle>{t("requestTitle")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {!connection && <Alert tone="info">{t("needToken")}</Alert>}
          <Field label={t("endpoint")} htmlFor="endpoint">
            <Select
              id="endpoint"
              value={selected}
              onChange={(e) => handleEndpointChange(e.target.value)}
            >
              {MISA_ENDPOINTS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.value} — {e.label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-slate-500">
            <span className="font-medium">{t("method")}:</span> {endpoint.method}
            {"  ·  "}
            <span className="font-medium">Path:</span>{" "}
            <code className="break-all">{endpoint.path}</code>
          </p>
          <Field label={t("body")} htmlFor="body">
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              spellCheck={false}
              className="font-mono"
            />
          </Field>
          <Button
            onClick={handleSend}
            loading={sending}
            disabled={!connection}
          >
            {t("send")}
          </Button>
        </CardBody>
      </Card>

      {/* Response */}
      {requestResult && (
        <Card>
          <CardHeader>
            <CardTitle>{t("responseTitle")}</CardTitle>
          </CardHeader>
          <CardBody>
            <ResultView result={requestResult} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
