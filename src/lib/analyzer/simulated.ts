import type { AnalysisOutput, Grade, Subject } from "@/lib/types";

export type AnalyzeInput = {
  filename: string;
  mimeType?: string;
  imageBase64?: string;
  images?: Array<{
    filename: string;
    mimeType: string;
    imageBase64: string;
  }>;
  subjectHint?: Subject;
  gradeHint?: Grade;
};

export async function analyzeWithSimulation(input: AnalyzeInput): Promise<AnalysisOutput> {
  const subject = input.subjectHint ?? "英语";
  const grade = input.gradeHint ?? "七年级";

  if (subject === "数学") {
    return {
      subject,
      grade,
      questionType: "函数图像判断题",
      recognizedText: "已知一次函数 y = 2x - 3，判断函数图像经过的象限，并说明理由。",
      studentAnswer: "学生只判断了 b = -3，所以认为图像只经过第四象限。",
      correctAnswer: "函数图像经过第一、三、四象限。",
      knowledgePoints: [{ name: "一次函数图像与性质", confidence: 0.92 }],
      mistakeReason: "只关注截距 b，没有结合 k 的正负判断图像上升趋势。",
      studentFriendlyExplanation:
        "你已经注意到 b = -3 会让图像和 y 轴交在负半轴，这一步是对的。还差一步：k = 2 大于 0，说明图像从左到右上升，所以它会经过第三、第四、第一象限。",
      example: "比如 y = x - 1，b = -1 表示和 y 轴交在 -1，k > 0 表示向右上升，所以也会经过第三、第四、第一象限。",
      archetype: {
        title: "一次函数图像性质判断母题",
        pattern: "根据函数表达式判断图像变化和经过象限",
        solutionTemplate: "先看 k 的正负判断上升或下降，再看 b 判断与 y 轴交点，最后结合图像经过象限。",
        commonTraps: ["只看 b 不看 k", "把上升和下降方向记反"]
      },
      practiceQuestions: [
        {
          question: "一次函数 y = -2x + 1 的图像经过哪些象限？",
          answer: "第一、二、四象限",
          hint: "先看 k = -2，再看 b = 1。"
        },
        {
          question: "一次函数 y = 3x + 2 的图像经过哪些象限？",
          answer: "第一、二、三象限",
          hint: "k > 0 表示图像上升，b > 0 表示交 y 轴正半轴。"
        },
        {
          question: "一次函数 y = -x - 4 的图像经过哪些象限？",
          answer: "第二、三、四象限",
          hint: "k < 0 表示图像下降，b < 0 表示交 y 轴负半轴。"
        }
      ],
      richExplanation: {
        diagnosis: "这道题的核心漏洞是只看截距 b，没有结合斜率 k 判断图像方向。",
        analogy: "一次函数图像像一条斜坡路，k 决定路往上还是往下，b 决定它从 y 轴哪里出发。",
        walkthrough: [
          { title: "先看 k", body: "k = 2 大于 0，所以图像从左到右上升。" },
          { title: "再看 b", body: "b = -3，说明图像和 y 轴交在负半轴。" },
          { title: "合并判断", body: "上升且从负半轴出发，会经过第三、第四、第一象限。" }
        ],
        wrongAnswerInsight: "只看 b = -3 时，很容易误以为图像只和第四象限有关。",
        treeContext: {
          path: ["数学", grade, "一次函数", "一次函数图像与性质", "象限判断"],
          prerequisites: ["平面直角坐标系", "正比例函数图像", "k 与 b 的意义"],
          current: ["一次函数 y = kx + b 图像性质"],
          next: ["一次函数与方程", "一次函数实际应用"],
          confusions: ["只看 b 不看 k", "把上升和下降方向记反"]
        },
        illustration: {
          type: "flow",
          title: "一次函数象限判断顺序",
          nodes: [
            { label: "k = 2", detail: "大于 0，图像上升", tone: "focus" },
            { label: "b = -3", detail: "交 y 轴负半轴", tone: "warning" },
            { label: "合并", detail: "三、四、一象限" }
          ]
        },
        shenzhenExample: {
          label: "深圳题型风格",
          question: "已知一次函数 y = -2x + 4，判断它经过哪些象限。",
          answer: "第一、二、四象限",
          explanation: "k < 0 表示图像下降，b > 0 表示交 y 轴正半轴，所以经过第一、二、四象限。"
        }
      }
    };
  }

  return {
    subject,
    grade,
    questionType: "语法选择题",
    recognizedText: "There ____ a book and two pens on the desk. A. is B. are C. am",
    studentAnswer: "学生选择了 B. are。",
    correctAnswer: "正确答案是 A. is。",
    knowledgePoints: [{ name: "There be 句型就近原则", confidence: 0.92 }],
    mistakeReason: "只看到后面有 two pens，就以为要用 are，没有看空格后最近的主语 a book。",
    studentFriendlyExplanation:
      "There be 句型要看 be 动词后面最近的名词。这里最近的是 a book，是单数，所以用 is；后面的 two pens 虽然是复数，但不是最近的那个。",
    example: "比如 There is a cat and two dogs under the tree. 最近的是 a cat，所以用 is。",
    archetype: {
      title: "There be 句型就近原则母题",
      pattern: "根据 be 动词后最近的主语单复数选择 is 或 are",
      solutionTemplate: "先圈出 be 动词后的第一个名词，再判断它是单数还是复数，最后选择 is 或 are。",
      commonTraps: ["只看句子里有没有复数名词", "忽略离 be 动词最近的主语"]
    },
    practiceQuestions: [
      {
        question: "There ____ two apples and a banana on the table.",
        answer: "are",
        hint: "看空格后最近的名词 two apples。"
      },
      {
        question: "There ____ a pencil and three books in the bag.",
        answer: "is",
        hint: "看空格后最近的名词 a pencil。"
      },
      {
        question: "There ____ some water in the bottle.",
        answer: "is",
        hint: "water 是不可数名词，按单数处理。"
      }
    ],
    richExplanation: {
      diagnosis: "这道题错在只看到了 two pens，没有看离 be 动词最近的 a book。",
      analogy: "There be 就像排队点名，be 动词只听离自己最近的同学回答。",
      walkthrough: [
        { title: "找最近名词", body: "空格后最近的是 a book。" },
        { title: "判断单复数", body: "a book 是单数，所以用 is。" },
        { title: "排除干扰", body: "two pens 虽然是复数，但离 be 更远，不决定答案。" }
      ],
      wrongAnswerInsight: "B. are 很诱人，是因为 two pens 是复数，但这道题考的是就近原则。",
      treeContext: {
        path: ["英语", grade, "语法", "There be 句型", "就近原则"],
        prerequisites: ["名词单复数", "be 动词 is/are"],
        current: ["There be 句型就近原则"],
        next: ["主谓一致", "倒装句识别"],
        confusions: ["只看最后一个名词", "把 there 当成真正主语"]
      },
      illustration: {
        type: "flow",
        title: "be 动词看最近名词",
        nodes: [
          { label: "There", detail: "句型开头" },
          { label: "is", detail: "由最近名词决定", tone: "focus" },
          { label: "a book", detail: "最近且单数", tone: "warning" },
          { label: "two pens", detail: "更远，不决定 be" }
        ]
      },
      shenzhenExample: {
        label: "深圳题型风格",
        question: "There ____ two books and a ruler on the desk.",
        answer: "are",
        explanation: "离空格最近的是 two books，是复数，所以用 are。"
      }
    }
  };
}
