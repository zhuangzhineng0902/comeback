import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeMistake } from "@/lib/analyzer";
import { analyzeWithSimulation } from "@/lib/analyzer/simulated";

const minimaxAnalysis = {
  subject: "数学",
  grade: "八年级",
  questionType: "一次函数应用题",
  recognizedText: "已知一次函数 y = 2x - 3，判断图像经过的象限。",
  studentAnswer: "第四象限",
  correctAnswer: "第一、三、四象限",
  knowledgePoints: [{ name: "一次函数图像与性质", confidence: 0.95 }],
  mistakeReason: "只看 b，没有看 k。",
  studentFriendlyExplanation: "先看 k 的正负，再看 b 的位置。",
  example: "y=x-1 也要同时看 k 和 b。",
  archetype: {
    title: "一次函数图像性质判断母题",
    pattern: "根据 k 和 b 判断图像",
    solutionTemplate: "先看 k，再看 b，最后合并象限。",
    commonTraps: ["只看截距"]
  },
  practiceQuestions: [{ question: "y=-x+2 经过哪些象限？", answer: "一二四", hint: "先看 k<0。" }]
};

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

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MINIMAX_API_KEY;
  delete process.env.MINIMAX_BASE_URL;
  delete process.env.MINIMAX_MODEL;
});

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
    expect(result.richExplanation?.diagnosis).toContain("截距");
    expect(result.richExplanation?.treeContext.path).toContain("一次函数图像与性质");
    expect(result.richExplanation?.illustration?.type).toBe("flow");
  });

  it("uses a neutral sample when hints are missing in simulation mode", async () => {
    const result = await analyzeWithSimulation({ filename: "worksheet.png" });

    expect(result.subject).toBe("英语");
    expect(result.grade).toBe("七年级");
    expect(result.richExplanation?.diagnosis).toContain("a book");
    expect(result.richExplanation?.shenzhenExample.label).toBe("深圳题型风格");
  });

  it("uses MiniMax mode when a MiniMax key and image bytes are present", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(minimaxAnalysis) } }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMistake({
      filename: "worksheet.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64"),
      subjectHint: "数学",
      gradeHint: "八年级"
    });

    expect(result.mode).toBe("api");
    expect(result.analysis.questionType).toBe("一次函数应用题");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.minimaxi.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-minimax-key",
          "Content-Type": "application/json"
        })
      })
    );
  });

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

  it("includes MiniMax error response details when the request is rejected", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            type: "error",
            error: {
              type: "bad_request_error",
              message: "invalid param: image url must be http(s):// or data:...;base64 (2013)"
            }
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await expect(
      analyzeMistake({
        filename: "worksheet.png",
        mimeType: "image/png",
        imageBase64: Buffer.from("image-bytes").toString("base64")
      })
    ).rejects.toThrow("invalid param: image url must be http(s):// or data:...;base64");
  });

  it("normalizes blank MiniMax fields instead of failing the whole analysis", async () => {
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
                    studentAnswer: "",
                    mistakeReason: ""
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

    expect(result.analysis.studentAnswer).toBe("图片中未清晰识别到学生答案。");
    expect(result.analysis.mistakeReason).toBe("未识别到明确错因，建议先核对题目条件和作答步骤。");
  });

  it("normalizes string common traps returned by MiniMax", async () => {
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
                    archetype: {
                      ...minimaxAnalysis.archetype,
                      commonTraps: "漏看等号两边同加同减；移项变号出错"
                    }
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

    expect(result.analysis.archetype.commonTraps).toEqual(["漏看等号两边同加同减", "移项变号出错"]);
  });

  it("repairs JSON-like MiniMax content with trailing commas and unquoted keys", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    const jsonLikeContent = `{
      analyses: [
        {
          sourceImageIndex: 0,
          subject: "数学",
          grade: "七年级",
          questionType: "解答题",
          recognizedText: "2x + 3 = 7",
          studentAnswer: "未作答",
          correctAnswer: "x = 2",
          knowledgePoints: [{"name":"一元一次方程","confidence":0.95}],
          mistakeReason: "移项规则不熟",
          studentFriendlyExplanation: "先两边同时减 3，再同时除以 2。",
          example: "3x + 1 = 7",
          archetype: {
            title: "一元一次方程",
            pattern: "ax+b=c",
            solutionTemplate: "移项，合并，系数化 1",
            commonTraps: ["移项忘记变号"],
          },
          practiceQuestions: [{"question":"x+1=3","answer":"x=2","hint":"两边减 1"}],
        },
      ],
    }`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: jsonLikeContent } }]
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

    expect(result.analysis.questionType).toBe("解答题");
    expect(result.analysis.archetype.commonTraps).toEqual(["移项忘记变号"]);
  });

  it("parses every mistake when MiniMax returns an analyses array", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    const secondAnalysis = {
      ...minimaxAnalysis,
      questionType: "第二道语法选择题",
      recognizedText: "There ____ two books on the desk.",
      mistakeReason: "没有识别复数主语。"
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    analyses: [
                      { ...minimaxAnalysis, sourceImageIndex: 0, richExplanation },
                      { ...secondAnalysis, sourceImageIndex: 1, richExplanation: { ...richExplanation, diagnosis: "第二题错因" } }
                    ]
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
      filename: "paper.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64")
    });

    expect(result.analysis.questionType).toBe("一次函数应用题");
    expect(result.analyses).toHaveLength(2);
    expect(result.analyses.map((item) => item.sourceImageIndex)).toEqual([0, 1]);
    expect(result.analyses[1].questionType).toBe("第二道语法选择题");
    expect(result.analyses[1].richExplanation?.diagnosis).toBe("第二题错因");
  });

  it("normalizes rich tree context strings returned by MiniMax", async () => {
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
                    richExplanation: {
                      ...richExplanation,
                      treeContext: {
                        path: "英语 → 七年级 → 语法 → There be 句型 → 就近原则",
                        prerequisites: "名词单复数、be 动词 is/are",
                        current: "There be 句型就近原则",
                        next: "主谓一致；倒装句识别",
                        confusions: "只看最后一个名词\n忽略离 be 最近的主语"
                      }
                    }
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
      filename: "grade-7-english.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64")
    });

    expect(result.analysis.richExplanation?.treeContext.path).toEqual([
      "英语",
      "七年级",
      "语法",
      "There be 句型",
      "就近原则"
    ]);
    expect(result.analysis.richExplanation?.treeContext.prerequisites).toEqual(["名词单复数", "be 动词 is/are"]);
    expect(result.analysis.richExplanation?.treeContext.current).toEqual(["There be 句型就近原则"]);
    expect(result.analysis.richExplanation?.treeContext.next).toEqual(["主谓一致", "倒装句识别"]);
    expect(result.analysis.richExplanation?.treeContext.confusions).toEqual([
      "只看最后一个名词",
      "忽略离 be 最近的主语"
    ]);
  });

  it("builds a rich fallback when MiniMax omits required rich explanation fields", async () => {
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
                    richExplanation: {
                      ...richExplanation,
                      wrongAnswerInsight: undefined
                    }
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

    expect(result.mode).toBe("api");
    expect(result.analysis.questionType).toBe("一次函数应用题");
    expect(result.analysis.richExplanation?.diagnosis).toBe("只看 b，没有看 k。");
    expect(result.analysis.richExplanation?.treeContext.path).toContain("一次函数图像与性质");
    expect(result.analysis.richExplanation?.shenzhenExample.label).toBe("深圳题型风格");
  });

  it("builds a rich fallback when MiniMax returns malformed rich tree context strings", async () => {
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
                    richExplanation: {
                      ...richExplanation,
                      treeContext: {
                        ...richExplanation.treeContext,
                        path: "知识树位置"
                      }
                    }
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

    expect(result.mode).toBe("api");
    expect(result.analysis.questionType).toBe("一次函数应用题");
    expect(result.analysis.richExplanation?.diagnosis).toBe("只看 b，没有看 k。");
    expect(result.analysis.richExplanation?.treeContext.path).toContain("一次函数图像与性质");
  });

  it("drops incomplete optional illustrations while keeping rich explanations", async () => {
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
                    richExplanation: {
                      ...richExplanation,
                      illustration: {
                        type: "flow",
                        nodes: richExplanation.illustration.nodes
                      }
                    }
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

    expect(result.mode).toBe("api");
    expect(result.analysis.richExplanation?.diagnosis).toContain("a book");
    expect(result.analysis.richExplanation?.illustration).toBeUndefined();
  });

  it("sends every uploaded image to MiniMax", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(minimaxAnalysis) } }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await analyzeMistake({
      filename: "page-1.png, page-2.png",
      mimeType: "image/png",
      imageBase64: "first-image",
      images: [
        { filename: "page-1.png", mimeType: "image/png", imageBase64: "first-image" },
        { filename: "page-2.png", mimeType: "image/jpeg", imageBase64: "second-image" }
      ]
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      thinking?: { type?: string };
      response_format?: { type?: string };
      max_completion_tokens?: number;
      messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>;
    };
    expect(requestBody.thinking).toEqual({ type: "disabled" });
    expect(requestBody.response_format).toEqual({ type: "json_object" });
    expect(requestBody.max_completion_tokens).toBe(4000);
    const imageUrls = requestBody.messages[0].content
      .filter((item) => item.type === "image_url")
      .map((item) => item.image_url?.url);
    expect(imageUrls).toEqual(["data:image/png;base64,first-image", "data:image/jpeg;base64,second-image"]);
  });

  it("asks MiniMax to infer missing subject and grade from image evidence without hidden defaults", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ ...minimaxAnalysis, subject: "英语", grade: "七年级" }) } }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await analyzeMistake({
      filename: "grade-7-english.png",
      mimeType: "image/png",
      imageBase64: "image-bytes"
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      messages: Array<{ content: Array<{ type: string; text?: string }> }>;
    };
    const prompt = requestBody.messages[0].content.find((item) => item.type === "text")?.text ?? "";
    expect(prompt).toContain("初一/七年级/7年级/Grade 7");
    expect(prompt).toContain("不要因为示例、学生档案或系统默认值选择八年级数学");
    expect(prompt).toContain("用户提示学科：未提供，请根据图片自动识别");
    expect(prompt).toContain("用户提示年级：未提供，请根据图片自动识别");
    expect(prompt).toContain("richExplanation");
    expect(prompt).toContain("老师板书式讲解");
    expect(prompt).toContain("知识树上下文");
    expect(prompt).toContain("sourceImageIndex");
    expect(prompt).toContain("图片索引从 0 开始");
    expect(prompt).toContain("深圳题型风格");
    expect(prompt).toContain("不要把未核验来源的题目说成深圳真题");
    expect(prompt).toContain("illustration 只能是结构化数据");
    expect(prompt).not.toContain("用户提示学科：数学");
    expect(prompt).not.toContain("用户提示年级：八年级");
  });

  it("allows overriding the MiniMax base URL for compatible deployments", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    process.env.MINIMAX_BASE_URL = "https://example.test/v1";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(minimaxAnalysis) } }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await analyzeMistake({
      filename: "worksheet.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64")
    });

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/v1/chat/completions", expect.any(Object));
  });

  it("accepts MiniMax responses that include reasoning text before JSON", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: `<think>先识别题目。</think>\n${JSON.stringify(minimaxAnalysis)}` } }]
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

    expect(result.mode).toBe("api");
    expect(result.analysis.archetype.title).toBe("一次函数图像性质判断母题");
  });

  it("normalizes common MiniMax string arrays into the app analysis shape", async () => {
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
                    knowledgePoints: ["一次函数图像与性质"],
                    archetype: "一次函数 y=kx+b 象限判断母题",
                    practiceQuestions: ["一次函数 y=-x+5 的图像经过哪些象限？"]
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

    expect(result.mode).toBe("api");
    expect(result.analysis.knowledgePoints[0]).toEqual({ name: "一次函数图像与性质", confidence: 0.8 });
    expect(result.analysis.archetype.title).toBe("一次函数 y=kx+b 象限判断母题");
    expect(result.analysis.practiceQuestions[0].question).toBe("一次函数 y=-x+5 的图像经过哪些象限？");
  });

  it("parses the first complete JSON object when MiniMax appends extra text", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `${JSON.stringify(minimaxAnalysis)}\n补充说明：这不是 JSON。示例 {不要解析这里}`
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

    expect(result.mode).toBe("api");
    expect(result.analysis.questionType).toBe("一次函数应用题");
  });

  it("repairs non-JSON MiniMax content with a second text-only request", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "<think>The image is a linear-function mistake. The student only checked b and ignored k.</think>"
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(minimaxAnalysis) } }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMistake({
      filename: "worksheet.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64")
    });

    expect(result.mode).toBe("api");
    expect(result.analysis.questionType).toBe("一次函数应用题");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as {
      thinking?: { type?: string };
      response_format?: { type?: string };
      max_completion_tokens?: number;
      messages: Array<{ content: string }>;
    };
    expect(repairBody.thinking).toEqual({ type: "disabled" });
    expect(repairBody.response_format).toEqual({ type: "json_object" });
    expect(repairBody.max_completion_tokens).toBe(4000);
    expect(repairBody.messages[0].content).toContain("转换成严格 JSON");
    expect(repairBody.messages[0].content).toContain("所有 JSON 属性名必须使用英文双引号");
    expect(repairBody.messages[0].content).toContain("重新生成完整 JSON 对象");
  });

  it("repairs rich explanations with malformed illustration types instead of dropping them", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    ...minimaxAnalysis,
                    richExplanation: {
                      ...richExplanation,
                      illustration: {
                        ...richExplanation.illustration,
                        type: "chart"
                      }
                    }
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ ...minimaxAnalysis, richExplanation }) } }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMistake({
      filename: "worksheet.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64")
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.analysis.richExplanation?.illustration?.type).toBe("flow");
  });

  it("surfaces MiniMax failures instead of silently falling back when a key is configured", async () => {
    process.env.MINIMAX_API_KEY = "test-minimax-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    await expect(analyzeMistake({
      filename: "worksheet.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64")
    })).rejects.toThrow("MiniMax");
  });

  it("uses simulation only when MiniMax is not configured", async () => {
    const result = await analyzeMistake({
      filename: "worksheet.png",
      mimeType: "image/png",
      imageBase64: Buffer.from("image-bytes").toString("base64")
    });

    expect(result.mode).toBe("simulation");
  });
});
