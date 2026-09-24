/** Right-hand content column of a module workspace (next to its sidebar). */
export function WorkspaceContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1400px] space-y-6">{children}</div>
    </div>
  );
}
