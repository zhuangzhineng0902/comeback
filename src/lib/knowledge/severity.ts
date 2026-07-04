import type { GapSeverity } from "@/lib/types";

export type SeverityInput = {
  errorCount: number;
  repeatedArchetypeCount: number;
};

const GAP_SEVERITY_RANK: Record<GapSeverity, number> = {
  normal: 0,
  weak: 1,
  important: 2,
  repeated_archetype: 3
};

export function calculateGapSeverity(input: SeverityInput): GapSeverity {
  if (input.repeatedArchetypeCount >= 2) {
    return "repeated_archetype";
  }
  if (input.errorCount >= 3) {
    return "important";
  }
  if (input.errorCount >= 2) {
    return "weak";
  }
  return "normal";
}

export function getGapSeverityRank(severity: GapSeverity): number {
  return GAP_SEVERITY_RANK[severity];
}
