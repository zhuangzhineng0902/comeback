# Rich Explanation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add child-friendly board-style explanations, structured knowledge-tree context, Shenzhen-style examples, and reliable inline illustrations to mistake analysis results.

**Architecture:** Extend `AnalysisOutput` with an optional `richExplanation` object so old AI responses remain valid. MiniMax and simulation will populate the new object, while focused React components render it inside `AnalysisCard` without trusting arbitrary AI HTML. Persistence stays unchanged; the saved `Mistake.explanation` remains a readable text summary.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Zod, Vitest, Testing Library, Tailwind CSS, MiniMax chat completions.

---

## File Structure

- Modify `src/lib/types.ts`
  - Add `RichExplanation`, `RichIllustration`, and related literal union types.
  - Add optional `richExplanation?: RichExplanation` to `AnalysisOutput`.
- Modify `src/lib/analyzer/minimax.ts`
  - Extend the Zod schema.
  - Normalize malformed optional rich explanation arrays.
  - Expand primary and repair prompts to request board-style explanations, knowledge-tree context, Shenzhen-style examples, and structured illustrations.
- Modify `src/lib/analyzer/simulated.ts`
  - Add rich explanation examples for both the math and neutral English simulation paths.
- Create `src/components/IllustrationRenderer.tsx`
  - Render `flow`, `compare`, and `treePath` illustration data using controlled JSX.
- Create `src/components/RichExplanationCard.tsx`
  - Render the board explanation, knowledge path, related knowledge, and Shenzhen-style example.
- Modify `src/components/AnalysisCard.tsx`
  - Insert `RichExplanationCard` below the answer/cause section when `analysis.richExplanation` exists.
  - Keep the existing simple explanation fallback.
- Modify `tests/unit/analyzer.test.ts`
  - Add valid-rich-response parser coverage.
  - Add old-response compatibility coverage.
  - Add prompt coverage for rich explanation requirements.
- Modify `tests/unit/review-components.test.tsx`
  - Add render tests for `RichExplanationCard` and illustration fallback behavior.

---

### Task 1: Add Rich Explanation Types

**Files:**
- Modify: `src/lib/types.ts`
- Test: `tests/unit/analyzer.test.ts`

- [ ] **Step 1: Write the failing type-oriented parser test**

Add this object near the existing `minimaxAnalysis` fixture in `tests/unit/analyzer.test.ts`:

```ts
const richExplanation = {
  diagnosis: "这道题错在只看到了 two pens，没有看离 be 最近的 a book。",
  analogy: "There be 就像排队点名，be 动词只听离自己最近的同学回答。",
  walkthrough: [
    { title: "先找最近名词", body: "空格后最近的是 a book。" },
    { title: "再判断单复数", body: "a book 是单数，所以 be 动词用 is。" }
  ],
  wrongAnswerInsight: "B. are 看起来像对，是因为后面出现了复数 two pens。",
  treeContext: {
    path: ["英语", "七年级", "语法", "There be 句型", "就近原则"],
    prerequisites: ["名词单复数", "be 动词 is/are"],
    current: ["There be 句型就近原则"],
    next: ["主谓一致", "倒装句识别"],
    confusions: ["只看最后一个名词", "忽略离 be 最近的主语"]
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
};
```

Add this test in `describe("simulated analyzer", ...)` after the existing MiniMax mode test:

```ts
it("parses rich MiniMax explanations for board-style teaching", async () => {
  process.env.MINIMAX_API_KEY = "test-minimax-key";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ...minimaxAnalysis,
                  richExplanation
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
  );

  const result = await analyzeMistake({
    filename: "worksheet.png",
    mimeType: "image/png",
    imageBase64: Buffer.from("image-bytes").toString("base64")
  });

  expect(result.analysis.richExplanation?.diagnosis).toContain("a book");
  expect(result.analysis.richExplanation?.illustration?.type).toBe("flow");
  expect(result.analysis.richExplanation?.treeContext.path).toEqual([
    "英语",
    "七年级",
    "语法",
    "There be 句型",
    "就近原则"
  ]);
  expect(result.analysis.richExplanation?.shenzhenExample.label).toBe("深圳题型风格");
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- tests/unit/analyzer.test.ts
```

Expected: FAIL because `richExplanation` is not in `AnalysisOutput` or the MiniMax Zod schema.

- [ ] **Step 3: Add the types**

