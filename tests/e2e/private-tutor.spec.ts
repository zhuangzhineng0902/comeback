import { expect, test } from "@playwright/test";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lmrdWwAAAABJRU5ErkJggg==",
  "base64"
);

test("student can analyze a mistake and see study guardrail", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI 老师" })).toBeVisible();

  await page.setInputFiles("input[type='file']", {
    name: "sample-mistake.png",
    mimeType: "image/png",
    buffer: onePixelPng
  });
  await page.getByRole("button", { name: "开始分析" }).click();
  await expect(page.getByText("一次函数图像性质判断母题")).toBeVisible();

  await page.getByPlaceholder("继续问老师：为什么这里要这样做？").fill("帮我查一下这个游戏怎么通关");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(page.getByText("我主要帮你学习", { exact: false })).toBeVisible();

  await page.goto("/tree");
  await expect(page.getByRole("heading", { name: "期末知识树" })).toBeVisible();
  await expect(page.getByText("一次函数图像与性质")).toBeVisible();
});
