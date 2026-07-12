# Private Tutor Agent

单个孩子使用的初中全学科私人教师 Web Agent。当前版本支持上传试卷/习题照片，结合本地 OCR 服务和 MiniMax 国内站 API 识别错题、讲解知识点、沉淀错题本、知识漏洞和期末知识树。

## 当前能力

- 面向单个孩子，默认学生 ID 为 `default-student`。
- 支持初中全学科：语文、数学、英语、物理、化学、生物、历史、地理、道德与法治。
- 支持上传 JPG、PNG、WebP、HEIC/HEIF 图片，单张最大 8MB，一次最多 16 张。
- 学科和年级可以不选，AI 会根据图片文字、题型和章节自动判断。
- OCR 前置识别题干、题号、文字块、红笔批改痕迹和疑似错题候选。
- MiniMax 负责最终错题判断、解题讲解、知识漏洞、母题、练习题、深圳题型风格例题。
- 错题保存后会更新知识漏洞；相同题目重复提交不会重复叠加错误次数。
- 同一母题多次出错会标记为高频母题漏洞。
- AI 追问有学习范围限制，会拦截游戏、娱乐视频、闲聊和绕过规则类请求。
- 首页显示 AI 分析历史和对话历史。
- 错题本详情页展示错题解析、母题、追问记录。

## 技术栈

- Web: Next.js 15, React 19, TypeScript
- 数据库: SQLite + Prisma
- AI: MiniMax Chat Completions API
- OCR: Flask + PaddleOCR + Pillow
- 批改痕迹识别: OCR 文本块、红笔像素检测、题号/小问空间绑定

## 代码处理流程

### 1. 前端上传

入口组件：`src/components/PhotoUploadTutor.tsx`

1. 用户选择 1 到 16 张图片。
2. 前端把图片放入 `FormData` 的 `files` 字段。
3. 可选传入 `subjectHint` 和 `gradeHint`；不选时后端交给 AI 自动识别。
4. 请求 `POST /api/analyze`。
5. 返回成功后，前端按图片分组显示：
   - 原始上传图片缩略图，点击可看原图。
   - OCR 证据摘要。
   - 每道错题的解析卡片。
   - 当前分析结果和历史记录。

当前上传处理是同步请求：前端会等待 `/api/analyze` 完成后一次性展示结果。当前代码没有异步任务队列和批量重试接口。

### 2. 上传 API 校验与落盘

入口：`src/app/api/analyze/route.ts`

处理步骤：

1. 校验文件数量：必须至少 1 张，最多 16 张。
2. 校验文件类型：只允许 `image/jpeg`、`image/png`、`image/webp`、`image/heic`、`image/heif`。
3. 校验单张大小：最大 8MB。
4. 保存原始图片到 `uploads/`：
   - 文件名格式：`<uuid>-<清洗后的原文件名>`
   - 中文字符会被清洗成 `_`，例如 `英语试卷_1.JPG` 可能变成 `____1.JPG`。
5. HEIC/HEIF 会用 macOS `sips` 转成 JPEG 分析图：
   - 路径形如 `uploads/<uuid>-<name>-analysis.jpg`
   - JPG、PNG、WebP 当前直接使用原图参与 OCR 和 AI 分析。

如果后续分析或持久化失败，当前 API 会删除本次刚上传的图片文件，避免留下无效文件。

### 3. OCR 前置识别

Web OCR 客户端：`src/lib/ocr/client.ts`

OCR 服务：`ocr_service/app.py`

处理步骤：

1. Web 端把图片 base64 还原为二进制，使用 multipart 字段 `image` 调用 `OCR_SERVICE_URL`。
2. OCR 服务用 Pillow 打开图片，并按 `OCR_MAX_SIDE` 缩放，默认最长边 1800。
3. PaddleOCR 识别文字、坐标和置信度。
4. `ocr_service/marks.py` 扫描红色像素块，提取红笔批改标记。
5. `ocr_service/normalization.py` 归一化结果：
   - `textBlocks`: OCR 文字块。
   - `questionCandidates`: 题号候选。
   - `gradingMarks`: 红笔/OCR 文本批改标记。
   - `mistakeCandidates`: 根据题号、红笔位置、小问位置绑定出的疑似错题。
