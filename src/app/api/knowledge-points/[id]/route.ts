import { NextResponse } from "next/server";

import { getKnowledgePointDetail } from "@/lib/knowledge/details";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getKnowledgePointDetail(id);

  if (!detail) {
    return NextResponse.json({ error: "知识点不存在。" }, { status: 404 });
  }

  return NextResponse.json({ detail });
}
