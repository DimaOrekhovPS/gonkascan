#!/usr/bin/env python3
import argparse
import json
import urllib.parse
import urllib.request
from decimal import Decimal, ROUND_FLOOR, getcontext


getcontext().prec = 60
POC_DEVIATION_COEFF = Decimal("0.909")


def get_json(base, path, params=None, timeout=60):
    url = base.rstrip("/") + path
    if params:
        url += "?" + urllib.parse.urlencode(params)

    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode())


def fixed_point_to_decimal(value):
    if not value:
        return Decimal(1)
    return Decimal(str(value["value"])) * (Decimal(10) ** int(value["exponent"]))


def decimal_to_json(value):
    return None if value is None else float(value)


def floor_int(value):
    return int(value.to_integral_value(rounding=ROUND_FLOOR))


def int_field(data, key, default=0):
    try:
        return int(data.get(key, default) or default)
    except (TypeError, ValueError):
        return default


def find_member(validation_weights, participant):
    for validation_weight in validation_weights:
        if validation_weight.get("member_address") == participant:
            return validation_weight
    return None


def decode_ratio(value):
    if not isinstance(value, dict) or "value" not in value or "exponent" not in value:
        return None
    return fixed_point_to_decimal(value)


def local_confirmation_ratio(confirmation_weight, weight_to_confirm):
    if confirmation_weight is None or weight_to_confirm == 0:
        return None
    ratio = (Decimal(confirmation_weight) / Decimal(weight_to_confirm)) / POC_DEVIATION_COEFF
    return min(ratio, Decimal(1))


def confirmation_weight_scales(root):
    scales = root.get("confirmation_weight_scales") or root.get("confirmationWeightScales") or []
    if not isinstance(scales, list):
        return []

    result = []
    for scale in scales:
        if not isinstance(scale, dict):
            continue

        model_id = scale.get("model_id") or scale.get("modelId")
        if not model_id:
            continue

        result.append(
            {
                "model_id": model_id,
                "scale_factor": fixed_point_to_decimal(
                    scale.get("weight_scale_factor") or scale.get("weightScaleFactor")
                ),
            }
        )

    return result


def model_scale_factors(params):
    return {
        model["model_id"]: fixed_point_to_decimal(model.get("weight_scale_factor"))
        for model in params.get("poc_params", {}).get("models", [])
        if model.get("model_id")
    }


def fetch_root_epoch_group(base, epoch):
    if epoch is None:
        return get_json(
            base,
            "/chain-api/productscience/inference/inference/current_epoch_group_data",
        )["epoch_group_data"]

    return get_json(
        base,
        f"/chain-api/productscience/inference/inference/epoch_group_data/{epoch}",
    )["epoch_group_data"]


def fetch_subgroup(base, epoch, model_id):
    return get_json(
        base,
        f"/chain-api/productscience/inference/inference/epoch_group_data/{epoch}",
        {"model_id": model_id},
    )["epoch_group_data"]


def fetch_participant_statuses(base):
    response = get_json(
        base,
        "/chain-api/productscience/inference/inference/participant",
        {"pagination.limit": "10000"},
    )
    return {participant["index"]: participant for participant in response.get("participant", [])}


def sum_ml_node_poc_weight(validation_weight):
    return sum(int_field(node, "poc_weight") for node in validation_weight.get("ml_nodes", []))


def build_new_weights(base, epoch, scales):
    weights = {}
    warnings = []

    for scale in scales:
        model_id = scale["model_id"]
        scale_factor = scale["scale_factor"]
        subgroup = fetch_subgroup(base, epoch, model_id)
        rows = subgroup.get("validation_weights", [])

        if not rows:
            warnings.append(f"snapshot model {model_id} has no subgroup validation_weights")

        for member in rows:
            participant = member.get("member_address")
            if not participant:
                continue

            raw_model_weight = sum_ml_node_poc_weight(member)
            scaled_model_weight = floor_int(Decimal(raw_model_weight) * scale_factor)
            participant_data = weights.setdefault(
                participant,
                {
                    "weight_to_confirm": 0,
                    "models": [],
                },
            )
            participant_data["weight_to_confirm"] += scaled_model_weight
            participant_data["models"].append(
                {
                    "model_id": model_id,
                    "raw_model_weight": raw_model_weight,
                    "scaled_model_weight": scaled_model_weight,
                    "weight_scale_factor": str(scale_factor),
                    "ml_node_count": len(member.get("ml_nodes", [])),
                }
            )

    return weights, warnings


