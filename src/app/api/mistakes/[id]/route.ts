import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const mistake = await prisma.mistake.findUnique({
    where: { id },
    include: {
      tutorMessages: { orderBy: { createdAt: "asc" } },
      mistakeArchetypes: { include: { archetype: true } }
    }
  });

  if (!mistake) {
    return NextResponse.json({ error: "错题不存在。" }, { status: 404 });
  }

  return NextResponse.json({ mistake });
}
