# Task 21: Dashboard Weight Computation Update

## Goal

Update participant detail metrics after chain weight computation changes.

## Problem

The chain now computes final participant weight using multi-model PoC, model scale factors, delegation, collateral, and root-group aggregation. The tracker previously used older approximations:

1. `Weight to Confirm` was derived from raw MLNode PoC data.
2. `Confirmation Ratio` could be based on a denominator that did not match the chain's scaled confirmation baseline.
3. MLNode cards displayed raw PoC weights instead of model-scaled weights.
4. Collateral cards mixed final root weight and pre-collateral concepts in a way that was hard to reason about.

## Expected Result

- Participant `Weight` uses the chain root epoch group weight.
- `Weight to Confirm` uses scaled model subgroup weights.
- `Confirmation Ratio` uses `confirmation_weight / weight_to_confirm`, capped at 100%.
- MLNode cards display scaled node weight.
- Collateral status uses `weight_to_confirm` as potential weight and root `weight` as effective weight.

## Data Sources

### Root Epoch Group

Endpoint:

```text
GET /chain-api/productscience/inference/inference/current_epoch_group_data
```

Used fields:

```text
epoch_group_data.epoch_index
epoch_group_data.sub_group_models[]
epoch_group_data.validation_weights[].member_address
epoch_group_data.validation_weights[].weight
epoch_group_data.validation_weights[].confirmation_weight
```

Dashboard values:

- `Weight` = `validation_weights[].weight`
- `confirmation_weight` = `validation_weights[].confirmation_weight`
- `Effective Weight` in collateral section = `validation_weights[].weight`

### Model Scale Factors

Endpoint:

```text
GET /chain-api/productscience/inference/inference/params
```

Used fields:

```text
params.poc_params.models[].model_id
params.poc_params.models[].weight_scale_factor
params.collateral_params.base_weight_ratio
params.collateral_params.collateral_per_weight_unit
```

### Model Subgroup Weights

Endpoint per model:

```text
GET /chain-api/productscience/inference/inference/epoch_group_data/{epoch}?model_id={urlencoded_model_id}
```

Used fields:

```text
epoch_group_data.validation_weights[].member_address
epoch_group_data.validation_weights[].weight
epoch_group_data.validation_weights[].ml_nodes[].node_id
epoch_group_data.validation_weights[].ml_nodes[].poc_weight
```

### Collateral Amount

Endpoint:

```text
GET /chain-api/productscience/inference/collateral/collateral/{participant}
```

Used field:

```text
amount.amount
```

## Computation

### Weight

Use the participant's root epoch group weight:

```python
weight = int(root_validation_weight["weight"])
```

This is the chain's final participant weight after root-group mechanics.

### Weight To Confirm

For each model subgroup:

```python
scaled_model_weight = floor(raw_model_weight * model_weight_scale_factor)
```

Then sum all scaled model weights:

```python
weight_to_confirm = sum(scaled_model_weight for each subgroup model)
```

This is the scaled own-model PoC baseline used as the confirmation denominator.

### Confirmation Ratio

Use the root-group confirmation weight divided by the scaled baseline:

```python
confirmation_ratio = confirmation_weight / weight_to_confirm
confirmation_ratio_capped = min(confirmation_ratio, 1.0)
```

If `weight_to_confirm` is zero, display `N/A`.

### MLNode Card Weight

For each model-specific MLNode from the subgroup response:

```python
scaled_node_weight = floor(raw_node_poc_weight * model_weight_scale_factor)
```

Display `scaled_node_weight` as the MLNode card weight. Keep raw PoC weight only as secondary/debug data.

If one physical node participates in multiple models, render model-specific entries because each model can have a different scale factor.

### Collateral Status

Use the scaled own-model baseline as collateral potential:

```python
potential_weight = weight_to_confirm
```

Use the root-group final weight as effective weight:

```python
effective_weight = root_weight
```

Compute collateral requirement from potential weight:

```python
base_weight = potential_weight * base_weight_ratio
eligible_weight = potential_weight * (1 - base_weight_ratio)
needed_collateral = ceil(eligible_weight * collateral_per_weight_unit)
collateral_rate = min(deposited_collateral / needed_collateral, 1.0)
```

Dashboard fields:

```text
Potential Weight = weight_to_confirm
Effective Weight = root_weight
Collateral Rate = collateral_rate * 100
Needed Collateral = needed_collateral, denom ngonka
```

## Implementation

### Backend

Files:

- `backend/src/backend/client.py`
- `backend/src/backend/models.py`
- `backend/src/backend/service.py`

Changes:

1. Add backend client support for:
   - current root epoch group data
   - model-specific epoch group data via `model_id`
2. Decode fixed-point model scale factors with `Decimal`.
3. Build scaled epoch weight data from subgroup responses.
4. Set participant `weight` from root `validation_weights[].weight`.
5. Set `weight_to_confirm` from scaled model subgroup sums.
6. Set `confirmation_poc_ratio` from root `confirmation_weight / weight_to_confirm`.
7. Return model-specific scaled MLNode weights in participant details.
8. Compute collateral cards from `weight_to_confirm`, root `weight`, collateral params, and deposited collateral.

### Frontend

Files:

- `frontend/src/types/inference.ts`
- `frontend/src/components/common/MLNodeCard.tsx`

Changes:

1. Extend `MLNodeInfo` with optional:
   - `raw_poc_weight`
   - `scaled_weight`
   - `model_id`
   - `weight_scale_factor`
2. Display `scaled_weight` first on MLNode cards.
3. Show raw PoC weight as secondary text when it differs from the displayed weight.

### Tests

Files:

- `backend/src/tests/test_confirmation_poc.py`
- `backend/src/tests/test_mlnode_weights.py`

Coverage:

1. Scaled model subgroup sums.
2. Per-node scaled weight fields.
3. Confirmation ratio capping and zero-denominator behavior.
4. Collateral potential/effective/rate/needed collateral semantics.

## Data Flow

1. Backend fetches current epoch active participants from `/v1/epochs/current/participants`.
2. Backend fetches root epoch group data from `/chain-api/.../current_epoch_group_data`.
3. Backend fetches inference params for model scale factors and collateral params.
4. Backend fetches one subgroup epoch group per model in `sub_group_models[]`.
5. Backend builds scaled weight data per participant.
6. Backend merges scaled fields, collateral fields, jail/health fields, and cached detail fields into `ParticipantStats`.
7. Frontend requests participant data through local `/api/v1/...` endpoints and renders the cards.

## Key Design Decisions

1. **Root weight is authoritative for `Weight`** - do not approximate final weight from PoC or confirmation data.
2. **Scaled model subgroup sum is authoritative for `Weight to Confirm`** - raw MLNode PoC sums are no longer the right denominator.
3. **Confirmation ratio uses different values by design** - numerator is root `confirmation_weight`; denominator is scaled own-model baseline.
4. **Collateral potential is approximate** - `weight_to_confirm` is the best exposed approximation of own pre-collateral capacity.
5. **Collateral effective weight is final root weight** - this keeps the visible effective weight aligned with the chain's final participant weight.
6. **MLNode weights are model-specific** - one physical node can appear multiple times if it contributes to multiple model subgroups.
7. **Response field names stay stable** - existing frontend cards keep working with minimal API churn.