6. Web 端把 OCR 结果整理成 `PaperVisionContext`，传给 MiniMax。

OCR 失败不会直接中断分析。失败时会返回 `status: "failed"` 的 OCR context，后续 MiniMax 仍会使用原图视觉能力继续分析。

### 4. MiniMax 分析

入口：`src/lib/analyzer/index.ts`

真实 AI 实现：`src/lib/analyzer/minimax.ts`

处理步骤：

1. 如果配置了 `MINIMAX_API_KEY` 且有图片数据，则调用 MiniMax。
2. 如果没有配置 MiniMax Key，则使用 `src/lib/analyzer/simulated.ts` 的模拟结果。
3. 请求 MiniMax 时会同时传：
   - 严格 JSON 输出要求。
   - 所有上传图片。
   - OCR 证据层。
   - 学科/年级提示或自动识别要求。
4. Prompt 要求 MiniMax：
   - 找出整张试卷里所有能识别的错题。
   - 不只返回第一题。
   - 用混合策略判断错题：老师批改标记 + 独立解题对比学生答案。
   - 优先把红色批改作为老师标记；黑色叉可能是学生排除选项，不能直接判错。
   - 识别半勾、扣分、远离题干的学生答案区域。
   - 输出孩子能理解的讲解、知识树上下文、结构化插图数据和深圳题型风格例题。

MiniMax 返回后会做多层解析：

1. 先直接解析严格 JSON。
2. 如果返回了 `<think>`、前后缀文本或多余内容，会尝试截取第一个 JSON 对象。
3. 如果是类 JSON，会尝试修复中文引号、未加引号字段、尾随逗号。
4. 如果仍失败，会发第二次 MiniMax 请求，把内容修复成严格 JSON。
5. 如果修复后仍失败，会发紧凑修复请求。
6. 如果视觉请求超时且 OCR 可用，会走 OCR-only MiniMax 分析。
7. 如果 MiniMax 漏掉 OCR `mistakeCandidates`，会请求扩展覆盖。
8. 如果扩展也失败，会把 OCR 候选保存为 `suspected` 错题，避免完全漏题。

如果 `ENABLE_AI_FALLBACK=true`，MiniMax 失败后会退回模拟分析。默认建议保持 `false`，这样真实 AI 问题会暴露出来，便于调试。

### 5. 错题保存与知识漏洞更新

入口：`src/lib/repositories/mistakes.ts`

每一道 AI 返回的 `analysis` 会进入事务保存：

1. 取第一个 `knowledgePoints[0]` 作为主知识点。
2. `KnowledgePoint` 按 `subject + grade + name` upsert。
3. `Archetype` 按 `subject + grade + knowledgePointId + title` upsert。
4. 检查同一个孩子、同学科、同年级下是否已存在相同题干：
   - 题干会去空格、标点并小写化后比较。
   - 如果相同题目已存在且知识漏洞已存在，直接返回旧错题和旧漏洞，不重复叠加错误次数。
5. 新错题写入 `Mistake`。
6. 建立 `MistakeArchetype` 关联。
7. 写入一条初始 `TutorMessage`，内容为 AI 的孩子版讲解。
8. 重新统计该知识点下的错题数和同母题重复数，更新 `KnowledgeGap`。

漏洞严重程度：

- `normal`: 普通错题。
- `weak`: 同一知识点错误数达到 2。
- `important`: 同一知识点错误数达到 3。
- `repeated_archetype`: 同一母题重复出错达到 2。

### 6. 首页历史与继续追问

历史接口：`src/app/api/history/route.ts`

- 查询最近 20 条错题。
- 根据已保存的错题和母题重建首页可展示的 `analysis` 结构。
- 返回原图 URL、错题解析、消息记录。

追问接口：`src/app/api/chat/route.ts`

1. 解析用户消息。
2. 如果传了 `mistakeId`，先确认错题属于默认学生。
3. 用 `src/lib/study-guard.ts` 判断是否学习相关。
4. 游戏、娱乐、绕过规则、闲聊会被拦截并写入 `NonStudyRequestLog`。
5. 学习问题会生成一个固定模板回复。
6. 如果有关联错题，会把用户问题和老师回复写入 `TutorMessage`。

