# Task 22: Dashboard Confirmation Rate Source Semantics

## Goal

Update participant confirmation rate computation and rendering to match chain confirmation PoC ratio semantics.

## Expected Result

- Prefer `participant.current_epoch_stats.confirmationPoCRatio` when present.
- Use `(confirmation_weight / weight_to_confirm) / 0.909`, capped at 100%, only as a baseline or accumulated confirmation-weight estimate.
- Do not show that estimate as the authoritative confirmation ratio for `INACTIVE` or `INVALID` participants when the chain ratio is null.
- Expose confirmation ratio source and state in API responses for debugging.
- Render `N/A` when no authoritative value exists, with an estimated value shown separately when available.

## Approach

1. Add response metadata for confirmation ratio source, state, and computed estimate.
2. Centralize confirmation rate selection in backend service logic.
3. Recompute displayed values when cached chain confirmation data is merged.
4. Update frontend types and participant rendering to distinguish confirmed chain values from estimates.
5. Update tests for chain-ratio preference, active estimates, inactive non-authoritative estimates, and missing data.
6. Do not treat `confirmation_weight / weight_to_confirm` without the `0.909` PoC deviation coefficient as a valid local estimate.
