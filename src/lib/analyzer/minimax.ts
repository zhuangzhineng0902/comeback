import { z } from "zod";

import type { AnalyzeInput } from "@/lib/analyzer/simulated";
import { grades, subjects, type AnalysisOutput, type Grade, type PaperVisionMistakeCandidate, type Subject } from "@/lib/types";

const defaultMiniMaxBaseUrl = "https://api.minimaxi.com/v1";
const defaultModel = "MiniMax-M3";
const defaultMaxCompletionTokens = 16000;
const gradingMarkTypes = ["check", "cross", "partial", "deduction", "circle", "question", "none", "unknown"] as const;
const mistakeJudgements = ["wrong", "partial", "suspected", "correct", "unknown"] as const;
const childExplanationRequirements = [
  "studentFriendlyExplanation 是“讲给孩子听”的主讲解，不能只给结论或口号；必须把解题思路打开。",
  "studentFriendlyExplanation 至少包含：先读题找什么条件、为什么选这个方法、关键公式或规则怎么用、每一步如何算或判断、孩子原答案卡在哪里、最后怎样验算或回看。",
  "表达要像老师面对初中生讲题：短句、具体、层层递进，可以用“先看、再想、所以、回头检查”组织；不要空泛地说“认真审题”“注意细节”。",
  "如果是计算题，要写清主要代入、变形或计算路径；如果是阅读/英语/文科题，要写清定位依据、关键词、排除理由和答案从哪里来。"
];
const richWalkthroughRequirements = [
  "richExplanation.walkthrough 每步 body 不能只有一句口号；每步都要说明这一步要看原题中的哪条信息、为什么这么做、做完后得到什么。",
  "richExplanation.walkthrough 要覆盖完整解题链路：读题定位、建模/选规则、计算或推理、对照学生答案、检查易错点。compact 模式也要保留 2 个实质步骤。"
];

const richIllustrationSchema = z.object({
  type: z.enum(["flow", "compare", "treePath"]),
  title: z.string().min(1),
  nodes: z
    .array(
      z.object({
        label: z.string().min(1),
        detail: z.string().min(1).optional(),
        tone: z.enum(["normal", "focus", "warning"]).optional()
      })
    )
    .min(1)
    .max(8)
});

const richExplanationSchema = z.object({
  diagnosis: z.string().min(1),
  analogy: z.string().min(1),
  walkthrough: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).min(2).max(5),
  wrongAnswerInsight: z.string().min(1),
  treeContext: z.object({
    path: z.array(z.string().min(1)).min(3).max(8),
    prerequisites: z.array(z.string().min(1)).min(1).max(6),
    current: z.array(z.string().min(1)).min(1).max(4),
    next: z.array(z.string().min(1)).min(1).max(6),
    confusions: z.array(z.string().min(1)).min(1).max(6)
  }),
  illustration: richIllustrationSchema.optional(),
  shenzhenExample: z.object({
    label: z.enum(["深圳题型风格", "深圳真题参考"]),
    sourceNote: z.string().min(1).optional(),
    question: z.string().min(1),
    answer: z.string().min(1),
    explanation: z.string().min(1)
  })
});

const gradingEvidenceSchema = z.object({
  markType: z.enum(gradingMarkTypes),
  markText: z.string().min(1).optional(),
  deductedScore: z.number().min(0).optional(),
  teacherMarkConfidence: z.number().min(0).max(1),
  answerMatchConfidence: z.number().min(0).max(1),
  judgement: z.enum(mistakeJudgements),
  isPartialCredit: z.boolean(),
  needsConfirmation: z.boolean(),
  evidenceSummary: z.string().min(1),
  studentAnswerLocation: z.string().min(1).optional()
});

const baseAnalysisSchema = z.object({
  sourceImageIndex: z.number().int().min(0).max(15).optional(),
  answerSheetImageIndex: z.number().int().min(0).max(15).optional(),
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
    .min(1),
  gradingEvidence: gradingEvidenceSchema.optional()
});

const analysisSchema = baseAnalysisSchema.extend({
  richExplanation: richExplanationSchema.optional()
});

const analysesSchema = z.object({
  analyses: z.array(analysisSchema).min(1).max(30)
});

const answerSheetDetectionSchema = z.object({
  candidates: z.array(z.object({
    answerSheetImageIndex: z.number().int().min(0).max(15),
    questionId: z.string().min(1),
    subQuestionId: z.string().min(1).optional(),
    markType: z.enum(["cross", "partial", "deduction"]),
    deductedScore: z.number().min(0).optional(),
    confidence: z.number().min(0).max(1),
    evidenceSummary: z.string().min(1)
  })).max(40)
});

type MiniMaxResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string;
    };
  }>;
};

function getMaxCompletionTokens() {
  const configured = Number.parseInt(process.env.MINIMAX_MAX_COMPLETION_TOKENS ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultMaxCompletionTokens;
}

function getMaxCompletionTokensForInput(input: AnalyzeInput) {
  return input.analysisDetail === "compact" ? Math.min(getMaxCompletionTokens(), 8000) : getMaxCompletionTokens();
}

function getMiniMaxTimeoutMs() {
  const configured = Number.parseInt(process.env.MINIMAX_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 90_000;
}

function stripJsonFence(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function extractJsonObject(content: string) {
  const stripped = stripJsonFence(content);
  const start = stripped.indexOf("{");

  if (start === -1) {
    return stripped;
  }

  let depth = 0;
  let isInsideString = false;
  let isEscaped = false;

  for (let index = start; index < stripped.length; index += 1) {
    const char = stripped[index];

    if (isInsideString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === "\"") {
        isInsideString = false;
      }
      continue;
    }

    if (char === "\"") {
      isInsideString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return stripped.slice(start, index + 1);
      }
    }
  }

  return stripped.slice(start);
}

function repairJsonLikeSyntax(content: string) {
  return content
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, "$1\"$2\":")
    .replace(/,\s*([}\]])/g, "$1");
}

function parseJsonObject(content: string): unknown {
  const extracted = extractJsonObject(content);

  try {
    return JSON.parse(extracted) as unknown;
  } catch {
    return JSON.parse(repairJsonLikeSyntax(extracted)) as unknown;
  }
}

function formatBox(box: [number, number, number, number] | undefined) {
  return box ? `[${box.join(",")}]` : "未提供坐标";
}

