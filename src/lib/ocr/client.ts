import type { PaperVisionBox, PaperVisionContext, PaperVisionQuestionCandidate, PaperVisionTextBlock } from "@/lib/types";

type OcrInput = {
  filename: string;
  mimeType: string;
  imageBase64: string;
  sourceImageIndex: number;
};

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

function extractQuestionCandidates(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : undefined;
  const candidates = [
    payload.questionCandidates,
    payload.questions,
    payload.questionBlocks,
    data?.questionCandidates,
    data?.questions,
    data?.questionBlocks
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeQuestionCandidate).filter((item): item is PaperVisionQuestionCandidate => Boolean(item));
    }
  }

  return [];
}

function getOcrTimeoutMs() {
  const configured = Number.parseInt(process.env.OCR_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 45_000;
}

function normalizeOcrPayload(payload: unknown, input: OcrInput): PaperVisionContext {
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const blocks = extractBlocks(record);
  const rawText = collectRawText(record, blocks);
  const questionCandidates = extractQuestionCandidates(record);

  return {
    sourceImageIndex: input.sourceImageIndex,
    engine: "ocr",
    status: blocks.length > 0 || rawText.length > 0 ? "available" : "unavailable",
    summary: blocks.length > 0 ? `识别 ${blocks.length} 个文字块` : "OCR 未识别到有效文字块",
    rawText,
    textBlocks: blocks.slice(0, 80),
    questionCandidates: questionCandidates.slice(0, 40)
  };
}

export async function analyzeImageWithOcr(input: OcrInput): Promise<PaperVisionContext | null> {
  const serviceUrl = process.env.OCR_SERVICE_URL?.trim();
  if (!serviceUrl) {
    return null;
  }

  try {
    const formData = new FormData();
    const bytes = Buffer.from(input.imageBase64, "base64");
    formData.append("image", new Blob([bytes], { type: input.mimeType }), input.filename);

    const response = await fetch(serviceUrl, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(getOcrTimeoutMs())
    });

    if (!response.ok) {
      throw new Error(`OCR request failed with status ${response.status}.`);
    }

    return normalizeOcrPayload(await response.json(), input);
  } catch (error) {
    console.warn("OCR pre-processing failed; continuing without OCR evidence.", error);
    return {
      sourceImageIndex: input.sourceImageIndex,
      engine: "ocr",
      status: "failed",
      summary: "OCR 预处理失败，已改用原图视觉分析。",
      textBlocks: [],
      questionCandidates: []
    };
  }
}
