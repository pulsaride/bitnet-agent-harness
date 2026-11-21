---
name: repository-analysis
description: Analyze repository structure, boundaries, dependencies, and likely change points using read-only evidence.
metadata:
  version: 1.1.0
---
# Repository analysis

1. Inspect repository instructions, manifests, top-level documentation, and current state before changing anything.
2. Use bounded file listing, focused search, and direct reads; prefer relevant source over generated output.
3. Map entry points, ownership boundaries, dependency flow, tests, and build or run commands.
4. Distinguish source-observed facts, test-observed behavior, and inference.
5. Report likely change points, risks, and missing evidence without claiming unverified runtime behavior.
6. Keep discovery read-only and avoid ambient credentials, secrets, or unrelated personal files.
