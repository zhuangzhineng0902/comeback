import { analyzeWithMiniMax } from "@/lib/analyzer/minimax";
import { analyzeWithSimulation, type AnalyzeInput } from "@/lib/analyzer/simulated";
import type { AnalysisOutput } from "@/lib/types";

export async function analyzeMistake(input: AnalyzeInput): Promise<{ mode: "api" | "simulation"; analysis: AnalysisOutput; analyses: AnalysisOutput[] }> {
  if (process.env.MINIMAX_API_KEY && input.imageBase64 && input.mimeType) {
    const analyses = await analyzeWithMiniMax(input);
    return { mode: "api", analysis: analyses[0], analyses };
  }

  const analysis = await analyzeWithSimulation(input);
  return { mode: "simulation", analysis, analyses: [analysis] };
}
