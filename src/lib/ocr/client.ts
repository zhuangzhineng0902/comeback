import type {
  GradingMarkType,
  MistakeJudgement,
  PaperVisionBox,
  PaperVisionContext,
  PaperVisionGradingMark,
  PaperVisionMistakeCandidate,
  PaperVisionQuestionCandidate,
  PaperVisionTextBlock
} from "@/lib/types";

type OcrInput = {
  filename: string;
  mimeType: string;
  imageBase64: string;
  sourceImageIndex: number;
};

const globalForOcrClient = globalThis as unknown as { ocrRequestQueue?: Promise<void> };
globalForOcrClient.ocrRequestQueue ??= Promise.resolve();

function shouldSerializeOcrRequests() {
  return process.env.OCR_SERIALIZE_REQUESTS !== "false";
}

async function runWithOcrQueue<T>(task: () => Promise<T>): Promise<T> {
  if (!shouldSerializeOcrRequests()) {
    return task();
  }

  const previous = globalForOcrClient.ocrRequestQueue?.catch(() => undefined) ?? Promise.resolve();
  let releaseQueue: () => void = () => undefined;
  globalForOcrClient.ocrRequestQueue = previous.then(
    () =>
      new Promise<void>((resolve) => {
        releaseQueue = resolve;
      })
  );

  await previous;
  try {
    return await task();
  } finally {
    releaseQueue();
  }
}

function normalizeNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(number) ? number : undefined;
}

function normalizeBox(value: unknown): PaperVisionBox | undefined {
  if (!Array.isArray(value) || value.length < 4) {
    return undefined;
  }

  const numbers = value.slice(0, 4).map(normalizeNumber);
  if (numbers.some((item) => item === undefined)) {
    return undefined;
  }

  return numbers as PaperVisionBox;
}

function collectRawText(payload: Record<string, unknown>, blocks: PaperVisionTextBlock[]) {
  const directText = payload.rawText ?? payload.text ?? payload.fullText;
  if (typeof directText === "string" && directText.trim().length > 0) {
    return directText.trim();
  }

  return blocks.map((block) => block.text).filter(Boolean).join("\n");
}

function normalizeBlock(value: unknown): PaperVisionTextBlock | null {
  if (typeof value === "string") {
    return value.trim().length > 0 ? { text: value.trim() } : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const text = record.text ?? record.content ?? record.words ?? record.value;
  if (typeof text !== "string" || text.trim().length === 0) {
    return null;
  }

  const confidence = normalizeNumber(record.confidence ?? record.score ?? record.probability);
  const role = record.role;

  return {
    text: text.trim(),
    bbox: normalizeBox(record.bbox ?? record.box ?? record.position),
    confidence,
    role: role === "question" || role === "studentAnswer" || role === "teacherMark" || role === "other" ? role : undefined
  };
}

function normalizeQuestionCandidate(value: unknown): PaperVisionQuestionCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const questionId = record.questionId ?? record.id ?? record.number;
  const text = record.text ?? record.content ?? record.question;
  const confidence = normalizeNumber(record.confidence ?? record.score ?? record.probability);

  return {
    questionId: typeof questionId === "string" || typeof questionId === "number" ? String(questionId).trim() : undefined,
    text: typeof text === "string" && text.trim().length > 0 ? text.trim() : undefined,
    bbox: normalizeBox(record.bbox ?? record.box ?? record.position),
    confidence
  };
}

function normalizeMarkType(value: unknown): GradingMarkType {
  const text = String(value ?? "").trim();
  if (["check", "cross", "partial", "deduction", "circle", "question", "none", "unknown"].includes(text)) {
    return text as GradingMarkType;
  }
  return "unknown";
}

function normalizeJudgement(value: unknown): MistakeJudgement {
  const text = String(value ?? "").trim();
  if (["wrong", "partial", "suspected", "correct", "unknown"].includes(text)) {
    return text as MistakeJudgement;
  }
  return "unknown";
}

function normalizeGradingMark(value: unknown): PaperVisionGradingMark | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const markText = record.markText ?? record.text;
  const source = record.source;

  return {
    markType: normalizeMarkType(record.markType ?? record.type),
    markText: typeof markText === "string" && markText.trim().length > 0 ? markText.trim() : undefined,
    bbox: normalizeBox(record.bbox ?? record.box ?? record.position),
    confidence: normalizeNumber(record.confidence ?? record.score ?? record.probability),
    source: source === "red-ink" || source === "ocr-text" || source === "vision" || source === "unknown" ? source : undefined
  };
}