In `src/lib/types.ts`, insert these types above `AnalysisOutput`:

```ts
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
```

Then add this property to `AnalysisOutput` after `practiceQuestions`:

```ts
  richExplanation?: RichExplanation;
```

- [ ] **Step 4: Run the test again**

Run:

```bash
npm test -- tests/unit/analyzer.test.ts
```

Expected: still FAIL because the Zod schema strips or rejects `richExplanation`.

---

### Task 2: Parse and Prompt for Rich Explanations

**Files:**
- Modify: `src/lib/analyzer/minimax.ts`
- Test: `tests/unit/analyzer.test.ts`

- [ ] **Step 1: Write prompt expectation test**

Extend the existing test named `asks MiniMax to infer missing subject and grade from image evidence without hidden defaults` in `tests/unit/analyzer.test.ts` with these assertions:

```ts
expect(prompt).toContain("richExplanation");
expect(prompt).toContain("老师板书式讲解");
expect(prompt).toContain("知识树上下文");
expect(prompt).toContain("深圳题型风格");
expect(prompt).toContain("不要把未核验来源的题目说成深圳真题");
expect(prompt).toContain("illustration 只能是结构化数据");
```

- [ ] **Step 2: Run the failing analyzer tests**

Run:

```bash
npm test -- tests/unit/analyzer.test.ts
```

Expected: FAIL on missing prompt text and schema support.

- [ ] **Step 3: Add Zod schemas**

In `src/lib/analyzer/minimax.ts`, add these constants above `analysisSchema`:

```ts
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
```

Then add this property inside `analysisSchema` after `practiceQuestions`:

```ts
  richExplanation: richExplanationSchema.optional()
```

Remember to add a comma after the existing `practiceQuestions` property.

- [ ] **Step 4: Normalize invalid illustration types safely**

In `normalizeAnalysisShape`, after the existing `practiceQuestions` normalization block, add:

```ts
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

    if (rich.illustration && typeof rich.illustration === "object" && !Array.isArray(rich.illustration)) {
      const illustration = { ...(rich.illustration as Record<string, unknown>) };
      if (!["flow", "compare", "treePath"].includes(String(illustration.type))) {
        delete rich.illustration;
      } else {
        rich.illustration = illustration;
      }
    }

    record.richExplanation = rich;
  }
```

- [ ] **Step 5: Expand MiniMax prompts**

In `buildPrompt`, replace the existing JSON field line with:

```ts
"JSON 必须完全符合字段：subject, grade, questionType, recognizedText, studentAnswer, correctAnswer, knowledgePoints, mistakeReason, studentFriendlyExplanation, example, archetype, practiceQuestions, richExplanation。",
```

Add these lines before the final user hint line:

```ts
"richExplanation 必须是对象，包含 diagnosis, analogy, walkthrough, wrongAnswerInsight, treeContext, illustration, shenzhenExample。",
"richExplanation.diagnosis 用一句话指出核心漏洞；analogy 必须用孩子熟悉的比方讲清楚。",
"richExplanation.walkthrough 是 2 到 5 个步骤，每步包含 title 和 body，形成老师板书式讲解。",
"richExplanation.treeContext 必须给知识树上下文：path, prerequisites, current, next, confusions。",
"richExplanation.shenzhenExample 必须给一道深圳题型风格的同类题；如果没有可靠来源，label 必须是“深圳题型风格”。",
"不要把未核验来源的题目说成深圳真题；只有能确认公开来源时才使用“深圳真题参考”并填写 sourceNote。",
"richExplanation.illustration 只能是结构化数据，type 只能是 flow、compare、treePath，nodes 最多 8 个；不要输出 HTML、Markdown 或远程图片链接。",
```

In `buildRepairPrompt`, replace the JSON field line the same way and add the same rich explanation constraints before the user hint line.

- [ ] **Step 6: Verify analyzer tests pass**

Run:

```bash
npm test -- tests/unit/analyzer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/lib/types.ts src/lib/analyzer/minimax.ts tests/unit/analyzer.test.ts
git commit -m "feat: parse rich mistake explanations"
```

---

### Task 3: Add Rich Simulation Data

**Files:**
- Modify: `src/lib/analyzer/simulated.ts`
- Test: `tests/unit/analyzer.test.ts`

- [ ] **Step 1: Add simulation expectations**

