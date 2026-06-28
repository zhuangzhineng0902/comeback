import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import { PhotoUploadTutor } from "@/components/PhotoUploadTutor";

describe("PhotoUploadTutor", () => {
  it("renders the upload and chat affordances", () => {
    render(<PhotoUploadTutor />);

    expect(screen.getByText("上传错题照片")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("继续问老师：为什么这里要这样做？")
    ).toBeTruthy();
  });
});
