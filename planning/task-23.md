# Task 23: v0.2.13 Confirmation Weight Verifier

## Goal

Create a standalone script that validates the dashboard maintainer memo's v0.2.13 `weight_to_confirm` instructions against live chain API data.

## Expected Result

- Fetch root epoch group data for current or selected epoch.
- Use `confirmation_weight_scales` as the source of truth when present.
- Compute each participant's `weight_to_confirm` from subgroup ML-node `poc_weight` sums.
- Compare the new denominator to the legacy params/subgroup-weight denominator.
- Report local fallback confirmation ratios and available chain `confirmationPoCRatio` values.

## Approach

1. Add a dependency-free Python script under `backend/scripts`.
2. Support `--base`, optional `--epoch`, participant filtering, text output, and JSON output.
3. Emit warnings when snapshot scales are absent, participant denominators are zero, or local fallback differs from chain ratio.
