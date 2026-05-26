# Task 23: v0.2.13 Confirmation Weight Calculation

## Goal

Update dashboard confirmation-weight logic for the v0.2.13 chain upgrade.

## Expected Result

- Use root `epoch_group_data.confirmation_weight_scales` as the source of truth when it is present and non-empty.
- Iterate only models listed in `confirmation_weight_scales`; do not add unrelated root `sub_group_models`.
- Compute each model contribution from subgroup `validation_weights[].ml_nodes[].poc_weight`.
- Keep root `validation_weights[].confirmation_weight` as the confirmed numerator.
- Prefer chain `current_epoch_stats.confirmationPoCRatio` when present.
- Preserve legacy `sub_group_models` plus params scaling for pre-v0.2.13 epochs.
- Provide an operational cache reset path for stale post-upgrade dashboard rows.

## Approach

1. Add helpers to decode `confirmation_weight_scales` from root epoch group data.
2. Update `_build_scaled_epoch_weight_data` to choose the v0.2.13 snapshot path when available.
3. For snapshot entries, fetch each model subgroup and compute `weight_to_confirm` from floored scaled ML-node PoC sums.
4. Keep the existing params-based subgroup logic as a fallback when the snapshot is absent or empty.
5. Ensure list and detail responses prefer chain `confirmationPoCRatio` before using local estimates.
6. Add focused backend tests for snapshot behavior, legacy fallback, and chain-ratio preservation.
7. Add a cache reset helper so operators can clear stale confirmation/reward rows after upgrade.