def build_legacy_weights(base, epoch, root, params):
    weights = {}
    scale_factors = model_scale_factors(params)

    for model_id in root.get("sub_group_models", []):
        subgroup = fetch_subgroup(base, epoch, model_id)
        scale_factor = scale_factors.get(model_id, Decimal(1))

        for member in subgroup.get("validation_weights", []):
            participant = member.get("member_address")
            if not participant:
                continue

            raw_model_weight = int_field(member, "weight")
            scaled_model_weight = floor_int(Decimal(raw_model_weight) * scale_factor)
            participant_data = weights.setdefault(
                participant,
                {
                    "weight_to_confirm": 0,
                    "models": [],
                },
            )
            participant_data["weight_to_confirm"] += scaled_model_weight
            participant_data["models"].append(
                {
                    "model_id": model_id,
                    "raw_model_weight": raw_model_weight,
                    "scaled_model_weight": scaled_model_weight,
                    "weight_scale_factor": str(scale_factor),
                }
            )

    return weights


def participant_result(participant, root_member, new_data, legacy_data, status_info):
    confirmation_weight = (
        int_field(root_member, "confirmation_weight") if root_member is not None else None
    )
    new_weight = new_data.get("weight_to_confirm", 0)
    legacy_weight = legacy_data.get("weight_to_confirm", 0)
    chain_ratio = decode_ratio((status_info.get("current_epoch_stats") or {}).get("confirmationPoCRatio"))
    new_ratio = local_confirmation_ratio(confirmation_weight, new_weight)
    legacy_ratio = local_confirmation_ratio(confirmation_weight, legacy_weight)

    return {
        "participant": participant,
        "status": status_info.get("status"),
        "root_weight": int_field(root_member, "weight") if root_member is not None else None,
        "confirmation_weight": confirmation_weight,
        "new_weight_to_confirm": new_weight,
        "legacy_weight_to_confirm": legacy_weight,
        "weight_delta": new_weight - legacy_weight,
        "new_local_ratio": decimal_to_json(new_ratio),
        "legacy_local_ratio": decimal_to_json(legacy_ratio),
        "chain_confirmation_poc_ratio": decimal_to_json(chain_ratio),
        "new_ratio_minus_chain": (
            decimal_to_json(new_ratio - chain_ratio)
            if new_ratio is not None and chain_ratio is not None
            else None
        ),
        "new_models": new_data.get("models", []),
        "legacy_models": legacy_data.get("models", []),
    }


