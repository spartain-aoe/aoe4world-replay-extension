# Copilot instructions

## Red/green TDD is required

For bug fixes and behavior changes, use a red/green workflow:

1. Add or update a focused unit, regression, or integration test that captures the reported bug or missing behavior.
2. Run that test before changing production code and confirm it fails for the expected reason.
3. Implement the smallest correct fix.
4. Re-run the same test and confirm it passes.
5. Run the relevant broader validation suite before committing.

Do not claim a bug is fixed unless the failing test was observed red first and green after the fix. If a bug cannot reasonably be covered by an automated test, document why in the final notes and add the closest practical regression coverage.
