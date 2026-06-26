# Private Tutor Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-student junior-high private tutor Web app that accepts worksheet photos, produces AI-style mistake coaching, remembers knowledge gaps, flags repeated archetype mistakes, and shows grade-subject knowledge trees.

**Architecture:** Use a Next.js single app with server routes, Prisma-backed SQLite persistence, local file uploads, and a replaceable analysis service. The domain logic for study guardrails, simulated analysis, knowledge gap severity, and tree building lives in small TypeScript modules that are tested before UI wiring.

**Tech Stack:** Next.js, TypeScript, Prisma, SQLite, Vitest, React Testing Library, Playwright, Tailwind CSS.

---

## File Structure

- Create `package.json`: project scripts and dependencies.
- Create `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `tailwind.config.ts`, `vitest.config.ts`, `playwright.config.ts`: framework and test configuration.
- Create `prisma/schema.prisma`: Student, Mistake, KnowledgePoint, KnowledgeGap, Archetype, MistakeArchetype, TutorMessage, and NonStudyRequestLog models.
- Create `prisma/seed.ts`: one default student plus junior-high seed knowledge points and sample archetypes.
- Create `src/lib/db.ts`: Prisma client singleton.
- Create `src/lib/types.ts`: shared domain types for subjects, grades, analysis output, severity, and mastery state.
- Create `src/lib/study-guard.ts`: learning-intent classifier and refusal response.
- Create `src/lib/analyzer/simulated.ts`: deterministic analysis for local development.
- Create `src/lib/analyzer/index.ts`: analyzer selector that uses API mode when configured and simulation otherwise.
- Create `src/lib/knowledge/severity.ts`: repeated knowledge-point and archetype severity rules.
- Create `src/lib/knowledge/tree.ts`: grade-subject knowledge tree builder.
- Create `src/lib/repositories/mistakes.ts`: persistence workflow that stores an analysis and updates knowledge gaps.
- Create `src/app/api/analyze/route.ts`: upload endpoint that stores a file and creates mistake records.
- Create `src/app/api/chat/route.ts`: study-bounded tutor follow-up endpoint.
- Create `src/app/api/mistakes/route.ts`, `src/app/api/mistakes/[id]/route.ts`: mistake list and detail endpoints.
- Create `src/app/api/knowledge-gaps/route.ts`: gap summary endpoint.
- Create `src/app/api/knowledge-tree/route.ts`: grade-subject tree endpoint.
- Create `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/mistakes/page.tsx`, `src/app/mistakes/[id]/page.tsx`, `src/app/gaps/page.tsx`, `src/app/tree/page.tsx`: app shell and pages.
- Create `src/components/*`: focused UI components for upload, tutor chat, analysis cards, filters, mistake cards, gap badges, and tree nodes.
- Create `tests/unit/*`: domain and repository tests.
- Create `tests/e2e/private-tutor.spec.ts`: browser workflow test.

---

### Task 1: Scaffold The Next.js App

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`

- [ ] **Step 1: Create project manifest**

Write `package.json`:

```json
{
  "name": "private-tutor-agent",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.0.0",
    "lucide-react": "^0.468.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.49",
    "prisma": "^6.0.0",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 2: Create framework config files**

Write `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb"
    }
  }
};

export default nextConfig;
```

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Write `postcss.config.mjs`:

```js
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};

export default config;
```

Write `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2937",
        paper: "#f8fafc",
        mint: "#2f9e8f",
        amber: "#d97706",
        coral: "#dc5b57"
      }
    }
  },
  plugins: []
};

export default config;
```

Write `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"]
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
```

Write `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120000
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
```

- [ ] **Step 3: Create starter shell**

Write `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
}

body {
  background: #f8fafc;
  color: #1f2937;
}
```

Write `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "私人教师 Agent",
  description: "初中错题辅导与知识漏洞复习"
};

const navItems = [
  { href: "/", label: "AI 老师" },
  { href: "/mistakes", label: "错题本" },
  { href: "/gaps", label: "知识漏洞" },
  { href: "/tree", label: "期末知识树" }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
              <Link href="/" className="text-lg font-semibold text-ink">
                私人教师 Agent
              </Link>
              <nav className="flex gap-2 text-sm">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-ink"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

Write `src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <h1 className="text-2xl font-semibold text-ink">AI 老师</h1>
        <p className="mt-2 text-sm text-slate-600">
          上传试卷或习题照片，我会帮你讲清错因、知识点和类似题型。
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
npm install
```

Expected: command exits with code 0 and creates `package-lock.json`.

- [ ] **Step 5: Verify starter app builds**

Run:

```bash
npm run build
```

Expected: command exits with code 0 and output contains `Compiled successfully`.

- [ ] **Step 6: Commit scaffold**

Run:

```bash
git add package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs tailwind.config.ts vitest.config.ts playwright.config.ts src/app
git commit -m "chore: scaffold tutor web app"
```

Expected: commit succeeds.

---

### Task 2: Add Prisma Schema And Seed Data

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `src/lib/db.ts`
- Create: `src/lib/types.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Create shared domain types**

Write `src/lib/types.ts`:

```ts
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
```

- [ ] **Step 2: Create Prisma schema**

Write `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Student {
  id                  String               @id @default(cuid())
  name                String
  currentGrade        String
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  mistakes            Mistake[]
  knowledgeGaps       KnowledgeGap[]
  nonStudyRequestLogs NonStudyRequestLog[]
}

model Mistake {
  id                 String              @id @default(cuid())
  studentId          String
  imagePath          String
  recognizedText     String
  subject            String
  grade              String
  questionType       String
  studentAnswer      String
  correctAnswer      String
  explanation        String
  mistakeReason      String
  masteryStatus      String              @default("new")
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt
  student            Student             @relation(fields: [studentId], references: [id])
  mistakeArchetypes  MistakeArchetype[]
  tutorMessages      TutorMessage[]

  @@index([studentId, subject, grade])
}

model KnowledgePoint {
  id            String           @id @default(cuid())
  subject       String
  grade         String
  name          String
  chapter       String
  parentId      String?
  sortOrder     Int              @default(0)
  parent        KnowledgePoint?  @relation("KnowledgePointTree", fields: [parentId], references: [id])
  children      KnowledgePoint[] @relation("KnowledgePointTree")
  knowledgeGaps KnowledgeGap[]
  archetypes    Archetype[]

  @@unique([subject, grade, name])
  @@index([subject, grade])
}

model KnowledgeGap {
  id                     String         @id @default(cuid())
  studentId              String
  knowledgePointId       String
  errorCount             Int            @default(0)
  relatedMistakeCount    Int            @default(0)
  repeatedArchetypeCount Int            @default(0)
  severity               String         @default("normal")
  typicalReasons         String         @default("[]")
  lastOccurredAt         DateTime?
  masteryLevel           Int            @default(0)
  reviewSuggestion       String
  student                Student        @relation(fields: [studentId], references: [id])
  knowledgePoint         KnowledgePoint @relation(fields: [knowledgePointId], references: [id])

  @@unique([studentId, knowledgePointId])
}

model Archetype {
  id                String             @id @default(cuid())
  subject           String
  grade             String
  knowledgePointId  String
  title             String
  pattern           String
  solutionTemplate  String
  commonTraps       String
  knowledgePoint    KnowledgePoint     @relation(fields: [knowledgePointId], references: [id])
  mistakeArchetypes MistakeArchetype[]

  @@unique([subject, grade, knowledgePointId, title])
}

model MistakeArchetype {
  id              String    @id @default(cuid())
  mistakeId       String
  archetypeId     String
  similarityScore Float
  createdAt       DateTime  @default(now())
  mistake         Mistake   @relation(fields: [mistakeId], references: [id])
  archetype       Archetype @relation(fields: [archetypeId], references: [id])

  @@index([archetypeId])
}

model TutorMessage {
  id        String   @id @default(cuid())
  mistakeId String
  role      String
  content   String
  createdAt DateTime @default(now())
  mistake   Mistake  @relation(fields: [mistakeId], references: [id])
}

model NonStudyRequestLog {
  id             String   @id @default(cuid())
  studentId      String
  contentSummary String
  category       String
  createdAt      DateTime @default(now())
  student        Student  @relation(fields: [studentId], references: [id])
}
```

- [ ] **Step 3: Add database environment defaults**

Append to `.gitignore` only if the lines are missing:

```gitignore
prisma/dev.db
prisma/dev.db-journal
```

Create `.env.example`:

```bash
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY=""
```

Create `.env.local` for local development:

```bash
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY=""
```

- [ ] **Step 4: Create Prisma client singleton**

Write `src/lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 5: Create seed data**

Write `prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const seedPoints = [
  { subject: "数学", grade: "七年级", chapter: "有理数", name: "有理数运算", parent: null, sortOrder: 1 },
  { subject: "数学", grade: "八年级", chapter: "一次函数", name: "一次函数", parent: null, sortOrder: 1 },
  { subject: "数学", grade: "八年级", chapter: "一次函数", name: "一次函数图像与性质", parent: "一次函数", sortOrder: 2 },
  { subject: "英语", grade: "八年级", chapter: "语法", name: "一般过去时", parent: null, sortOrder: 1 },
  { subject: "物理", grade: "八年级", chapter: "力学", name: "力与运动", parent: null, sortOrder: 1 },
  { subject: "化学", grade: "九年级", chapter: "酸碱盐", name: "酸碱盐性质", parent: null, sortOrder: 1 },
  { subject: "语文", grade: "七年级", chapter: "阅读", name: "记叙文阅读", parent: null, sortOrder: 1 },
  { subject: "历史", grade: "八年级", chapter: "近代史", name: "近代化探索", parent: null, sortOrder: 1 },
  { subject: "地理", grade: "七年级", chapter: "地图", name: "等高线地形图", parent: null, sortOrder: 1 },
  { subject: "道德与法治", grade: "八年级", chapter: "法治", name: "权利与义务", parent: null, sortOrder: 1 }
];

async function main() {
  const student = await prisma.student.upsert({
    where: { id: "default-student" },
    update: { name: "我的学生", currentGrade: "八年级" },
    create: { id: "default-student", name: "我的学生", currentGrade: "八年级" }
  });

  const created = new Map<string, string>();

  for (const point of seedPoints.filter((item) => item.parent === null)) {
    const record = await prisma.knowledgePoint.upsert({
      where: { subject_grade_name: { subject: point.subject, grade: point.grade, name: point.name } },
      update: { chapter: point.chapter, parentId: null, sortOrder: point.sortOrder },
      create: {
        subject: point.subject,
        grade: point.grade,
        chapter: point.chapter,
        name: point.name,
        parentId: null,
        sortOrder: point.sortOrder
      }
    });
    created.set(`${point.subject}:${point.grade}:${point.name}`, record.id);
  }

  for (const point of seedPoints.filter((item) => item.parent !== null)) {
    const parentId = created.get(`${point.subject}:${point.grade}:${point.parent}`);
    if (!parentId) {
      throw new Error(`Missing parent knowledge point: ${point.parent}`);
    }
    const record = await prisma.knowledgePoint.upsert({
      where: { subject_grade_name: { subject: point.subject, grade: point.grade, name: point.name } },
      update: { chapter: point.chapter, parentId, sortOrder: point.sortOrder },
      create: {
        subject: point.subject,
        grade: point.grade,
        chapter: point.chapter,
        name: point.name,
        parentId,
        sortOrder: point.sortOrder
      }
    });
    created.set(`${point.subject}:${point.grade}:${point.name}`, record.id);
  }

  const functionPointId = created.get("数学:八年级:一次函数图像与性质");
  if (!functionPointId) {
    throw new Error("Missing seeded function knowledge point");
  }

  await prisma.archetype.upsert({
    where: {
      subject_grade_knowledgePointId_title: {
        subject: "数学",
        grade: "八年级",
        knowledgePointId: functionPointId,
        title: "一次函数图像性质判断母题"
      }
    },
    update: {
      pattern: "根据函数表达式判断图像变化和交点",
      solutionTemplate: "先看 k 的正负，再看 b 的意义，最后结合图像判断",
      commonTraps: JSON.stringify(["只看 b 不看 k", "把上升和下降方向记反"])
    },
    create: {
      subject: "数学",
      grade: "八年级",
      knowledgePointId: functionPointId,
      title: "一次函数图像性质判断母题",
      pattern: "根据函数表达式判断图像变化和交点",
      solutionTemplate: "先看 k 的正负，再看 b 的意义，最后结合图像判断",
      commonTraps: JSON.stringify(["只看 b 不看 k", "把上升和下降方向记反"])
    }
  });

  console.log(`Seeded default student ${student.name}`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 6: Generate database**

Run:

```bash
npm run prisma:migrate -- --name init
npm run prisma:seed
```

Expected: migration succeeds and seed output contains `Seeded default student`.

- [ ] **Step 7: Verify build**

Run:

```bash
npm run build
```

Expected: command exits with code 0.

- [ ] **Step 8: Commit schema and seed**

Run:

```bash
git add .gitignore .env.example prisma src/lib/db.ts src/lib/types.ts package.json package-lock.json
git commit -m "feat: add tutor data model"
```

Expected: commit succeeds and `.env.local` remains untracked.

---

### Task 3: Implement Study Guardrails

**Files:**
- Create: `src/lib/study-guard.ts`
- Create: `tests/unit/study-guard.test.ts`

- [ ] **Step 1: Write failing guardrail tests**

Write `tests/unit/study-guard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyStudyIntent, createStudyRefusal } from "@/lib/study-guard";

describe("study guardrails", () => {
  it("allows junior-high study requests", () => {
    expect(classifyStudyIntent("帮我讲一下这道一次函数错题")).toEqual({
      allowed: true,
      category: "study"
    });
  });

  it("blocks game requests", () => {
    expect(classifyStudyIntent("帮我查一下这个游戏怎么通关")).toEqual({
      allowed: false,
      category: "game"
    });
  });

  it("blocks entertainment video requests", () => {
    expect(classifyStudyIntent("推荐几个好看的短视频")).toEqual({
      allowed: false,
      category: "entertainment"
    });
  });

  it("returns a warm learning redirection", () => {
    expect(createStudyRefusal("game")).toContain("我主要帮你学习");
    expect(createStudyRefusal("game")).toContain("类似题");
  });
});
```

- [ ] **Step 2: Run guardrail tests and verify failure**

Run:

```bash
npm test -- tests/unit/study-guard.test.ts
```

Expected: FAIL because `src/lib/study-guard.ts` does not exist.

- [ ] **Step 3: Implement guardrails**

Write `src/lib/study-guard.ts`:

```ts
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
```

- [ ] **Step 4: Run guardrail tests and verify pass**

Run:

```bash
npm test -- tests/unit/study-guard.test.ts
```

Expected: PASS with 4 tests.

- [ ] **Step 5: Commit guardrails**

Run:

```bash
git add src/lib/study-guard.ts tests/unit/study-guard.test.ts
git commit -m "feat: add study guardrails"
```

Expected: commit succeeds.

---

### Task 4: Implement Analysis And Severity Domain Logic

**Files:**
- Create: `src/lib/analyzer/simulated.ts`
- Create: `src/lib/analyzer/index.ts`
- Create: `src/lib/knowledge/severity.ts`
- Create: `tests/unit/analyzer.test.ts`
- Create: `tests/unit/severity.test.ts`

- [ ] **Step 1: Write failing analyzer tests**

Write `tests/unit/analyzer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { analyzeWithSimulation } from "@/lib/analyzer/simulated";

describe("simulated analyzer", () => {
  it("returns a structured junior-high math analysis", async () => {
    const result = await analyzeWithSimulation({
      filename: "worksheet.png",
      subjectHint: "数学",
      gradeHint: "八年级"
    });

    expect(result.subject).toBe("数学");
    expect(result.grade).toBe("八年级");
    expect(result.knowledgePoints[0].name).toBe("一次函数图像与性质");
    expect(result.archetype.title).toBe("一次函数图像性质判断母题");
    expect(result.practiceQuestions).toHaveLength(3);
  });
});
```

Write `tests/unit/severity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateGapSeverity } from "@/lib/knowledge/severity";

describe("gap severity", () => {
  it("marks a repeated archetype as the highest priority", () => {
    expect(calculateGapSeverity({ errorCount: 2, repeatedArchetypeCount: 2 })).toBe("repeated_archetype");
  });

  it("marks three errors on one point as important", () => {
    expect(calculateGapSeverity({ errorCount: 3, repeatedArchetypeCount: 0 })).toBe("important");
  });

  it("marks two errors as weak", () => {
    expect(calculateGapSeverity({ errorCount: 2, repeatedArchetypeCount: 0 })).toBe("weak");
  });

  it("keeps one error as normal", () => {
    expect(calculateGapSeverity({ errorCount: 1, repeatedArchetypeCount: 0 })).toBe("normal");
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- tests/unit/analyzer.test.ts tests/unit/severity.test.ts
```

Expected: FAIL because analyzer and severity modules do not exist.

- [ ] **Step 3: Implement simulated analyzer**

Write `src/lib/analyzer/simulated.ts`:

```ts
import type { AnalysisOutput, Grade, Subject } from "@/lib/types";

export type AnalyzeInput = {
  filename: string;
  subjectHint?: Subject;
  gradeHint?: Grade;
};

export async function analyzeWithSimulation(input: AnalyzeInput): Promise<AnalysisOutput> {
  const subject = input.subjectHint ?? "数学";
  const grade = input.gradeHint ?? "八年级";

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
    ]
  };
}
```

Write `src/lib/analyzer/index.ts`:

```ts
import { analyzeWithSimulation, type AnalyzeInput } from "@/lib/analyzer/simulated";
import type { AnalysisOutput } from "@/lib/types";

export async function analyzeMistake(input: AnalyzeInput): Promise<{ mode: "api" | "simulation"; analysis: AnalysisOutput }> {
  if (!process.env.OPENAI_API_KEY) {
    return { mode: "simulation", analysis: await analyzeWithSimulation(input) };
  }

  return { mode: "simulation", analysis: await analyzeWithSimulation(input) };
}
```

- [ ] **Step 4: Implement severity logic**

Write `src/lib/knowledge/severity.ts`:

```ts
import type { GapSeverity } from "@/lib/types";

export type SeverityInput = {
  errorCount: number;
  repeatedArchetypeCount: number;
};

export function calculateGapSeverity(input: SeverityInput): GapSeverity {
  if (input.repeatedArchetypeCount >= 2) {
    return "repeated_archetype";
  }
  if (input.errorCount >= 3) {
    return "important";
  }
  if (input.errorCount >= 2) {
    return "weak";
  }
  return "normal";
}
```

- [ ] **Step 5: Run tests and verify pass**

Run:

```bash
npm test -- tests/unit/analyzer.test.ts tests/unit/severity.test.ts
```

Expected: PASS with 5 tests.

- [ ] **Step 6: Commit domain logic**

Run:

```bash
git add src/lib/analyzer src/lib/knowledge/severity.ts tests/unit/analyzer.test.ts tests/unit/severity.test.ts
git commit -m "feat: add tutor analysis rules"
```

Expected: commit succeeds.

---

### Task 5: Implement Mistake Persistence Workflow

**Files:**
- Create: `src/lib/repositories/mistakes.ts`
- Create: `tests/unit/mistake-repository.test.ts`

- [ ] **Step 1: Write repository integration tests**

Write `tests/unit/mistake-repository.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { saveAnalysisAsMistake } from "@/lib/repositories/mistakes";
import { analyzeWithSimulation } from "@/lib/analyzer/simulated";

describe("mistake repository", () => {
  beforeEach(async () => {
    await prisma.tutorMessage.deleteMany();
    await prisma.mistakeArchetype.deleteMany();
    await prisma.mistake.deleteMany();
    await prisma.knowledgeGap.deleteMany();
  });

  it("stores an analysis and creates a knowledge gap", async () => {
    const analysis = await analyzeWithSimulation({ filename: "a.png" });
    const result = await saveAnalysisAsMistake({
      studentId: "default-student",
      imagePath: "uploads/a.png",
      analysis
    });

    expect(result.mistake.subject).toBe("数学");
    expect(result.gap.errorCount).toBe(1);
    expect(result.gap.severity).toBe("normal");
  });

  it("marks repeated archetype mistakes as high priority", async () => {
    const analysis = await analyzeWithSimulation({ filename: "a.png" });
    await saveAnalysisAsMistake({ studentId: "default-student", imagePath: "uploads/a.png", analysis });
    const second = await saveAnalysisAsMistake({ studentId: "default-student", imagePath: "uploads/b.png", analysis });

    expect(second.gap.repeatedArchetypeCount).toBe(2);
    expect(second.gap.severity).toBe("repeated_archetype");
  });
});
```

- [ ] **Step 2: Run repository tests and verify failure**

Run:

```bash
npm test -- tests/unit/mistake-repository.test.ts
```

Expected: FAIL because `saveAnalysisAsMistake` does not exist.

- [ ] **Step 3: Implement persistence workflow**

Write `src/lib/repositories/mistakes.ts`:

```ts
import { prisma } from "@/lib/db";
import type { AnalysisOutput } from "@/lib/types";
import { calculateGapSeverity } from "@/lib/knowledge/severity";

export type SaveAnalysisInput = {
  studentId: string;
  imagePath: string;
  analysis: AnalysisOutput;
};

export async function saveAnalysisAsMistake(input: SaveAnalysisInput) {
  const pointName = input.analysis.knowledgePoints[0]?.name ?? "待确认知识点";

  const knowledgePoint = await prisma.knowledgePoint.upsert({
    where: {
      subject_grade_name: {
        subject: input.analysis.subject,
        grade: input.analysis.grade,
        name: pointName
      }
    },
    update: {},
    create: {
      subject: input.analysis.subject,
      grade: input.analysis.grade,
      name: pointName,
      chapter: "待确认",
      sortOrder: 999
    }
  });

  const archetype = await prisma.archetype.upsert({
    where: {
      subject_grade_knowledgePointId_title: {
        subject: input.analysis.subject,
        grade: input.analysis.grade,
        knowledgePointId: knowledgePoint.id,
        title: input.analysis.archetype.title
      }
    },
    update: {
      pattern: input.analysis.archetype.pattern,
      solutionTemplate: input.analysis.archetype.solutionTemplate,
      commonTraps: JSON.stringify(input.analysis.archetype.commonTraps)
    },
    create: {
      subject: input.analysis.subject,
      grade: input.analysis.grade,
      knowledgePointId: knowledgePoint.id,
      title: input.analysis.archetype.title,
      pattern: input.analysis.archetype.pattern,
      solutionTemplate: input.analysis.archetype.solutionTemplate,
      commonTraps: JSON.stringify(input.analysis.archetype.commonTraps)
    }
  });

  const mistake = await prisma.mistake.create({
    data: {
      studentId: input.studentId,
      imagePath: input.imagePath,
      recognizedText: input.analysis.recognizedText,
      subject: input.analysis.subject,
      grade: input.analysis.grade,
      questionType: input.analysis.questionType,
      studentAnswer: input.analysis.studentAnswer,
      correctAnswer: input.analysis.correctAnswer,
      explanation: input.analysis.studentFriendlyExplanation,
      mistakeReason: input.analysis.mistakeReason,
      masteryStatus: "new",
      mistakeArchetypes: {
        create: {
          archetypeId: archetype.id,
          similarityScore: 0.95
        }
      },
      tutorMessages: {
        create: {
          role: "assistant",
          content: input.analysis.studentFriendlyExplanation
        }
      }
    },
    include: {
      mistakeArchetypes: true,
      tutorMessages: true
    }
  });

  const errorCount = await prisma.mistake.count({
    where: {
      studentId: input.studentId,
      subject: input.analysis.subject,
      grade: input.analysis.grade,
      mistakeArchetypes: {
        some: {
          archetype: {
            knowledgePointId: knowledgePoint.id
          }
        }
      }
    }
  });

  const repeatedArchetypeCount = await prisma.mistakeArchetype.count({
    where: {
      archetypeId: archetype.id,
      mistake: {
        studentId: input.studentId
      }
    }
  });

  const severity = calculateGapSeverity({ errorCount, repeatedArchetypeCount });

  const gap = await prisma.knowledgeGap.upsert({
    where: {
      studentId_knowledgePointId: {
        studentId: input.studentId,
        knowledgePointId: knowledgePoint.id
      }
    },
    update: {
      errorCount,
      relatedMistakeCount: errorCount,
      repeatedArchetypeCount,
      severity,
      typicalReasons: JSON.stringify([input.analysis.mistakeReason]),
      lastOccurredAt: new Date(),
      reviewSuggestion:
        severity === "repeated_archetype"
          ? "优先复习这类母题，先按模板做 3 道变式题。"
          : "先回看错因，再完成一组相似练习。"
    },
    create: {
      studentId: input.studentId,
      knowledgePointId: knowledgePoint.id,
      errorCount,
      relatedMistakeCount: errorCount,
      repeatedArchetypeCount,
      severity,
      typicalReasons: JSON.stringify([input.analysis.mistakeReason]),
      lastOccurredAt: new Date(),
      masteryLevel: 0,
      reviewSuggestion: "先回看错因，再完成一组相似练习。"
    }
  });

  return { mistake, gap, knowledgePoint, archetype };
}
```

- [ ] **Step 4: Run repository tests and verify pass**

Run:

```bash
npm test -- tests/unit/mistake-repository.test.ts
```

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit persistence workflow**

Run:

```bash
git add src/lib/repositories/mistakes.ts tests/unit/mistake-repository.test.ts
git commit -m "feat: persist analyzed mistakes"
```

Expected: commit succeeds.

---

### Task 6: Implement Knowledge Tree Builder

**Files:**
- Create: `src/lib/knowledge/tree.ts`
- Create: `tests/unit/knowledge-tree.test.ts`

- [ ] **Step 1: Write tree builder tests**

Write `tests/unit/knowledge-tree.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildKnowledgeTree } from "@/lib/knowledge/tree";

describe("knowledge tree", () => {
  it("builds one tree for a single grade and subject", () => {
    const tree = buildKnowledgeTree({
      points: [
        { id: "root", name: "一次函数", parentId: null, chapter: "一次函数", sortOrder: 1 },
        { id: "child", name: "一次函数图像与性质", parentId: "root", chapter: "一次函数", sortOrder: 2 }
      ],
      gaps: [{ knowledgePointId: "child", severity: "repeated_archetype", errorCount: 2, repeatedArchetypeCount: 2 }]
    });

    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].severity).toBe("repeated_archetype");
  });
});
```

- [ ] **Step 2: Run tree tests and verify failure**

Run:

```bash
npm test -- tests/unit/knowledge-tree.test.ts
```

Expected: FAIL because `buildKnowledgeTree` does not exist.

- [ ] **Step 3: Implement tree builder**

Write `src/lib/knowledge/tree.ts`:

```ts
import type { GapSeverity } from "@/lib/types";

export type TreePoint = {
  id: string;
  name: string;
  parentId: string | null;
  chapter: string;
  sortOrder: number;
};

export type TreeGap = {
  knowledgePointId: string;
  severity: GapSeverity | string;
  errorCount: number;
  repeatedArchetypeCount: number;
};

export type KnowledgeTreeNode = {
  id: string;
  name: string;
  chapter: string;
  severity: GapSeverity;
  errorCount: number;
  repeatedArchetypeCount: number;
  children: KnowledgeTreeNode[];
};

const severityOrder: Record<GapSeverity, number> = {
  normal: 0,
  weak: 1,
  important: 2,
  repeated_archetype: 3
};

function normalizeSeverity(value: string | undefined): GapSeverity {
  if (value === "weak" || value === "important" || value === "repeated_archetype") {
    return value;
  }
  return "normal";
}

function strongerSeverity(a: GapSeverity, b: GapSeverity): GapSeverity {
  return severityOrder[a] >= severityOrder[b] ? a : b;
}

export function buildKnowledgeTree(input: { points: TreePoint[]; gaps: TreeGap[] }): KnowledgeTreeNode[] {
  const gapByPoint = new Map(input.gaps.map((gap) => [gap.knowledgePointId, gap]));
  const nodes = new Map<string, KnowledgeTreeNode>();

  for (const point of input.points) {
    const gap = gapByPoint.get(point.id);
    nodes.set(point.id, {
      id: point.id,
      name: point.name,
      chapter: point.chapter,
      severity: normalizeSeverity(gap?.severity),
      errorCount: gap?.errorCount ?? 0,
      repeatedArchetypeCount: gap?.repeatedArchetypeCount ?? 0,
      children: []
    });
  }

  const roots: KnowledgeTreeNode[] = [];

  for (const point of [...input.points].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const node = nodes.get(point.id);
    if (!node) {
      continue;
    }
    if (point.parentId && nodes.has(point.parentId)) {
      nodes.get(point.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function bubbleSeverity(node: KnowledgeTreeNode): GapSeverity {
    for (const child of node.children) {
      node.severity = strongerSeverity(node.severity, bubbleSeverity(child));
      node.errorCount += child.errorCount;
      node.repeatedArchetypeCount += child.repeatedArchetypeCount;
    }
    return node.severity;
  }

  roots.forEach(bubbleSeverity);
  return roots;
}
```

- [ ] **Step 4: Run tree tests and verify pass**

Run:

```bash
npm test -- tests/unit/knowledge-tree.test.ts
```

Expected: PASS with 1 test.

- [ ] **Step 5: Commit tree builder**

Run:

```bash
git add src/lib/knowledge/tree.ts tests/unit/knowledge-tree.test.ts
git commit -m "feat: build grade subject knowledge trees"
```

Expected: commit succeeds.

---

### Task 7: Implement API Routes

**Files:**
- Create: `src/app/api/analyze/route.ts`
- Create: `src/app/api/chat/route.ts`
- Create: `src/app/api/mistakes/route.ts`
- Create: `src/app/api/mistakes/[id]/route.ts`
- Create: `src/app/api/knowledge-gaps/route.ts`
- Create: `src/app/api/knowledge-tree/route.ts`

- [ ] **Step 1: Implement analyze route**

Write `src/app/api/analyze/route.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { analyzeMistake } from "@/lib/analyzer";
import { saveAnalysisAsMistake } from "@/lib/repositories/mistakes";
import { grades, subjects, type Grade, type Subject } from "@/lib/types";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const subjectHint = formData.get("subjectHint");
  const gradeHint = formData.get("gradeHint");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请先上传一张试卷或习题照片。" }, { status: 400 });
  }

  const subject = subjects.includes(subjectHint as Subject) ? (subjectHint as Subject) : undefined;
  const grade = grades.includes(gradeHint as Grade) ? (gradeHint as Grade) : undefined;

  const bytes = Buffer.from(await file.arrayBuffer());
  const uploadDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  const imagePath = path.join("uploads", safeName);
  await writeFile(path.join(process.cwd(), imagePath), bytes);

  const result = await analyzeMistake({ filename: file.name, subjectHint: subject, gradeHint: grade });
  const saved = await saveAnalysisAsMistake({
    studentId: "default-student",
    imagePath,
    analysis: result.analysis
  });

  return NextResponse.json({
    mode: result.mode,
    analysis: result.analysis,
    mistakeId: saved.mistake.id,
    gapSeverity: saved.gap.severity
  });
}
```

- [ ] **Step 2: Implement chat route**

Write `src/app/api/chat/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { classifyStudyIntent, createStudyRefusal } from "@/lib/study-guard";

export async function POST(request: Request) {
  const body = (await request.json()) as { mistakeId?: string; message?: string };
  const message = body.message?.trim() ?? "";

  if (!message) {
    return NextResponse.json({ error: "请输入想追问的问题。" }, { status: 400 });
  }

  const intent = classifyStudyIntent(message);

  if (!intent.allowed) {
    await prisma.nonStudyRequestLog.create({
      data: {
        studentId: "default-student",
        contentSummary: message.slice(0, 80),
        category: intent.category
      }
    });
    return NextResponse.json({
      blocked: true,
      reply: createStudyRefusal(intent.category)
    });
  }

  const reply = `我们继续看学习问题。你问的是：“${message}”。先抓住题目的关键词，再把它对应到知识点和解题模板。`;

  if (body.mistakeId) {
    await prisma.tutorMessage.createMany({
      data: [
        { mistakeId: body.mistakeId, role: "user", content: message },
        { mistakeId: body.mistakeId, role: "assistant", content: reply }
      ]
    });
  }

  return NextResponse.json({ blocked: false, reply });
}
```

- [ ] **Step 3: Implement mistakes routes**

Write `src/app/api/mistakes/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subject = searchParams.get("subject");
  const grade = searchParams.get("grade");

  const mistakes = await prisma.mistake.findMany({
    where: {
      studentId: "default-student",
      ...(subject ? { subject } : {}),
      ...(grade ? { grade } : {})
    },
    include: {
      mistakeArchetypes: {
        include: { archetype: true }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ mistakes });
}
```

Write `src/app/api/mistakes/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const mistake = await prisma.mistake.findUnique({
    where: { id },
    include: {
      tutorMessages: { orderBy: { createdAt: "asc" } },
      mistakeArchetypes: { include: { archetype: true } }
    }
  });

  if (!mistake) {
    return NextResponse.json({ error: "错题不存在。" }, { status: 404 });
  }

  return NextResponse.json({ mistake });
}
```

- [ ] **Step 4: Implement knowledge routes**

Write `src/app/api/knowledge-gaps/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const gaps = await prisma.knowledgeGap.findMany({
    where: { studentId: "default-student" },
    include: { knowledgePoint: true },
    orderBy: [{ severity: "desc" }, { lastOccurredAt: "desc" }]
  });

  return NextResponse.json({ gaps });
}
```

Write `src/app/api/knowledge-tree/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildKnowledgeTree } from "@/lib/knowledge/tree";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const grade = searchParams.get("grade") ?? "八年级";
  const subject = searchParams.get("subject") ?? "数学";

  const points = await prisma.knowledgePoint.findMany({
    where: { grade, subject },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });
  const gaps = await prisma.knowledgeGap.findMany({
    where: {
      studentId: "default-student",
      knowledgePoint: { grade, subject }
    }
  });

  return NextResponse.json({
    grade,
    subject,
    tree: buildKnowledgeTree({ points, gaps })
  });
}
```

- [ ] **Step 5: Verify typecheck through build**

Run:

```bash
npm run build
```

Expected: command exits with code 0.

- [ ] **Step 6: Commit API routes**

Run:

```bash
git add src/app/api
git commit -m "feat: add tutor api routes"
```

Expected: commit succeeds.

---

### Task 8: Build AI Teacher Home Page

**Files:**
- Create: `src/components/AnalysisCard.tsx`
- Create: `src/components/PhotoUploadTutor.tsx`
- Modify: `src/app/page.tsx`
- Create: `tests/unit/photo-upload-tutor.test.tsx`

- [ ] **Step 1: Write component smoke test**

Write `tests/unit/photo-upload-tutor.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhotoUploadTutor } from "@/components/PhotoUploadTutor";

describe("PhotoUploadTutor", () => {
  it("renders the upload and chat affordances", () => {
    render(<PhotoUploadTutor />);
    expect(screen.getByText("上传错题照片")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("继续问老师：为什么这里要这样做？")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run component test and verify failure**

Run:

```bash
npm test -- tests/unit/photo-upload-tutor.test.tsx
```

Expected: FAIL because `PhotoUploadTutor` does not exist.

- [ ] **Step 3: Create analysis card**

Write `src/components/AnalysisCard.tsx`:

```tsx
import type { AnalysisOutput } from "@/lib/types";

export function AnalysisCard({ analysis, mode, gapSeverity }: { analysis: AnalysisOutput; mode: string; gapSeverity: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-mint/10 px-2 py-1 font-medium text-mint">{analysis.grade}</span>
        <span className="rounded bg-slate-100 px-2 py-1 font-medium text-slate-700">{analysis.subject}</span>
        <span className="rounded bg-amber/10 px-2 py-1 font-medium text-amber">{mode === "simulation" ? "演示分析" : "真实分析"}</span>
        <span className="rounded bg-coral/10 px-2 py-1 font-medium text-coral">{gapSeverity}</span>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-ink">{analysis.archetype.title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-700">{analysis.studentFriendlyExplanation}</p>
      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-md bg-slate-50 p-3">
          <dt className="text-xs font-medium text-slate-500">错因</dt>
          <dd className="mt-1 text-sm text-slate-800">{analysis.mistakeReason}</dd>
        </div>
        <div className="rounded-md bg-slate-50 p-3">
          <dt className="text-xs font-medium text-slate-500">解题模板</dt>
          <dd className="mt-1 text-sm text-slate-800">{analysis.archetype.solutionTemplate}</dd>
        </div>
      </dl>
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-ink">相似练习</h3>
        <div className="mt-2 grid gap-2">
          {analysis.practiceQuestions.map((item) => (
            <div key={item.question} className="rounded-md border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-800">{item.question}</p>
              <p className="mt-1 text-slate-500">提示：{item.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Create upload tutor component**

Write `src/components/PhotoUploadTutor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Send, Upload } from "lucide-react";
import { AnalysisCard } from "@/components/AnalysisCard";
import type { AnalysisOutput } from "@/lib/types";

type AnalyzeResponse = {
  mode: string;
  analysis: AnalysisOutput;
  mistakeId: string;
  gapSeverity: string;
};

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

export function PhotoUploadTutor() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    if (!file) {
      setError("请先选择一张照片。");
      return;
    }
    setError("");
    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/analyze", { method: "POST", body: formData });
    const data = await response.json();
    setIsAnalyzing(false);
    if (!response.ok) {
      setError(data.error ?? "分析失败，请重新上传。");
      return;
    }
    setResult(data);
    setMessages([{ role: "assistant", content: data.analysis.studentFriendlyExplanation }]);
  }

  async function sendQuestion() {
    const trimmed = question.trim();
    if (!trimmed) {
      return;
    }
    setQuestion("");
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mistakeId: result?.mistakeId, message: trimmed })
    });
    const data = await response.json();
    setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-ink">AI 老师</h1>
        <p className="mt-2 text-sm text-slate-600">上传错题照片，我会帮你讲清错因、知识点、母题和变式练习。</p>
        <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:bg-slate-100">
          <Upload className="h-8 w-8 text-mint" aria-hidden="true" />
          <span className="mt-3 font-medium text-ink">上传错题照片</span>
          <span className="mt-1 text-xs text-slate-500">{file ? file.name : "支持试卷、练习册、课堂作业照片"}</span>
          <input className="sr-only" type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        {error ? <p className="mt-3 text-sm text-coral">{error}</p> : null}
        <button
          onClick={analyze}
          disabled={isAnalyzing}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-mint px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {isAnalyzing ? "分析中..." : "开始分析"}
        </button>
        <div className="mt-5">
          {result ? <AnalysisCard analysis={result.analysis} mode={result.mode} gapSeverity={result.gapSeverity} /> : null}
        </div>
      </section>

      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">继续追问</h2>
        <div className="mt-4 flex max-h-[520px] flex-col gap-3 overflow-y-auto">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={message.role === "assistant" ? "rounded-md bg-slate-50 p-3 text-sm text-slate-700" : "rounded-md bg-mint/10 p-3 text-sm text-ink"}
            >
              {message.content}
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="继续问老师：为什么这里要这样做？"
          />
          <button onClick={sendQuestion} className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-ink text-white" aria-label="发送">
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 5: Wire home page**

Write `src/app/page.tsx`:

```tsx
import { PhotoUploadTutor } from "@/components/PhotoUploadTutor";

export default function HomePage() {
  return <PhotoUploadTutor />;
}
```

- [ ] **Step 6: Run component test and build**

Run:

```bash
npm test -- tests/unit/photo-upload-tutor.test.tsx
npm run build
```

Expected: test passes and build exits with code 0.

- [ ] **Step 7: Commit home UI**

Run:

```bash
git add src/components src/app/page.tsx tests/unit/photo-upload-tutor.test.tsx
git commit -m "feat: build ai teacher workspace"
```

Expected: commit succeeds.

---

### Task 9: Build Mistake, Gap, And Tree Pages

**Files:**
- Create: `src/components/SeverityBadge.tsx`
- Create: `src/components/MistakeList.tsx`
- Create: `src/components/KnowledgeTreeView.tsx`
- Create: `src/app/mistakes/page.tsx`
- Create: `src/app/mistakes/[id]/page.tsx`
- Create: `src/app/gaps/page.tsx`
- Create: `src/app/tree/page.tsx`

- [ ] **Step 1: Create shared severity badge**

Write `src/components/SeverityBadge.tsx`:

```tsx
const labels: Record<string, string> = {
  normal: "普通节点",
  weak: "普通薄弱",
  important: "重点薄弱",
  repeated_archetype: "高频母题漏洞"
};

const classes: Record<string, string> = {
  normal: "bg-slate-100 text-slate-700",
  weak: "bg-amber/10 text-amber",
  important: "bg-coral/10 text-coral",
  repeated_archetype: "bg-coral text-white"
};

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`rounded px-2 py-1 text-xs font-medium ${classes[severity] ?? classes.normal}`}>{labels[severity] ?? labels.normal}</span>;
}
```

- [ ] **Step 2: Create mistake list component**

Write `src/components/MistakeList.tsx`:

```tsx
import Link from "next/link";

type MistakeSummary = {
  id: string;
  subject: string;
  grade: string;
  questionType: string;
  mistakeReason: string;
  masteryStatus: string;
  createdAt: string | Date;
};

export function MistakeList({ mistakes }: { mistakes: MistakeSummary[] }) {
  if (mistakes.length === 0) {
    return <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">还没有错题。先去 AI 老师页面上传一张照片吧。</p>;
  }

  return (
    <div className="grid gap-3">
      {mistakes.map((mistake) => (
        <Link key={mistake.id} href={`/mistakes/${mistake.id}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-mint">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{mistake.grade}</span>
            <span>{mistake.subject}</span>
            <span>{new Date(mistake.createdAt).toLocaleDateString("zh-CN")}</span>
          </div>
          <h2 className="mt-2 font-semibold text-ink">{mistake.questionType}</h2>
          <p className="mt-2 text-sm text-slate-600">{mistake.mistakeReason}</p>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create knowledge tree view**

Write `src/components/KnowledgeTreeView.tsx`:

```tsx
import { SeverityBadge } from "@/components/SeverityBadge";

type TreeNode = {
  id: string;
  name: string;
  chapter: string;
  severity: string;
  errorCount: number;
  repeatedArchetypeCount: number;
  children: TreeNode[];
};

function NodeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  return (
    <li className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2" style={{ paddingLeft: depth * 14 }}>
        <div>
          <p className="font-medium text-ink">{node.name}</p>
          <p className="text-xs text-slate-500">
            错误 {node.errorCount} 次 · 高频母题 {node.repeatedArchetypeCount} 次
          </p>
        </div>
        <SeverityBadge severity={node.severity} />
      </div>
      {node.children.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {node.children.map((child) => (
            <NodeView key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function KnowledgeTreeView({ tree }: { tree: TreeNode[] }) {
  if (tree.length === 0) {
    return <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">这个年级和学科还没有知识点数据。</p>;
  }

  return (
    <ul className="grid gap-3">
      {tree.map((node) => (
        <NodeView key={node.id} node={node} />
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Create mistakes pages**

Write `src/app/mistakes/page.tsx`:

```tsx
import { prisma } from "@/lib/db";
import { MistakeList } from "@/components/MistakeList";

export default async function MistakesPage() {
  const mistakes = await prisma.mistake.findMany({
    where: { studentId: "default-student" },
    orderBy: { createdAt: "desc" }
  });

  return (
    <section>
      <h1 className="text-2xl font-semibold text-ink">错题本</h1>
      <p className="mt-2 text-sm text-slate-600">按时间记录所有已经分析的错题。</p>
      <div className="mt-5">
        <MistakeList mistakes={mistakes} />
      </div>
    </section>
  );
}
```

Write `src/app/mistakes/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function MistakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mistake = await prisma.mistake.findUnique({
    where: { id },
    include: {
      tutorMessages: { orderBy: { createdAt: "asc" } },
      mistakeArchetypes: { include: { archetype: true } }
    }
  });

  if (!mistake) {
    notFound();
  }

  return (
    <article className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="text-sm text-slate-500">
          {mistake.grade} · {mistake.subject}
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{mistake.questionType}</h1>
        <h2 className="mt-5 text-sm font-semibold text-ink">题目文本</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">{mistake.recognizedText}</p>
        <h2 className="mt-5 text-sm font-semibold text-ink">错因讲解</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">{mistake.explanation}</p>
      </section>
      <aside className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-ink">母题</h2>
        {mistake.mistakeArchetypes.map((item) => (
          <div key={item.id} className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
            <p className="font-medium text-ink">{item.archetype.title}</p>
            <p className="mt-1 text-slate-600">{item.archetype.solutionTemplate}</p>
          </div>
        ))}
      </aside>
    </article>
  );
}
```

- [ ] **Step 5: Create gap and tree pages**

Write `src/app/gaps/page.tsx`:

```tsx
import { SeverityBadge } from "@/components/SeverityBadge";
import { prisma } from "@/lib/db";

export default async function GapsPage() {
  const gaps = await prisma.knowledgeGap.findMany({
    where: { studentId: "default-student" },
    include: { knowledgePoint: true },
    orderBy: [{ lastOccurredAt: "desc" }]
  });

  return (
    <section>
      <h1 className="text-2xl font-semibold text-ink">知识漏洞</h1>
      <p className="mt-2 text-sm text-slate-600">这里会记录反复出错的知识点和高频母题。</p>
      <div className="mt-5 grid gap-3">
        {gaps.map((gap) => (
          <article key={gap.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">
                  {gap.knowledgePoint.grade} · {gap.knowledgePoint.subject}
                </p>
                <h2 className="mt-1 font-semibold text-ink">{gap.knowledgePoint.name}</h2>
              </div>
              <SeverityBadge severity={gap.severity} />
            </div>
            <p className="mt-3 text-sm text-slate-600">
              错误 {gap.errorCount} 次，高频母题 {gap.repeatedArchetypeCount} 次。{gap.reviewSuggestion}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
```

Write `src/app/tree/page.tsx`:

```tsx
import { KnowledgeTreeView } from "@/components/KnowledgeTreeView";
import { buildKnowledgeTree } from "@/lib/knowledge/tree";
import { prisma } from "@/lib/db";

export default async function TreePage({ searchParams }: { searchParams: Promise<{ grade?: string; subject?: string }> }) {
  const params = await searchParams;
  const grade = params.grade ?? "八年级";
  const subject = params.subject ?? "数学";
  const points = await prisma.knowledgePoint.findMany({
    where: { grade, subject },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });
  const gaps = await prisma.knowledgeGap.findMany({
    where: { studentId: "default-student", knowledgePoint: { grade, subject } }
  });
  const tree = buildKnowledgeTree({ points, gaps });

  return (
    <section>
      <h1 className="text-2xl font-semibold text-ink">期末知识树</h1>
      <p className="mt-2 text-sm text-slate-600">当前范围：{grade} · {subject}</p>
      <div className="mt-5">
        <KnowledgeTreeView tree={tree} />
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Verify build**

Run:

```bash
npm run build
```

Expected: command exits with code 0.

- [ ] **Step 7: Commit pages**

Run:

```bash
git add src/components src/app/mistakes src/app/gaps src/app/tree
git commit -m "feat: add review pages"
```

Expected: commit succeeds.

---

### Task 10: Add End-To-End Verification

**Files:**
- Create: `tests/e2e/private-tutor.spec.ts`
- Create: `tests/fixtures/sample-mistake.txt`

- [ ] **Step 1: Create upload fixture**

Write `tests/fixtures/sample-mistake.txt`:

```text
sample worksheet fixture for simulated upload
```

- [ ] **Step 2: Write E2E test**

Write `tests/e2e/private-tutor.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("student can analyze a mistake and see study guardrail", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI 老师" })).toBeVisible();

  await page.setInputFiles('input[type="file"]', "tests/fixtures/sample-mistake.txt");
  await page.getByRole("button", { name: /开始分析/ }).click();
  await expect(page.getByText("一次函数图像性质判断母题")).toBeVisible();

  await page.getByPlaceholder("继续问老师：为什么这里要这样做？").fill("帮我查一下这个游戏怎么通关");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("我主要帮你学习")).toBeVisible();

  await page.goto("/tree");
  await expect(page.getByRole("heading", { name: "期末知识树" })).toBeVisible();
  await expect(page.getByText("一次函数")).toBeVisible();
});
```

- [ ] **Step 3: Run unit tests**

Run:

```bash
npm test
```

Expected: all unit tests pass.

- [ ] **Step 4: Run E2E test**

Run:

```bash
npm run test:e2e
```

Expected: Playwright test passes in Chromium.

- [ ] **Step 5: Run production build**

Run:

```bash
npm run build
```

Expected: command exits with code 0.

- [ ] **Step 6: Commit verification**

Run:

```bash
git add tests/e2e tests/fixtures
git commit -m "test: cover tutor learning flow"
```

Expected: commit succeeds.

---

### Task 11: Final Manual QA And Delivery Notes

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Write `README.md`:

```md
# 私人教师 Agent

面向单个初中学生的 Web 私人教师应用。学生上传试卷或习题照片后，系统生成错因分析、知识点讲解、母题总结和相似练习，并沉淀知识漏洞与期末知识树。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run prisma:migrate -- --name init
npm run prisma:seed
npm run dev
```

打开 http://localhost:3000。

## AI 模式

- 未配置 `OPENAI_API_KEY` 时，系统使用模拟分析，完整功能可演示。
- 配置 `OPENAI_API_KEY` 后，分析器入口已预留真实视觉模型接入点。

## 核心页面

- `/`：AI 老师，上传照片并继续追问。
- `/mistakes`：错题本。
- `/gaps`：知识漏洞。
- `/tree`：按年级和学科拆分的期末知识树。

## 验证

```bash
npm test
npm run test:e2e
npm run build
```
```

- [ ] **Step 2: Start dev server**

Run:

```bash
npm run dev
```

Expected: server starts at `http://localhost:3000`.

- [ ] **Step 3: Manually verify pages**

Open `http://localhost:3000` and verify:

- AI 老师 page renders upload control.
- Uploading `tests/fixtures/sample-mistake.txt` produces analysis content.
- A game-related follow-up returns the study refusal.
- `/mistakes` shows the saved mistake.
- `/gaps` shows a knowledge gap.
- `/tree` shows the 八年级数学 tree.

- [ ] **Step 4: Stop dev server**

Stop the running server with Ctrl-C in the terminal session.

- [ ] **Step 5: Commit README**

Run:

```bash
git add README.md
git commit -m "docs: add local run instructions"
```

Expected: commit succeeds.

- [ ] **Step 6: Final status**

Run:

```bash
git status --short
```

Expected: no tracked implementation files are modified. Untracked local files may include `.env.local`, `uploads/`, and `prisma/dev.db`.

