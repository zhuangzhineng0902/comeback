import { NextResponse } from "next/server";

import { retryFailedAnalysisJobs } from "@/lib/analysis/jobs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let jobIds: string[] | undefined;

  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object" && Array.isArray((body as { jobIds?: unknown }).jobIds)) {
      jobIds = (body as { jobIds: unknown[] }).jobIds.filter((item): item is string => typeof item === "string");
    }
  } catch {
    jobIds = undefined;
  }

  const result = await retryFailedAnalysisJobs(id, jobIds);
  return NextResponse.json(result);
}
