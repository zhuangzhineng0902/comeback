import { describe, expect, it } from "vitest";
import { calculateGapSeverity } from "@/lib/knowledge/severity";

describe("gap severity", () => {
  it("marks a repeated archetype as the highest priority", () => {
    expect(calculateGapSeverity({ errorCount: 2, repeatedArchetypeCount: 2 })).toBe("repeated_archetype");
  });

  it("marks three errors on one point as important", () => {
    expect(calculateGapSeverity({ errorCount: 3, repeatedArchetypeCount: 0 })).toBe("important");
  });

  it("marks two errors as weak", () => {
    expect(calculateGapSeverity({ errorCount: 2, repeatedArchetypeCount: 0 })).toBe("weak");
  });

  it("keeps one error as normal", () => {
    expect(calculateGapSeverity({ errorCount: 1, repeatedArchetypeCount: 0 })).toBe("normal");
  });
});
