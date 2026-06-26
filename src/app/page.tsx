export default function HomePage() {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <h1 className="text-2xl font-semibold text-ink">AI 老师</h1>
        <p className="mt-2 text-sm text-slate-600">
          上传试卷或习题照片，我会帮你讲清错因、知识点和类似题型。
        </p>
      </div>
    </section>
  );
}
