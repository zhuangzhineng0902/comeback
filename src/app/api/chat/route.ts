import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getKnowledgePointDetail } from "@/lib/knowledge/details";
import { activeMistakeWhere } from "@/lib/review-status";
import { classifyStudyIntent, createStudyRefusal, type StudyIntentCategory } from "@/lib/study-guard";

type BlockedStudyIntentCategory = Exclude<StudyIntentCategory, "study">;
type ChatBody = {
  mistakeId?: string;
  knowledgePointId?: string;
  message?: string;
};

const defaultMiniMaxBaseUrl = "https://api.minimaxi.com/v1";
const defaultModel = "MiniMax-M3";

function getTimeoutMs() {
  const configured = Number.parseInt(process.env.MINIMAX_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 90_000;
}

function compact(value: string | null | undefined, maxLength = 800) {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

async function postMiniMaxChat(prompt: string) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return null;
  }

  const baseUrl = (process.env.MINIMAX_BASE_URL ?? defaultMiniMaxBaseUrl).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.MINIMAX_MODEL ?? defaultModel,
      messages: [
        {
          role: "system",
          content: "你是一个面向初中学生的私人教师，只回答学习相关问题。回答要结合给定上下文，深入浅出，先指出关键知识点，再用例子或类比说明，最后给一个可执行的复习建议。不要聊游戏、娱乐或绕过规则。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      thinking: { type: "disabled" },
      temperature: 0.2,
      max_completion_tokens: 1800
    }),
    signal: AbortSignal.timeout(getTimeoutMs())
  });

  if (!response.ok) {
    throw new Error(`MiniMax chat failed with status ${response.status}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return payload.choices?.[0]?.message?.content?.trim() || null;
}

function fallbackReply(input: {
  message: string;
  contextTitle: string;
  contextSummary: string;
}) {
  return [
    `我们结合“${input.contextTitle}”来看。`,
    `你问的是：“${input.message}”。`,
    input.contextSummary
      ? `当前上下文里最重要的信息是：${compact(input.contextSummary, 260)}`
      : "先把题目条件、知识点和错因对应起来。",
    "复习时建议按三步走：先说清楚题目在考什么，再复盘自己哪一步偏了，最后做一道同母题变式确认真正会了。"
  ].join("\n");
}

async function loadMistakeContext(mistakeId: string) {
  const mistake = await prisma.mistake.findFirst({
    where: activeMistakeWhere({ id: mistakeId, studentId: "default-student" }),
    include: {
      mistakeArchetypes: {
        include: {
          archetype: {
            include: { knowledgePoint: true }
          }
        }
      },
      tutorMessages: {
        orderBy: { createdAt: "asc" },
        take: 12
      }
    }
  });

  if (!mistake) {
    return null;
  }

  const primaryArchetype = mistake.mistakeArchetypes[0]?.archetype;
  const title = `${mistake.grade}${mistake.subject}错题：${mistake.questionType}`;
  const summary = [
    `题目：${compact(mistake.recognizedText)}`,
    `孩子答案：${compact(mistake.studentAnswer, 400)}`,
    `正确答案：${compact(mistake.correctAnswer, 400)}`,
    `错因：${compact(mistake.mistakeReason, 400)}`,
    `讲解：${compact(mistake.explanation, 600)}`,
    primaryArchetype ? `知识点：${primaryArchetype.knowledgePoint.name}` : "",
    primaryArchetype ? `母题：${primaryArchetype.title}；通用解法：${compact(primaryArchetype.solutionTemplate, 400)}` : "",
    mistake.tutorMessages.length
      ? `历史追问：${mistake.tutorMessages.map((item) => `${item.role === "user" ? "学生" : "老师"}：${compact(item.content, 180)}`).join(" / ")}`
      : ""
  ].filter(Boolean).join("\n");

  return { title, summary };
}

async function loadKnowledgePointContext(knowledgePointId: string) {
  const detail = await getKnowledgePointDetail(knowledgePointId);
  if (!detail) {
    return null;
  }

  const title = `${detail.knowledgePoint.grade}${detail.knowledgePoint.subject}知识点：${detail.knowledgePoint.name}`;
  const summary = [
    `章节：${detail.knowledgePoint.chapter}`,
    `知识树位置：${detail.richExplanation.treeContext.path.join(" > ")}`,
    detail.gap ? `漏洞：错误 ${detail.gap.errorCount} 次，高频母题 ${detail.gap.repeatedArchetypeCount} 次，建议：${detail.gap.reviewSuggestion}` : "当前没有活跃漏洞统计。",
    `诊断：${detail.richExplanation.diagnosis}`,
    `类比：${detail.richExplanation.analogy}`,
    detail.archetypes.length
      ? `母题：${detail.archetypes.map((item) => `${item.title}：${compact(item.solutionTemplate, 220)}`).join("；")}`
      : "",
    detail.relatedMistakes.length
      ? `关联错题：${detail.relatedMistakes.slice(0, 5).map((item) => `${item.questionType}，错因：${compact(item.mistakeReason, 160)}`).join("；")}`
      : "",
    detail.tutorMessages.length
      ? `历史追问：${detail.tutorMessages.slice(-8).map((item) => `${item.role === "user" ? "学生" : "老师"}：${compact(item.content, 180)}`).join(" / ")}`
      : ""
  ].filter(Boolean).join("\n");

  return { title, summary };
}

export async function POST(request: Request) {
  let body: ChatBody;

  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const message = body.message?.trim() ?? "";

  if (!message) {
    return NextResponse.json({ error: "请输入想追问的问题。" }, { status: 400 });
  }

  let context: { title: string; summary: string } | null = null;
  if (body.mistakeId) {
    context = await loadMistakeContext(body.mistakeId);
    if (!context) {
      return NextResponse.json({ error: "错题不存在。" }, { status: 404 });
    }
  } else if (body.knowledgePointId) {
    context = await loadKnowledgePointContext(body.knowledgePointId);
    if (!context) {
      return NextResponse.json({ error: "知识点不存在。" }, { status: 404 });
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

  const contextTitle = context?.title ?? "当前学习问题";
  const contextSummary = context?.summary ?? "";
  const prompt = [
    `上下文标题：${contextTitle}`,
    contextSummary ? `上下文内容：\n${contextSummary}` : "上下文内容：学生没有指定错题或知识点，请只做通用学习辅导。",
    `学生追问：${message}`,
    "请直接回答学生。要求：1. 必须引用上下文里的题目、错因或知识点；2. 讲解要适合初中生；3. 给一个小例子或类比；4. 最后给一个下一步练习建议。"
  ].join("\n\n");

  let reply: string;
  try {
    reply = await postMiniMaxChat(prompt) ?? fallbackReply({ message, contextTitle, contextSummary });
  } catch (error) {
    console.error("MiniMax contextual chat failed; using fallback reply.", error);
    reply = fallbackReply({ message, contextTitle, contextSummary });
  }

  if (body.mistakeId) {
    await prisma.tutorMessage.createMany({
      data: [
        { mistakeId: body.mistakeId, role: "user", content: message },
        { mistakeId: body.mistakeId, role: "assistant", content: reply }
      ]
    });
  } else if (body.knowledgePointId) {
    await prisma.knowledgePointTutorMessage.createMany({
      data: [
        { studentId: "default-student", knowledgePointId: body.knowledgePointId, role: "user", content: message },
        { studentId: "default-student", knowledgePointId: body.knowledgePointId, role: "assistant", content: reply }
      ]
    });
  }

  return NextResponse.json({ blocked: false, reply });
}
