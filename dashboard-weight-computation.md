# Dashboard Weight Computation

This document describes how the dashboard should compute participant weights after multi-model PoC and delegation logic.

The examples below use `node3.gonka.ai` and one participant from epoch 257. Dashboard maintainers can replace `BASE` and `PARTICIPANT` with the API host and participant address used by their environment.

```bash
BASE="https://node3.gonka.ai"
PARTICIPANT="gonka17gpuntq09zsaqtmpe544gc32tk4424dwv5t34f"
```

## Recommended Dashboard Values

## Reference Script

We attach a small reference implementation:

```bash
python3 dashboard_weights.py "$PARTICIPANT" --base "$BASE"
```

The script outputs the recommended dashboard fields:

```text
dashboard.weight
dashboard.weight_to_confirm
dashboard.confirmation_ratio_percent
ml_nodes[].scaled_weight
```

`dashboard.confirmation_ratio_percent` is computed as `chain.confirmation_weight / dashboard.weight_to_confirm * 100`, capped at `100`.

### Weight

Show the participant's root epoch group `weight`.

Endpoint:

```text
GET /chain-api/productscience/inference/inference/current_epoch_group_data
```

Curl example:

```bash
curl -s "$BASE/chain-api/productscience/inference/inference/current_epoch_group_data"
```

Curl example with `jq` to extract the dashboard `Weight` box value:

```bash
curl -s "$BASE/chain-api/productscience/inference/inference/current_epoch_group_data" \
  | jq --arg participant "$PARTICIPANT" '
      .epoch_group_data as $root
      | $root.validation_weights[]
      | select(.member_address == $participant)
      | {
          epoch: ($root.epoch_index | tonumber),
          weight: (.weight | tonumber),
          confirmation_weight: (.confirmation_weight | tonumber)
        }
    '
```

Find the participant in:

```text
epoch_group_data.validation_weights[].member_address == <participant>
```

Use:

```text
weight = int(validation_weights[].weight)
```

This is the final chain weight after consensus aggregation, delegation transfers, collateral adjustment, and power capping. It can be larger than the participant's own scaled ML-node weight if other participants delegated PoC weight to this participant.

### Weight To Confirm

Show the scaled own-ML-node confirmation baseline, not the raw nonce/PoC sum.

For each model subgroup, fetch the participant's raw model weight and multiply by the model's `weight_scale_factor`, truncating toward zero:

```text
scaled_model_weight = floor(raw_model_weight * weight_scale_factor)
weight_to_confirm = sum(scaled_model_weight for all model subgroups)
```

Use this instead of raw PoC/nonces because the chain seeds `confirmation_weight` from scaled model weights.

Endpoints:

```text
GET /chain-api/productscience/inference/inference/params
GET /chain-api/productscience/inference/inference/current_epoch_group_data
GET /chain-api/productscience/inference/inference/epoch_group_data/{epoch}?model_id={urlencoded_model_id}
```

Curl examples:

```bash
curl -s "$BASE/chain-api/productscience/inference/inference/params"
curl -s "$BASE/chain-api/productscience/inference/inference/current_epoch_group_data"
```

Extract the current epoch and subgroup model IDs:

```bash
curl -s "$BASE/chain-api/productscience/inference/inference/current_epoch_group_data" \
  | jq '{
      epoch: .epoch_group_data.epoch_index,
      models: .epoch_group_data.sub_group_models
    }'
```

Fetch one model subgroup. The model ID must be URL-encoded:

```bash
EPOCH="257"
MODEL_ID="Qwen/Qwen3-235B-A22B-Instruct-2507-FP8"
MODEL_ID_ENCODED="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$MODEL_ID")"

curl -s "$BASE/chain-api/productscience/inference/inference/epoch_group_data/$EPOCH?model_id=$MODEL_ID_ENCODED"
```

Extract the raw model weight for one participant from that subgroup:

```bash
curl -s "$BASE/chain-api/productscience/inference/inference/epoch_group_data/$EPOCH?model_id=$MODEL_ID_ENCODED" \
  | jq --arg participant "$PARTICIPANT" '
      .epoch_group_data.validation_weights[]
      | select(.member_address == $participant)
      | {
          raw_model_weight: (.weight | tonumber),
          ml_nodes: .ml_nodes
        }
    '
```

Read model scale factors from:

```text
params.poc_params.models[].model_id
params.poc_params.models[].weight_scale_factor
```

Curl example to list scale factors:

```bash
curl -s "$BASE/chain-api/productscience/inference/inference/params" \
  | jq '
      .params.poc_params.models[]
      | {
          model_id,
          weight_scale_factor
        }
    '
```

Read model IDs and current epoch from:

```text
current_epoch_group_data.epoch_group_data.sub_group_models[]
current_epoch_group_data.epoch_group_data.epoch_index
```

For each model ID, fetch the subgroup and find the same participant in:

```text
epoch_group_data.validation_weights[].member_address == <participant>
```

Use that subgroup row's:

```text
raw_model_weight = int(validation_weights[].weight)
```

Then apply the model scale factor and floor.

### Confirmation Ratio

Compute against the scaled own-ML-node confirmation baseline:

```text
confirmation_ratio = confirmation_weight / weight_to_confirm
confirmation_ratio_capped = min(confirmation_ratio, 1.0)
```

Display `confirmation_ratio_capped` as a percentage. If `weight_to_confirm` is zero, display `N/A`.

Use `confirmation_weight` from the root epoch group participant row:

```text
confirmation_weight = int(current_epoch_group_data.validation_weights[].confirmation_weight)
```

Curl example to fetch the chain `confirmation_weight` and root `weight` together:

