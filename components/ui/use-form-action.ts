"use client";

import * as React from "react";
import { requestFormReset } from "react-dom";
import { unstable_rethrow } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  isSuccessState,
  runFormAction,
  type BaseFormState,
} from "@/lib/forms/run-form-action";

export interface FormActionProps {
  /** Progressive enhancement: used only if the form is submitted before hydration. */
  action: (formData: FormData) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export interface UseFormActionOptions<S> {
  /**
   * Runs right after the action returned (not on a redirect), still inside the
   * action. Use it for what must not depend on this component staying mounted,
   * e.g. a toast after a delete that removes the row holding the button.
   */
  onResult?: (state: S) => void;
  /** Runs when the action redirected (it succeeded and navigates away). */
  onRedirect?: () => void;
  /**
   * Wording for a failed request, when the default ("what you typed is
   * still here") does not fit, e.g. a form that is only a button.
   */
  failureMessages?: { offline: string; failed: string };
}

/**
 * Drop-in for `useActionState` on a `<form>`:
 *
 *   const [state, formProps, pending] = useFormAction(saveThing, {});
 *   <form {...formProps}> … </form>
 *
 * What it changes compared with `<form action={action}>`:
 *
 * 1. Typed values survive an error. React 19 resets every uncontrolled field
 *    of a form whose `action` is a function, as soon as the action settles,
 *    whatever it returned (react-dom: startHostTransition → requestFormReset).
 *    Here the submit is dispatched from `onSubmit` instead, so React does not
 *    reset; the form is reset explicitly only when the action succeeded,
 *    which keeps the previous behaviour on success. A chosen file is kept
 *    too.
 * 2. A failed request (offline, dropped connection, 500) becomes
 *    `state.error` instead of replacing the page with the error boundary.
 * 3. After field errors, focus moves to the first invalid field (Field sets
 *    `aria-invalid`).
 *
 * Redirects from the action still navigate.
 */
export function useFormAction<S extends BaseFormState>(
  action: (prev: S, formData: FormData) => Promise<S>,
  initialState: S,
  options: UseFormActionOptions<S> = {},
): [state: S, formProps: FormActionProps, pending: boolean] {
  const t = useTranslations("Errors");
  const formRef = React.useRef<HTMLFormElement | null>(null);
  // Latest callbacks and messages without re-creating the action function.
  const latest = React.useRef({ action, options, offline: t("offline"), failed: t("actionFailed") });
  React.useEffect(() => {
    latest.current = { action, options, offline: t("offline"), failed: t("actionFailed") };
  });

  const run = async (prev: Awaited<S>, formData: FormData): Promise<S> => {
    const current = latest.current;
    const next = await runFormAction(current.action, prev as S, formData, {
      rethrow: unstable_rethrow,
      isOnline: () => typeof navigator === "undefined" || navigator.onLine,
      messages: current.options.failureMessages ?? { offline: current.offline, failed: current.failed },
      onRedirect: current.options.onRedirect,
    });
    const form = formRef.current;
    // Same as React's own reset after a form action, but only on success.
    if (isSuccessState(next) && form?.isConnected) requestFormReset(form);
    current.options.onResult?.(next);
    return next;
  };
  const [state, dispatch, pending] = React.useActionState<S, FormData>(
    run,
    initialState as Awaited<S>,
  );

  // Move focus to the first invalid field once the errors are on screen.
  React.useEffect(() => {
    if (!state.fieldErrors || Object.keys(state.fieldErrors).length === 0) return;
    const form = formRef.current;
    if (!form?.isConnected) return;
    form.querySelector<HTMLElement>('[aria-invalid="true"]:not([disabled])')?.focus();
  }, [state]);

  // A second submit while one is running (Enter pressed twice) is ignored;
  // useActionState would otherwise queue it and send the form again.
  const pendingRef = React.useRef(false);
  React.useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const onSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      // Take over from React's form-action handling (which would reset the form).
      event.preventDefault();
      if (pendingRef.current) return;
      pendingRef.current = true;
      const form = event.currentTarget;
      formRef.current = form;
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      const formData = new FormData(form, submitter);
      React.startTransition(() => dispatch(formData));
    },
    [dispatch],
  );

  return [state, { action: dispatch, onSubmit }, pending];
}

export interface UseActionCallOptions {
  /**
   * A failed request normally keeps the previous state and adds `error`.
   * With this, the state becomes just `{ error }`: for a preview / check
   * step, whose previous result belongs to another file.
   */
  resetOnFailure?: boolean;
  /** Runs when the request failed (offline, dropped connection, server error). */
  onFailure?: (formData: FormData) => void;
}

/**
 * `useActionState` for an action that is called from code instead of a form
 * submit (multi-step uploads: choose a file -> the server checks it ->
 * confirm):
 *
 *   const [state, call, pending] = useActionCall(inspectFiles, {});
 *   call(formData);
 *
 * Same failure handling as useFormAction: a request that throws becomes
 * `state.error` instead of the route error page, and a redirect still
 * navigates. `call` starts its own transition.
 */
export function useActionCall<S extends BaseFormState>(
  action: (prev: S, formData: FormData) => Promise<S>,
  initialState: S,
  options: UseActionCallOptions = {},
): [state: S, call: (formData: FormData) => void, pending: boolean] {
  const t = useTranslations("Errors");
  const latest = React.useRef({ action, options, offline: t("offline"), failed: t("actionFailed") });
  React.useEffect(() => {
    latest.current = { action, options, offline: t("offline"), failed: t("actionFailed") };
  });

  const run = async (prev: Awaited<S>, formData: FormData): Promise<S> => {
    const current = latest.current;
    let failed = false;
    const next = await runFormAction(current.action, prev as S, formData, {
      rethrow: unstable_rethrow,
      isOnline: () => typeof navigator === "undefined" || navigator.onLine,
      messages: { offline: current.offline, failed: current.failed },
      onFailure: () => {
        failed = true;
      },
    });
    if (!failed) return next;
    current.options.onFailure?.(formData);
    return current.options.resetOnFailure ? ({ error: next.error } as S) : next;
  };
  const [state, dispatch, pending] = React.useActionState<S, FormData>(
    run,
    initialState as Awaited<S>,
  );
  const call = React.useCallback(
    (formData: FormData) => React.startTransition(() => dispatch(formData)),
    [dispatch],
  );
  return [state, call, pending];
}

/**
 * For client flows that call server actions or Storage themselves, in
 * several steps (video upload, add lesson with a video, note auto-save):
 * the same failure wording as useFormAction.
 *
 *   const failureMessage = useActionFailureMessage();
 *   try { … } catch (error) { setError(failureMessage(error)); }
 *
 * Next's redirect / notFound errors are rethrown; anything else is logged in
 * the browser console and becomes the offline or generic message, never the
 * raw text ("Failed to fetch", "An unexpected response was received…").
 */
export function useActionFailureMessage(): (error: unknown) => string {
  const t = useTranslations("Errors");
  return React.useCallback(
    (error: unknown) => {
      unstable_rethrow(error);
      console.error(error);
      const online = typeof navigator === "undefined" || navigator.onLine;
      return online ? t("actionFailed") : t("offline");
    },
    [t],
  );
}
