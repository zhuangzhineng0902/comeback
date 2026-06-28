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

export type AnalysisOutput = {
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
};