function formatPaperVisionContexts(input: AnalyzeInput) {
  if (!input.paperVisionContexts?.length) {
    return "";
  }

  const contexts = input.paperVisionContexts.map((context) => {
    const textBlocks = context.textBlocks.slice(0, 12).map((block, index) => ({
      index: index + 1,
      text: block.text,
      bbox: formatBox(block.bbox),
      confidence: block.confidence,
      role: block.role
    }));
    const questionCandidates = context.questionCandidates.slice(0, 16).map((question, index) => ({
      index: index + 1,
      questionId: question.questionId,
      text: question.text,
      bbox: formatBox(question.bbox),
      confidence: question.confidence
    }));
    const gradingMarks = context.gradingMarks?.slice(0, 30).map((mark, index) => ({
      index: index + 1,
      markType: mark.markType,
      markText: mark.markText,
      bbox: formatBox(mark.bbox),
      confidence: mark.confidence,
      source: mark.source
    })) ?? [];
    const mistakeCandidates = context.mistakeCandidates?.slice(0, 30).map((candidate, index) => ({
      index: index + 1,
      questionId: candidate.questionId,
      subQuestionId: candidate.subQuestionId,
      text: candidate.text,
      bbox: formatBox(candidate.bbox),
      confidence: candidate.confidence,
      markTypes: candidate.markTypes,
      judgement: candidate.judgement,
      evidenceSummary: candidate.evidenceSummary
    })) ?? [];
    const layoutRegions = context.layoutRegions?.slice(0, 30).map((region, index) => ({
      index: index + 1,
      regionType: region.regionType,
      bbox: formatBox(region.bbox),
      confidence: region.confidence,
      source: region.source
    })) ?? [];

    return {
      sourceImageIndex: context.sourceImageIndex,
      engine: context.engine,
      status: context.status,
      summary: context.summary,
      pageRoleHint: context.pageRoleHint,
      layoutRegions,
      textBlocks,
      questionCandidates,
      gradingMarks,
      mistakeCandidates
    };
  });

  return [
    "OCR 前置识别结果如下，这是给你定位题号、题干、学生答案区域和版面的紧凑证据层；layoutRegions 是 OCRAutoScore YOLO 检出的答题卡作答区域。",
    "请优先用 OCR 文本校对题干、题号、选项和普通印刷文字；同时必须继续查看原图来识别手写答案、批改符号、涂改痕迹和公式细节。",
    "如果存在 mistakeCandidates（错题候选），必须逐个分析 mistakeCandidates；除非原图能明确证明候选是全对，否则每个候选都要在 analyses 中输出一项。",
    "mistakeCandidates 来自题号、红笔批改标记和空间位置匹配；填空题、解答题、小题候选也必须覆盖，不要只返回选择题或第一题。",
    "如果 OCR 文本与图片视觉冲突，以原图为准，并在 gradingEvidence.evidenceSummary 中说明冲突。",
    "坐标 bbox 格式为 [x1,y1,x2,y2]，可用于判断学生答案是否离题干较远。",
    JSON.stringify(contexts)
  ].join("\n");
}

