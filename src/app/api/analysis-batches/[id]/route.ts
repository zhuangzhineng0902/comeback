import { NextResponse } from "next/server";

import { getAnalysisBatchView } from "@/lib/analysis/jobs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getAnalysisBatchView(id);

  if (!view) {
    return NextResponse.json({ error: "处理批次不存在。" }, { status: 404 });
  }

  return NextResponse.json(view);
}
