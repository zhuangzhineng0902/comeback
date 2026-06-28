# Rich Explanation Design

## Goal

Upgrade mistake analysis from a short abstract explanation into a child-friendly learning card that combines:

- teacher-style walkthroughs with analogies,
- simple inline illustrations that render reliably in the web UI,
- knowledge-tree context so one mistake is visible as a leaf on a larger branch,
- Shenzhen exam-style examples, with real source attribution only when the source can be verified.

The feature keeps the app scoped to one child and junior-high subjects.

## User Experience

After uploading one or more worksheet photos, the result card should show the existing diagnosis plus a richer explanation section:

1. **Teacher Board**
   - A one-sentence diagnosis in plain language.
   - A child-friendly analogy.
   - A step-by-step solution walkthrough.
   - A "why the wrong answer was tempting" explanation.

2. **Inline Illustration**
   - Rendered by the web app from structured data, not by remote image URLs.
   - Initial illustration types:
     - `flow`: ordered boxes and arrows.
     - `compare`: left/right contrast.
     - `treePath`: knowledge-tree path highlight.
   - If the AI omits illustration data or returns invalid data, the UI hides the illustration instead of breaking the card.

3. **Knowledge Tree Context**
   - Show the path from subject and grade to chapter, knowledge point, and current gap.
   - Include:
     - prerequisite knowledge,
     - current target knowledge,
     - next related knowledge,
     - common confusions.
   - Repeated similar mistakes should continue to use the existing high-priority gap severity and visual emphasis.

4. **Shenzhen Exam-Style Examples**
   - Default behavior: generate a "深圳题型风格" similar question.
   - If a reliable source is known, include a source label such as year, exam type, and topic.
   - Do not claim a question is an exact Shenzhen past-paper question unless the source is verified.

## Data Shape

Extend `AnalysisOutput` with an optional `richExplanation` field so old saved mistakes stay compatible.

```ts
type RichExplanation = {
  diagnosis: string;
  analogy: string;
  walkthrough: Array<{ title: string; body: string }>;
  wrongAnswerInsight: string;
  treeContext: {
    path: string[];
    prerequisites: string[];
    current: string[];
    next: string[];
    confusions: string[];
  };
  illustration?: {
    type: "flow" | "compare" | "treePath";
    title: string;
    nodes: Array<{ label: string; detail?: string; tone?: "normal" | "focus" | "warning" }>;
  };
  shenzhenExample: {
    label: "深圳题型风格" | "深圳真题参考";
    sourceNote?: string;
    question: string;
    answer: string;
    explanation: string;
  };
};
```

This implementation will not add a database JSON column. Persistence remains backward-compatible by storing a readable summary in the existing `Mistake.explanation` text field. The structured rich explanation is used by the upload response and immediate result UI; historical detail pages continue to display the saved readable explanation and existing archetype data.

## AI Prompting

The MiniMax prompt should require:

- concrete analogies, suitable for middle-school students;
- "first explain, then solve, then summarize the mother problem";
- knowledge-tree context with prerequisite/current/next/confusion lists;
- Shenzhen-style example generation, with strict wording rules around real-source claims;
- illustration data as small structured objects only.

The schema parser should accept missing `richExplanation` for compatibility, normalize simple malformed arrays where safe, and reject unsafe or invalid illustration types.

## UI Components

Add focused components instead of expanding the upload component:

- `RichExplanationCard`
  - Owns layout and section ordering.
- `IllustrationRenderer`
  - Converts structured illustration data into accessible HTML/SVG-like UI.
  - Does not render arbitrary HTML from AI output.
- `KnowledgePath`
  - Shows the tree path and related knowledge lists.
- `ShenzhenExample`
  - Clearly labels "深圳题型风格" vs "深圳真题参考".

The result page should remain dense and study-focused, not a marketing-style layout. Cards should be simple, with stable dimensions for illustrations and readable mobile stacking.

## Error Handling

- If `richExplanation` is absent, show the existing analysis card sections.
- If illustration data is invalid, omit only the illustration.
- If Shenzhen source information is uncertain, label the example as "深圳题型风格" rather than "真题".
- If MiniMax returns extra prose, keep the current JSON extraction and repair flow.

## Testing

Unit coverage:

- MiniMax prompt includes rich-explanation requirements.
- Parser accepts a valid `richExplanation`.
- Parser tolerates old responses without `richExplanation`.
- Invalid illustration types are dropped or rejected safely.
- UI renders the rich explanation sections and hides missing illustrations.
- API route still handles multi-image uploads and no subject or grade hints.

Manual verification:

- Use a generated "七年级英语" image to confirm `mode=api`, subject and grade detection, and rich explanation rendering.
- Browser check on desktop-width and mobile-width screens to ensure illustrations and text do not overlap.

## Out Of Scope

- Building a searchable database of verified Shenzhen past papers.
- Crawling or scraping copyrighted past-paper websites.
- AI-generated bitmap illustrations.
- Multi-child profiles.