function buildPrompt(input: AnalyzeInput) {
  const paperVisionContext = formatPaperVisionContexts(input);
  const targetQuestionInstruction = input.targetQuestion
    ? `本次只分析一道已经由程序完成题号配对的错题：题号=${input.targetQuestion.questionId}${input.targetQuestion.subQuestionId ? `，小题=${input.targetQuestion.subQuestionId}` : ""}，题目页原始索引=${input.targetQuestion.questionImageIndex}，答题卡原始索引=${input.targetQuestion.answerSheetImageIndex}。题干 OCR=${input.targetQuestion.questionText ?? "未完整识别，请查看第1张图"}。答题卡证据=${input.targetQuestion.answerEvidence}。输入图片第1张是题目页，第2张是对应答题卡。只输出这一道题；sourceImageIndex 必须填 ${input.targetQuestion.questionImageIndex}，answerSheetImageIndex 必须填 ${input.targetQuestion.answerSheetImageIndex}。如果答题卡证据不足以确认错误，analyses 返回空数组。`
    : "";
  const answerSheetInstruction = input.paperLayout === "question_pages_with_answer_sheet"
    ? `这是一组混合上传的试卷页和答题卡，上传顺序不代表页面角色。OCR 初判的页面角色为：${(input.pageRoles ?? []).map((role, index) => `第${index + 1}张=${role === "question" ? "题目页" : role === "answer_sheet" ? "答题卡" : "待判断"}`).join("；")}。你必须结合原图自行复核角色，把答题卡上的作答、涂改和老师批改标记与题目页按题号逐一对照。判错证据唯一可信源是答题卡：题目页中的所有手写、勾叉、颜色、OCR teacherMark、gradingMarks 和 mistakeCandidates 都不得作为批改或作答证据。只有答题卡能清晰对应题号且批改/作答证据明确时才输出错题；无法对应、标记不清或证据矛盾时直接跳过，不猜测、不补全。每个输出必须同时给 sourceImageIndex（题目页索引）和 answerSheetImageIndex（对应答题卡索引）；两者无法明确时不得输出该题。analyses 只可输出题目页中的错题，绝不能把答题卡作为 sourceImageIndex。`
    : "";
  return [
    "你是一个只服务初中学生学习的私人教师 Agent。",
    "请分析图片中的错题或习题照片，输出严格 JSON，不要输出 Markdown，不要输出解释性前后缀。",
    input.analysisDetail === "compact"
      ? "当前是多页批量分析模式：每道错题讲解必须紧凑，practiceQuestions 只给 1 道，walkthrough 只给 2 步，illustration.nodes 最多 3 个。"
      : "",
    answerSheetInstruction,
    targetQuestionInstruction,
    "如果图片是一整张试卷或多页试卷，请找出所有能识别出的错题；每一道错题都要单独分析，不要只分析第一题。",
    "JSON 顶层必须是对象，字段为 analyses；analyses 是数组，每个元素代表一道错题。",
    "analyses 每个元素必须完全符合字段：sourceImageIndex, answerSheetImageIndex, subject, grade, questionType, recognizedText, studentAnswer, correctAnswer, knowledgePoints, mistakeReason, studentFriendlyExplanation, example, archetype, practiceQuestions, richExplanation, gradingEvidence。",
    "sourceImageIndex 表示这道错题来自第几张上传图片，图片索引从 0 开始；无法判断时填 0。",
    input.paperLayout === "question_pages_with_answer_sheet" ? "answerSheetImageIndex 表示这道错题对应的答题卡图片索引，必须指向答题卡；无法确定时不要输出该题。" : "",
    "subject 必须是：语文、数学、英语、物理、化学、生物、历史、地理、道德与法治之一。",
    "grade 必须是：七年级、八年级、九年级之一。",
    "knowledgePoints 至少 1 个，confidence 是 0 到 1 的数字。",
    "knowledgePoints 的格式必须是对象数组，例如 [{\"name\":\"一次函数图像与性质\",\"confidence\":0.9}]。",
    "archetype 必须是对象，包含 title, pattern, solutionTemplate, commonTraps。",
    "practiceQuestions 给 1 到 3 道同类练习，必须是对象数组，每道包含 question, answer, hint。",
    "gradingEvidence 必须是对象，用混合策略判断错题：先识别老师批改标记，再独立完整解题并和学生答案对比。",
    "识别老师批改标记时要特别关注打叉、半勾、半对、扣分、圈画、问号；markType 只能是 check、cross、partial、deduction、circle、question、none、unknown。",
    "老师批改通常优先看红色红笔标记；黑色或铅笔在选项、图象旁边打的叉，可能是学生排除选项或草稿标记，不能仅凭黑色叉判为错题。",
    "对计算题和解答题，必须寻找可能离题干较远的学生答案区域、草稿区、续写区，并把 studentAnswerLocation 写清楚。",
    "judgement 只能是 wrong、partial、suspected、correct、unknown；半勾、扣分、步骤前半正确后半错误应输出 partial，needsConfirmation 视图像清晰度决定。",
    "teacherMarkConfidence 和 answerMatchConfidence 都是 0 到 1 的数字；isPartialCredit 表示是否部分得分；evidenceSummary 用一句话说明判定依据。",
    "不要把明显全对的题目放进 analyses；如果老师标记不清或字迹涂改严重但疑似出错，可以输出 suspected 并设置 needsConfirmation 为 true。",
    "不要用省略号，不要用字符串替代对象，不要输出 <think>。",
    "讲解要适合孩子阅读，深入浅出，但不要涉及游戏、娱乐网站、闲聊内容。",
    ...childExplanationRequirements,
    "如果用户未提供学科或年级，请根据图片文字、题型、章节和知识点自动判断。",
    "年级判断优先看图片中的明确文字：初一/七年级/7年级/Grade 7 => 七年级；初二/八年级/8年级/Grade 8 => 八年级；初三/九年级/9年级/Grade 9 => 九年级。",
    "如果图片没有明确年级文字，再根据教材章节和题目难度推断；不要因为示例、学生档案或系统默认值选择八年级数学。",
    "richExplanation 必须是对象，包含 diagnosis, analogy, walkthrough, wrongAnswerInsight, treeContext, illustration, shenzhenExample。",
    "richExplanation.diagnosis 用一句话指出核心漏洞；analogy 必须用孩子熟悉的比方讲清楚。",
    "richExplanation.walkthrough 是 2 到 5 个步骤，每步包含 title 和 body，形成老师板书式讲解。",
    ...richWalkthroughRequirements,
    "richExplanation.treeContext 必须给知识树上下文：path, prerequisites, current, next, confusions。",
    "richExplanation.shenzhenExample 必须给一道深圳题型风格的同类题；如果没有可靠来源，label 必须是“深圳题型风格”。",
    "不要把未核验来源的题目说成深圳真题；只有能确认公开来源时才使用“深圳真题参考”并填写 sourceNote。",
    "richExplanation.illustration 只能是结构化数据，type 只能是 flow、compare、treePath，nodes 最多 8 个；不要输出 HTML、Markdown 或远程图片链接。",
    paperVisionContext,
    `用户提示学科：${input.subjectHint ?? "未提供，请根据图片自动识别"}；用户提示年级：${input.gradeHint ?? "未提供，请根据图片自动识别"}；文件名：${input.filename}。`
  ].filter(Boolean).join("\n");
}

function buildRepairPrompt(content: string, input: AnalyzeInput) {
  const paperVisionContext = formatPaperVisionContexts(input);
  const answerSheetInstruction = input.paperLayout === "question_pages_with_answer_sheet"
    ? "这组图片混有题目页和答题卡，上传顺序无意义；请自行复核页面角色。只可用答题卡上的作答和批改作为判错证据，题目页标记一律忽略；无法按题号明确对应时跳过，不猜测。只输出题目页的错题，不能把答题卡作为 sourceImageIndex。"
    : "";
  return [
    "请把下面这段错题分析内容转换成严格 JSON。",
    "只输出 JSON 对象，不要 Markdown，不要 <think>，不要解释。",
    "不要修补原文字符，请根据原始内容重新生成完整 JSON 对象。",
    answerSheetInstruction,
    "所有 JSON 属性名必须使用英文双引号，所有字符串也必须使用英文双引号。",
    "禁止输出 JavaScript 对象、单引号、尾随逗号、注释或任何 JSON 之外的文字。",
    "JSON 顶层必须是对象，字段为 analyses；analyses 是数组，每个元素代表一道错题。",
    "analyses 每个元素字段必须是：sourceImageIndex, answerSheetImageIndex, subject, grade, questionType, recognizedText, studentAnswer, correctAnswer, knowledgePoints, mistakeReason, studentFriendlyExplanation, example, archetype, practiceQuestions, richExplanation, gradingEvidence。",
    "sourceImageIndex 表示这道错题来自第几张上传图片，图片索引从 0 开始；无法判断时填 0。",
    "subject 必须是：语文、数学、英语、物理、化学、生物、历史、地理、道德与法治之一。",
    "grade 必须是：七年级、八年级、九年级之一。",
    "knowledgePoints 必须是对象数组，格式如 [{\"name\":\"知识点\",\"confidence\":0.8}]。",
    "archetype 必须是对象，包含 title, pattern, solutionTemplate, commonTraps。",
    "practiceQuestions 必须是对象数组，每项包含 question, answer, hint。",
    "gradingEvidence 必须是对象，包含 markType, markText, deductedScore, teacherMarkConfidence, answerMatchConfidence, judgement, isPartialCredit, needsConfirmation, evidenceSummary, studentAnswerLocation。",
    "markType 只能是 check、cross、partial、deduction、circle、question、none、unknown；judgement 只能是 wrong、partial、suspected、correct、unknown。",
    "必须体现混合策略：识别老师批改标记，同时独立完整解题并对比学生答案，尤其保留半勾、扣分、远距离学生答案区域的信息。",
    "老师批改通常优先看红色红笔标记；黑色或铅笔在选项、图象旁边打的叉，可能是学生排除选项或草稿标记，不能仅凭黑色叉判为错题。",
    ...childExplanationRequirements,
    "如果用户未提供学科或年级，请根据原始内容和图片信息自动判断。",
    "年级判断优先看图片中的明确文字：初一/七年级/7年级/Grade 7 => 七年级；初二/八年级/8年级/Grade 8 => 八年级；初三/九年级/9年级/Grade 9 => 九年级。",
    "如果没有明确年级文字，再根据教材章节和题目难度推断；不要因为示例、学生档案或系统默认值选择八年级数学。",
    "richExplanation 必须是对象，包含 diagnosis, analogy, walkthrough, wrongAnswerInsight, treeContext, illustration, shenzhenExample。",
    "richExplanation.diagnosis 用一句话指出核心漏洞；analogy 必须用孩子熟悉的比方讲清楚。",
    "richExplanation.walkthrough 是 2 到 5 个步骤，每步包含 title 和 body，形成老师板书式讲解。",
    ...richWalkthroughRequirements,
    "richExplanation.treeContext 必须给知识树上下文：path, prerequisites, current, next, confusions。",
    "richExplanation.shenzhenExample 必须给一道深圳题型风格的同类题；如果没有可靠来源，label 必须是“深圳题型风格”。",
    "不要把未核验来源的题目说成深圳真题；只有能确认公开来源时才使用“深圳真题参考”并填写 sourceNote。",
    "richExplanation.illustration 只能是结构化数据，type 只能是 flow、compare、treePath，nodes 最多 8 个；不要输出 HTML、Markdown 或远程图片链接。",
    paperVisionContext,
    `用户提示学科：${input.subjectHint ?? "未提供，请根据图片自动识别"}；用户提示年级：${input.gradeHint ?? "未提供，请根据图片自动识别"}；文件名：${input.filename}。`,
    "原始内容：",
    content
  ].filter(Boolean).join("\n");
}