In the existing simulation test `returns a structured junior-high math analysis`, add:

```ts
expect(result.richExplanation?.diagnosis).toContain("截距");
expect(result.richExplanation?.treeContext.path).toContain("一次函数图像与性质");
expect(result.richExplanation?.illustration?.type).toBe("flow");
```

In the existing simulation test `uses a neutral sample when hints are missing in simulation mode`, add:

```ts
expect(result.richExplanation?.diagnosis).toContain("a book");
expect(result.richExplanation?.shenzhenExample.label).toBe("深圳题型风格");
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- tests/unit/analyzer.test.ts
```

Expected: FAIL because simulation does not populate `richExplanation`.

- [ ] **Step 3: Add math rich explanation**

In `src/lib/analyzer/simulated.ts`, inside the math return object, add this property after `practiceQuestions`:

```ts
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
```

Add a comma after the previous `practiceQuestions` array.

- [ ] **Step 4: Add English rich explanation**

In `src/lib/analyzer/simulated.ts`, inside the English return object, add this property after `practiceQuestions`:

```ts
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
```

- [ ] **Step 5: Verify analyzer tests pass**

Run:

```bash
npm test -- tests/unit/analyzer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/analyzer/simulated.ts tests/unit/analyzer.test.ts
git commit -m "feat: add rich simulated explanations"
```

---

### Task 4: Render Controlled Illustrations

**Files:**
- Create: `src/components/IllustrationRenderer.tsx`
- Modify: `tests/unit/review-components.test.tsx`

- [ ] **Step 1: Write failing component tests**

Add this import to `tests/unit/review-components.test.tsx`:

```ts
import { IllustrationRenderer } from "@/components/IllustrationRenderer";
```

Add these tests inside `describe("review components", ...)`:

```tsx
it("renders flow illustrations from structured data", () => {
  render(
    <IllustrationRenderer
      illustration={{
        type: "flow",
        title: "be 动词看最近名词",
        nodes: [
          { label: "There" },
          { label: "is", detail: "由最近名词决定", tone: "focus" },
          { label: "a book", detail: "最近且单数", tone: "warning" }
        ]
      }}
    />
  );

  expect(screen.getByText("be 动词看最近名词")).toBeTruthy();
  expect(screen.getByText("There")).toBeTruthy();
  expect(screen.getByText("由最近名词决定")).toBeTruthy();
});

it("renders nothing when illustration data is missing", () => {
  const { container } = render(<IllustrationRenderer illustration={undefined} />);

  expect(container.textContent).toBe("");
});
```

- [ ] **Step 2: Run the failing component tests**

Run:

```bash
npm test -- tests/unit/review-components.test.tsx
```

Expected: FAIL because `IllustrationRenderer` does not exist.

- [ ] **Step 3: Create `IllustrationRenderer`**

Create `src/components/IllustrationRenderer.tsx`:

```tsx
import React from "react";

import type { RichIllustration, RichIllustrationTone } from "@/lib/types";

type IllustrationRendererProps = {
  illustration?: RichIllustration;
};

const toneClassName: Record<RichIllustrationTone, string> = {
  normal: "border-slate-200 bg-white text-slate-700",
  focus: "border-sky-300 bg-sky-50 text-sky-950",
  warning: "border-amber-300 bg-amber-50 text-amber-950"
};

function nodeClassName(tone: RichIllustrationTone | undefined) {
  return toneClassName[tone ?? "normal"];
}

export function IllustrationRenderer({ illustration }: IllustrationRendererProps) {
  if (!illustration) {
    return null;
  }

  if (illustration.type === "compare") {
    return (
      <figure className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <figcaption className="text-xs font-medium text-slate-500">{illustration.title}</figcaption>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {illustration.nodes.map((node) => (
            <div key={`${node.label}-${node.detail ?? ""}`} className={`rounded-md border p-3 ${nodeClassName(node.tone)}`}>
              <p className="text-sm font-semibold">{node.label}</p>
              {node.detail ? <p className="mt-1 text-xs leading-5">{node.detail}</p> : null}
            </div>
          ))}
        </div>
      </figure>
    );
  }

  if (illustration.type === "treePath") {
    return (
      <figure className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <figcaption className="text-xs font-medium text-slate-500">{illustration.title}</figcaption>
        <div className="mt-3 space-y-2">
          {illustration.nodes.map((node, index) => (
            <div key={`${node.label}-${index}`} className={`rounded-md border p-2 ${nodeClassName(node.tone)}`} style={{ marginLeft: `${Math.min(index, 4) * 14}px` }}>
              <p className="text-sm font-semibold">{node.label}</p>
              {node.detail ? <p className="text-xs leading-5">{node.detail}</p> : null}
            </div>
          ))}
        </div>
      </figure>
    );
  }

  return (
    <figure className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <figcaption className="text-xs font-medium text-slate-500">{illustration.title}</figcaption>
      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        {illustration.nodes.map((node, index) => (
          <React.Fragment key={`${node.label}-${index}`}>
            <div className={`min-w-24 flex-1 rounded-md border p-3 ${nodeClassName(node.tone)}`}>
              <p className="text-sm font-semibold">{node.label}</p>
              {node.detail ? <p className="mt-1 text-xs leading-5">{node.detail}</p> : null}
            </div>
            {index < illustration.nodes.length - 1 ? (
              <div className="flex items-center text-slate-400" aria-hidden="true">
                →
              </div>
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </figure>
  );
}
```

