import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatKeeperIQ,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatSigned,
} from "@/lib/format";

describe("formatters", () => {
  it("formats missing values as dashes", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatKeeperIQ(undefined)).toBe("—");
    expect(formatPercent(null)).toBe("—");
    expect(formatMinutes(null)).toBe("—");
  });

  it("formats KeeperIQ with at most one decimal", () => {
    expect(formatKeeperIQ(90)).toBe("90");
    expect(formatKeeperIQ(90.5)).toBe("90.5");
  });

  it("formats signed rank changes", () => {
    expect(formatSigned(3, 0)).toBe("+3");
    expect(formatSigned(-2, 0)).toBe("−2");
    expect(formatSigned(0, 0)).toBe("0");
  });

  it("formats dates in UTC", () => {
    expect(formatDate("2026-07-23")).toContain("2026");
  });
});