function buildCompactRepairPrompt(content: string, input: AnalyzeInput) {
  const paperVisionContext = formatPaperVisionContexts(input);
  const answerSheetInstruction = input.paperLayout === "question_pages_with_answer_sheet"
    ? "这组图片混有题目页和答题卡，上传顺序无意义；自行复核页面角色。只可用答题卡上的作答和批改作为判错证据，题目页标记一律忽略；无法明确对应就跳过。按题号对照，sourceImageIndex 只能指向题目页。"
    : "";
  return [
    "请重新生成严格、紧凑 JSON，只输出 JSON 对象。",
    "不要 Markdown，不要 <think>，不要解释，不要扩写讲解。",
    answerSheetInstruction,
    "顶层必须是 {\"analyses\":[...]}，每道错题一个元素。",
    "如果原内容格式损坏，请保留能确定的信息，缺失项用简短但有效的学习分析补齐。",
    "每个元素必须包含 sourceImageIndex, answerSheetImageIndex, subject, grade, questionType, recognizedText, studentAnswer, correctAnswer, knowledgePoints, mistakeReason, studentFriendlyExplanation, example, archetype, practiceQuestions, richExplanation, gradingEvidence。",
    "subject 只能是语文、数学、英语、物理、化学、生物、历史、地理、道德与法治；grade 只能是七年级、八年级、九年级。",
    "knowledgePoints 至少 1 个；practiceQuestions 只给 1 道；richExplanation.walkthrough 只给 2 步；illustration.nodes 最多 3 个。",
    "studentFriendlyExplanation 必须保留完整思路：读题条件、选法原因、关键步骤、错因和检查方法都要交代，保持紧凑但不能只有一句提醒。",
    "richExplanation.walkthrough 的 2 步必须是实质讲解，覆盖“怎么想”和“怎么做”。",
    "字符串里如果出现英文双引号，必须转义为 \\\"。",
    paperVisionContext,
    `用户提示学科：${input.subjectHint ?? "未提供，请根据图片自动识别"}；用户提示年级：${input.gradeHint ?? "未提供，请根据图片自动识别"}；文件名：${input.filename}。`,
    "原始损坏内容：",
    content.slice(0, 4000)
  ].filter(Boolean).join("\n");
}

function buildOcrOnlyPrompt(input: AnalyzeInput) {
  const paperVisionContext = formatPaperVisionContexts(input);
  const answerSheetInstruction = input.paperLayout === "question_pages_with_answer_sheet"
    ? "这组图片混有题目页和答题卡，上传顺序无意义；自行复核页面角色。只可用答题卡上的作答和批改作为判错证据，题目页标记一律忽略；无法明确对应就跳过。按题号对照，只输出题目页的错题。"
    : "";
  return [
    "OCR-only 真实 AI 分析模式。",
    "上一次图片视觉分析请求超时。请不要再请求或等待图片视觉识别，只根据 OCR 证据层、题号候选、文字块坐标和用户提示生成严格 JSON。",
    answerSheetInstruction,
    "如果 OCR 证据不足以确定某一道题是否错了，可以输出 suspected，并设置 gradingEvidence.needsConfirmation 为 true。",
    "JSON 顶层必须是对象，字段为 analyses；analyses 是数组，每个元素代表一道错题。",
    "每个元素必须包含 sourceImageIndex, subject, grade, questionType, recognizedText, studentAnswer, correctAnswer, knowledgePoints, mistakeReason, studentFriendlyExplanation, example, archetype, practiceQuestions, richExplanation, gradingEvidence。",
    "practiceQuestions 只给 1 道；richExplanation.walkthrough 只给 2 到 3 步；illustration.nodes 最多 4 个；保持内容紧凑。",
    "studentFriendlyExplanation 要把 OCR 能确定的题干条件、解法选择、推理步骤、错因和检查办法讲清楚；证据不足的地方要明确说需要人工确认。",
    ...richWalkthroughRequirements,
    paperVisionContext,
    `用户提示学科：${input.subjectHint ?? "未提供，请根据 OCR 自动识别"}；用户提示年级：${input.gradeHint ?? "未提供，请根据 OCR 自动识别"}；文件名：${input.filename}。`
  ].filter(Boolean).join("\n");
}

