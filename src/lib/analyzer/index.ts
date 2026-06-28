import { analyzeWithMiniMax } from "@/lib/analyzer/minimax";
import { analyzeWithSimulation, type AnalyzeInput } from "@/lib/analyzer/simulated";
import type { AnalysisOutput } from "@/lib/types";

export async function analyzeMistake(input: AnalyzeInput): Promise<{ mode: "api" | "simulation"; analysis: AnalysisOutput }> {
  if (process.env.MINIMAX_API_KEY && input.imageBase64 && input.mimeType) {
    return { mode: "api", analysis: await analyzeWithMiniMax(input) };
  }

  return { mode: "simulation", analysis: await analyzeWithSimulation(input) };
}
