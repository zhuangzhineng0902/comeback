export type PracticeSource = {
  mistakeId: string;
  subject: string;
  grade: string;
  questionType: string;
  recognizedText: string;
  mistakeReason: string;
  correctAnswer: string;
  archetype: {
    id: string;
    title: string;
    pattern: string;
    solutionTemplate: string;
    commonTraps: string;
    knowledgePoint: {
      name: string;
      chapter: string;
    };
  };
};

export type SimulatedPracticeQuestion = {
  id: string;
  subject: string;
  grade: string;
  knowledgePointName: string;
  archetypeTitle: string;
  sourceMistakeId: string;
  sourceQuestionType: string;
  stem: string;
  options?: string[];
  answer: string;
  hint: string;
  solution: string;
  trapFocus: string;
};

export type PracticeSet = {
  id: string;
  title: string;
  createdAt: string;
  sourceMistakeCount: number;
  sourceArchetypeCount: number;
  questions: SimulatedPracticeQuestion[];
};

function parseTraps(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function quadrantAnswer(k: number, b: number) {
  if (k > 0 && b > 0) {
    return "第一、二、三象限";
  }
  if (k > 0 && b < 0) {
    return "第一、三、四象限";
  }
  if (k < 0 && b > 0) {
    return "第一、二、四象限";
  }
  return "第二、三、四象限";
}

function makeLinearFunctionQuestion(source: PracticeSource, index: number): SimulatedPracticeQuestion {
  const variants = [
    { k: 2, b: -5 },
    { k: -3, b: 4 },
    { k: 4, b: 1 },
    { k: -2, b: -6 },
    { k: 1, b: -3 },
    { k: -1, b: 5 }
  ];
  const item = variants[index % variants.length];
  const expression = `y = ${item.k === 1 ? "" : item.k === -1 ? "-" : item.k}x ${item.b >= 0 ? "+" : "-"} ${Math.abs(item.b)}`;
  const answer = quadrantAnswer(item.k, item.b);

  return {
    id: `${source.archetype.id}-${index}`,
    subject: source.subject,
    grade: source.grade,
    knowledgePointName: source.archetype.knowledgePoint.name,
    archetypeTitle: source.archetype.title,
    sourceMistakeId: source.mistakeId,
    sourceQuestionType: source.questionType,
    stem: `已知一次函数 ${expression}，判断它的图像经过哪些象限，并说明理由。`,
    answer,
    hint: "先看 k 判断图像上升或下降，再看 b 判断与 y 轴交点位置。",
    solution: `k = ${item.k}，${item.k > 0 ? "图像从左到右上升" : "图像从左到右下降"}；b = ${item.b}，图像与 y 轴交在${item.b > 0 ? "正" : "负"}半轴，所以经过${answer}。`,
    trapFocus: "不要只看 b，也不要把上升和下降方向记反。"
  };
}

function makeThereBeQuestion(source: PracticeSource, index: number): SimulatedPracticeQuestion {
  const variants = [
    {
      stem: "There ____ two notebooks and a ruler in the schoolbag.",
      answer: "are",
      nearest: "two notebooks"
    },
    {
      stem: "There ____ a dictionary and three exercise books on the desk.",
      answer: "is",
      nearest: "a dictionary"
    },
    {
      stem: "There ____ some milk and two eggs in the kitchen.",
      answer: "is",
      nearest: "some milk"
    },
    {
      stem: "There ____ three students and a teacher in the classroom.",
      answer: "are",
      nearest: "three students"
    },
    {
      stem: "There ____ an orange and some apples in the basket.",
      answer: "is",
      nearest: "an orange"
    }
  ];
  const item = variants[index % variants.length];

  return {
    id: `${source.archetype.id}-${index}`,
    subject: source.subject,
    grade: source.grade,
    knowledgePointName: source.archetype.knowledgePoint.name,
    archetypeTitle: source.archetype.title,
    sourceMistakeId: source.mistakeId,
    sourceQuestionType: source.questionType,
    stem: `${item.stem}  A. is  B. are  C. am`,
    options: ["A. is", "B. are", "C. am"],
    answer: item.answer,
    hint: `看空格后最近的名词：${item.nearest}。`,
    solution: `There be 句型遵循就近原则，最近的主语是 ${item.nearest}，所以填 ${item.answer}。`,
    trapFocus: "不要被后面更远的名词单复数干扰。"
  };
}

function makeArithmeticQuestion(source: PracticeSource, index: number): SimulatedPracticeQuestion {
  const variants = [
    { stem: "计算：-12 + 7 - (-5)", answer: "0", solution: "-12 + 7 + 5 = 0" },
    { stem: "计算：(-3) × 4 - 18 ÷ (-6)", answer: "-9", solution: "-12 - (-3) = -9" },
    { stem: "计算：-2² + (-3)² - 5", answer: "0", solution: "-4 + 9 - 5 = 0，注意 -2² 表示 -(2²)。" },
    { stem: "计算：|-8| - 3 × (-2)", answer: "14", solution: "8 - (-6) = 14" }
  ];
  const item = variants[index % variants.length];

  return {
    id: `${source.archetype.id}-${index}`,
    subject: source.subject,
    grade: source.grade,
    knowledgePointName: source.archetype.knowledgePoint.name,
    archetypeTitle: source.archetype.title,
    sourceMistakeId: source.mistakeId,
    sourceQuestionType: source.questionType,
    stem: item.stem,
    answer: item.answer,
    hint: "先处理符号和括号，再按运算顺序计算。",
    solution: item.solution,
    trapFocus: "注意负号、括号和乘方的优先级。"
  };
}

function makeEnglishFormQuestion(source: PracticeSource, index: number): SimulatedPracticeQuestion {
  const variants = [
    {
      stem: "根据句意，用括号中所给词的适当形式填空：The new bridge makes the trip more ____ for people in this town. (convenience)",
      answer: "convenient",
      hint: "空格前有 more，后面需要形容词。",
      solution: "convenience 是名词，句中 more 后修饰名词 trip 的状态，应改为形容词 convenient。"
    },
    {
      stem: "根据句意，用括号中所给词的适当形式填空：His ____ helped the team finish the project on time. (decide)",
      answer: "decision",
      hint: "形容词性物主代词 His 后面通常接名词。",
      solution: "decide 是动词，His 后需要名词，decision 表示“决定”。"
    },
    {
      stem: "根据句意，用括号中所给词的适当形式填空：The children should learn to protect ____ when they are alone. (they)",
      answer: "themselves",
      hint: "主语和宾语指同一群人时，用反身代词。",
      solution: "children 对应 they，保护他们自己要用反身代词 themselves。"
    },
    {
      stem: "根据句意，用括号中所给词的适当形式填空：The story is one of the ____ books I have read this year. (interesting)",
      answer: "most interesting",
      hint: "one of the 后常接形容词最高级 + 名词复数。",
      solution: "one of the ... books 表示“最……的书之一”，interesting 的最高级是 most interesting。"
    }
  ];
  const item = variants[index % variants.length];

  return {
    id: `${source.archetype.id}-${index}`,
    subject: source.subject,
    grade: source.grade,
    knowledgePointName: source.archetype.knowledgePoint.name,
    archetypeTitle: source.archetype.title,
    sourceMistakeId: source.mistakeId,
    sourceQuestionType: source.questionType,
    stem: item.stem,
    answer: item.answer,
    hint: item.hint,
    solution: item.solution,
    trapFocus: "先判断空格所需词性，再考虑固定搭配、单复数、时态或大小写。"
  };
}

function makeCongruenceQuestion(source: PracticeSource, index: number): SimulatedPracticeQuestion {
  const variants = [
    {
      stem: "如图意：在 △ABC 和 △DEF 中，AB = DE，AC = DF，∠A = ∠D。求证：△ABC ≌ △DEF，并写出判定依据。",
      answer: "△ABC ≌ △DEF，依据 SAS。",
      solution: "已知两组对应边 AB = DE、AC = DF，且夹角 ∠A = ∠D 相等，所以由 SAS 可证两三角形全等。"
    },
    {
      stem: "在 △ABC 和 △ADE 中，AB = AD，AC = AE，且点 B、A、D 共线，点 C、A、E 共线。求证：∠B = ∠D。",
      answer: "先证 △ABC ≌ △ADE，再得 ∠B = ∠D。",
      solution: "由 AB = AD、AC = AE，且 ∠BAC 与 ∠DAE 为对顶角相等，可用 SAS 证明三角形全等，再由全等三角形对应角相等得到结论。"
    },
    {
      stem: "在 △ABC 中，D 是 BC 中点，AD ⊥ BC。求证：AB = AC，并说明用到了哪两个直角三角形。",
      answer: "AB = AC；比较 Rt△ADB 和 Rt△ADC。",
      solution: "BD = DC，AD 为公共边，∠ADB = ∠ADC = 90°，所以 Rt△ADB ≌ Rt△ADC，得到 AB = AC。"
    }
  ];
  const item = variants[index % variants.length];

  return {
    id: `${source.archetype.id}-${index}`,
    subject: source.subject,
    grade: source.grade,
    knowledgePointName: source.archetype.knowledgePoint.name,
    archetypeTitle: source.archetype.title,
    sourceMistakeId: source.mistakeId,
    sourceQuestionType: source.questionType,
    stem: item.stem,
    answer: item.answer,
    hint: "先找对应边、对应角，再选择 SSS、SAS、ASA、AAS 或 HL。",
    solution: item.solution,
    trapFocus: "证明全等前要先写清对应关系，不能只罗列条件。"
  };
}

function makeMotionDiscussionQuestion(source: PracticeSource, index: number): SimulatedPracticeQuestion {
  const variants = [
    {
      stem: "点 P 从 A 出发沿线段 AB 向 B 运动，AB = 12，速度为每秒 2 个单位；点 Q 从 B 出发沿 BA 向 A 运动，速度为每秒 1 个单位。设运动时间为 t 秒。① 写出 AP、BQ；② 当两点相遇时求 t。",
      answer: "AP = 2t，BQ = t；t = 4。",
      solution: "AP = 2t，BQ = t。相遇时 AP + BQ = AB，所以 2t + t = 12，解得 t = 4。"
    },
    {
      stem: "点 M 从 C 出发沿 CD 运动，CD = 10，速度为每秒 1 个单位；点 N 从 D 出发沿 DC 运动，速度为每秒 3 个单位。设运动时间为 t 秒。① 写出 CM、DN；② 当两点相遇时求 t。",
      answer: "CM = t，DN = 3t；t = 2.5。",
      solution: "相遇时 CM + DN = CD，所以 t + 3t = 10，解得 t = 2.5。"
    },
    {
      stem: "线段 AB = 9，点 P 从 A 向 B 运动，每秒 1 个单位；点 Q 从 B 向 A 运动，每秒 2 个单位。设 t 秒后两点距离为 3，求 t。",
      answer: "t = 2 或 t = 4。",
      solution: "相遇前距离为 9 - 3t，令 9 - 3t = 3 得 t = 2；相遇后距离为 3t - 9，令 3t - 9 = 3 得 t = 4。"
    }
  ];
  const item = variants[index % variants.length];

  return {
    id: `${source.archetype.id}-${index}`,
    subject: source.subject,
    grade: source.grade,
    knowledgePointName: source.archetype.knowledgePoint.name,
    archetypeTitle: source.archetype.title,
    sourceMistakeId: source.mistakeId,
    sourceQuestionType: source.questionType,
    stem: item.stem,
    answer: item.answer,
    hint: "先写路程 = 速度 × 时间，再判断是否需要分相遇前后讨论。",
    solution: item.solution,
    trapFocus: "动点题不要跳过取值范围和分段讨论。"
  };
}

function makeGenericQuestion(source: PracticeSource, index: number): SimulatedPracticeQuestion {
  const traps = parseTraps(source.archetype.commonTraps);
  const trap = traps[index % Math.max(traps.length, 1)] ?? source.mistakeReason;
  const action = index % 2 === 0 ? "判断结论是否成立" : "补全关键步骤";

  return {
    id: `${source.archetype.id}-${index}`,
    subject: source.subject,
    grade: source.grade,
    knowledgePointName: source.archetype.knowledgePoint.name,
    archetypeTitle: source.archetype.title,
    sourceMistakeId: source.mistakeId,
    sourceQuestionType: source.questionType,
    stem: `【${source.archetype.knowledgePoint.name}】围绕母题“${source.archetype.title}”，${action}：题目给出一组同类条件，要求先圈出关键条件，再按模板完成解答。`,
    answer: "按母题模板完整作答，关键条件和结论要一一对应。",
    hint: source.archetype.solutionTemplate,
    solution: `这类题按母题模板处理：${source.archetype.solutionTemplate}`,
    trapFocus: trap
  };
}

function generateOne(source: PracticeSource, index: number) {
  const title = `${source.archetype.title}${source.archetype.pattern}${source.archetype.knowledgePoint.name}`;
  if (source.subject === "数学" && title.includes("一次函数")) {
    return makeLinearFunctionQuestion(source, index);
  }
  if (source.subject === "英语" && /there\s*be|There be|就近原则/i.test(title)) {
    return makeThereBeQuestion(source, index);
  }
  if (source.subject === "英语") {
    return makeEnglishFormQuestion(source, index);
  }
  if (source.subject === "数学" && title.includes("有理数")) {
    return makeArithmeticQuestion(source, index);
  }
  if (source.subject === "数学" && title.includes("全等")) {
    return makeCongruenceQuestion(source, index);
  }
  if (source.subject === "数学" && (title.includes("动点") || title.includes("分类讨论"))) {
    return makeMotionDiscussionQuestion(source, index);
  }
  return makeGenericQuestion(source, index);
}

export function generatePracticeSet(input: {
  sources: PracticeSource[];
  count: number;
  subject?: string | null;
  grade?: string | null;
}): PracticeSet {
  const uniqueArchetypes = new Set(input.sources.map((source) => source.archetype.id));
  const titleScope = [input.grade, input.subject].filter(Boolean).join(" · ");
  const title = titleScope ? `${titleScope} 错题模拟练习` : "错题模拟练习";
  const questions: SimulatedPracticeQuestion[] = [];

  if (input.sources.length > 0) {
    for (let index = 0; index < input.count; index += 1) {
      const source = input.sources[index % input.sources.length];
      questions.push(generateOne(source, index));
    }
  }

  return {
    id: `practice-${Date.now()}`,
    title,
    createdAt: new Date().toISOString(),
    sourceMistakeCount: new Set(input.sources.map((source) => source.mistakeId)).size,
    sourceArchetypeCount: uniqueArchetypes.size,
    questions
  };
}
