export const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "道德与法治"] as const;
export const grades = ["七年级", "八年级", "九年级"] as const;

export type Subject = (typeof subjects)[number];
export type Grade = (typeof grades)[number];
export type MasteryStatus = "new" | "reviewing" | "mastered";
export type GapSeverity = "normal" | "weak" | "important" | "repeated_archetype";

export type RichIllustrationType = "flow" | "compare" | "treePath";
export type RichIllustrationTone = "normal" | "focus" | "warning";

export type RichIllustration = {
  type: RichIllustrationType;
  title: string;
  nodes: Array<{
    label: string;
    detail?: string;
    tone?: RichIllustrationTone;
  }>;
};

export type RichExplanation = {
  diagnosis: string;
  analogy: string;
  walkthrough: Array<{ title: string; body: string }>;
  wrongAnswerInsight: string;
  treeContext: {
    path: string[];
    prerequisites: string[];
    current: string[];
    next: string[];
    confusions: string[];
  };
  illustration?: RichIllustration;
  shenzhenExample: {
    label: "深圳题型风格" | "深圳真题参考";
    sourceNote?: string;
    question: string;
    answer: string;
    explanation: string;
  };
};

export type GradingMarkType = "check" | "cross" | "partial" | "deduction" | "circle" | "question" | "none" | "unknown";
export type MistakeJudgement = "wrong" | "partial" | "suspected" | "correct" | "unknown";

export type GradingEvidence = {
  markType: GradingMarkType;
  markText?: string;
  deductedScore?: number;
  teacherMarkConfidence: number;
  answerMatchConfidence: number;
  judgement: MistakeJudgement;
  isPartialCredit: boolean;
  needsConfirmation: boolean;
  evidenceSummary: string;
  studentAnswerLocation?: string;
};

export type PaperVisionBox = [number, number, number, number];

export type PaperVisionTextBlock = {
  text: string;
  bbox?: PaperVisionBox;
  confidence?: number;
  role?: "question" | "studentAnswer" | "teacherMark" | "other";
};

export type PaperVisionQuestionCandidate = {
  questionId?: string;
  text?: string;
  bbox?: PaperVisionBox;
  confidence?: number;
};

export type PaperVisionGradingMark = {
  markType: GradingMarkType;
  markText?: string;
  bbox?: PaperVisionBox;
  confidence?: number;
  source?: "red-ink" | "ocr-text" | "vision" | "yolo-error-mark" | "yolo-error-mark-review" | "unknown";
  requiresManualReview?: boolean;
};

export type PaperVisionMistakeCandidate = {
  questionId?: string;
  subQuestionId?: string;
  text?: string;
  bbox?: PaperVisionBox;
  confidence?: number;
  markTypes: GradingMarkType[];
  judgement: MistakeJudgement;
  requiresManualReview?: boolean;
  evidenceSummary: string;
};

export type PaperVisionLayoutRegion = {
  regionType: "student_id" | "subjective_question" | "fillin_question" | "objective_question" | "unknown";
  bbox?: PaperVisionBox;
  confidence?: number;
  source?: "ocrautoscore-yolov8" | "unknown";
};

export type PaperVisionDebugArtifact = {
  kind: "layout" | "grading-original" | "combined-ocr" | "metadata" | "unknown";
  path?: string;
  url?: string;
};

export type PaperVisionContext = {
  sourceImageIndex: number;
  engine: "ocr" | "autocut" | "vision" | "unknown";
  status: "available" | "unavailable" | "failed";
  summary: string;
  rawText?: string;
  textBlocks: PaperVisionTextBlock[];
  questionCandidates: PaperVisionQuestionCandidate[];
  layoutRegions?: PaperVisionLayoutRegion[];
  pageRoleHint?: "answer_sheet" | "question" | "unknown";
  gradingMarks?: PaperVisionGradingMark[];
  mistakeCandidates?: PaperVisionMistakeCandidate[];
  debugArtifacts?: PaperVisionDebugArtifact[];
};

export type AnalysisOutput = {
  sourceImageIndex?: number;
  answerSheetImageIndex?: number;
  subject: Subject;
  grade: Grade;
  questionType: string;
  recognizedText: string;
  studentAnswer: string;
  correctAnswer: string;
  knowledgePoints: Array<{ name: string; confidence: number }>;
  mistakeReason: string;
  studentFriendlyExplanation: string;
  example: string;
  archetype: {
    title: string;
    pattern: string;
    solutionTemplate: string;
    commonTraps: string[];
  };
  practiceQuestions: Array<{ question: string; answer: string; hint: string }>;
  richExplanation?: RichExplanation;
  gradingEvidence?: GradingEvidence;
};