- [ ] **Step 4: Verify component tests pass**

Run:

```bash
npm test -- tests/unit/review-components.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/components/IllustrationRenderer.tsx tests/unit/review-components.test.tsx
git commit -m "feat: render structured learning illustrations"
```

---

### Task 5: Render the Rich Explanation Card

**Files:**
- Create: `src/components/RichExplanationCard.tsx`
- Modify: `src/components/AnalysisCard.tsx`
- Modify: `tests/unit/review-components.test.tsx`

- [ ] **Step 1: Write failing rich card test**

Add this import to `tests/unit/review-components.test.tsx`:

```ts
import { RichExplanationCard } from "@/components/RichExplanationCard";
```

Add this test inside `describe("review components", ...)`:

```tsx
it("renders teacher-board explanation, knowledge context, and Shenzhen example", () => {
  render(
    <RichExplanationCard
      explanation={{
        diagnosis: "错在没有看最近的 a book。",
        analogy: "There be 就像排队点名。",
        walkthrough: [
          { title: "找最近名词", body: "最近的是 a book。" },
          { title: "判断单复数", body: "a book 是单数。" }
        ],
        wrongAnswerInsight: "are 看起来像对，是因为 two pens 是复数。",
        treeContext: {
          path: ["英语", "七年级", "语法", "There be 句型", "就近原则"],
          prerequisites: ["名词单复数"],
          current: ["There be 句型就近原则"],
          next: ["主谓一致"],
          confusions: ["只看最后一个名词"]
        },
        illustration: {
          type: "flow",
          title: "be 动词看最近名词",
          nodes: [{ label: "a book", tone: "focus" }]
        },
        shenzhenExample: {
          label: "深圳题型风格",
          question: "There ____ two books and a ruler on the desk.",
          answer: "are",
          explanation: "最近的是 two books。"
        }
      }}
    />
  );

  expect(screen.getByText("老师板书式讲解")).toBeTruthy();
  expect(screen.getByText("错在没有看最近的 a book。")).toBeTruthy();
  expect(screen.getByText("知识树位置")).toBeTruthy();
  expect(screen.getByText("英语 → 七年级 → 语法 → There be 句型 → 就近原则")).toBeTruthy();
  expect(screen.getByText("深圳题型风格")).toBeTruthy();
  expect(screen.getByText("There ____ two books and a ruler on the desk.")).toBeTruthy();
});
```

- [ ] **Step 2: Run failing component tests**

Run:

```bash
npm test -- tests/unit/review-components.test.tsx
```

Expected: FAIL because `RichExplanationCard` does not exist.

- [ ] **Step 3: Create `RichExplanationCard`**

Create `src/components/RichExplanationCard.tsx`:

