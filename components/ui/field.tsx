import * as React from "react";
import { cn } from "@/lib/utils";
import { Input, Select, Textarea } from "@/components/ui/input";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium text-slate-700", className)}
      {...props}
    />
  );
}

type ControlProps = {
  id?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  "aria-describedby"?: string;
};

/** Children Field knows how to wire: native controls and the kit's wrappers. */
const CONTROL_TYPES: readonly unknown[] = ["input", "select", "textarea", Input, Select, Textarea];

function isControl(node: React.ReactNode): node is React.ReactElement<ControlProps> {
  return React.isValidElement(node) && CONTROL_TYPES.includes(node.type);
}

/**
 * Label + control + hint / error message stack.
 *
 * When the child is a single input, select or textarea (native or from
 * components/ui/input.tsx), Field wires up the accessibility itself:
 * - the label points at the control (the control gets an id when it has
 *   none, so call sites no longer need `htmlFor` + `id`);
 * - on error the control gets `aria-invalid` and is described by the error
 *   text; otherwise it is described by the hint.
 *
 * Any other child (a custom component, several controls) is rendered as is,
 * and `htmlFor` works as before.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const autoId = React.useId();
  const errorId = `${autoId}-error`;
  const hintId = `${autoId}-hint`;
  const messageId = error ? errorId : hint ? hintId : undefined;

  let control = children;
  let labelFor = htmlFor;
  if (isControl(children)) {
    const id = children.props.id ?? htmlFor ?? `${autoId}-control`;
    labelFor = id;
    const describedBy =
      [children.props["aria-describedby"], messageId].filter(Boolean).join(" ") || undefined;
    control = React.cloneElement(children, {
      id,
      "aria-invalid": error ? true : children.props["aria-invalid"],
      "aria-describedby": describedBy,
    });
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={labelFor}>{label}</Label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
