# flash-mem Review Prompt

Use this prompt when you want an LLM to review whether flash-mem was actually used in a task.

```text
Review your work on this task.

Did you use flash-mem in this work?
- If yes, what flash-mem context or memory did you use?
- If no, why not?

Be specific and short. Do not guess.
```

If you want a stricter version, use this:

```text
Review this task and explain whether flash-mem was used.

Answer only these:
1. Did you call flash-mem or use flash-mem context?
2. What did you retrieve from it?
3. Why was it relevant to this work?
4. If you did not use it, say why not.

If you are unsure, say "I am not sure" instead of guessing.
```
