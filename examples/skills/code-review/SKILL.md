---
name: code-review
description: Review a proposed change against repository standards and its originating task, prioritizing actionable, security-sensitive defects.
metadata:
  version: 1.1.0
---
# Code review

1. Pin the comparison and inventory the complete diff before reviewing.
2. Read the task or specification and applicable repository instructions.
3. Review two axes separately: conformance to documented standards and fidelity to the requested behavior.
4. Report only actionable defects, ranked critical/high/medium/low, with file and line evidence.
5. Treat authorization, subprocess execution, path handling, and filesystem boundaries as security-sensitive.
6. Verify that changed behavior has focused tests; identify missing coverage as a finding only when it affects correctness or safety.
7. Do not restate the diff, speculate without evidence, or approve code based only on passing tests.
