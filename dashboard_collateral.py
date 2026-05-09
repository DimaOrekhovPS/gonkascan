#!/usr/bin/env python3
import argparse
import json
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR, getcontext


getcontext().prec = 60


def get_json(base, path, params=None):
    url = base.rstrip("/") + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode())


def fixed_point_to_decimal(value):
    if not value:
        return Decimal(1)
    return Decimal(str(value["value"])) * (Decimal(10) ** int(value["exponent"]))


def floor_int(value):
    return int(value.to_integral_value(rounding=ROUND_FLOOR))


def ceil_int(value):
    return int(value.to_integral_value(rounding=ROUND_CEILING))


def find_member(validation_weights, participant):
    for validation_weight in validation_weights:
        if validation_weight.get("member_address") == participant:
            return validation_weight
    return None


def get_deposited_collateral(base, participant):
    try:
        collateral = get_json(
            base,
            f"/chain-api/productscience/inference/collateral/collateral/{participant}",
        )
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return Decimal(0)
        raise

    return Decimal(str(collateral.get("amount", {}).get("amount", "0")))


def approximate_potential_weight(base, participant, params, root):
    coefficients = {
        model["model_id"]: fixed_point_to_decimal(model.get("weight_scale_factor"))
        for model in params["poc_params"]["models"]
    }
    epoch = int(root["epoch_index"])
    weight_to_confirm = 0
    models = []

    for model_id in root.get("sub_group_models", []):
        subgroup = get_json(
            base,
            f"/chain-api/productscience/inference/inference/epoch_group_data/{epoch}",
            {"model_id": model_id},
        )["epoch_group_data"]
        member = find_member(subgroup.get("validation_weights", []), participant)
        coefficient = coefficients.get(model_id, Decimal(1))
        raw_model_weight = int(member.get("weight", 0)) if member else 0
        scaled_model_weight = floor_int(Decimal(raw_model_weight) * coefficient)
        weight_to_confirm += scaled_model_weight
        models.append(
            {
                "model_id": model_id,
                "raw_model_weight": raw_model_weight,
                "weight_scale_factor": str(coefficient),
                "scaled_model_weight": scaled_model_weight,
            }
        )

    return weight_to_confirm, models


def collateral_values(
    potential_weight,
    effective_weight,
    deposited,
    base_ratio,
    collateral_per_weight_unit,
):
    potential = Decimal(potential_weight)
    base_weight = potential * base_ratio
    eligible_weight = potential - base_weight

    needed_collateral = (
        0
        if eligible_weight == 0
        else ceil_int(eligible_weight * collateral_per_weight_unit)
    )

    collateral_rate = (
        Decimal(1)
        if needed_collateral == 0
        else min(deposited / Decimal(needed_collateral), Decimal(1))
    )

    return {
        "potential_weight": int(potential_weight),
        "base_weight": floor_int(base_weight),
        "collateral_eligible_weight": str(eligible_weight),
        "effective_weight": int(effective_weight),
        "needed_collateral_ngonka": needed_collateral,
        "collateral_rate": float(collateral_rate),
        "collateral_rate_percent": float(collateral_rate * Decimal(100)),
    }


def build_collateral_check(base, participant, potential_weight=None):
    params = get_json(base, "/chain-api/productscience/inference/inference/params")[
        "params"
    ]
    collateral_params = params["collateral_params"]
    base_ratio = fixed_point_to_decimal(collateral_params["base_weight_ratio"])
    collateral_per_weight_unit = fixed_point_to_decimal(
        collateral_params["collateral_per_weight_unit"]
    )
    grace_period_end_epoch = int(collateral_params["grace_period_end_epoch"])

    root = get_json(
        base,
        "/chain-api/productscience/inference/inference/current_epoch_group_data",
    )["epoch_group_data"]
    epoch = int(root["epoch_index"])
    member = find_member(root.get("validation_weights", []), participant)
    if member is None:
        raise SystemExit(f"participant not found in current epoch: {participant}")

    root_weight = int(member.get("weight", 0))
    deposited = get_deposited_collateral(base, participant)
    warnings = []

    if epoch <= grace_period_end_epoch:
        warnings.append(
            "Collateral grace period is active; chain does not reduce weight by collateral."
        )

    approx_models = []
    if potential_weight is None:
        potential_weight, approx_models = approximate_potential_weight(
            base,
            participant,
            params,
            root,
        )
        values = collateral_values(
            potential_weight,
            root_weight,
            deposited,
            base_ratio,
            collateral_per_weight_unit,
        )
        exact = False
        potential_weight_source = "approx_scaled_own_model_poc"
        warnings.append(
            "Approximation: potential_weight is computed as the participant's own "
            "scaled model PoC sum, the same baseline used for weight_to_confirm. "
            "It does not include delegation transfers, delegation/bootstrap penalties, "
            "consensus caps, collateral adjustment, or power capping."
        )
    else:
        values = collateral_values(
            potential_weight,
            root_weight,
            deposited,
            base_ratio,
            collateral_per_weight_unit,
        )
        exact = True
        potential_weight_source = "provided_by_argument"

    return {
        "participant": participant,
        "epoch": epoch,
        "chain": {
            "root_weight": root_weight,
            "deposited_collateral_ngonka": str(deposited),
        },
        "params": {
            "grace_period_end_epoch": grace_period_end_epoch,
            "base_weight_ratio": str(base_ratio),
            "collateral_per_weight_unit": str(collateral_per_weight_unit),
        },
        "dashboard_collateral": {
            "potential_weight": values["potential_weight"],
            "effective_weight": values["effective_weight"],
            "collateral_rate_percent": values["collateral_rate_percent"],
            "needed_collateral_ngonka": values["needed_collateral_ngonka"],
        },
        "computed_from_potential": values,
        "approximation_inputs": {
            "models": approx_models,
        },
        "validity": {
            "exact": exact,
            "potential_weight_source": potential_weight_source,
            "warnings": warnings,
        },
    }


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Check collateral dashboard fields for one Gonka participant."
        )
    )
    parser.add_argument("participant", help="participant gonka address")
    parser.add_argument("--base", default="https://node3.gonka.ai")
    parser.add_argument(
        "--potential-weight",
        type=int,
        help=(
            "Potential weight override. Without this, the script uses the chain "
            "scaled own-model PoC baseline used for weight_to_confirm."
        ),
    )
    args = parser.parse_args()

    print(
        json.dumps(
            build_collateral_check(args.base, args.participant, args.potential_weight),
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