def verify(base, epoch=None, participants=None, include_model_details=False):
    root = fetch_root_epoch_group(base, epoch)
    epoch = int(root.get("epoch_index", epoch or 0))
    root_rows = root.get("validation_weights", [])
    root_by_participant = {
        row["member_address"]: row for row in root_rows if row.get("member_address")
    }

    params = get_json(base, "/chain-api/productscience/inference/inference/params")["params"]
    scales = confirmation_weight_scales(root)
    legacy_weights = build_legacy_weights(base, epoch, root, params)
    if scales:
        new_weights, warnings = build_new_weights(base, epoch, scales)
        weight_source = "confirmation_weight_scales"
    else:
        new_weights = legacy_weights
        warnings = ["root epoch_group_data has no confirmation_weight_scales"]
        weight_source = "legacy_fallback"

    status_by_participant = fetch_participant_statuses(base)

    participant_ids = set(root_by_participant) | set(new_weights) | set(legacy_weights)
    if participants:
        participant_ids &= set(participants)

    rows = []
    for participant in sorted(participant_ids):
        row = participant_result(
            participant,
            root_by_participant.get(participant),
            new_weights.get(participant, {}),
            legacy_weights.get(participant, {}),
            status_by_participant.get(participant, {}),
        )

        if not include_model_details:
            row.pop("new_models", None)
            row.pop("legacy_models", None)

        if row["confirmation_weight"] and row["new_weight_to_confirm"] == 0 and scales:
            warnings.append(f"{participant} has confirmation_weight but zero new_weight_to_confirm")

        rows.append(row)

    changed = [row for row in rows if row["new_weight_to_confirm"] != row["legacy_weight_to_confirm"]]
    chain_compared = [row for row in rows if row["chain_confirmation_poc_ratio"] is not None]
    chain_deltas = [
        abs(row["new_ratio_minus_chain"])
        for row in chain_compared
        if row["new_ratio_minus_chain"] is not None
    ]

    return {
        "base": base,
        "epoch": epoch,
        "snapshot_scale_count": len(scales),
        "weight_source": weight_source,
        "snapshot_models": [
            {"model_id": scale["model_id"], "weight_scale_factor": str(scale["scale_factor"])}
            for scale in scales
        ],
        "legacy_sub_group_models": root.get("sub_group_models", []),
        "root_validation_weights": len(root_rows),
        "participants_checked": len(rows),
        "participants_changed_vs_legacy": len(changed),
        "participants_with_chain_ratio": len(chain_compared),
        "max_abs_new_ratio_minus_chain": max(chain_deltas) if chain_deltas else None,
        "warnings": warnings,
        "participants": rows,
    }


def print_text(result, limit):
    print(f"base: {result['base']}")
    print(f"epoch: {result['epoch']}")
    print(f"weight source: {result['weight_source']}")
    print(f"snapshot scales: {result['snapshot_scale_count']}")
    print(f"snapshot models: {', '.join(m['model_id'] for m in result['snapshot_models']) or '-'}")
    print(f"legacy subgroup models: {', '.join(result['legacy_sub_group_models']) or '-'}")
    print(f"root validation weights: {result['root_validation_weights']}")
    print(f"participants checked: {result['participants_checked']}")
    print(f"changed vs legacy: {result['participants_changed_vs_legacy']}")
    print(f"participants with chain ratio: {result['participants_with_chain_ratio']}")
    print(f"max abs new ratio minus chain: {result['max_abs_new_ratio_minus_chain']}")

    if result["warnings"]:
        print()
        print("warnings:")
        for warning in result["warnings"]:
            print(f"- {warning}")

    print()
    print("participants:")
    rows = result["participants"][:limit] if limit is not None else result["participants"]
    for row in rows:
        print(
            "{participant} status={status} confirm={confirmation_weight} "
            "new={new_weight_to_confirm} legacy={legacy_weight_to_confirm} "
            "delta={weight_delta} new_ratio={new_local_ratio} "
            "chain_ratio={chain_confirmation_poc_ratio} ratio_delta={new_ratio_minus_chain}".format(
                **row
            )
        )

    remaining = len(result["participants"]) - len(rows)
    if remaining > 0:
        print(f"... {remaining} more participants omitted; use --limit 0 or --json for all")


def main():
    parser = argparse.ArgumentParser(
        description="Verify v0.2.13 confirmation_weight_scales weight_to_confirm math."
    )
    parser.add_argument("--base", required=True, help="Chain API base URL, e.g. https://node.testnet")
    parser.add_argument("--epoch", type=int, help="Epoch to inspect. Defaults to current epoch")
    parser.add_argument(
        "--participant",
        action="append",
        default=[],
        help="Participant address to include. May be provided multiple times",
    )
    parser.add_argument(
        "--include-model-details",
        action="store_true",
        help="Include per-model contribution details in output",
    )
    parser.add_argument("--json", action="store_true", help="Print full JSON output")
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Number of participants to print in text mode. Use 0 for all",
    )
    args = parser.parse_args()

    result = verify(
        args.base,
        epoch=args.epoch,
        participants=args.participant,
        include_model_details=args.include_model_details,
    )

    if args.json:
        print(json.dumps(result, indent=2))
        return

    print_text(result, None if args.limit == 0 else args.limit)


if __name__ == "__main__":
    main()
