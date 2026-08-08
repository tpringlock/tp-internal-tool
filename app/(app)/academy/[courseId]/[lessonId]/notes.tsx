"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { saveLessonNote } from "@/app/actions/academy";

type SaveStatus = "idle" | "saving" | "saved";

/**
 * A per-lesson private note with debounced auto-save. Each lesson has its own
 * note; the seed comes from the server. Saves ~800ms after the last keystroke
 * via the saveLessonNote server action and shows a subtle status.
 */
export function LessonNotes({
  courseId,
  lessonId,
  initialContent,
}: {
  courseId: string;
  lessonId: string;
  initialContent: string;
}) {
  const t = useTranslations("Academy");
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState<SaveStatus>("idle");
  // The last value we know is persisted, so we never save an unchanged note.
  const savedRef = useRef(initialContent);

  useEffect(() => {
    if (content === savedRef.current) return;
    setStatus("saving");
    const handle = setTimeout(async () => {
      const fd = new FormData();
      fd.set("lesson_id", lessonId);
      fd.set("course_id", courseId);
      fd.set("content", content);
      const result = await saveLessonNote({}, fd);
      if (result.success) {
        savedRef.current = content;
        setStatus("saved");
      } else {
        setStatus("idle");
      }
    }, 800);
    return () => clearTimeout(handle);
  }, [content, courseId, lessonId]);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>{t("notes")}</CardTitle>
        <span className="text-xs text-slate-400">
          {status === "saving"
            ? t("noteSaving")
            : status === "saved"
              ? t("noteSaved")
              : ""}
        </span>
      </CardHeader>
      <CardBody>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder={t("notesPlaceholder")}
        />
      </CardBody>
    </Card>
  );
}
