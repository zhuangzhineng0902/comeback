export type StudyIntentCategory = "study" | "game" | "entertainment" | "chat" | "bypass";

export type StudyIntentResult = {
  allowed: boolean;
  category: StudyIntentCategory;
};

const blockedPatterns: Array<{ category: Exclude<StudyIntentCategory, "study">; keywords: string[] }> = [
  { category: "game", keywords: ["游戏", "通关", "皮肤", "抽卡", "王者", "原神", "和平精英"] },
  { category: "entertainment", keywords: ["短视频", "视频推荐", "追剧", "综艺", "明星", "电影"] },
  { category: "bypass", keywords: ["绕过", "解除限制", "不要管规则", "假装不是学习"] },
  { category: "chat", keywords: ["陪我闲聊", "讲笑话", "无聊", "八卦"] }
];

const studyKeywords = [
  "题",
  "错题",
  "知识点",
  "讲解",
  "复习",
  "考试",
  "数学",
  "语文",
  "英语",
  "物理",
  "化学",
  "生物",
  "历史",
  "地理",
  "道德与法治",
  "道法",
  "函数",
  "阅读",
  "作文",
  "语法",
  "练习"
];

export function classifyStudyIntent(input: string): StudyIntentResult {
  const normalized = input.trim().toLowerCase();

  for (const pattern of blockedPatterns) {
    if (pattern.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return { allowed: false, category: pattern.category };
    }
  }

  if (studyKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return { allowed: true, category: "study" };
  }

  return { allowed: false, category: "chat" };
}

export function createStudyRefusal(category: Exclude<StudyIntentCategory, "study">): string {
  const topic =
    category === "game"
      ? "游戏相关内容"
      : category === "entertainment"
        ? "娱乐视频内容"
        : "这个内容";

  return `我主要帮你学习，${topic}我不能帮你查。我们可以回到刚才的错题，我帮你把关键步骤讲清楚，或者给你出一道类似题练练。`;
}
