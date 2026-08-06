import { describe, it, expect } from "vitest";
import { buildCanonicalName, buildStoragePath } from "./naming";

const date = new Date("2026-08-06T10:30:00Z");

describe("buildCanonicalName", () => {
  it("joins client, type and project with the date and a disambiguator", () => {
    expect(
      buildCanonicalName({
        clientName: "Acme Corp",
        projectName: "Tower A",
        docType: "contract",
        date,
        disambiguator: "ab12",
      }),
    ).toBe("Acme Corp_Contract_Tower A_20260806_ab12.pdf");
  });

  it("maps multi-word document types to a single filename token", () => {
    expect(
      buildCanonicalName({
        clientName: "Acme",
        projectName: "P1",
        docType: "payment_record",
        date,
        disambiguator: "zz99",
      }),
    ).toBe("Acme_PaymentRecord_P1_20260806_zz99.pdf");
  });

  it("replaces underscores in names so segment delimiters stay unambiguous", () => {
    expect(
      buildCanonicalName({
        clientName: "A_B Co",
        projectName: "P_1",
        docType: "invoice",
        date,
        disambiguator: "c3d4",
      }),
    ).toBe("A-B Co_Invoice_P-1_20260806_c3d4.pdf");
  });

  it("removes characters that are illegal in filenames", () => {
    expect(
      buildCanonicalName({
        clientName: 'Acme/Corp:*?"<>|',
        projectName: "Tower A",
        docType: "contract",
        date,
        disambiguator: "ab12",
      }),
    ).toBe("AcmeCorp_Contract_Tower A_20260806_ab12.pdf");
  });

  it("trims and collapses internal whitespace", () => {
    expect(
      buildCanonicalName({
        clientName: "  Acme   Corp  ",
        projectName: "Tower   A",
        docType: "contract",
        date,
        disambiguator: "ab12",
      }),
    ).toBe("Acme Corp_Contract_Tower A_20260806_ab12.pdf");
  });
});

describe("buildStoragePath", () => {
  it("namespaces the file under its project id with a .pdf extension", () => {
    expect(buildStoragePath("proj-123", "file-abc")).toBe(
      "proj-123/file-abc.pdf",
    );
  });
});
