import { z } from "zod";

import type { AnalyzeInput } from "@/lib/analyzer/simulated";
import { grades, subjects, type AnalysisOutput } from "@/lib/types";

const defaultMiniMaxBaseUrl = "https://api.minimaxi.com/v1";
const defaultModel = "MiniMax-M3";

const analysisSchema = z.object({
  subject: z.enum(subjects),
  grade: z.enum(grades),
  questionType: z.string().min(1),
  recognizedText: z.string().min(1),
  studentAnswer: z.string().min(1),
  correctAnswer: z.string().min(1),
  knowledgePoints: z.array(z.object({ name: z.string().min(1), confidence: z.number().min(0).max(1) })).min(1),
  mistakeReason: z.string().min(1),
  studentFriendlyExplanation: z.string().min(1),
  example: z.string().min(1),
  archetype: z.object({
    title: z.string().min(1),
    pattern: z.string().min(1),
    solutionTemplate: z.string().min(1),
    commonTraps: z.array(z.string().min(1)).min(1)
  }),
  practiceQuestions: z
    .array(z.object({ question: z.string().min(1), answer: z.string().min(1), hint: z.string().min(1) }))
    .min(1)
});

type MiniMaxResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function stripJsonFence(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function extractJsonObject(content: string) {
  const stripped = stripJsonFence(content);
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return stripped;
  }

  return stripped.slice(start, end + 1);
}

function buildPrompt(input: AnalyzeInput) {
  return [
    "你是一个只服务初中学生学习的私人教师 Agent。",
    "请分析图片中的错题或习题照片，输出严格 JSON，不要输出 Markdown，不要输出解释性前后缀。",
    "JSON 必须完全符合字段：subject, grade, questionType, recognizedText, studentAnswer, correctAnswer, knowledgePoints, mistakeReason, studentFriendlyExplanation, example, archetype, practiceQuestions。",
    "subject 必须是：语文、数学、英语、物理、化学、生物、历史、地理、道德与法治之一。",
    "grade 必须是：七年级、八年级、九年级之一。",
    "knowledgePoints 至少 1 个，confidence 是 0 到 1 的数字。",
    "knowledgePoints 的格式必须是对象数组，例如 [{\"name\":\"一次函数图像与性质\",\"confidence\":0.9}]。",
    "archetype 必须是对象，包含 title, pattern, solutionTemplate, commonTraps。",
    "practiceQuestions 给 1 到 3 道同类练习，必须是对象数组，每道包含 question, answer, hint。",
    "不要用省略号，不要用字符串替代对象，不要输出 <think>。",
    "讲解要适合孩子阅读，深入浅出，但不要涉及游戏、娱乐网站、闲聊内容。",
    "如果用户未提供学科或年级，请根据图片内容自动判断，不要默认八年级数学。",
    `用户提示学科：${input.subjectHint ?? "未提供，请自动识别"}；用户提示年级：${input.gradeHint ?? "未提供，请自动识别"}；文件名：${input.filename}。`
  ].join("\n");
}

function normalizeAnalysisShape(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = { ...(value as Record<string, unknown>) };

  if (Array.isArray(record.knowledgePoints)) {
    record.knowledgePoints = record.knowledgePoints.map((point) => {
      if (typeof point === "string") {
        return { name: point, confidence: 0.8 };
      }
      return point;
    });
  }

  if (typeof record.archetype === "string") {
    record.archetype = {
      title: record.archetype,
      pattern: record.archetype,
      solutionTemplate: record.archetype,
      commonTraps: ["只记结论，没有套用完整母题模板"]
    };
  }

  if (Array.isArray(record.practiceQuestions)) {
    record.practiceQuestions = record.practiceQuestions.map((question) => {
      if (typeof question === "string") {
        return {
          question,
          answer: "请先尝试作答，再让老师批改。",
          hint: "套用本题母题模板，先找关键条件，再按步骤判断。"
        };
      }
      return question;
    });
  }

  return record;
}

function parseAnalysis(content: string): AnalysisOutput {
  try {
    const parsed = JSON.parse(extractJsonObject(content)) as unknown;
    return analysisSchema.parse(normalizeAnalysisShape(parsed));
  } catch (error) {
    throw new Error(`MiniMax response could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function analyzeWithMiniMax(input: AnalyzeInput): Promise<AnalysisOutput> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey || !input.imageBase64 || !input.mimeType) {
    throw new Error("MiniMax analysis requires MINIMAX_API_KEY and image data.");
  }

  const baseUrl = (process.env.MINIMAX_BASE_URL ?? defaultMiniMaxBaseUrl).replace(/\/+$/, "");
  const images = input.images?.length
    ? input.images
    : [{ filename: input.filename, mimeType: input.mimeType, imageBase64: input.imageBase64 }];
  const imageContent = images.map((image) => ({
    type: "image_url",
    image_url: { url: `data:${image.mimeType};base64,${image.imageBase64}` }
  }));
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.MINIMAX_MODEL ?? defaultModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt(input) },
            ...imageContent
          ]
        }
      ],
      temperature: 0.2,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    throw new Error(`MiniMax request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as MiniMaxResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("MiniMax response did not include message content.");
  }

  return parseAnalysis(content);
}
