import { describe, expect, it } from "vitest";
import { normalizeRhuReportCategory } from "./rhuReporting.js";

describe("normalizeRhuReportCategory", () => {
  it("defaults missing and unknown to overview", () => {
    expect(normalizeRhuReportCategory(null)).toBe("overview");
    expect(normalizeRhuReportCategory("nope")).toBe("overview");
  });

  it("maps aliases and slugs", () => {
    expect(normalizeRhuReportCategory("all")).toBe("overview");
    expect(normalizeRhuReportCategory("patient-visits")).toBe("patient_visits");
    expect(normalizeRhuReportCategory("referral-reports")).toBe("referrals");
    expect(normalizeRhuReportCategory("family_planning")).toBe("family_planning");
  });
});
