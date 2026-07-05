import { NextResponse } from "next/server";

import { retryFailedAnalysisJobs } from "@/lib/analysis/jobs";
import { prisma } from "@/lib/db";

const STUDENT_ID = "default-student";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { jobIds?: unknown };
  const requestedJobIds = Array.isArray(body.jobIds)
    ? body.jobIds.filter((item): item is string => typeof item === "string" && item.length > 0)
    : undefined;

  const jobs = await prisma.analysisJob.findMany({
    where: {
      studentId: STUDENT_ID,
      status: "failed",
      ...(requestedJobIds?.length ? { id: { in: requestedJobIds } } : {})
    },
    select: { id: true, batchId: true }
  });

  if (jobs.length === 0) {
    return NextResponse.json({ retried: 0 });
  }

  const jobsByBatch = new Map<string, string[]>();
  for (const job of jobs) {
    const ids = jobsByBatch.get(job.batchId) ?? [];
    ids.push(job.id);
    jobsByBatch.set(job.batchId, ids);
  }

  let retried = 0;
  for (const [batchId, jobIds] of jobsByBatch) {
    const result = await retryFailedAnalysisJobs(batchId, jobIds);
    retried += result.retried;
  }

  return NextResponse.json({ retried });
}
