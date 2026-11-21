---
name: generate-unit-tests
description: Add focused deterministic unit tests for observable behavior, invalid inputs, and security boundaries.
metadata:
  version: 1.1.0
---
# Generate unit tests

1. Derive tests from the public contract and documented requirements before implementation trivia.
2. Use descriptive behavior names and Arrange-Act-Assert structure.
3. Cover the normal path, invalid input, explicit failure, and authorization or filesystem boundaries where relevant.
4. Use deterministic fixtures and isolate external dependencies without hiding the behavior under test.
5. Run the narrow suite first, then adjacent and broader required checks.
6. Do not weaken production validation or existing assertions to make new tests pass.
7. Add the smallest test set that proves the requested behavior and prevents the identified regression.
