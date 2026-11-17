import { describe, expect, it, vi } from "vitest";
import { unstable_rethrow } from "next/navigation";
import {
  isRedirectError,
  isSuccessState,
  runFormAction,
  type BaseFormState,
  type RunFormActionDeps,
} from "./run-form-action";

const messages = { offline: "OFFLINE", failed: "FAILED" };
const deps = (over: Partial<RunFormActionDeps> = {}): RunFormActionDeps => ({
  // The real Next helper: this is what the hook passes in.
  rethrow: unstable_rethrow,
  isOnline: () => true,
  messages,
  ...over,
});
const fd = () => new FormData();

/** What a server action's redirect() looks like on the client. */
function redirectError(to = "/documents") {
  return Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;push;${to};307;` });
}

describe("runFormAction", () => {
  it("returns the action's state untouched", async () => {
    const state = { fieldErrors: { code: ["bad"] } };
    const action = vi.fn(async () => state);
    const prev = {};
    const data = fd();
    expect(await runFormAction(action, prev, data, deps())).toBe(state);
    expect(action).toHaveBeenCalledWith(prev, data);
  });

  it("turns a network failure into an error state instead of throwing", async () => {
    const action = async (): Promise<BaseFormState> => {
      throw new TypeError("Failed to fetch");
    };
    expect(await runFormAction(action, {}, fd(), deps({ isOnline: () => false }))).toEqual({
      error: "OFFLINE",
      success: undefined,
      fieldErrors: undefined,
    });
  });

  it("uses the generic message when the browser is online (server error, dropped connection)", async () => {
    const action = async (): Promise<BaseFormState> => {
      throw new Error("An unexpected response was received from the server.");
    };
    expect((await runFormAction(action, {}, fd(), deps())).error).toBe("FAILED");
  });

  it("keeps the other fields of a richer state and clears stale success / field errors", async () => {
    interface Rich extends BaseFormState {
      contractId?: string;
      rows: number[];
    }
    const prev: Rich = { contractId: "c1", rows: [1, 2], success: "old", fieldErrors: { a: ["x"] } };
    const action = async (): Promise<Rich> => {
      throw new TypeError("Load failed");
    };
    expect(await runFormAction(action, prev, fd(), deps())).toEqual({
      contractId: "c1",
      rows: [1, 2],
      success: undefined,
      fieldErrors: undefined,
      error: "FAILED",
    });
  });

  it("lets a redirect through so the navigation still happens", async () => {
    const error = redirectError("/billing/calculations/1");
    const onRedirect = vi.fn();
    const action = async (): Promise<BaseFormState> => {
      throw error;
    };
    await expect(runFormAction(action, {}, fd(), deps({ onRedirect }))).rejects.toBe(error);
    expect(onRedirect).toHaveBeenCalledTimes(1);
  });

  it("lets through the exact error Next rejects a redirecting server action with", async () => {
    // server-action-reducer.js: getRedirectError(href, type) + handled = true.
    const { getRedirectError } = await import("next/dist/client/components/redirect");
    for (const type of ["push", "replace"] as const) {
      const error = Object.assign(getRedirectError("/documents?client=1", type as never), { handled: true });
      const onRedirect = vi.fn();
      const onFailure = vi.fn();
      const action = async (): Promise<BaseFormState> => {
        throw error;
      };
      await expect(runFormAction(action, { error: "old" }, fd(), deps({ onRedirect, onFailure }))).rejects.toBe(error);
      expect(onRedirect).toHaveBeenCalledTimes(1);
      // Never reported as a failed request (no error message, no toast).
      expect(onFailure).not.toHaveBeenCalled();
    }
  });

  it("reports a thrown failure through onFailure", async () => {
    const onFailure = vi.fn();
    const failure = new TypeError("Failed to fetch");
    const action = async (): Promise<BaseFormState> => {
      throw failure;
    };
    await runFormAction(action, {}, fd(), deps({ onFailure }));
    expect(onFailure).toHaveBeenCalledWith(failure);
  });

  it("does not call onRedirect for other failures", async () => {
    const onRedirect = vi.fn();
    const action = async (): Promise<BaseFormState> => {
      throw new TypeError("Failed to fetch");
    };
    await runFormAction(action, {}, fd(), deps({ onRedirect }));
    expect(onRedirect).not.toHaveBeenCalled();
  });

  it("lets notFound() through as well", async () => {
    const error = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    const action = async (): Promise<BaseFormState> => {
      throw error;
    };
    await expect(runFormAction(action, {}, fd(), deps())).rejects.toBe(error);
  });
});

describe("isRedirectError", () => {
  it("recognises only Next redirect errors", () => {
    expect(isRedirectError(redirectError())).toBe(true);
    expect(isRedirectError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isRedirectError({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })).toBe(false);
    expect(isRedirectError({ digest: 42 })).toBe(false);
    expect(isRedirectError(null)).toBe(false);
    expect(isRedirectError("NEXT_REDIRECT")).toBe(false);
  });
});

describe("isSuccessState", () => {
  it("is true only without an error and without field errors", () => {
    expect(isSuccessState({})).toBe(true);
    expect(isSuccessState({ success: "Đã lưu" })).toBe(true);
    expect(isSuccessState({ fieldErrors: {} })).toBe(true);
    expect(isSuccessState({ error: "x" })).toBe(false);
    expect(isSuccessState({ fieldErrors: { name: ["bắt buộc"] } })).toBe(false);
    expect(isSuccessState({ success: "ok", error: "x" })).toBe(false);
    expect(isSuccessState(undefined)).toBe(false);
    expect(isSuccessState(null)).toBe(false);
  });
});