当前追问回复不是 MiniMax 实时生成，而是本地模板回复。

### 7. 错题本、知识漏洞、期末知识树

错题本：

- 列表页：`src/app/mistakes/page.tsx`
- 详情页：`src/app/mistakes/[id]/page.tsx`
- API：`src/app/api/mistakes/route.ts`、`src/app/api/mistakes/[id]/route.ts`

知识漏洞：

- 页面：`src/app/gaps/page.tsx`
- API：`src/app/api/knowledge-gaps/route.ts`
- 按 `severityRank` 和最近发生时间排序。

期末知识树：

- 页面：`src/app/tree/page.tsx`
- API：`src/app/api/knowledge-tree/route.ts`
- 构建逻辑：`src/lib/knowledge/tree.ts`
- 默认查询 `八年级 + 数学`，可按学科和年级筛选。
- 树节点会向父节点汇总错误数、同母题重复数和最严重漏洞标记。

当前代码没有独立的知识点详情页；知识漏洞和知识树主要提供列表/树状视图。

### 8. 图片访问

图片接口：`src/app/api/uploads/[filename]/route.ts`

- 通过文件名读取 `process.cwd()/uploads/<filename>`。
- 根据扩展名返回 `image/jpeg`、`image/png`、`image/webp`、`image/heic`、`image/heif`。
- 文件不存在时返回 `404 { "error": "图片不存在。" }`。

## 环境要求

### Node.js

建议使用 Node.js 22 或更高版本。当前本地验证环境曾使用：

```bash
node --version
# v24.x

npm --version
# 11.x
```

### Python

OCR 服务建议使用 Python 3.11。

已验证环境示例：

```bash
/opt/miniconda3/envs/paddle_env/bin/python3 --version
# Python 3.11.x
```

不要直接使用系统 Python 3.14 跑 OCR 服务。PaddleOCR/PaddlePaddle 对 Python 版本和平台 wheel 比较敏感，Python 3.11 是当前项目更稳定的选择。

### 系统依赖

- macOS / Linux 均可开发。
- HEIC/HEIF 转换依赖 macOS `sips`；非 macOS 环境建议上传 JPG、PNG 或 WebP。
- Apple Silicon 或不同 CPU/GPU 环境安装 PaddlePaddle 时，需要选择匹配平台的 wheel。

## 安装 Web 依赖

```bash
npm install
```

## 配置环境变量

复制示例配置：

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```env
DATABASE_URL="file:./dev.db"
MINIMAX_API_KEY="你的 MiniMax API Key"
MINIMAX_BASE_URL="https://api.minimaxi.com/v1"
MINIMAX_MODEL="MiniMax-M3"
MINIMAX_MAX_COMPLETION_TOKENS="16000"
MINIMAX_TIMEOUT_MS="90000"
ENABLE_AI_FALLBACK="false"
OCR_SERVICE_URL="http://127.0.0.1:5005/ocr"
OCR_TIMEOUT_MS="120000"
```

说明：

- `ENABLE_AI_FALLBACK=false` 时，真实 AI 失败会直接返回错误，不走 mock。
- `OCR_SERVICE_URL` 必须指向本地 OCR 服务的 `/ocr` 接口。
- MiniMax 国内站 API Key 不要提交到 Git。

## 初始化数据库

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

数据库默认写入 `prisma/dev.db`，该文件已被 `.gitignore` 忽略。

## 搭建 OCR 服务

推荐使用 Conda 创建 Python 3.11 环境：

```bash
conda create -n paddle_env python=3.11
conda activate paddle_env
pip install -r ocr_service/requirements.txt
pip install paddlepaddle
```

如果 `pip install paddlepaddle` 失败，请按 PaddlePaddle 官网选择匹配当前机器、Python 版本和 CPU/GPU 的安装命令。

启动 OCR 服务：

```bash
python3 ocr_service/app.py
```

服务默认监听：

```text
http://127.0.0.1:5005
```

健康检查：

```bash
curl http://127.0.0.1:5005/health
```

