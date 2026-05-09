# Task 21: Dashboard Weight Computation Update

## Goal

Update participant detail metrics after chain weight computation changes.

## Expected Result

- Participant `Weight` uses the chain root epoch group weight.
- `Weight to Confirm` uses scaled model subgroup weights.
- `Confirmation Ratio` uses `confirmation_weight / weight_to_confirm`, capped at 100%.
- MLNode cards display scaled node weight.
- Collateral status uses `weight_to_confirm` as the approximate potential weight.

## Approach

1. Read root epoch group data from the chain API.
2. Fetch model subgroup data for every current subgroup model.
3. Apply each model `weight_scale_factor` with floor truncation.
4. Reuse the scaled baseline for confirmation and collateral fields.
5. Keep existing response field names where possible to limit frontend churn.
