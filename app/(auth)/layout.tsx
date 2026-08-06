export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            Company Portal
          </h1>
          <p className="text-sm text-slate-500">Internal tools</p>
        </div>
        {children}
      </div>
    </div>
  );
}
