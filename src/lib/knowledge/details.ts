import { prisma } from "@/lib/db";
import type { GapSeverity, RichExplanation } from "@/lib/types";

const STUDENT_ID = "default-student";

type KnowledgePointRecord = {
  id: string;
  subject: string;
  grade: string;
  name: string;
  chapter: string;
  parentId: string | null;
  parent: { id: string; name: string; chapter: string } | null;
  children: Array<{ id: string; name: string; chapter: string; sortOrder: number }>;
};

type KnowledgeGapRecord = {
  id: string;
  knowledgePointId: string;
  severity: string;
  errorCount: number;
  repeatedArchetypeCount: number;
  reviewSuggestion: string;
  typicalReasons: string;
};

type MistakeRecord = {
  id: string;
  imagePath: string;
  subject: string;
  grade: string;
  questionType: string;
  recognizedText: string;
  studentAnswer: string;
  correctAnswer: string;
  explanation: string;
  mistakeReason: string;
  masteryStatus: string;
  createdAt: Date;
};

type ArchetypeRecord = {
  id: string;
  title: string;
  pattern: string;
  solutionTemplate: string;
  commonTraps: string;
  mistakeArchetypes: Array<{ mistake: MistakeRecord }>;
};

export type KnowledgePointDetail = {
  knowledgePoint: KnowledgePointRecord;
  gap: KnowledgeGapRecord | null;
  richExplanation: RichExplanation;
  archetypes: Array<{
    id: string;
    title: string;
    pattern: string;
    solutionTemplate: string;
    commonTraps: string[];
  }>;
  relatedMistakes: MistakeRecord[];
};