function buildCoveragePrompt(input: AnalyzeInput, existingAnalyses: AnalysisOutput[]) {
  const paperVisionContext = formatPaperVisionContexts(input);
  return [
    "覆盖校验：上一次分析遗漏了 OCR 错题候选。",
    "请重新输出完整严格 JSON，顶层为 {\"analyses\":[...]}。",
    "必须补齐所有 mistakeCandidates；每一个 mistakeCandidate 至少对应 analyses 中一项。",
    "如果候选不确定，也要输出 suspected，并设置 gradingEvidence.needsConfirmation 为 true，不要直接丢弃。",
    "可以保留已有分析，但必须覆盖填空题、解答题、小题候选，不要只分析选择题。",
    paperVisionContext,
    "已有分析：",
    JSON.stringify({ analyses: existingAnalyses })
  ].filter(Boolean).join("\n");
}

function splitMiniMaxList(value: string, primarySeparators?: RegExp) {
  const separators = primarySeparators ?? /→|->|=>|、|，|,|;|；|\r?\n/g;
  const parts = value
    .split(separators)
    .map((item) => item.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [value.trim()].filter(Boolean);
}

function normalizeStringListField(record: Record<string, unknown>, key: string, primarySeparators?: RegExp) {
  const value = record[key];

  if (typeof value === "string") {
    record[key] = splitMiniMaxList(value, primarySeparators);
  }
}

function normalizeRequiredStringField(record: Record<string, unknown>, key: string, fallback: string) {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    record[key] = fallback;
  }
}

function normalizeConfidence(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value > 1 ? value / 100 : value));
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace("%", ""));
    if (Number.isFinite(parsed)) {
      return Math.min(1, Math.max(0, parsed > 1 ? parsed / 100 : parsed));
    }
  }

  return fallback;
}

function normalizeOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
  }

  return undefined;
}

function normalizeMarkType(value: unknown): (typeof gradingMarkTypes)[number] {
  const text = String(value ?? "").trim().toLowerCase();
  if ((gradingMarkTypes as readonly string[]).includes(text)) {
    return text as (typeof gradingMarkTypes)[number];
  }

  if (/半勾|半对|部分|partial/.test(text)) return "partial";
  if (/扣分|扣\d|deduct|minus/.test(text)) return "deduction";
  if (/打叉|叉|错|×|✕|✗|x\b|cross/.test(text)) return "cross";
  if (/打勾|勾|对|√|✓|check/.test(text)) return "check";
  if (/圈|圆圈|circle/.test(text)) return "circle";
  if (/问号|\?|question/.test(text)) return "question";
  if (/无|没有|none|no mark/.test(text)) return "none";
  return "unknown";
}

function normalizeJudgement(value: unknown): (typeof mistakeJudgements)[number] {
  const text = String(value ?? "").trim().toLowerCase();
  if ((mistakeJudgements as readonly string[]).includes(text)) {
    return text as (typeof mistakeJudgements)[number];
  }

  if (/半对|部分|半错|partial/.test(text)) return "partial";
  if (/疑似|不确定|待确认|suspect/.test(text)) return "suspected";
  if (/全对|正确|对\b|correct/.test(text)) return "correct";
  if (/错误|错|wrong|incorrect/.test(text)) return "wrong";
  return "unknown";
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(true|yes|1|是|需要|需|有)$/i.test(value.trim())) return true;
    if (/^(false|no|0|否|不需要|无|没有)$/i.test(value.trim())) return false;
  }
  return fallback;
}

function normalizeGradingEvidence(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const evidence = { ...(value as Record<string, unknown>) };
  evidence.markType = normalizeMarkType(evidence.markType ?? evidence.mark ?? evidence.teacherMark ?? evidence.markText);
  evidence.judgement = normalizeJudgement(evidence.judgement ?? evidence.result ?? evidence.conclusion);
  evidence.teacherMarkConfidence = normalizeConfidence(evidence.teacherMarkConfidence, 0);
  evidence.answerMatchConfidence = normalizeConfidence(evidence.answerMatchConfidence, 0.5);
  evidence.isPartialCredit =
    normalizeBoolean(evidence.isPartialCredit, evidence.markType === "partial" || evidence.judgement === "partial");
  evidence.needsConfirmation = normalizeBoolean(evidence.needsConfirmation, evidence.judgement === "suspected");

  const deductedScore = normalizeOptionalNumber(evidence.deductedScore);
  if (deductedScore === undefined) {
    delete evidence.deductedScore;
  } else {
    evidence.deductedScore = deductedScore;
  }

  if (typeof evidence.markText !== "string" || evidence.markText.trim().length === 0) {
    delete evidence.markText;
  }

  if (typeof evidence.studentAnswerLocation !== "string" || evidence.studentAnswerLocation.trim().length === 0) {
    delete evidence.studentAnswerLocation;
  }

  normalizeRequiredStringField(evidence, "evidenceSummary", "根据老师批改标记和学生答案对比，判断这道题需要复习。");
  return evidence;
}

