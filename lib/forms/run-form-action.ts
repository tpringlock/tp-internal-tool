/**
 * Pure core of components/ui/use-form-action.ts: run a server action for a
 * form and turn a thrown failure into an error state, so the form stays on
 * screen with what the user typed instead of the route error page.
 *
 * Kept free of React and Next imports so it can be unit-tested.
 */

/** The fields every form state in this app shares (see app/actions/auth.ts). */
export interface BaseFormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[]>;
}

export interface RunFormActionDeps {
  /**
   * Must throw for errors the framework uses for control flow (redirect,
   * notFound): `unstable_rethrow` from next/navigation. Called first.
   */
  rethrow: (error: unknown) => void;
  /** `navigator.onLine`. */
  isOnline: () => boolean;
  messages: { offline: string; failed: string };
  /** Called when the action redirected, i.e. succeeded and navigates away. */
  onRedirect?: () => void;
}

/** A Next.js redirect thrown by a server action that called redirect(). */
export function isRedirectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/** No error and no field errors: the action did what was asked. */
export function isSuccessState(state: BaseFormState | null | undefined): boolean {
  if (!state) return false;
  if (state.error) return false;
  return !state.fieldErrors || Object.keys(state.fieldErrors).length === 0;
}

/**
 * Run `action(prev, formData)`.
 *
 * - Its result is returned untouched.
 * - A redirect is passed on (after `onRedirect`), so navigation still works.
 * - Anything else that throws (the request never left the browser, the
 *   connection dropped, the server answered with a 500) becomes
 *   `{ ...prev, error }` with success/field errors cleared, so the other
 *   fields of a richer state keep their shape.
 */
export async function runFormAction<S extends BaseFormState>(
  action: (prev: S, formData: FormData) => Promise<S>,
  prev: S,
  formData: FormData,
  deps: RunFormActionDeps,
): Promise<S> {
  try {
    return await action(prev, formData);
  } catch (error) {
    if (isRedirectError(error)) deps.onRedirect?.();
    deps.rethrow(error);
    return {
      ...prev,
      success: undefined,
      fieldErrors: undefined,
      error: deps.isOnline() ? deps.messages.failed : deps.messages.offline,
    };
  }
}
