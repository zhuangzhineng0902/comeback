import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhotoUploadTutor } from "@/components/PhotoUploadTutor";

describe("PhotoUploadTutor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the upload and chat affordances", () => {
    render(<PhotoUploadTutor />);

    expect(screen.getByText("上传错题照片")).toBeTruthy();
    expect(screen.getByText("自动识别学科")).toBeTruthy();
    expect(screen.getByText("自动识别年级")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("继续问老师：为什么这里要这样做？")
    ).toBeTruthy();
  });

  it("allows selecting multiple photos", () => {
    const { container } = render(<PhotoUploadTutor />);
    const input = container.querySelector("input[type='file']");

    expect(input?.hasAttribute("multiple")).toBe(true);
  });

  it("shows immediate feedback while analyzing an uploaded photo", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const { container } = render(<PhotoUploadTutor />);
    const input = container.querySelector("input[type='file']");

    fireEvent.change(input!, {
      target: {
        files: [
          new File(["image-1"], "第1页.png", { type: "image/png" }),
          new File(["image-2"], "第2页.png", { type: "image/png" })
        ]
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(screen.getByText("已选择 2 张图片")).toBeTruthy();
    expect(screen.getByText("AI 正在识别照片并整理错因，通常需要 15-30 秒。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "分析中" }).hasAttribute("disabled")).toBe(true);
  });

  it("rejects selecting more than sixteen photos before upload", () => {
    const { container } = render(<PhotoUploadTutor />);
    const input = container.querySelector("input[type='file']");
    const files = Array.from({ length: 17 }, (_, index) => new File(["image"], `第${index + 1}页.png`, { type: "image/png" }));

    fireEvent.change(input!, { target: { files } });

    expect(screen.getByText("一次最多上传 16 张图片。")).toBeTruthy();
  });
});
