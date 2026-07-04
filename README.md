# Private Tutor Agent

单个孩子使用的初中全学科私人教师 Web Agent。应用支持上传试卷/习题照片，先通过本地 OCR 服务识别题目、批改痕迹和错题候选，再调用 MiniMax 国内站 API 生成错题解析、知识漏洞、母题和复习建议。

## 技术栈

- Web: Next.js 15, React 19, TypeScript
- 数据库: SQLite + Prisma
- AI: MiniMax Chat Completions API
- OCR: Flask + PaddleOCR + Pillow
- 图片批改识别: OCR 文本块、红笔像素检测、题号/小问空间绑定

## 环境要求

### Node.js

建议使用 Node.js 22 或更高版本。当前本地验证环境为：

```bash
node --version
# v24.14.0

npm --version
# 11.9.0
```

### Python

OCR 服务建议使用 Python 3.11。

当前已验证环境：

```bash
/opt/miniconda3/envs/paddle_env/bin/python3 --version
# Python 3.11.15
```

不要直接使用系统 Python 3.14 跑 OCR 服务。PaddleOCR/PaddlePaddle 对 Python 版本和平台 wheel 比较敏感，Python 3.11 是当前项目已验证的稳定选择。

### 系统依赖

- macOS / Linux 均可开发
- HEIC 图片转换依赖 macOS `sips`；非 macOS 环境建议上传 JPG/PNG/WebP
- Apple Silicon 或不同 CPU/GPU 环境安装 PaddlePaddle 时，需要选择匹配平台的 wheel

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
OCR_TIMEOUT_MS="45000"
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

开两个终端：

终端 1，OCR 服务：

```bash
conda activate paddle_env
python3 ocr_service/app.py
```

终端 2，Web 服务：

```bash
npm run dev
```

或使用生产模式：

```bash
npm run build
npm run start -- -p 57353
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

- `src/components/PhotoUploadTutor.tsx` 中有两个 `<img>` 的 Next.js 性能警告，不影响本地运行。

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

### MiniMax 返回解析失败

确认 `.env.local` 中：

```env
MINIMAX_API_KEY="..."
MINIMAX_BASE_URL="https://api.minimaxi.com/v1"
MINIMAX_MODEL="MiniMax-M3"
MINIMAX_MAX_COMPLETION_TOKENS="16000"
MINIMAX_TIMEOUT_MS="90000"
```

模型偶尔会返回非严格 JSON。项目已有 JSON 修复和 OCR 候选兜底逻辑，但如果 MiniMax 连续超时或返回异常，仍需要查看服务端日志定位。

### HEIC 上传失败

HEIC 会调用 macOS `sips` 转 JPEG。非 macOS 环境建议改传 JPG、PNG 或 WebP。

## 目录说明

```text
src/                 Next.js 页面、API、业务逻辑
src/lib/analyzer/    MiniMax 调用、JSON 修复、OCR 候选兜底
src/lib/ocr/         Web 端调用 OCR 服务的客户端
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

