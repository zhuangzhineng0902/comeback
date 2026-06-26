export const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "道德与法治"] as const;
export const grades = ["七年级", "八年级", "九年级"] as const;

export type Subject = (typeof subjects)[number];
export type Grade = (typeof grades)[number];
export type MasteryStatus = "new" | "reviewing" | "mastered";
export type GapSeverity = "normal" | "weak" | "important" | "repeated_archetype";

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
};