OCR 接口要求 multipart 表单字段名为 `image`：

```bash
curl -X POST http://127.0.0.1:5005/ocr \
  -F 'image=@tests/2912.JPG;type=image/jpeg'
```

## 启动 Web 应用

开发模式：

```bash
npm run dev
```

默认访问：

```text
http://localhost:3000
```

指定端口：

```bash
npm run dev -- --port 51762
```

生产构建并启动：

```bash
npm run build
npm run start -- -p 57353
```

访问：

```text
http://localhost:57353
```

## 推荐本地启动顺序

开两个终端。

终端 1，OCR 服务：

```bash
conda activate paddle_env
python3 ocr_service/app.py
```

终端 2，Web 服务：

```bash
npm run dev -- --port 51762
```

## 验证命令

OCR 单测：

```bash
npm run ocr:test
```

Web/业务单测：

```bash
npm test
```

生产构建：

```bash
npm run build
```

当前已知构建警告：

- `src/components/PhotoUploadTutor.tsx` 中使用 `<img>` 展示上传原图，会触发 Next.js 图片优化建议，不影响本地运行。

## 常见问题

### OCR 服务启动失败

优先检查 Python 版本：

```bash
python3 --version
```

如果是 Python 3.14，建议切换到 Python 3.11 Conda 环境。然后重新安装：

```bash
pip install -r ocr_service/requirements.txt
pip install paddlepaddle
```

### Web 上传图片后没有 OCR 结果

检查 OCR 服务是否在运行：

```bash
curl http://127.0.0.1:5005/health
```

检查 `.env.local`：

```env
OCR_SERVICE_URL="http://127.0.0.1:5005/ocr"
```

OCR 失败时 Web 会继续走原图视觉分析，页面上会显示 OCR 失败或没有文字块。

### MiniMax 返回解析失败

确认 `.env.local` 中：

```env
MINIMAX_API_KEY="..."
MINIMAX_BASE_URL="https://api.minimaxi.com/v1"
MINIMAX_MODEL="MiniMax-M3"
MINIMAX_MAX_COMPLETION_TOKENS="16000"
MINIMAX_TIMEOUT_MS="90000"
```

模型偶尔会返回非严格 JSON。项目已有 JSON 截取、类 JSON 修复、二次修复请求、紧凑修复请求、OCR-only 兜底和 OCR 候选兜底，但如果 MiniMax 连续超时或返回异常，仍需要查看服务端日志定位。

### 上传后 `uploads/` 为空

当前代码会把图片写入运行 Web 服务时的 `process.cwd()/uploads`。如果从不同工作目录或 worktree 启动服务，会写到不同目录。

另外，当前 `/api/analyze` 如果后续 AI 分析或数据库保存失败，会删除本次刚上传的图片文件。只有分析和保存成功的上传会保留。

### HEIC 上传失败

HEIC/HEIF 会调用 macOS `sips` 转 JPEG。非 macOS 环境建议改传 JPG、PNG 或 WebP。

### 一次上传很多页耗时较长

当前实现是同步处理：

- 每张图先 OCR。
- 所有图片一起发给 MiniMax。
- MiniMax 返回后再保存每一道错题。

如果图片多、试卷密、MiniMax 响应慢，页面会等待较久。当前代码没有后台队列、批量任务状态和批量重试。

## 目录说明

```text
src/app/             Next.js 页面和 API Route
src/components/      前端组件，包含上传页和解析卡片
src/lib/analyzer/    MiniMax 调用、JSON 修复、OCR 候选兜底、模拟分析
src/lib/ocr/         Web 端调用 OCR 服务的客户端
src/lib/knowledge/   知识漏洞严重程度和知识树构建
src/lib/repositories/错题、母题、知识漏洞保存逻辑
ocr_service/         Flask + PaddleOCR OCR 服务
prisma/              SQLite schema、migration、seed
tests/               单元测试和本地测试样例
uploads/             本地上传图片，已忽略
```

## Git 注意事项

以下文件不要提交：

- `.env.local`
- `prisma/dev.db`
- `uploads/`
- 本地试卷照片样例，例如 `tests/2912.JPG`