function normalizeSingleAnalysisShape(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = { ...(value as Record<string, unknown>) };

  normalizeRequiredStringField(record, "questionType", "未识别题型");
  normalizeRequiredStringField(record, "recognizedText", "图片中未清晰识别到完整题干。");
  normalizeRequiredStringField(record, "studentAnswer", "图片中未清晰识别到学生答案。");
  normalizeRequiredStringField(record, "correctAnswer", "需要结合题目重新推导。");
  normalizeRequiredStringField(record, "mistakeReason", "未识别到明确错因，建议先核对题目条件和作答步骤。");
  normalizeRequiredStringField(
    record,
    "studentFriendlyExplanation",
    "先把题干条件圈出来，分清题目已经给了什么、要求我们求什么。再选择对应的方法或公式，把每一步为什么这样做说清楚，并和自己的答案逐项对照。最后回到题干检查单位、符号、关键词或选项限制，看看错误是从审题、套公式还是计算中出现的。"
  );
  normalizeRequiredStringField(record, "example", "可以先用同类基础题练习，再回到原题。");
  record.gradingEvidence = normalizeGradingEvidence(record.gradingEvidence);

  if (Array.isArray(record.knowledgePoints)) {
    record.knowledgePoints = record.knowledgePoints.map((point) => {
      if (typeof point === "string") {
        return { name: point, confidence: 0.8 };
      }
      return point;
    });
  }
  if (!Array.isArray(record.knowledgePoints) || record.knowledgePoints.length === 0) {
    record.knowledgePoints = [{ name: String(record.questionType), confidence: 0.5 }];
  }

  if (typeof record.archetype === "string") {
    record.archetype = {
      title: record.archetype,
      pattern: record.archetype,
      solutionTemplate: record.archetype,
      commonTraps: ["只记结论，没有套用完整母题模板"]
    };
  } else if (record.archetype && typeof record.archetype === "object" && !Array.isArray(record.archetype)) {
    const archetype = { ...(record.archetype as Record<string, unknown>) };
    normalizeRequiredStringField(archetype, "title", "同类母题");
    normalizeRequiredStringField(archetype, "pattern", "先识别条件，再按步骤求解。");
    normalizeRequiredStringField(archetype, "solutionTemplate", "圈条件、列步骤、核对答案。");
    normalizeStringListField(archetype, "commonTraps");
    if (!Array.isArray(archetype.commonTraps) || archetype.commonTraps.length === 0) {
      archetype.commonTraps = ["只记结论，没有套用完整母题模板"];
    }
    record.archetype = archetype;
  }
  if (!record.archetype || typeof record.archetype !== "object" || Array.isArray(record.archetype)) {
    record.archetype = {
      title: "同类母题",
      pattern: "先识别条件，再按步骤求解。",
      solutionTemplate: "圈条件、列步骤、核对答案。",
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
      if (question && typeof question === "object" && !Array.isArray(question)) {
        const normalizedQuestion = { ...(question as Record<string, unknown>) };
        normalizeRequiredStringField(normalizedQuestion, "question", "请完成一道同类基础题。");
        normalizeRequiredStringField(normalizedQuestion, "answer", "请先尝试作答，再让老师批改。");
        normalizeRequiredStringField(normalizedQuestion, "hint", "套用本题母题模板，先找关键条件，再按步骤判断。");
        return normalizedQuestion;
      }
      return {
        question: "请完成一道同类基础题。",
        answer: "请先尝试作答，再让老师批改。",
        hint: "套用本题母题模板，先找关键条件，再按步骤判断。"
      };
    });
  }
  if (!Array.isArray(record.practiceQuestions) || record.practiceQuestions.length === 0) {
    const archetype = record.archetype as Record<string, unknown>;
    record.practiceQuestions = [
      {
        question: String(record.example),
        answer: String(record.correctAnswer),
        hint: typeof archetype.solutionTemplate === "string"
          ? archetype.solutionTemplate
          : "套用本题母题模板，先找关键条件，再按步骤判断。"
      }
    ];
  }

  if (record.richExplanation && typeof record.richExplanation === "object" && !Array.isArray(record.richExplanation)) {
    const rich = { ...(record.richExplanation as Record<string, unknown>) };

    if (Array.isArray(rich.walkthrough)) {
      rich.walkthrough = rich.walkthrough.map((step, index) => {
        if (typeof step === "string") {
          return { title: `第 ${index + 1} 步`, body: step };
        }
        return step;
      });
    }

    if (rich.treeContext && typeof rich.treeContext === "object" && !Array.isArray(rich.treeContext)) {
      const treeContext = { ...(rich.treeContext as Record<string, unknown>) };
      normalizeStringListField(treeContext, "path", /→|->|=>|、|，|,|;|；|\r?\n/g);
      normalizeStringListField(treeContext, "prerequisites");
      normalizeStringListField(treeContext, "current");
      normalizeStringListField(treeContext, "next");
      normalizeStringListField(treeContext, "confusions");
      rich.treeContext = treeContext;
    }

    if (rich.illustration && typeof rich.illustration === "object" && !Array.isArray(rich.illustration)) {
      const illustration = { ...(rich.illustration as Record<string, unknown>) };
      const type = String(illustration.type);
      if (["flow", "compare", "treePath"].includes(type)) {
        const hasTitle = typeof illustration.title === "string" && illustration.title.trim().length > 0;
        const hasNodes = Array.isArray(illustration.nodes) && illustration.nodes.length > 0;
        if (hasTitle && hasNodes) {
          rich.illustration = illustration;
        } else {
          delete rich.illustration;
        }
      } else {
        rich.illustration = illustration;
      }
    }

    record.richExplanation = rich;
  }

  return record;
}

function normalizeAnalysisShape(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = { ...(value as Record<string, unknown>) };
    if (Array.isArray(record.analyses)) {
      return {
        ...record,
        analyses: record.analyses.map((analysis) => normalizeSingleAnalysisShape(analysis))
      };
    }
  }

  return normalizeSingleAnalysisShape(value);
}

function buildRichExplanationFallback(analysis: z.infer<typeof baseAnalysisSchema>): AnalysisOutput["richExplanation"] {
  const primaryKnowledgePoint = analysis.knowledgePoints[0]?.name ?? analysis.questionType;
  const firstPractice = analysis.practiceQuestions[0];

  return {
    diagnosis: analysis.mistakeReason,
    analogy: analysis.studentFriendlyExplanation,
    walkthrough: [
      {
        title: "先定位题目",
        body: analysis.recognizedText
      },
      {
        title: "再纠正答案",
        body: `孩子答案：${analysis.studentAnswer}。正确答案：${analysis.correctAnswer}。`
      },
      {
        title: "最后套母题",
        body: analysis.archetype.solutionTemplate
      }
    ],
    wrongAnswerInsight: analysis.mistakeReason,
    treeContext: {
      path: [analysis.subject, analysis.grade, analysis.questionType, primaryKnowledgePoint],
      prerequisites: analysis.archetype.commonTraps.slice(0, 3),
      current: analysis.knowledgePoints.map((point) => point.name),
      next: [analysis.archetype.title],
      confusions: analysis.archetype.commonTraps
    },
    illustration: {
      type: "flow",
      title: "从错因到母题",
      nodes: [
        { label: primaryKnowledgePoint, detail: "当前知识点", tone: "focus" },
        { label: "错因", detail: analysis.mistakeReason, tone: "warning" },
        { label: "母题", detail: analysis.archetype.title }
      ]
    },
    shenzhenExample: {
      label: "深圳题型风格",
      question: firstPractice?.question ?? analysis.example,
      answer: firstPractice?.answer ?? analysis.correctAnswer,
      explanation: firstPractice?.hint ?? analysis.archetype.solutionTemplate
    }
  };
}

