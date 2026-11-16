"use client";

import "./globals.css";

// Last-resort boundary: replaces the root layout, so there is no next-intl
// provider here and the text cannot use useTranslations. The app is
// Vietnamese-only (messages/vi.json is the only active locale), so it is
// written out directly.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">
            Đã xảy ra lỗi nghiêm trọng
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Ứng dụng không tải được. Vui lòng thử lại; nếu vẫn lỗi, hãy báo quản trị viên.
          </p>
          {error.digest && (
            <p className="mt-3 break-all font-mono text-xs text-slate-500">
              Mã lỗi: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Thử lại
          </button>
        </div>
      </body>
    </html>
  );
}
