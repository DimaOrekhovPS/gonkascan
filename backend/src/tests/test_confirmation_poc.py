import pytest
from backend.service import _calculate_weight_to_confirm, _extract_confirmation_poc_ratio
from backend.models import ParticipantStats, CurrentEpochStats


class TestExtractConfirmationPoCRatio:
    def test_decodes_dec_with_negative_exponent(self):
        # Real chain response: 924919395994990 * 10^-16 ≈ 0.0925
        info = {
            "current_epoch_stats": {
                "confirmationPoCRatio": {
                    "value": "924919395994990",
                    "exponent": -16,
                }
            }
        }
        ratio = _extract_confirmation_poc_ratio(info)
        assert ratio is not None
        assert abs(ratio - 0.0924919395994990) < 1e-12

    def test_returns_none_when_field_missing(self):
        assert _extract_confirmation_poc_ratio({}) is None
        assert _extract_confirmation_poc_ratio({"current_epoch_stats": {}}) is None

    def test_returns_none_when_dec_malformed(self):
        info = {"current_epoch_stats": {"confirmationPoCRatio": "not-a-dec"}}
        assert _extract_confirmation_poc_ratio(info) is None

        info_partial = {"current_epoch_stats": {"confirmationPoCRatio": {"value": "1"}}}
        assert _extract_confirmation_poc_ratio(info_partial) is None

    def test_one_point_zero_dec(self):
        # 10000000000000000 * 10^-16 = 1.0 (full confirmation)
        info = {
            "current_epoch_stats": {
                "confirmationPoCRatio": {
                    "value": "10000000000000000",
                    "exponent": -16,
                }
            }
        }
        ratio = _extract_confirmation_poc_ratio(info)
        assert ratio is not None
        assert abs(ratio - 1.0) < 1e-12


class TestCalculateWeightToConfirm:
    def test_single_group_all_false(self):
        ml_nodes_data = [
            {
                "ml_nodes": [
                    {"poc_weight": 100, "timeslot_allocation": [True, False]},
                    {"poc_weight": 200, "timeslot_allocation": [True, False]},
                    {"poc_weight": 300, "timeslot_allocation": [True, False]}
                ]
            }
        ]
        
        result = _calculate_weight_to_confirm(ml_nodes_data)
        assert result == 600
    
    def test_single_group_mixed_allocation(self):
        ml_nodes_data = [
            {
                "ml_nodes": [
                    {"poc_weight": 100, "timeslot_allocation": [True, False]},
                    {"poc_weight": 200, "timeslot_allocation": [True, True]},
                    {"poc_weight": 300, "timeslot_allocation": [True, False]}
                ]
            }
        ]
        
        result = _calculate_weight_to_confirm(ml_nodes_data)
        assert result == 400
    
    def test_multiple_groups(self):
        ml_nodes_data = [
            {
                "ml_nodes": [
                    {"poc_weight": 100, "timeslot_allocation": [True, False]},
                    {"poc_weight": 200, "timeslot_allocation": [True, True]}
                ]
            },
            {
                "ml_nodes": [
                    {"poc_weight": 300, "timeslot_allocation": [True, False]},
                    {"poc_weight": 400, "timeslot_allocation": [False, False]}
                ]
            }
        ]
        
        result = _calculate_weight_to_confirm(ml_nodes_data)
        assert result == 800
    
    def test_empty_ml_nodes(self):
        ml_nodes_data = []
        result = _calculate_weight_to_confirm(ml_nodes_data)
        assert result == 0
    
    def test_empty_nested_ml_nodes(self):
        ml_nodes_data = [
            {"ml_nodes": []},
            {"ml_nodes": []}
        ]
        result = _calculate_weight_to_confirm(ml_nodes_data)
        assert result == 0
    
    def test_missing_timeslot_allocation(self):
        ml_nodes_data = [
            {
                "ml_nodes": [
                    {"poc_weight": 100},
                    {"poc_weight": 200, "timeslot_allocation": [True, False]}
                ]
            }
        ]
        result = _calculate_weight_to_confirm(ml_nodes_data)
        assert result == 200
    
    def test_short_timeslot_allocation(self):
        ml_nodes_data = [
            {
                "ml_nodes": [
                    {"poc_weight": 100, "timeslot_allocation": [True]},
                    {"poc_weight": 200, "timeslot_allocation": [True, False]}
                ]
            }
        ]
        result = _calculate_weight_to_confirm(ml_nodes_data)
        assert result == 200
    
    def test_real_data_structure(self):
        ml_nodes_data = [
            {
                "ml_nodes": [
                    {"poc_weight": 703, "timeslot_allocation": [True, False]},
                    {"poc_weight": 121, "timeslot_allocation": [True, False]},
                    {"poc_weight": 2433, "timeslot_allocation": [True, False]},
                    {"poc_weight": 2446, "timeslot_allocation": [True, False]},
                    {"poc_weight": 2605, "timeslot_allocation": [True, False]},
                    {"poc_weight": 2285, "timeslot_allocation": [True, False]},
                    {"poc_weight": 2347, "timeslot_allocation": [True, False]},
                    {"poc_weight": 2374, "timeslot_allocation": [True, False]},
                    {"poc_weight": 2276, "timeslot_allocation": [True, False]},
                    {"poc_weight": 2338, "timeslot_allocation": [True, False]},
                    {"poc_weight": 2475, "timeslot_allocation": [True, False]}
                ]
            }
        ]
        
        result = _calculate_weight_to_confirm(ml_nodes_data)
        assert result == 22403


class TestConfirmationDataIntegration:
    @pytest.mark.asyncio
    async def test_save_and_retrieve_confirmation_data(self):
        from backend.database import CacheDB
        import tempfile
        import os
        
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

