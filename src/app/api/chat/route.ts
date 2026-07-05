import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { activeMistakeWhere } from "@/lib/review-status";
import { classifyStudyIntent, createStudyRefusal, type StudyIntentCategory } from "@/lib/study-guard";

type BlockedStudyIntentCategory = Exclude<StudyIntentCategory, "study">;

export async function POST(request: Request) {
  let body: { mistakeId?: string; message?: string };

  try {
    body = (await request.json()) as { mistakeId?: string; message?: string };
  } catch {
    return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const message = body.message?.trim() ?? "";

  if (!message) {
    return NextResponse.json({ error: "请输入想追问的问题。" }, { status: 400 });
  }

  if (body.mistakeId) {
    const mistake = await prisma.mistake.findFirst({
      where: activeMistakeWhere({ id: body.mistakeId, studentId: "default-student" })
    });

    if (!mistake) {
      return NextResponse.json({ error: "错题不存在。" }, { status: 404 });
    }
  }

  const intent = classifyStudyIntent(message);

  if (!intent.allowed) {
    await prisma.nonStudyRequestLog.create({
      data: {
        studentId: "default-student",
        contentSummary: message.slice(0, 80),
        category: intent.category
      }
    });
    return NextResponse.json({
      blocked: true,
      reply: createStudyRefusal(intent.category as BlockedStudyIntentCategory)
    });
  }

  const reply = `我们继续看学习问题。你问的是：“${message}”。先抓住题目的关键词，再把它对应到知识点和解题模板。`;

  if (body.mistakeId) {
    await prisma.tutorMessage.createMany({
      data: [
        { mistakeId: body.mistakeId, role: "user", content: message },
        { mistakeId: body.mistakeId, role: "assistant", content: reply }
      ]
    });
  }

  return NextResponse.json({ blocked: false, reply });
}
