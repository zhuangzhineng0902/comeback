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

async function run() {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();
