"use client";

import * as React from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PdfFrame } from "@/components/ui/pdf-frame";
import { DownloadLink } from "@/components/ui/download-link";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";

type CourseDoc = { id: string; file_name: string; file_size: number };

/**
 * The sidebar/panel that toggles between the server-rendered "Course content"
 * tree (passed as children) and the course's PDF "Documents". Used on both the
 * course overview and the lesson viewer. The content tree stays a server
 * component; only the toggle + documents list live on the client.
 */
export function CourseContentPanel({
  documents,
  contentMeta,
  bodyClassName,
  children,
}: {
  documents: CourseDoc[];
  contentMeta?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("Academy");
  const [tab, setTab] = useState<"content" | "documents">("content");

  const tabButton = (key: "content" | "documents", label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        tab === key
          ? "bg-slate-100 text-slate-900"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
      )}
    >
      {label}
    </button>
  );

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {tabButton("content", t("courseContent"))}
          {tabButton("documents", t("documents"))}
        </div>
        {tab === "content" && contentMeta ? (
          <span className="text-xs text-slate-500">{contentMeta}</span>
        ) : null}
      </CardHeader>

      {tab === "content" ? (
        <CardBody className={bodyClassName ?? "p-0"}>{children}</CardBody>
      ) : (
        <CardBody className="space-y-4">
          {documents.length === 0 ? (
            <p className="text-sm text-slate-500">{t("noDocuments")}</p>
          ) : (
            documents.map((file) => (
              <div key={file.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <FileText
                      className="h-4 w-4 shrink-0 text-primary"
                      aria-hidden
                    />
                    <span className="font-medium">{file.file_name}</span>
                    <span className="text-xs text-slate-400">
                      {formatBytes(file.file_size)}
                    </span>
                  </div>
                  <DownloadLink
                    href={`/api/academy/course-files/${file.id}?dl=1`}
                    className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
                  >
                    {t("download")}
                  </DownloadLink>
                </div>
                <PdfFrame
                  src={`/api/academy/course-files/${file.id}`}
                  title={file.file_name}
                  className="h-[600px] w-full rounded-md border border-slate-200"
                />
              </div>
            ))
          )}
        </CardBody>
      )}
    </Card>
  );
}
