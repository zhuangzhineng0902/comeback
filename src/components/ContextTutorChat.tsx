"use client";

import { Send } from "lucide-react";
import React, { useState } from "react";

export type TutorChatMessage = {
  role: "user" | "assistant" | string;
  content: string;
};

type ContextTutorChatProps = {
  title?: string;
  description?: string;
  mistakeId?: string;
  knowledgePointId?: string;
  initialMessages?: TutorChatMessage[];
  placeholder?: string;
};

async function readJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function ContextTutorChat({
  title = "继续问老师",
  description = "我会结合当前页面内容回答，只回答学习相关问题。",
  mistakeId,
  knowledgePointId,
  initialMessages = [],
  placeholder = "继续问老师：这里为什么这样做？"
}: ContextTutorChatProps) {
  const [messages, setMessages] = useState<TutorChatMessage[]>(
    initialMessages.length > 0
      ? initialMessages
      : [{ role: "assistant", content: "可以直接追问当前内容，我会带着页面里的错题和知识点上下文回答。" }]
  );
  const [question, setQuestion] = useState("");
  const [isChatting, setIsChatting] = useState(false);

  async function sendQuestion() {
    const trimmed = question.trim();
    if (!trimmed || isChatting) {
      return;
    }

    setQuestion("");
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setIsChatting(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, mistakeId, knowledgePointId })
      });
      const data = await readJson(response);
      const reply =
        typeof data.reply === "string"
          ? data.reply
          : typeof data.error === "string"
            ? data.error
            : "老师暂时没有回答出来，换一种问法试试。";
      setMessages((current) => [...current, { role: "assistant", content: reply }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: "网络连接异常，稍后再问老师一次。" }]);
    } finally {
      setIsChatting(false);
    }
  }

  return (
    <section className="flex min-h-[360px] flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="max-h-[420px] flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-md px-3 py-2 text-sm leading-6 ${
              message.role === "assistant"
                ? "bg-slate-100 text-slate-700"
                : "ml-4 bg-slate-900 text-white sm:ml-8"
            }`}
          >
            {message.role === "assistant" ? "老师：" : "学生："}
            {message.content}
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 p-3">
        <div className="flex min-w-0 gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void sendQuestion();
              }
            }}
            placeholder={placeholder}
            className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm text-ink placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={sendQuestion}
            disabled={isChatting}
            aria-label="发送问题"
            className="grid h-10 w-10 place-items-center rounded-md bg-slate-900 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            <Send aria-hidden="true" size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
