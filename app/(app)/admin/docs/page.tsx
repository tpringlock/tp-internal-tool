import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/dal";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface Endpoint {
  method: HttpMethod;
  path: string;
  description: string;
  auth: string;
  params?: string;
  response: string;
}

interface ActionGroup {
  title: string;
  actions: { name: string; description: string }[];
}

// HTTP API route handlers under app/api/**. Descriptions are written in
// Vietnamese since the tool is Vietnamese-only.
const endpoints: Endpoint[] = [
  {
    method: "GET",
    path: "/api/documents/[id]",
    description: "Trả về (stream) tệp PDF tài liệu của người dùng.",
    auth: "Đăng nhập + RLS",
    params: "?dl=1 để tải xuống",
    response: "PDF stream",
  },
  {
    method: "GET",
    path: "/api/documents/search",
    description: "Gợi ý tìm kiếm theo tên tệp (tối đa 8 kết quả).",
    auth: "Đăng nhập",
    params: "?q=<từ khóa>",
    response: "JSON",
  },
  {
    method: "GET",
    path: "/api/share/[token]",
    description: "Công khai: trả về PDF tài liệu được chia sẻ qua token.",
    auth: "Token chia sẻ",
    response: "PDF stream",
  },
  {
    method: "GET",
    path: "/api/share/folder/[token]",
    description: "Công khai: trả về tài liệu trong thư mục khách được chia sẻ.",
    auth: "Token chia sẻ",
    params: "?doc=<id>",
    response: "PDF stream",
  },
  {
    method: "GET",
    path: "/api/academy/files/[id]",
    description: "Trả về tệp PDF đính kèm của bài học.",
    auth: "Đăng nhập + RLS",
    params: "?dl=1 để tải xuống",
    response: "PDF stream",
  },
  {
    method: "GET",
    path: "/api/academy/course-files/[id]",
    description: "Trả về tệp PDF cấp khóa học.",
    auth: "Đăng nhập + RLS",
    params: "?dl=1 để tải xuống",
    response: "PDF stream",
  },
  {
    method: "GET",
    path: "/api/academy/thumbnails/[courseId]",
    description: "Trả về ảnh thumbnail của khóa học (cache 5 phút).",
    auth: "Đăng nhập + RLS",
    response: "Image stream",
  },
  {
    method: "GET",
    path: "/api/academy/videos/[lessonId]",
    description:
      "Chuyển hướng tới URL video đã ký; hỗ trợ HTTP Range để tua video.",
    auth: "Đăng nhập + RLS",
    params: "Range header",
    response: "302 Redirect",
  },
];

// Server actions grouped by domain — the app's mutations run through these
// rather than REST endpoints.
const actionGroups: ActionGroup[] = [
  {
    title: "Người dùng — app/actions/users.ts",
    actions: [
      { name: "createUser", description: "Tạo tài khoản người dùng (admin)." },
      { name: "setUserActive", description: "Kích hoạt / vô hiệu hóa người dùng." },
      { name: "setUserRole", description: "Đổi vai trò người dùng." },
      { name: "deleteUser", description: "Xóa vĩnh viễn người dùng (admin)." },
    ],
  },
  {
    title: "Học viện — app/actions/academy.ts",
    actions: [
      { name: "createCourse / updateCourse / deleteCourse", description: "Quản lý khóa học." },
      { name: "publishCourse", description: "Bật/tắt trạng thái xuất bản khóa học." },
      { name: "addLesson / updateLesson / deleteLesson / reorderLesson", description: "Quản lý bài học." },
      { name: "uploadLessonFile / deleteLessonFile", description: "Đính kèm PDF cho bài học." },
      { name: "createLessonVideoUploadUrl / finalizeLessonVideo / removeLessonVideo", description: "Tải lên và quản lý video bài học." },
      { name: "addChapter / updateChapter / deleteChapter / reorderChapter", description: "Quản lý chương." },
      { name: "addQuizQuestion / updateQuizQuestion / deleteQuizQuestion / reorderQuizQuestion", description: "Quản lý câu hỏi trắc nghiệm." },
      { name: "enrollAndStart / toggleLessonComplete / submitChapterQuiz / saveLessonNote", description: "Tương tác của học viên." },
    ],
  },
  {
    title: "Dự án & Khách hàng — app/actions/projects.ts, clients.ts",
    actions: [
      { name: "addProject / editProject", description: "Quản lý dự án." },
      { name: "assignMember / unassignMember", description: "Gán / gỡ thành viên khỏi dự án." },
      { name: "addClient / editClient", description: "Quản lý thư mục khách hàng." },
    ],
  },
  {
    title: "Chia sẻ — app/actions/shares.ts, folder-shares.ts",
    actions: [
      { name: "createShareLink / revokeShareLink", description: "Liên kết chia sẻ tài liệu có thời hạn." },
      { name: "createFolderShareLink / revokeFolderShareLink", description: "Liên kết chia sẻ thư mục khách hàng." },
    ],
  },
  {
    title: "Tài khoản & Xác thực — app/actions/profile.ts, auth.ts",
    actions: [
      { name: "updateProfile / changePassword", description: "Cập nhật hồ sơ và đổi mật khẩu." },
      { name: "login / logout / requestPasswordReset / updatePassword", description: "Xác thực và khôi phục mật khẩu." },
    ],
  },
];

const methodColors: Record<HttpMethod, string> = {
  GET: "bg-emerald-100 text-emerald-700",
  POST: "bg-blue-100 text-blue-700",
  PUT: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
};

export default async function ApiDocsPage() {
  await requireAdmin();
  const t = await getTranslations("ApiDocs");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">{t("title")}</h1>
        <p className="text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("endpointsTitle")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {endpoints.map((ep) => (
            <div
              key={ep.path}
              className="rounded-md border border-slate-200 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${methodColors[ep.method]}`}
                >
                  {ep.method}
                </span>
                <code className="font-mono text-sm text-slate-900">
                  {ep.path}
                </code>
              </div>
              <p className="mt-2 text-sm text-slate-600">{ep.description}</p>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-3">
                <div>
                  <dt className="font-medium text-slate-700">{t("auth")}</dt>
                  <dd>{ep.auth}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">{t("paramsLabel")}</dt>
                  <dd>{ep.params ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">{t("responseLabel")}</dt>
                  <dd>{ep.response}</dd>
                </div>
              </dl>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("actionsTitle")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <p className="text-sm text-slate-500">{t("actionsIntro")}</p>
          {actionGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-slate-800">
                {group.title}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {group.actions.map((a) => (
                  <li key={a.name} className="text-sm text-slate-600">
                    <code className="font-mono text-xs text-slate-900">
                      {a.name}
                    </code>{" "}
                    — {a.description}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
