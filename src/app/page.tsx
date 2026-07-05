import { ArrowRight, BookOpenCheck, Camera, ClipboardList } from "lucide-react";
import Link from "next/link";
import React from "react";

const actions = [
  {
    href: "/teacher",
    title: "我要登记错题",
    description: "拍照上传试卷或习题，AI 老师帮你整理错因、知识点和母题。",
    icon: Camera,
    className: "border-sky-200 bg-sky-50 text-sky-950",
    iconClassName: "bg-sky-600 text-white"
  },
  {
    href: "/mistakes",
    title: "我要复习错题",
    description: "按年级、学科和知识点查看错题，把薄弱点一类一类补回来。",
    icon: BookOpenCheck,
    className: "border-emerald-200 bg-emerald-50 text-emerald-950",
    iconClassName: "bg-emerald-600 text-white"
  }
];

export default function HomePage() {
  return (
    <section className="min-h-[calc(100vh-120px)]">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-stretch">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              私人教师 Agent
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight text-ink sm:text-4xl">
              你今天想做什么？
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
              选择一个入口开始学习，系统会把登记、复习、人工复核和模拟练习串起来。
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`group flex min-h-56 flex-col justify-between rounded-lg border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${action.className}`}
                >
                  <div>
                    <div className={`inline-flex h-12 w-12 items-center justify-center rounded-md ${action.iconClassName}`}>
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <h2 className="mt-5 text-2xl font-semibold">{action.title}</h2>
                    <p className="mt-3 text-sm leading-6 opacity-80">{action.description}</p>
                  </div>
                  <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
                    进入
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-slate-900 p-5 text-white shadow-sm sm:p-6">
          <p className="text-sm font-medium text-slate-300">学习路径</p>
          <div className="mt-5 space-y-4">
            {[
              ["1", "登记错题", "上传图片，沉淀错因和母题。"],
              ["2", "复习错题", "按知识点回看同类问题。"],
              ["3", "模拟练习", "用母题生成新的试题。"]
            ].map(([step, title, description]) => (
              <div key={step} className="flex gap-3 rounded-md border border-white/10 bg-white/5 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-sm font-semibold text-slate-900">
                  {step}
                </span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
