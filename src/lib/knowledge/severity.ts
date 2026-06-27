import type { GapSeverity } from "@/lib/types";

export type SeverityInput = {
  errorCount: number;
  repeatedArchetypeCount: number;
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
