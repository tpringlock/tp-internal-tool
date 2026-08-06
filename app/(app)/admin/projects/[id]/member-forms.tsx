"use client";

import { useActionState, useRef, useEffect } from "react";
import { assignMember, unassignMember } from "@/app/actions/projects";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export interface Candidate {
  id: string;
  full_name: string;
}

export function AssignMemberForm({
  projectId,
  candidates,
}: {
  projectId: string;
  candidates: Candidate[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    assignMember,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Every active employee is already assigned to this project.
      </p>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <input type="hidden" name="project_id" value={projectId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Select name="user_id" defaultValue="" required>
            <option value="" disabled>
              Select an employee…
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add member"}
        </Button>
      </div>
    </form>
  );
}

export function RemoveMemberButton({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) {
  return (
    <form action={unassignMember}>
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="user_id" value={userId} />
      <Button type="submit" variant="danger" size="sm">
        Remove
      </Button>
    </form>
  );
}
