# flash-mem Review Prompt

Use this prompt when you want an LLM to review whether flash-mem was actually used in a task.

## Flash-Mem Retrieval Policy

Before making code or architecture changes, query Flash-Mem for relevant existing context.

Prefer summaries, metadata, tags, confidence, and related files first.

Load full memory content only when summaries are insufficient or the task requires detailed historical context.

Depend on Flash-Mem's retrieval contract, not on internal storage or search implementation details.

Do not assume retrieval is keyword-only, LIKE-based, or tied to Markdown files.

```text
Review your work on this task.

Did you use flash-mem in this work?
- If yes, what flash-mem context or memory did you use?
- If no, why not?

What was the result of using flash-mem?
- If the result was empty, why was it empty?

Be specific and short. Do not guess.
```

If you want a stricter version, use this:

```text
Review this task and explain whether flash-mem was used.

Answer only these:
1. Did you call flash-mem or use flash-mem context?
2. What did you retrieve from it?
3. Why was it relevant to this work?
4. What was the result?
5. If the result was empty, why was it empty?
6. If you did not use it, say why not.

If you are unsure, say "I am not sure" instead of guessing.
```
