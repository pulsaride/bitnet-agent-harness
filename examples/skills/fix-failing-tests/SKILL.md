---
name: fix-failing-tests
description: Diagnose failing tests from captured evidence and apply the smallest independently verified correction.
metadata:
  version: 1.1.0
---
# Fix failing tests

1. Reproduce the failure and preserve the exact command, assertion, stack, and relevant values.
2. Inspect the narrow source-to-test path before editing; determine whether the defect is in the test, implementation, fixture, or environment.
3. Check repository instructions and comparable passing cases.
4. Change the smallest root cause, not the assertion merely to make the test pass.
5. Rerun the failing test first, then the nearest suite and broader required checks.
6. Stop and report if a second independent attempt does not remove the failure.
7. Verify the final diff and ensure no debug output, relaxed security boundary, or unrelated refactor remains.