function parseSingleAnalysis(value: unknown): AnalysisOutput {
  const parsed = analysisSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  const hasMalformedIllustration = parsed.error.issues.some((issue) => issue.path.join(".").startsWith("richExplanation.illustration"));
  if (hasMalformedIllustration) {
    throw parsed.error;
  }

  const base = baseAnalysisSchema.parse(value);
  return { ...base, richExplanation: buildRichExplanationFallback(base) };
}

function parseAnalysis(content: string): AnalysisOutput[] {
  try {
    const normalized = normalizeAnalysisShape(parseJsonObject(content));
    const parsedMany = analysesSchema.safeParse(normalized);
    if (parsedMany.success) {
      return parsedMany.data.analyses;
    }

    if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
      const analyses = (normalized as Record<string, unknown>).analyses;
      if (Array.isArray(analyses)) {
        return analyses.map((analysis) => parseSingleAnalysis(analysis));
      }
    }

    return [parseSingleAnalysis(normalized)];
  } catch (error) {
    throw new Error(`MiniMax response could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function postMiniMax(input: { baseUrl: string; apiKey: string; body: unknown }) {
  let response: Response;
  try {
    response = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input.body),
      signal: AbortSignal.timeout(getMiniMaxTimeoutMs())
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`MiniMax request timed out after ${getMiniMaxTimeoutMs()}ms.`);
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const compactDetail = detail.trim().replace(/\s+/g, " ").slice(0, 500);
    throw new Error(
      compactDetail
        ? `MiniMax request failed with status ${response.status}: ${compactDetail}`
        : `MiniMax request failed with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as MiniMaxResponse;
  const choice = payload.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    throw new Error("MiniMax response did not include message content.");
  }
  if (choice?.finish_reason === "length") {
    console.warn("MiniMax response was truncated; attempting to repair partial JSON content.");
  }

  return content;
}

async function repairMiniMaxContent(input: {
  baseUrl: string;
  apiKey: string;
  analyzeInput: AnalyzeInput;
  content: string;
}) {
  return postMiniMax({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    body: {
      model: process.env.MINIMAX_MODEL ?? defaultModel,
      messages: [
        {
          role: "user",
          content: buildRepairPrompt(input.content, input.analyzeInput)
        }
      ],
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      temperature: 0,
      max_completion_tokens: getMaxCompletionTokensForInput(input.analyzeInput)
    }
  });
}

async function repairMiniMaxContentCompact(input: {
  baseUrl: string;
  apiKey: string;
  analyzeInput: AnalyzeInput;
  content: string;
}) {
  return postMiniMax({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    body: {
      model: process.env.MINIMAX_MODEL ?? defaultModel,
      messages: [
        {
          role: "user",
          content: buildCompactRepairPrompt(input.content, input.analyzeInput)
        }
      ],
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      temperature: 0,
      max_completion_tokens: getMaxCompletionTokensForInput(input.analyzeInput)
    }
  });
}

async function analyzeMiniMaxOcrOnly(input: {
  baseUrl: string;
  apiKey: string;
  analyzeInput: AnalyzeInput;
}) {
  return postMiniMax({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    body: {
      model: process.env.MINIMAX_MODEL ?? defaultModel,
      messages: [
        {
          role: "user",
          content: buildOcrOnlyPrompt(input.analyzeInput)
        }
      ],
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_completion_tokens: getMaxCompletionTokensForInput(input.analyzeInput)
    }
  });
}

async function expandMiniMaxCoverage(input: {
  baseUrl: string;
  apiKey: string;
  analyzeInput: AnalyzeInput;
  existingAnalyses: AnalysisOutput[];
}) {
  return postMiniMax({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    body: {
      model: process.env.MINIMAX_MODEL ?? defaultModel,
      messages: [
        {
          role: "user",
          content: buildCoveragePrompt(input.analyzeInput, input.existingAnalyses)
        }
      ],
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      temperature: 0,
      max_completion_tokens: getMaxCompletionTokensForInput(input.analyzeInput)
    }
  });
}

function isMiniMaxTimeout(error: unknown) {
  return error instanceof Error && error.message.includes("MiniMax request timed out");
}

function getMistakeCandidateCount(input: AnalyzeInput) {
  return input.paperVisionContexts?.reduce((count, context) => count + (context.mistakeCandidates?.length ?? 0), 0) ?? 0;
}

function getMistakeCandidates(input: AnalyzeInput) {
  return input.paperVisionContexts?.flatMap((context) => context.mistakeCandidates ?? []) ?? [];
}

function isCandidateCovered(candidate: PaperVisionMistakeCandidate, analyses: AnalysisOutput[]) {
  const candidateTokens = [candidate.questionId, candidate.subQuestionId, candidate.text]
    .filter((item): item is string => Boolean(item && item.trim()))
    .map((item) => item.trim());

  return analyses.some((analysis) => {
    const haystack = [
      analysis.questionType,
      analysis.recognizedText,
      analysis.studentAnswer,
      analysis.correctAnswer,
      analysis.mistakeReason,
      analysis.gradingEvidence?.evidenceSummary,
      analysis.gradingEvidence?.studentAnswerLocation
    ].filter(Boolean).join("\n");
    return candidateTokens.some((token) => haystack.includes(token));
  });
}

function getMissingMistakeCandidates(input: AnalyzeInput, analyses: AnalysisOutput[]) {
  return getMistakeCandidates(input).filter((candidate) => !isCandidateCovered(candidate, analyses));
}

function inferSubject(input: AnalyzeInput, analyses: AnalysisOutput[]): Subject {
  if (input.subjectHint && subjects.includes(input.subjectHint as Subject)) {
    return input.subjectHint as Subject;
  }
  return analyses[0]?.subject ?? "数学";
}

function inferGrade(input: AnalyzeInput, analyses: AnalysisOutput[]): Grade {
  if (input.gradeHint && grades.includes(input.gradeHint as Grade)) {
    return input.gradeHint as Grade;
  }
  return analyses[0]?.grade ?? "九年级";
}