function normalizeMistakeCandidate(value: unknown): PaperVisionMistakeCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const questionId = record.questionId ?? record.id ?? record.number;
  const subQuestionId = record.subQuestionId ?? record.subId;
  const text = record.text ?? record.content ?? record.question;
  const markTypes = Array.isArray(record.markTypes)
    ? record.markTypes.map(normalizeMarkType).filter((markType) => markType !== "unknown")
    : [];
  const evidenceSummary = record.evidenceSummary ?? record.summary;

  return {
    questionId: typeof questionId === "string" || typeof questionId === "number" ? String(questionId).trim() : undefined,
    subQuestionId: typeof subQuestionId === "string" || typeof subQuestionId === "number" ? String(subQuestionId).trim() : undefined,
    text: typeof text === "string" && text.trim().length > 0 ? text.trim() : undefined,
    bbox: normalizeBox(record.bbox ?? record.box ?? record.position),
    confidence: normalizeNumber(record.confidence ?? record.score ?? record.probability),
    markTypes: markTypes.length > 0 ? markTypes : ["unknown"],
    judgement: normalizeJudgement(record.judgement),
    evidenceSummary: typeof evidenceSummary === "string" && evidenceSummary.trim().length > 0 ? evidenceSummary.trim() : "OCR 发现疑似批改标记。"
  };
}

function extractBlocks(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : undefined;
  const candidates = [
    payload.textBlocks,
    payload.blocks,
    payload.ocrResults,
    payload.results,
    data?.textBlocks,
    data?.blocks,
    data?.ocrResults,
    data?.results
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeBlock).filter((block): block is PaperVisionTextBlock => Boolean(block));
    }
  }

  return [];
}

function extractArray<T>(
  payload: Record<string, unknown>,
  keys: string[],
  normalizer: (value: unknown) => T | null
) {
  const data = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : undefined;
  const candidates = keys.flatMap((key) => [payload[key], data?.[key]]);

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizer).filter((item): item is T => Boolean(item));
    }
  }

  return [];
}

function extractQuestionCandidates(payload: Record<string, unknown>) {
  return extractArray(payload, ["questionCandidates", "questions", "questionBlocks"], normalizeQuestionCandidate);
}

function getOcrTimeoutMs() {
  const configured = Number.parseInt(process.env.OCR_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 45_000;
}

async function readOcrErrorDetail(response: Response) {
  const body = await response.text().catch(() => "");
  if (!body.trim()) {
    return "";
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const error = record.error ?? record.detail ?? record.message;
      if (typeof error === "string" && error.trim()) {
        return error.trim();
      }
    }
  } catch {
    return body.trim().slice(0, 300);
  }

  return body.trim().slice(0, 300);
}

function buildFailedContext(input: OcrInput, error: unknown): PaperVisionContext {
  const message = error instanceof Error ? error.message : String(error);
  const detail = message.trim().length > 0 ? ` 原因：${message.slice(0, 180)}` : "";

  return {
    sourceImageIndex: input.sourceImageIndex,
    engine: "ocr",
    status: "failed",
    summary: `OCR 预处理失败，已改用原图视觉分析。${detail}`,
    textBlocks: [],
    questionCandidates: [],
    gradingMarks: [],
    mistakeCandidates: []
  };
}

function normalizeOcrPayload(payload: unknown, input: OcrInput): PaperVisionContext {
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const blocks = extractBlocks(record);
  const rawText = collectRawText(record, blocks);
  const questionCandidates = extractQuestionCandidates(record);
  const gradingMarks = extractArray(record, ["gradingMarks", "marks", "teacherMarks"], normalizeGradingMark);
  const mistakeCandidates = extractArray(record, ["mistakeCandidates", "wrongQuestionCandidates"], normalizeMistakeCandidate);

  return {
    sourceImageIndex: input.sourceImageIndex,
    engine: "ocr",
    status: blocks.length > 0 || rawText.length > 0 ? "available" : "unavailable",
    summary: blocks.length > 0 ? `识别 ${blocks.length} 个文字块` : "OCR 未识别到有效文字块",
    rawText,
    textBlocks: blocks.slice(0, 80),
    questionCandidates: questionCandidates.slice(0, 40),
    gradingMarks: gradingMarks.slice(0, 80),
    mistakeCandidates: mistakeCandidates.slice(0, 40)
  };
}

export async function analyzeImageWithOcr(input: OcrInput): Promise<PaperVisionContext | null> {
  const serviceUrl = process.env.OCR_SERVICE_URL?.trim();
  if (!serviceUrl) {
    return null;
  }

  try {
    return await runWithOcrQueue(async () => {
      const formData = new FormData();
      const bytes = Buffer.from(input.imageBase64, "base64");
      formData.append("image", new Blob([bytes], { type: input.mimeType }), input.filename);

      const response = await fetch(serviceUrl, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(getOcrTimeoutMs())
      });

      if (!response.ok) {
        const detail = await readOcrErrorDetail(response);
        throw new Error(`OCR request failed with status ${response.status}${detail ? `: ${detail}` : ""}.`);
      }

      return normalizeOcrPayload(await response.json(), input);
    });
  } catch (error) {
    console.warn("OCR pre-processing failed; continuing without OCR evidence.", error);
    return buildFailedContext(input, error);
  }
}
