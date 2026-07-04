import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { uploadFilePath } from "@/lib/uploads";

const mimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif"
};

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  const safeName = path.basename(decodeURIComponent(filename));
  const uploadPath = uploadFilePath(safeName);

  try {
    const bytes = await readFile(uploadPath);
    const contentType = mimeTypes[path.extname(safeName).toLowerCase()] ?? "application/octet-stream";

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Type": contentType
      }
    });
  } catch {
    return NextResponse.json({ error: "图片不存在。" }, { status: 404 });
  }
}