function buildCandidateFallbackAnalysis(
  candidate: PaperVisionMistakeCandidate,
  input: AnalyzeInput,
  analyses: AnalysisOutput[]
): AnalysisOutput {
  const subject = inferSubject(input, analyses);
  const grade = inferGrade(input, analyses);
  const markType = candidate.markTypes.find((item) => item !== "unknown") ?? "unknown";
  const questionLabel = [candidate.questionId ? `第 ${candidate.questionId} 题` : "未定位题号", candidate.subQuestionId ? `(${candidate.subQuestionId})` : ""].join("");
  const recognizedText = candidate.text ?? `${questionLabel} OCR 候选题干待复核`;

  return {
    sourceImageIndex: 0,
    subject,
    grade,
    questionType: `OCR候选${questionLabel}`,
    recognizedText,
    studentAnswer: "OCR 检测到批改痕迹，但学生答案需要结合原图人工确认。",
    correctAnswer: "需要根据题干重新推导并人工复核。",
    knowledgePoints: [{ name: "待确认知识点", confidence: 0.5 }],
    mistakeReason: candidate.evidenceSummary,
    studentFriendlyExplanation: "这道题附近有批改痕迹，先把题干和自己的答案重新抄清楚，再按步骤核对。",
    example: "先确认题目条件和答案位置，再让老师或 AI 针对清晰题干继续讲解。",
    archetype: {
      title: "OCR候选错题复核",
      pattern: "根据批改痕迹定位疑似错题",
      solutionTemplate: "看题号和批改标记，复核题干、学生答案、正确解法。",
      commonTraps: ["只看 OCR 文本，忽略原图批改痕迹", "没有确认学生答案位置"]
    },
    practiceQuestions: [
      {
        question: "请先重新拍清楚或裁剪这道疑似错题，再完成同类题复习。",
        answer: "以人工复核后的正确答案为准。",
        hint: "重点看红笔标记、题号、学生答案三者是否对应。"
      }
    ],
    gradingEvidence: {
      markType,
      teacherMarkConfidence: candidate.confidence ?? 0.5,
      answerMatchConfidence: 0.2,
      judgement: candidate.judgement === "unknown" ? "suspected" : candidate.judgement,
      isPartialCredit: candidate.judgement === "partial",
      needsConfirmation: true,
      evidenceSummary: candidate.evidenceSummary,
      studentAnswerLocation: candidate.bbox ? `OCR候选区域 ${formatBox(candidate.bbox)}` : undefined
    }
  };
}

function appendCandidateFallbackAnalyses(input: AnalyzeInput, analyses: AnalysisOutput[]) {
  const missingCandidates = getMissingMistakeCandidates(input, analyses);
  if (missingCandidates.length === 0) {
    return analyses;
  }
  return [
    ...analyses,
    ...missingCandidates.map((candidate) => buildCandidateFallbackAnalysis(candidate, input, analyses))
  ];
}

async function parseWithRepairs(input: {
  baseUrl: string;
  apiKey: string;
  analyzeInput: AnalyzeInput;
  content: string;
}) {
  try {
    return parseAnalysis(input.content);
  } catch {
    try {
      const repairedContent = await repairMiniMaxContent({
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        analyzeInput: input.analyzeInput,
        content: input.content
      });
      try {
        return parseAnalysis(repairedContent);
      } catch {
        const compactContent = await repairMiniMaxContentCompact({
          baseUrl: input.baseUrl,
          apiKey: input.apiKey,
          analyzeInput: input.analyzeInput,
          content: repairedContent
        });
        return parseAnalysis(compactContent);
      }
    } catch (repairError) {
      if (getMistakeCandidateCount(input.analyzeInput) > 0) {
        return appendCandidateFallbackAnalyses(input.analyzeInput, []);
      }

      throw repairError;
    }
  }
}

export async function analyzeWithMiniMax(input: AnalyzeInput): Promise<AnalysisOutput[]> {
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
  let content: string;
  try {
    content = await postMiniMax({
      baseUrl,
      apiKey,
      body: {
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
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_completion_tokens: getMaxCompletionTokensForInput(input)
      }
    });
  } catch (error) {
    if (!isMiniMaxTimeout(error) || !input.paperVisionContexts?.some((context) => context.status === "available")) {
      throw error;
    }

    content = await analyzeMiniMaxOcrOnly({ baseUrl, apiKey, analyzeInput: input });
  }

  const analyses = await parseWithRepairs({ baseUrl, apiKey, analyzeInput: input, content });
  const candidateCount = getMistakeCandidateCount(input);
  const missingCandidates = getMissingMistakeCandidates(input, analyses);
  if (candidateCount > 0 && missingCandidates.length > 0) {
    try {
      const expandedContent = await expandMiniMaxCoverage({ baseUrl, apiKey, analyzeInput: input, existingAnalyses: analyses });
      return appendCandidateFallbackAnalyses(input, await parseWithRepairs({ baseUrl, apiKey, analyzeInput: input, content: expandedContent }));
    } catch {
      return appendCandidateFallbackAnalyses(input, analyses);
    }
  }

  return analyses;
}

export async function detectAnswerSheetMistakesWithMiniMax(input: {
  images: Array<{ originalIndex: number; filename: string; mimeType: string; imageBase64: string; part?: string }>;
}) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey || input.images.length === 0) return [];
  const baseUrl = (process.env.MINIMAX_BASE_URL ?? defaultMiniMaxBaseUrl).replace(/\/+$/, "");
  const content = await postMiniMax({
    baseUrl,
    apiKey,
    body: {
      model: process.env.MINIMAX_MODEL ?? defaultModel,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "你只负责识别答题卡上的老师批改结果，不解题，不看题目页。",
              "逐张、逐栏、逐题扫描所有印刷题号，找出所有明确有红叉、半叉、半勾或红色扣分数字的题号；勾号和没有批改的题不要输出。",
              "题号必须来自答题卡印刷题号。扣6分、扣8分等数字要写入 deductedScore；半叉、半勾用 partial。",
              "只认老师的红色批改，不要把学生的黑色或蓝色书写、划线、改写当成红叉或扣分。",
              "无法确定题号或批改含义时不要猜测，不输出该项。",
              `图片顺序与来源：${input.images.map((image, index) => `第${index + 1}张=原始索引${image.originalIndex}的${image.part ?? "整页"}`).join("；")}。同一原图可能被分区展示，结果要按题号去重；answerSheetImageIndex 必须填写对应原始索引。`,
              "只输出严格 JSON：{\"candidates\":[{\"answerSheetImageIndex\":0,\"questionId\":\"10\",\"markType\":\"deduction\",\"deductedScore\":6,\"confidence\":0.9,\"evidenceSummary\":\"第10题有红叉并扣6分\"}]}"
            ].join("\n")
          },
          ...input.images.map((image) => ({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.imageBase64}` } }))
        ]
      }],
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      temperature: 0,
      max_completion_tokens: 3000
    }
  });
  return answerSheetDetectionSchema.parse(parseJsonObject(content)).candidates;
}
