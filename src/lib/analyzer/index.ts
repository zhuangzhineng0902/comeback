import { analyzeWithSimulation, type AnalyzeInput } from "@/lib/analyzer/simulated";
import type { AnalysisOutput } from "@/lib/types";

export async function analyzeMistake(input: AnalyzeInput): Promise<{ mode: "api" | "simulation"; analysis: AnalysisOutput }> {
  if (!process.env.OPENAI_API_KEY) {
    return { mode: "simulation", analysis: await analyzeWithSimulation(input) };
  }

  return { mode: "simulation", analysis: await analyzeWithSimulation(input) };
}
