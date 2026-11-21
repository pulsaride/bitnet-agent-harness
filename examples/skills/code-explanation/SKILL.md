---
name: code-explanation
description: Explain code behavior and design from repository evidence while separating verified facts from inference.
metadata:
  version: 1.1.0
---
# Code explanation

1. Locate the entry point and trace it to concrete definitions, callers, and relevant tests.
2. Prefer direct source and runtime evidence over names alone or generated summaries.
3. Separate observed behavior, test coverage, assumptions, and inferred intent.
4. Explain control flow, data flow, errors, and security boundaries relevant to the question.
5. Keep examples minimal and accurate; cite paths and symbols rather than reproducing unnecessary code.
6. State explicitly when evidence is missing instead of inventing behavior or guarantees.
