import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subject = searchParams.get("subject");
  const grade = searchParams.get("grade");

  const mistakes = await prisma.mistake.findMany({
    where: {
      studentId: "default-student",
      ...(subject ? { subject } : {}),
      ...(grade ? { grade } : {})
    },
    include: {
      mistakeArchetypes: {
        include: { archetype: true }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ mistakes });
}