```bash
curl -s "$BASE/chain-api/productscience/inference/inference/current_epoch_group_data" \
  | jq --arg participant "$PARTICIPANT" '
      .epoch_group_data.validation_weights[]
      | select(.member_address == $participant)
      | {
          root_weight: (.weight | tonumber),
          confirmation_weight: (.confirmation_weight | tonumber)
        }
    '
```

Do not compute the ratio as `confirmation_weight / root_weight`. Root weight includes delegation/collateral/capping effects, while confirmation PoC is measured against the participant's own scaled ML-node baseline.

### ML Node Weight Cards

For each ML node shown on the participant page, display scaled weight:

```text
scaled_node_weight = floor(raw_node_poc_weight * model_weight_scale_factor)
```

Because this floors each node independently, the sum of displayed node weights can differ slightly from `scaled_model_weight`, which is computed by flooring after summing the model's raw weight. Use `scaled_model_weight` / `weight_to_confirm` for the confirmation denominator, and use per-node scaled values for the node cards.

Source the nodes from the model subgroup response:

```text
GET /chain-api/productscience/inference/inference/epoch_group_data/{epoch}?model_id={urlencoded_model_id}
```

Curl example to fetch the node list for a participant in one model subgroup:

```bash
curl -s "$BASE/chain-api/productscience/inference/inference/epoch_group_data/$EPOCH?model_id=$MODEL_ID_ENCODED" \
  | jq --arg participant "$PARTICIPANT" '
      .epoch_group_data.validation_weights[]
      | select(.member_address == $participant)
      | .ml_nodes[]
      | {
          node_id,
          raw_poc_weight: (.poc_weight | tonumber)
        }
    '
```

For the participant row, read:

```text
validation_weights[].ml_nodes[].poc_weight
```

The raw `poc_weight` can still be exposed as debug/detail data, but the primary visible node weight should be the scaled value. If one physical node participates in multiple models, render separate model-specific entries or clearly show each model contribution, because each model can have a different scale factor.

### Collateral Status

Decision for the current dashboard: approximate collateral `Potential Weight` as the same scaled own-ML-node baseline used for `weight_to_confirm`, and show collateral `Effective Weight` as the chain's root-group final `weight`.

```text
potential_weight = weight_to_confirm
potential_weight = sum(floor(raw_model_weight * model_weight_scale_factor))
effective_weight = root_weight
```

This approximates the participant's own pre-collateral capacity using the scaled model PoC baseline. It can differ from final root `weight` because root `weight` also includes delegation, collateral adjustment, caps, penalties, and other root-group effects.

Use the potential weight to compute collateral rate and needed collateral:

```text
base_weight = potential_weight * base_weight_ratio
eligible_weight = potential_weight * (1 - base_weight_ratio)

needed_collateral = ceil(eligible_weight * collateral_per_weight_unit)
collateral_rate = min(deposited_collateral / needed_collateral, 1.0)
```

Dashboard boxes:

```text
Potential Weight = weight_to_confirm
Effective Weight = root_weight
Collateral Rate = collateral_rate * 100
Needed Collateral = needed_collateral, denom ngonka
```

Endpoints:

```text
GET /chain-api/productscience/inference/inference/params
GET /chain-api/productscience/inference/inference/current_epoch_group_data
GET /chain-api/productscience/inference/inference/epoch_group_data/{epoch}?model_id={urlencoded_model_id}
GET /chain-api/productscience/inference/collateral/collateral/{participant}
```

Curl examples:

```bash
curl -s "$BASE/chain-api/productscience/inference/inference/params" \
  | jq '.params.collateral_params'

curl -s "$BASE/chain-api/productscience/inference/inference/current_epoch_group_data" \
  | jq --arg participant "$PARTICIPANT" '
      .epoch_group_data.validation_weights[]
      | select(.member_address == $participant)
      | {
          root_weight: (.weight | tonumber)
        }
    '

curl -s "$BASE/chain-api/productscience/inference/collateral/collateral/$PARTICIPANT"
```

Use the same model subgroup loop described in `Weight To Confirm` to compute `potential_weight`. For each model:

```bash
EPOCH="257"
MODEL_ID="Qwen/Qwen3-235B-A22B-Instruct-2507-FP8"
MODEL_ID_ENCODED="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$MODEL_ID")"

curl -s "$BASE/chain-api/productscience/inference/inference/epoch_group_data/$EPOCH?model_id=$MODEL_ID_ENCODED" \
  | jq --arg participant "$PARTICIPANT" '
      .epoch_group_data.validation_weights[]
      | select(.member_address == $participant)
      | {
          raw_model_weight: (.weight | tonumber),
          ml_nodes: .ml_nodes
        }
    '
```

Read:

```text
base_weight_ratio:
  params.collateral_params.base_weight_ratio

collateral_per_weight_unit:
  params.collateral_params.collateral_per_weight_unit

grace_period_end_epoch:
  params.collateral_params.grace_period_end_epoch

deposited_collateral:
  collateral.amount.amount

root_weight:
  current_epoch_group_data.epoch_group_data.validation_weights[].weight

potential_weight:
  weight_to_confirm
```

Reference check script:

```bash
python3 dashboard_collateral.py "$PARTICIPANT" --base "$BASE"
```

The script reports:

```text
dashboard_collateral.potential_weight
dashboard_collateral.effective_weight
dashboard_collateral.collateral_rate_percent
dashboard_collateral.needed_collateral_ngonka
validity.exact
validity.warnings[]
```

## Why Root Weight Can Differ

The chain computes the participant's root `weight` after additional epoch mechanics. The important one for `root_weight > weight_to_confirm` is PoC delegation: when a participant delegates, part of their weight is transferred out and added to the delegatee.

That means:

```text
root_weight != sum(floor(raw_model_weight * weight_scale_factor))
```

The scaled sum is still the right denominator for confirmation ratio because it matches the chain's initial confirmation-weight baseline.
