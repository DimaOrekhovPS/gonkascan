import os
import tempfile

import pytest

from backend.models import CurrentEpochStats, ParticipantStats
from backend.service import (
    InferenceService,
    _calc_participant_collateral_status,
    _safe_confirmation_ratio,
)


class FakeClient:
    def __init__(self, subgroups):
        self.subgroups = subgroups

    async def get_epoch_group_data(self, epoch_id, height=None, model_id=None):
        return {"epoch_group_data": self.subgroups[model_id]}


class TestScaledWeightToConfirm:
    @pytest.mark.asyncio
    async def test_sums_scaled_model_subgroup_weights(self):
        params = {
            "poc_params": {
                "models": [
                    {
                        "model_id": "model-a",
                        "weight_scale_factor": {"value": "5", "exponent": -1},
                    },
                    {
                        "model_id": "model-b",
                        "weight_scale_factor": {"value": "2", "exponent": 0},
                    },
                ]
            }
        }
        root = {"epoch_index": "7", "sub_group_models": ["model-a", "model-b"]}
        subgroups = {
            "model-a": {
                "validation_weights": [
                    {
                        "member_address": "gonka1test",
                        "weight": "101",
                        "ml_nodes": [
                            {"node_id": "node-1", "poc_weight": "51"},
                            {"node_id": "node-2", "poc_weight": "50"},
                        ],
                    }
                ]
            },
            "model-b": {
                "validation_weights": [
                    {
                        "member_address": "gonka1test",
                        "weight": "7",
                        "ml_nodes": [
                            {"node_id": "node-1", "poc_weight": "7"},
                        ],
                    }
                ]
            },
        }

        service = InferenceService(FakeClient(subgroups), None)
        result = await service._build_scaled_epoch_weight_data(7, params, root)

        participant = result["gonka1test"]
        assert participant["weight_to_confirm"] == 64
        assert participant["ml_nodes_map"] == {"node-1": 39, "node-2": 25}
        assert participant["ml_nodes"][0]["raw_poc_weight"] == 51
        assert participant["ml_nodes"][0]["scaled_weight"] == 25
        assert participant["ml_nodes"][2]["scaled_weight"] == 14


class TestConfirmationRatio:
    def test_uses_scaled_denominator_deviation_coefficient_and_caps_at_one(self):
        assert abs(_safe_confirmation_ratio(48, 100) - 0.528052805280528) < 1e-12
        assert _safe_confirmation_ratio(91, 100) == 1.0

    def test_returns_none_without_denominator(self):
        assert _safe_confirmation_ratio(50, 0) is None
        assert _safe_confirmation_ratio(None, 100) is None


class TestCollateralStatus:
    def test_uses_weight_to_confirm_as_potential_and_root_weight_as_effective(self):
        collateral_params = {
            "base_weight_ratio": {"value": "1", "exponent": -1},
            "collateral_per_weight_unit": {"value": "2", "exponent": 0},
        }
        collateral_resp = {"amount": {"amount": "90"}}

        result = _calc_participant_collateral_status(
            collateral_params,
            100,
            88,
            collateral_resp,
        )

        assert result["potential_weight"] == 100
        assert result["effective_weight"] == 88
        assert result["needed_ngonka"] == "180"
        assert result["collateral_ratio"] == 0.5


class TestConfirmationDataIntegration:
    @pytest.mark.asyncio
    async def test_save_and_retrieve_confirmation_data(self):
        from backend.database import CacheDB
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.db') as tmp:
            db_path = tmp.name
        
        try:
            cache_db = CacheDB(db_path)
            await cache_db.initialize()
            
            confirmation_data = [
                {
                    "participant_index": "gonka1test1",
                    "weight_to_confirm": 1000,
                    "confirmation_weight": 800,
                    "confirmation_poc_ratio": 0.8,
                    "participant_status": "ACTIVE"
                },
                {
                    "participant_index": "gonka1test2",
                    "weight_to_confirm": 2000,
                    "confirmation_weight": 600,
                    "confirmation_poc_ratio": 0.3,
                    "participant_status": "INACTIVE"
                },
                {
                    "participant_index": "gonka1test3",
                    "weight_to_confirm": 1500,
                    "confirmation_weight": None,
                    "confirmation_poc_ratio": None,
                    "participant_status": "ACTIVE"
                }
            ]
            
            await cache_db.save_confirmation_data_batch(91, confirmation_data)
            
            retrieved = await cache_db.get_confirmation_data(91)
            
            assert retrieved is not None
            assert len(retrieved) == 3
            
            p1 = next(p for p in retrieved if p["participant_index"] == "gonka1test1")
            assert p1["weight_to_confirm"] == 1000
            assert p1["confirmation_weight"] == 800
            assert p1["confirmation_poc_ratio"] == 0.8
            assert p1["participant_status"] == "ACTIVE"
            
            p2 = next(p for p in retrieved if p["participant_index"] == "gonka1test2")
            assert p2["weight_to_confirm"] == 2000
            assert p2["confirmation_weight"] == 600
            assert p2["confirmation_poc_ratio"] == 0.3
            assert p2["participant_status"] == "INACTIVE"
            
            p3 = next(p for p in retrieved if p["participant_index"] == "gonka1test3")
            assert p3["weight_to_confirm"] == 1500
            assert p3["confirmation_weight"] is None
            assert p3["confirmation_poc_ratio"] is None
            assert p3["participant_status"] == "ACTIVE"
            
            empty_epoch = await cache_db.get_confirmation_data(999)
            assert empty_epoch is None
            
        finally:
            if os.path.exists(db_path):
                os.remove(db_path)
    
    @pytest.mark.asyncio
    async def test_participant_stats_with_confirmation_fields(self):
        participant = ParticipantStats(
            index="gonka1test",
            address="gonka1testaddress",
            weight=5000,
            models=["model1"],
            current_epoch_stats=CurrentEpochStats(
                inference_count="100",
                missed_requests="5",
                earned_coins="1000",
                rewarded_coins="900",
                burned_coins="100",
                validated_inferences="95",
                invalidated_inferences="5"
            ),
            weight_to_confirm=4000,
            confirmation_weight=1500,
            confirmation_poc_ratio=0.375,
            participant_status="INACTIVE"
        )
        
        assert participant.weight_to_confirm == 4000
        assert participant.confirmation_weight == 1500
        assert participant.confirmation_poc_ratio == 0.375
        assert participant.participant_status == "INACTIVE"
        assert participant.confirmation_poc_ratio < 0.5
    
    @pytest.mark.asyncio
    async def test_participant_stats_with_null_confirmation_fields(self):
        participant = ParticipantStats(
            index="gonka1test",
            address="gonka1testaddress",
            weight=5000,
            models=["model1"],
            current_epoch_stats=CurrentEpochStats(
                inference_count="100",
                missed_requests="5",
                earned_coins="1000",
                rewarded_coins="900",
                burned_coins="100",
                validated_inferences="95",
                invalidated_inferences="5"
            ),
            weight_to_confirm=None,
            confirmation_weight=None,
            confirmation_poc_ratio=None,
            participant_status="ACTIVE"
        )
        
        assert participant.weight_to_confirm is None
        assert participant.confirmation_weight is None
        assert participant.confirmation_poc_ratio is None
        assert participant.participant_status == "ACTIVE"