```tsx
import React from "react";

import { IllustrationRenderer } from "@/components/IllustrationRenderer";
import type { RichExplanation } from "@/lib/types";

type RichExplanationCardProps = {
  explanation: RichExplanation;
};

function TagList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RichExplanationCard({ explanation }: RichExplanationCardProps) {
  return (
    <section className="rounded-md border border-sky-200 bg-sky-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-sky-700">老师板书式讲解</p>
        <span className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs text-sky-900">
          知识树 + 例题
        </span>
      </div>

      <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-ink">{explanation.diagnosis}</h3>
            <p className="mt-2 text-sm leading-6 text-sky-950">{explanation.analogy}</p>
          </div>

          <IllustrationRenderer illustration={explanation.illustration} />

          <div className="rounded-md border border-sky-100 bg-white p-3">
            <p className="text-xs font-medium text-slate-500">一步一步来</p>
            <ol className="mt-3 space-y-3">
              {explanation.walkthrough.map((step, index) => (
                <li key={`${step.title}-${index}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 text-sm leading-6 text-slate-700">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span>
                    <strong className="text-ink">{step.title}：</strong>
                    {step.body}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-800">为什么会选错</p>
            <p className="mt-2 text-sm leading-6 text-amber-950">{explanation.wrongAnswerInsight}</p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <p className="text-xs font-medium text-slate-500">知识树位置</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-ink">{explanation.treeContext.path.join(" → ")}</p>
          </div>

          <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-3">
            <TagList title="前置知识" items={explanation.treeContext.prerequisites} />
            <TagList title="当前叶子" items={explanation.treeContext.current} />
            <TagList title="后续关联" items={explanation.treeContext.next} />
            <TagList title="易混点" items={explanation.treeContext.confusions} />
          </div>

          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-emerald-800">深圳题型例子</p>
              <span className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white">
                {explanation.shenzhenExample.label}
              </span>
            </div>
            {explanation.shenzhenExample.sourceNote ? (
              <p className="mt-2 text-xs leading-5 text-emerald-800">{explanation.shenzhenExample.sourceNote}</p>
            ) : null}
            <p className="mt-2 text-sm font-medium leading-6 text-ink">{explanation.shenzhenExample.question}</p>
            <p className="mt-2 text-sm leading-6 text-emerald-950">答案：{explanation.shenzhenExample.answer}</p>
            <p className="mt-1 text-sm leading-6 text-emerald-950">{explanation.shenzhenExample.explanation}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire card into `AnalysisCard`**

In `src/components/AnalysisCard.tsx`, add this import:

```ts
import { RichExplanationCard } from "@/components/RichExplanationCard";
```

Replace the existing child explanation block:

```tsx
          <div className="rounded-md border border-sky-200 bg-sky-50 p-4">
            <p className="text-xs font-medium text-sky-700">讲给孩子听</p>
            <p className="mt-2 text-sm leading-6 text-sky-950">{analysis.studentFriendlyExplanation}</p>
            <p className="mt-3 text-sm leading-6 text-sky-900">{analysis.example}</p>
          </div>
```

with:

```tsx
          {analysis.richExplanation ? (
            <RichExplanationCard explanation={analysis.richExplanation} />
          ) : (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs font-medium text-sky-700">讲给孩子听</p>
              <p className="mt-2 text-sm leading-6 text-sky-950">{analysis.studentFriendlyExplanation}</p>
              <p className="mt-3 text-sm leading-6 text-sky-900">{analysis.example}</p>
            </div>
          )}
```

- [ ] **Step 5: Verify component tests pass**

Run:

```bash
npm test -- tests/unit/review-components.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/components/RichExplanationCard.tsx src/components/AnalysisCard.tsx tests/unit/review-components.test.tsx
git commit -m "feat: show rich mistake explanation cards"
```

---

### Task 6: Verify API Compatibility and Full App

**Files:**
- No planned source edits. This task verifies that optional `richExplanation` remains backward-compatible with existing API and upload tests.

- [ ] **Step 1: Run the full unit suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Restart the dev server if stale chunks appear**

If the browser shows old UI or chunk errors, stop the current dev server and run:

```bash
rm -rf .next
npm run dev -- --port 57353
```

Expected: the app serves at `http://localhost:57353/`.

- [ ] **Step 4: Manual browser verification**

Use the existing generated image `/tmp/comeback-grade-test.png` or upload a small worksheet image through the UI.

Expected:

- The upload result still shows `AI 视觉分析`.
- Subject and grade still auto-detect when dropdowns are empty.
- The result card shows "老师板书式讲解".
- The illustration appears as controlled boxes/arrows, not a broken image.
- The knowledge path appears as text joined by arrows.
- The Shenzhen example is labeled "深圳题型风格" unless a verified source note exists.

- [ ] **Step 5: Push all commits**

Run:

```bash
git push origin private-tutor-implementation
```

Expected: push succeeds.
