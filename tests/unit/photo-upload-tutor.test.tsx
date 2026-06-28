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
    expect(
      screen.getByPlaceholderText("继续问老师：为什么这里要这样做？")
    ).toBeTruthy();
  });

  it("shows immediate feedback while analyzing an uploaded photo", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const { container } = render(<PhotoUploadTutor />);
    const input = container.querySelector("input[type='file']");

    fireEvent.change(input!, {
      target: { files: [new File(["image-bytes"], "错题.png", { type: "image/png" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(screen.getByText("AI 正在识别照片并整理错因，通常需要 15-30 秒。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "分析中" }).hasAttribute("disabled")).toBe(true);
  });
});
