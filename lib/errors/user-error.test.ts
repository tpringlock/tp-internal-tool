import { describe, expect, it } from "vitest";
import { classifyError } from "./user-error";

describe("classifyError", () => {
  it("hides native Postgres / PostgREST text", () => {
    expect(
      classifyError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "clients_code_key"',
      }),
    ).toEqual({ kind: "unique" });
    expect(
      classifyError({
        code: "23503",
        message:
          'update or delete on table "clients" violates foreign key constraint "projects_client_id_fkey" on table "projects"',
      }),
    ).toEqual({ kind: "in_use" });
    expect(
      classifyError({
        code: "42501",
        message: 'new row violates row-level security policy for table "documents"',
      }),
    ).toEqual({ kind: "forbidden" });
    expect(classifyError({ code: "42501", message: "permission denied for table user_emails" })).toEqual({
      kind: "forbidden",
    });
    expect(
      classifyError({ code: "23502", message: 'null value in column "name" of relation "clients" violates not-null constraint' }),
    ).toEqual({ kind: "invalid" });
    expect(classifyError({ code: "22P02", message: 'invalid input syntax for type uuid: "abc"' })).toEqual({
      kind: "invalid",
    });
    expect(
      classifyError({ code: "23514", message: 'new row for relation "x" violates check constraint "x_vat_check"' }),
    ).toEqual({ kind: "invalid" });
  });

  it("never returns the raw text for those", () => {
    for (const message of [
      'duplicate key value violates unique constraint "clients_code_key"',
      'violates foreign key constraint "projects_client_id_fkey"',
      "new row violates row-level security policy",
    ]) {
      expect(classifyError({ message }).message).toBeUndefined();
    }
  });

  it("passes our own raise-exception texts through", () => {
    expect(classifyError({ code: "P0001", message: "Bản tính đã hủy, không thể sửa." })).toEqual({
      kind: "passthrough",
      message: "Bản tính đã hủy, không thể sửa.",
    });
    // Raised with a custom errcode but still written for the user.
    expect(classifyError({ code: "42501", message: "Chỉ kế toán hoặc admin mới được lưu bảng giá." })).toEqual({
      kind: "passthrough",
      message: "Chỉ kế toán hoặc admin mới được lưu bảng giá.",
    });
    expect(classifyError({ code: "23514", message: "0037: billing_price_lines đã có dữ liệu. Dừng để không chép trùng." }).kind).toBe(
      "passthrough",
    );
    // P0001 in English is still a deliberate message.
    expect(classifyError({ code: "P0001", message: "Only admins may change role or active status" }).kind).toBe(
      "passthrough",
    );
  });

  it("maps codes when the message is not recognised", () => {
    expect(classifyError({ code: "23505", message: "something new" })).toEqual({ kind: "unique" });
    expect(classifyError({ code: "PGRST301", message: "JWT expired" })).toEqual({ kind: "forbidden" });
  });

  it("recognises Supabase Auth errors", () => {
    expect(classifyError({ code: "same_password", message: "New password should be different from the old password.", status: 422 }).kind).toBe(
      "auth_same_password",
    );
    expect(classifyError({ message: "New password should be different from the old password." }).kind).toBe(
      "auth_same_password",
    );
    expect(classifyError({ code: "weak_password", message: "Password should be at least 8 characters." }).kind).toBe(
      "auth_weak_password",
    );
    expect(classifyError({ code: "email_exists", message: "A user with this email address has already been registered" }).kind).toBe(
      "auth_email_exists",
    );
    expect(classifyError({ message: "A user with this email address has already been registered" }).kind).toBe(
      "auth_email_exists",
    );
    expect(classifyError({ status: 429, message: "For security purposes, you can only request this after 30 seconds." }).kind).toBe(
      "auth_rate_limit",
    );
  });

  it("falls back to unknown, keeping the code for support", () => {
    expect(classifyError({ code: "XX000", message: "internal error" })).toEqual({ kind: "unknown", code: "XX000" });
    expect(classifyError({ message: "The resource already exists" })).toEqual({ kind: "unknown", code: undefined });
    expect(classifyError({})).toEqual({ kind: "unknown", code: undefined });
    expect(classifyError(null)).toEqual({ kind: "unknown", code: undefined });
    expect(classifyError(undefined)).toEqual({ kind: "unknown", code: undefined });
  });
});
