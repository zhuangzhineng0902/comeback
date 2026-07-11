import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";

type EnrichmentPayload = {
  explanation: string;
  mistakeReason: string;
  knowledgePoints: string[];
  solutionStrategy: string;
  archetype: {
    title: string;
    pattern: string;
    solutionTemplate: string;
    commonTraps: string[];
  };
  examples: Array<{
    label: "深圳题型风格" | "深圳真题参考" | "AI模拟题";
    sourceTitle?: string;
    sourceUrl?: string;
    question: string;
    answer: string;
    explanation: string;
  }>;
};

function isContentComplete(mistake: {
  explanation: string;
  mistakeReason: string;
  correctAnswer: string;
  questionType: string;
}) {
  const combined = `${mistake.explanation}\n${mistake.mistakeReason}\n${mistake.correctAnswer}`;
  return (
    mistake.explanation.length >= 180 &&
    mistake.mistakeReason.length >= 30 &&
    !/待复核|人工复核|重新推导|未清晰|不知道/.test(combined) &&
    !/OCR|复核/.test(mistake.questionType)
  );
}

function extractJson(content: string) {
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^```(?:json)?|```$/gm, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("MiniMax未返回完整JSON");
  return JSON.parse(cleaned.slice(start, end + 1)) as EnrichmentPayload;
}

function normalizeEnrichment(payload: EnrichmentPayload): EnrichmentPayload {
  if (!payload.explanation?.trim() || !payload.solutionStrategy?.trim() || !payload.archetype?.title?.trim()) {
    throw new Error("MiniMax补全内容不完整");
  }
  return {
    ...payload,
    knowledgePoints: Array.isArray(payload.knowledgePoints) ? payload.knowledgePoints.filter(Boolean).slice(0, 6) : [],
    archetype: {
      ...payload.archetype,
      commonTraps: Array.isArray(payload.archetype.commonTraps) ? payload.archetype.commonTraps.filter(Boolean).slice(0, 8) : []
    },
    examples: (Array.isArray(payload.examples) ? payload.examples : []).slice(0, 5).map((example) => {
      const hasVerifiableSource = example.label === "深圳真题参考" && example.sourceTitle?.trim() && /^https?:\/\//.test(example.sourceUrl ?? "");
      return {
        ...example,
        label: hasVerifiableSource ? "深圳真题参考" : example.label === "深圳题型风格" ? "深圳题型风格" : "AI模拟题",
        sourceTitle: hasVerifiableSource ? example.sourceTitle : undefined,
        sourceUrl: hasVerifiableSource ? example.sourceUrl : undefined
      };
    })
  };
}

export async function enrichConfirmedMistake(mistakeId: string, studentId: string) {
  const mistake = await prisma.mistake.findFirst({ where: { id: mistakeId, studentId } });
  if (!mistake || mistake.reviewStatus !== "confirmed_wrong") return null;
  if (isContentComplete(mistake)) {
    return prisma.mistake.update({ where: { id: mistake.id }, data: { contentStatus: "complete", contentError: null } });
  }

  await prisma.mistake.update({ where: { id: mistake.id }, data: { contentStatus: "enriching", contentError: null } });
  try {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) throw new Error("未配置MINIMAX_API_KEY");
    const image = await readFile(mistake.imagePath);
    const extension = path.extname(mistake.imagePath).toLowerCase();
    const mimeType = extension === ".png" ? "image/png" : "image/jpeg";
    const prompt = [
      "你是深圳初中学科教研老师。下面题目已经由人工确认是错题，不再判断对错，只补全学习内容。",
      `学科：${mistake.subject}；年级：${mistake.grade}；题型：${mistake.questionType}`,
      `题干OCR：${mistake.recognizedText}`,
      `学生答案：${mistake.studentAnswer}`,
      `当前正确答案：${mistake.correctAnswer}`,
      "要求深入浅出给出完整解题步骤、思路、可复用套路、知识点、易错点、母题和练习题。",
      "深圳真题必须提供可核验的sourceTitle和http(s) sourceUrl；没有明确来源时label只能写AI模拟题或深圳题型风格，禁止冒充真题。",
      "只返回JSON，字段为 explanation, mistakeReason, knowledgePoints, solutionStrategy, archetype{title,pattern,solutionTemplate,commonTraps}, examples[{label,sourceTitle,sourceUrl,question,answer,explanation}]。"
    ].join("\n");
    const response = await fetch(`${(process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.com/v1").replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.MINIMAX_MODEL ?? "MiniMax-M3",
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${image.toString("base64")}` } }
        ] }],
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_completion_tokens: 12000
      }),
      signal: AbortSignal.timeout(Number(process.env.MINIMAX_TIMEOUT_MS ?? 90000))
    });
    if (!response.ok) throw new Error(`MiniMax补全请求失败(${response.status})`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const enrichment = normalizeEnrichment(extractJson(body.choices?.[0]?.message?.content ?? ""));
    return prisma.$transaction(async (tx) => {
      const relation = await tx.mistakeArchetype.findFirst({ where: { mistakeId: mistake.id } });
      if (relation) {
        await tx.archetype.update({
          where: { id: relation.archetypeId },
          data: {
            pattern: enrichment.archetype.pattern,
            solutionTemplate: enrichment.archetype.solutionTemplate,
            commonTraps: JSON.stringify(enrichment.archetype.commonTraps)
          }
        });
      }
      return tx.mistake.update({
        where: { id: mistake.id },
        data: {
          explanation: enrichment.explanation,
          mistakeReason: enrichment.mistakeReason,
          contentStatus: "complete",
          contentJson: JSON.stringify(enrichment),
          contentError: null,
          contentUpdatedAt: new Date()
        }
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return prisma.mistake.update({
      where: { id: mistake.id },
      data: { contentStatus: "failed", contentError: message.slice(0, 500), contentUpdatedAt: new Date() }
    });
  }
}