function parseStringArray(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalizeSeverity(value: string | undefined): GapSeverity {
  if (value === "weak" || value === "important" || value === "repeated_archetype") {
    return value;
  }
  return "normal";
}

function subjectAnalogy(point: KnowledgePointRecord) {
  const name = point.name;
  if (point.subject === "数学" || point.subject === "物理" || point.subject === "化学") {
    return `${name}像一套检查仪表：先看题目给了哪些量，再按固定关系一步步代入。少看一个条件，后面的结果就容易偏。`;
  }
  if (point.subject === "英语" || point.subject === "语文") {
    return `${name}像读句子的路标：先找关键词和结构，再判断它在整句话里承担什么作用，不能只凭第一感觉选答案。`;
  }
  return `${name}像在地图上定位：先确定大章节，再找到当前小知识点，最后看它和前后知识的联系。`;
}

function makeGenericQuestion(point: KnowledgePointRecord, archetype: ArchetypeRecord | undefined) {
  if (archetype) {
    return `围绕“${archetype.pattern}”设计一道题，要求说明每一步为什么这样做。`;
  }
  return `围绕“${point.name}”设计一道基础题，要求先写出已知条件，再写出解题步骤。`;
}

function makeRichExplanation(input: {
  point: KnowledgePointRecord;
  gap: KnowledgeGapRecord | null;
  archetypes: ArchetypeRecord[];
  relatedMistakes: MistakeRecord[];
}): RichExplanation {
  const { point, gap, archetypes, relatedMistakes } = input;
  const firstArchetype = archetypes[0];
  const firstMistake = relatedMistakes[0];
  const typicalReasons = parseStringArray(gap?.typicalReasons);
  const traps = firstArchetype ? parseStringArray(firstArchetype.commonTraps) : [];
  const mainReason = typicalReasons[0] ?? traps[0] ?? firstMistake?.mistakeReason ?? "对关键条件和解题步骤的对应关系还不够稳定。";
  const question = firstMistake?.recognizedText ?? makeGenericQuestion(point, firstArchetype);
  const answer = firstMistake?.correctAnswer ?? firstArchetype?.solutionTemplate ?? "先定位知识点，再按步骤完整作答。";
  const explanation = firstMistake?.explanation ?? firstArchetype?.solutionTemplate ?? `${point.name}的复习重点是把概念、条件和步骤连起来。`;

  return {
    diagnosis: `当前漏洞集中在“${point.name}”。从错题记录看，主要问题是：${mainReason}`,
    analogy: subjectAnalogy(point),
    walkthrough: [
      {
        title: "先定位这片叶子",
        body: `它属于 ${point.grade} ${point.subject} 的“${point.chapter}”。做题时先判断题目是不是在考这个知识点，避免把相近题型混在一起。`
      },
      {
        title: "再抓关键条件",
        body: firstArchetype
          ? `这类母题通常长这样：${firstArchetype.pattern}。解题模板是：${firstArchetype.solutionTemplate}`
          : `把题干中的关键词、数量关系、图像信息或句子结构圈出来，再逐条对应到“${point.name}”。`
      },
      {
        title: "最后用错题反查",
        body: firstMistake
          ? `这道相关错题里，孩子答案是“${firstMistake.studentAnswer}”，正确答案是“${firstMistake.correctAnswer}”。复习时要问：哪一步开始偏了？`
          : "如果暂时没有关联错题，可以先用一题多变的方式练：换数字、换问法、换情境，但保留同一个核心知识点。"
      }
    ],
    wrongAnswerInsight: `容易出错的位置：${mainReason}`,
    treeContext: {
      path: [point.subject, point.grade, point.chapter, point.parent?.name, point.name].filter((item): item is string => Boolean(item)),
      prerequisites: point.parent ? [point.parent.name] : [point.chapter],
      current: [point.name],
      next: point.children.map((child) => child.name).slice(0, 4),
      confusions: [...typicalReasons, ...traps].slice(0, 4)
    },
    illustration: {
      type: "treePath",
      title: "从知识树看到当前漏洞",
      nodes: [
        { label: point.subject, detail: "学科", tone: "normal" },
        { label: point.grade, detail: "年级", tone: "normal" },
        { label: point.chapter, detail: "章节", tone: "normal" },
        ...(point.parent ? [{ label: point.parent.name, detail: "上位知识", tone: "normal" as const }] : []),
        {
          label: point.name,
          detail: `错误 ${gap?.errorCount ?? 0} 次，高频母题 ${gap?.repeatedArchetypeCount ?? 0} 次`,
          tone: normalizeSeverity(gap?.severity) === "normal" ? "focus" : "warning"
        }
      ]
    },
    shenzhenExample: {
      label: "深圳题型风格",
      sourceNote: "基于当前错题与母题生成的真题风格练习，非原题引用",
      question,
      answer,
      explanation
    }
  };
}

export async function getKnowledgePointDetail(id: string): Promise<KnowledgePointDetail | null> {
  const point = await prisma.knowledgePoint.findFirst({
    where: { id },
    include: {
      parent: true,
      children: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }
    }
  });

  if (!point) {
    return null;
  }

  const [gap, archetypes] = await Promise.all([
    prisma.knowledgeGap.findFirst({
      where: {
        studentId: STUDENT_ID,
        knowledgePointId: id
      }
    }),
    prisma.archetype.findMany({
      where: { knowledgePointId: id },
      include: {
        mistakeArchetypes: {
          where: { mistake: { studentId: STUDENT_ID } },
          include: { mistake: true },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { title: "asc" }
    })
  ]);

  const relatedMistakesById = new Map<string, MistakeRecord>();
  for (const archetype of archetypes as ArchetypeRecord[]) {
    for (const relation of archetype.mistakeArchetypes) {
      relatedMistakesById.set(relation.mistake.id, relation.mistake);
    }
  }
  const relatedMistakes = [...relatedMistakesById.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    knowledgePoint: point as KnowledgePointRecord,
    gap: gap ? ({ ...gap, severity: normalizeSeverity(gap.severity) } as KnowledgeGapRecord) : null,
    richExplanation: makeRichExplanation({
      point: point as KnowledgePointRecord,
      gap: gap as KnowledgeGapRecord | null,
      archetypes: archetypes as ArchetypeRecord[],
      relatedMistakes
    }),
    archetypes: (archetypes as ArchetypeRecord[]).map((archetype) => ({
      id: archetype.id,
      title: archetype.title,
      pattern: archetype.pattern,
      solutionTemplate: archetype.solutionTemplate,
      commonTraps: parseStringArray(archetype.commonTraps)
    })),
    relatedMistakes
  };
}
