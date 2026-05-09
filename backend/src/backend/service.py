import re
import asyncio
import logging
import time
import json
import base64
import hashlib
import httpx
from urllib.parse import urlparse
import socket
import copy
import ipaddress
import geoip2.database
from collections import defaultdict
from geoip2.errors import AddressNotFoundError
from typing import Optional, List, Dict, Any
from decimal import Decimal, getcontext, ROUND_CEILING, ROUND_FLOOR
from datetime import datetime, timezone, timedelta
import importlib
import pkgutil
from google.protobuf.any_pb2 import Any
from google.protobuf.message import Message
from gonka_protos.cosmos.tx.v1beta1.tx_pb2 import TxRaw, TxBody
from gonka_protos.cosmos.tx.v1beta1.tx_pb2 import AuthInfo
from google.protobuf.json_format import MessageToDict
from bech32 import bech32_decode, convertbits
from backend.client import GonkaClient
from backend.database import CacheDB
from backend.models import (
    ParticipantStats,
    CurrentEpochStats,
    InferenceResponse,
    RewardInfo,
    SeedInfo,
    ParticipantDetailsResponse,
    WarmKeyInfo,
    HardwareInfo,
    MLNodeInfo,
    BlockInfo,
    TimelineEvent,
    TimelineResponse,
    ModelInfo,
    ModelStats,
    ModelsResponse,
    Transaction,
    TransactionResponse,
    ParticipantMapItem,
    ParticipantMapResponse,
    AssetsResponse,
    AddressTransactionsResponse,
    EpochSeriesPoint,
    ModelEpochSeriesResponse,
    ModelEpochTokenUsageItem,
    ModelEpochTokenUsageResponse,
    HardwareStats,
    HardwaresResponse,
    HardwareParticiapteCount,
    HardwareDetailsResponse,
    HardwareEpochSeriesResponse,
    BlockStats,
    BlockStatsResponse,
    ProposalsResponse,
    ProposalDetailResponse,
    ProposalTransactions,
    OrderbookStats,
    TokenStats,
    MarketStats,
    CollateralStatus,
    TransferTransaction,
    AddressTransfersResponse,
    BalanceInfo
)

getcontext().prec = 60

BASE_DECIMALS = Decimal("1e9")
QUOTE_DECIMALS = Decimal("1e6")

logger = logging.getLogger(__name__)

def is_valid_gonka_address(addr: str, prefix="gonka") -> bool:
    hrp, data = bech32_decode(addr)
    if hrp != prefix or data is None:
        return False
    decoded = convertbits(data, 5, 8, False)
    return decoded is not None

def build_registry(root_pkg: str) -> dict[str, type[Message]]:
    registry: dict[str, type[Message]] = {}

    pkg = importlib.import_module(root_pkg)
    for modinfo in pkgutil.walk_packages(pkg.__path__, pkg.__name__ + "."):
        if not modinfo.name.endswith("_pb2"):
            continue
        mod = importlib.import_module(modinfo.name)
        for attr in dir(mod):
            cls = getattr(mod, attr)
            if (isinstance(cls, type) and issubclass(cls, Message) and hasattr(cls, "DESCRIPTOR")):
                full_name = cls.DESCRIPTOR.full_name
                if full_name:
                    registry[full_name] = cls

    return registry

REGISTRY = build_registry("gonka_protos")

def _extract_ml_nodes_map(ml_nodes_data: List[Dict]) -> Dict[str, int]:
    result = {}
    for wrapper in ml_nodes_data:
        for node in wrapper.get("ml_nodes", []):
            node_id = node.get("node_id")
            if node_id:
                poc_weight = node.get("poc_weight")
                if poc_weight is not None:
                    result[node_id] = poc_weight
    return result


def _int_field(data: Dict[str, Any], key: str, default: int = 0) -> int:
    try:
        return int(data.get(key, default) or default)
    except (TypeError, ValueError):
        return default


def _floor_int(value: Decimal) -> int:
    return int(value.to_integral_value(rounding=ROUND_FLOOR))


def _safe_confirmation_ratio(
    confirmation_weight: Optional[int],
    weight_to_confirm: int,
) -> Optional[float]:
    if confirmation_weight is None or weight_to_confirm == 0:
        return None
    ratio = Decimal(confirmation_weight) / Decimal(weight_to_confirm)
    return float(min(ratio, Decimal(1)))


def _validation_weight_map(epoch_group_data: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    return {
        validation_weight.get("member_address"): validation_weight
        for validation_weight in epoch_group_data.get("validation_weights", [])
        if validation_weight.get("member_address")
    }


def _model_scale_factors(params: Dict[str, Any]) -> Dict[str, Decimal]:
    return {
        model["model_id"]: _decode_fixed_point(model.get("weight_scale_factor"))
        for model in params.get("poc_params", {}).get("models", [])
        if model.get("model_id")
    }


def _scale_weight(raw_weight: int, scale_factor: Decimal) -> int:
    return _floor_int(Decimal(raw_weight) * scale_factor)

def _decode_fixed_point(fp: Optional[Dict[str, Any]]) -> Decimal:
    if not fp:
        return Decimal(1)
    v = Decimal(str(fp["value"]))
    e = int(fp["exponent"])
    return v * (Decimal(10) ** Decimal(e))


def _calc_participant_collateral_status(
    collateral_params: Dict[str, Any],
    potential_weight_value: int,
    collateral_resp: Dict[str, Any],
) -> CollateralStatus:
    potential_weight = Decimal(potential_weight_value)

    base_ratio = _decode_fixed_point(collateral_params["base_weight_ratio"])
    per_weight = _decode_fixed_point(collateral_params["collateral_per_weight_unit"])

    deposited = Decimal(str(collateral_resp["amount"]["amount"]))

    one = Decimal(1)

    base_weight = potential_weight * base_ratio
    eligible_weight = potential_weight * (one - base_ratio)

    if per_weight == 0:
        activated_weight = eligible_weight if deposited > 0 else Decimal(0)
        needed_collateral = 0 if eligible_weight == 0 else 1
    else:
        activated_weight = min(eligible_weight, deposited / per_weight)
        needed_collateral = int(
            (eligible_weight * per_weight).to_integral_value(rounding=ROUND_CEILING)
        )

    if needed_collateral <= 0:
        collateral_ratio = one
    else:
        collateral_ratio = deposited / needed_collateral
        if collateral_ratio > one:
            collateral_ratio = one

    effective_weight = base_weight + activated_weight

    return {
        "potential_weight": int(potential_weight),
        "effective_weight": _floor_int(effective_weight),
        "collateral_ratio": float(collateral_ratio),
        "needed_ngonka": str(needed_collateral),
        "collateral_amount": collateral_resp
    }


class InferenceService:
    def __init__(self, client: GonkaClient, cache_db: CacheDB):
        self.client = client
        self.cache_db = cache_db
        self.current_epoch_id: Optional[int] = None
        self.current_epoch_data: Optional[InferenceResponse] = None
        self.last_fetch_time: Optional[float] = None
        self.timeline_cache: Optional[TimelineResponse] = None
        self.timeline_cache_time: Optional[float] = None
        self.timeline_cache_ttl: float = 30.0
        self.cache_warming_in_progress: bool = False
        self.last_cache_warm_time: Optional[float] = None
        self.params_module_index: Optional[dict] = None
    
    def decode_tx_base64(self, tx_base64: str) -> dict:
        tx_bytes = base64.b64decode(tx_base64)
        raw = TxRaw()
        raw.ParseFromString(tx_bytes)
        body = TxBody()
        body.ParseFromString(raw.body_bytes)
        body_dict = MessageToDict(
            body,
            preserving_proto_field_name=True,
            always_print_fields_with_no_presence=True,
        )

        auth_info = AuthInfo()
        auth_info.ParseFromString(raw.auth_info_bytes)
        auth_info_dict = MessageToDict(
            auth_info,
            preserving_proto_field_name=True,
            always_print_fields_with_no_presence=True,
        )

        signatures = [base64.b64encode(s).decode("utf-8") for s in raw.signatures]

        return {
            "hash": hashlib.sha256(tx_bytes).hexdigest(),
            "body": body_dict,
            "auth_info": auth_info_dict,
            "signatures": signatures
        }
    
    async def _calculate_avg_block_time(self, current_height: int) -> float:
        try:
            reference_height = current_height - 10000
            
            current_block_data = await self.client.get_block(current_height)
            current_timestamp = current_block_data["result"]["block"]["header"]["time"]
            
            reference_block_data = await self.client.get_block(reference_height)
            reference_timestamp = reference_block_data["result"]["block"]["header"]["time"]
            
            current_dt = datetime.fromisoformat(current_timestamp.replace('Z', '+00:00'))
            reference_dt = datetime.fromisoformat(reference_timestamp.replace('Z', '+00:00'))
            
            time_diff_seconds = (current_dt - reference_dt).total_seconds()
            block_diff = current_height - reference_height
            avg_block_time = round(time_diff_seconds / block_diff, 2)
            
            return avg_block_time
        except Exception as e:
            logger.warning(f"Failed to calculate avg block time: {e}")
            return 6.0
    
    async def get_epoch_participants(self, epoch_id: int) -> dict:
        cached = await self.cache_db.get_epoch_participants_snapshot(epoch_id)
        if cached:
            logger.debug(f"Using cached epoch_participants snapshot for epoch {epoch_id}")
            return cached
        
        logger.info(f"Cache miss for epoch_participants {epoch_id}, fetching from RPC")
        try:
            epoch_data = await self.client.get_epoch_participants(epoch_id)
            try:
                await self.cache_db.save_epoch_participants_snapshot(
                    epoch_id=epoch_id,
                    epoch_data=epoch_data,
                    fetched_from=self.client._get_current_url()
                )
            except Exception as e:
                logger.warning(f"Failed to cache epoch_participants snapshot for epoch {epoch_id}: {e}")

            return epoch_data

        except Exception as rpc_error:
            logger.error(f"RPC get_epoch_participants failed for epoch {epoch_id}: {rpc_error}")
            raise

    async def get_canonical_height(self, epoch_id: int, requested_height: Optional[int] = None) -> int:
        if self.current_epoch_id is None:
            latest_info = await self.client.get_latest_epoch()
            current_epoch_id = latest_info["latest_epoch"]["index"]
            self.current_epoch_id = current_epoch_id
        else:
            current_epoch_id = self.current_epoch_id
            latest_info = None
        
        if epoch_id == current_epoch_id:
            current_height = await self.client.get_latest_height()
            return requested_height if requested_height else current_height
        
        epoch_data = await self.get_epoch_participants(epoch_id)
        effective_height = epoch_data["active_participants"]["effective_block_height"]
        
        try:
            next_epoch_data = await self.get_epoch_participants(epoch_id + 1)
            next_effective_height = next_epoch_data["active_participants"]["effective_block_height"]
            canonical_height = next_effective_height - 10
        except Exception:
            if latest_info is None:
                latest_info = await self.client.get_latest_epoch()
            canonical_height = latest_info["epoch_stages"]["next_poc_start"] - 10
        
        if requested_height is None:
            return canonical_height
        
        if requested_height < effective_height:
            raise ValueError(
                f"Height {requested_height} is before epoch {epoch_id} start (effective height: {effective_height}). "
                f"No data exists for this epoch at this height."
            )
        
        if requested_height >= canonical_height:
            logger.info(f"Height {requested_height} is after epoch {epoch_id} end. "
                      f"Clamping to canonical height {canonical_height}")
            return canonical_height
        
        return requested_height

    async def _build_scaled_epoch_weight_data(
        self,
        epoch_id: int,
        params: Dict[str, Any],
        root_epoch_group_data: Dict[str, Any],
        height: Optional[int] = None,
    ) -> Dict[str, Dict[str, Any]]:
        scale_factors = _model_scale_factors(params)
        participants: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {
                "weight_to_confirm": 0,
                "models": [],
                "ml_nodes": [],
                "ml_nodes_map": defaultdict(int),
            }
        )

        model_ids = root_epoch_group_data.get("sub_group_models", [])
        subgroup_epoch = int(root_epoch_group_data.get("epoch_index", epoch_id))

        for model_id in model_ids:
            try:
                subgroup_resp = await self.client.get_epoch_group_data(
                    subgroup_epoch,
                    height=height,
                    model_id=model_id,
                )
                subgroup = subgroup_resp.get("epoch_group_data", {})
            except Exception as e:
                logger.warning(f"Failed to fetch subgroup weights for {model_id}: {e}")
                continue

            scale_factor = scale_factors.get(model_id, Decimal(1))
            for member in subgroup.get("validation_weights", []):
                participant_id = member.get("member_address")
                if not participant_id:
                    continue

                raw_model_weight = _int_field(member, "weight")
                scaled_model_weight = _scale_weight(raw_model_weight, scale_factor)
                participant_data = participants[participant_id]
                participant_data["weight_to_confirm"] += scaled_model_weight
                participant_data["models"].append(
                    {
                        "model_id": model_id,
                        "raw_model_weight": raw_model_weight,
                        "scaled_model_weight": scaled_model_weight,
                        "weight_scale_factor": str(scale_factor),
                    }
                )

                for index, node in enumerate(member.get("ml_nodes", [])):
                    raw_node_weight = _int_field(node, "poc_weight")
                    scaled_node_weight = _scale_weight(raw_node_weight, scale_factor)
                    node_id = node.get("node_id") or node.get("id") or f"{model_id}#{index}"

                    participant_data["ml_nodes"].append(
                        {
                            "local_id": node_id,
                            "node_id": node_id,
                            "model_id": model_id,
                            "models": [model_id],
                            "raw_poc_weight": raw_node_weight,
                            "poc_weight": scaled_node_weight,
                            "scaled_weight": scaled_node_weight,
                            "weight_scale_factor": str(scale_factor),
                        }
                    )
                    participant_data["ml_nodes_map"][node_id] += scaled_node_weight

        return {
            participant_id: {
                **data,
                "ml_nodes_map": dict(data["ml_nodes_map"]),
            }
            for participant_id, data in participants.items()
        }
    
    async def _load_cached_epoch_from_db(self, epoch_id: int) -> Optional[InferenceResponse]:
        try:
            cached_stats = await self.cache_db.get_stats(epoch_id)
            if not cached_stats:
                return None
            
            logger.info(f"Loading cached epoch {epoch_id} from database: {len(cached_stats)} participants")

            participants_stats = []
            for stats_dict in cached_stats:
                try:
                    participant = ParticipantStats(
                        index=stats_dict["index"],
                        address=stats_dict["address"],
                        weight=stats_dict.get("weight", 0),
                        validator_key=stats_dict.get("validator_key"),
                        inference_url=stats_dict.get("inference_url"),
                        status=stats_dict.get("status"),
                        models=stats_dict.get("models", []),
                        current_epoch_stats=CurrentEpochStats(**stats_dict["current_epoch_stats"]),
                        seed_signature=stats_dict.get("_seed_signature"),
                        ml_nodes_map=stats_dict.get("_ml_nodes_map", {}),
                        weight_to_confirm=stats_dict.get("weight_to_confirm"),
                        confirmation_weight=stats_dict.get("confirmation_weight"),
                        confirmation_poc_ratio=stats_dict.get("confirmation_poc_ratio"),
                        participant_status=stats_dict.get("participant_status"),
                        collateral_status=CollateralStatus(**stats_dict["collateral_status"])
                    )
                    participants_stats.append(participant)
                except Exception as e:
                    logger.warning(f"Failed to parse cached participant {stats_dict.get('index', 'unknown')}: {e}")
            
            if not participants_stats:
                return None
            
            cached_height = cached_stats[0].get("_height", 0)
            hardware = await self.cache_db.get_participants_hardware_map_by_epoch(epoch_id)
            
            return InferenceResponse(
                epoch_id=epoch_id,
                height=cached_height,
                participants=participants_stats,
                hardware=hardware,
                cached_at=cached_stats[0].get("_cached_at", datetime.utcnow().isoformat()),
                is_current=True
            )
        except Exception as e:
            logger.warning(f"Failed to load cached epoch from database: {e}")
            return None
    
    async def get_current_epoch_stats(self, reload: bool = False) -> InferenceResponse:
        current_time = time.time()
        cache_age = (current_time - self.last_fetch_time) if self.last_fetch_time else None
        
        if not reload and self.current_epoch_data and cache_age and cache_age < 300:
            logger.info(f"Returning cached current epoch data (age: {cache_age:.1f}s)")
            return self.current_epoch_data
        
        if not self.current_epoch_data and not reload:
            try:
                latest_info = await self.client.get_latest_epoch()
                current_epoch_id = latest_info["latest_epoch"]["index"]
                
                db_cached = await self._load_cached_epoch_from_db(current_epoch_id)
                if db_cached:
                    logger.info(f"Loaded current epoch {current_epoch_id} from database on startup")
                    self.current_epoch_data = db_cached
                    self.current_epoch_id = current_epoch_id
                    self.last_fetch_time = current_time - 31
                    return db_cached
            except Exception as e:
                logger.warning(f"Failed to load cached data from database on startup: {e}")
        
        try:
            logger.info("Fetching fresh current epoch data")
            height = await self.client.get_latest_height()
            epoch_data = await self.client.get_current_epoch_participants()
            
            epoch_id = epoch_data["active_participants"]["epoch_group_id"]
            
            await self._mark_epoch_finished_if_needed(epoch_id, height)
            
            all_participants_data = await self.client.get_all_participants(height=height)
            participants_list = all_participants_data.get("participant", [])
            params = await self.client.get_inference_params()
            params_data = params["params"]
            collateral_params = params_data["collateral_params"]
            root_group = (
                await self.client.get_current_epoch_group_data()
            ).get("epoch_group_data", {})
            root_weights = _validation_weight_map(root_group)
            scaled_weights = await self._build_scaled_epoch_weight_data(
                epoch_id,
                params_data,
                root_group,
                height=height,
            )
            
            active_indices = {
                p["index"] for p in epoch_data["active_participants"]["participants"]
            }
            
            epoch_participant_data = {
                p["index"]: {
                    "weight": _int_field(root_weights.get(p["index"], p), "weight"),
                    "models": p.get("models", []),
                    "validator_key": p.get("validator_key"),
                    "seed_signature": p.get("seed", {}).get("signature"),
                    "ml_nodes_map": scaled_weights.get(p["index"], {}).get("ml_nodes_map", {})
                }
                for p in epoch_data["active_participants"]["participants"]
            }
            
            active_participants = [
                p for p in participants_list if p["index"] in active_indices
            ]

            participants_stats = []
            stats_for_saving = []
            for p in active_participants:
                try:
                    epoch_data_for_participant = epoch_participant_data.get(p["index"], {})
                    scaled_data = scaled_weights.get(p["index"], {})
                    root_member = root_weights.get(p["index"], {})
                    weight_to_confirm = int(scaled_data.get("weight_to_confirm", 0))
                    confirmation_weight_raw = root_member.get("confirmation_weight")
                    confirmation_weight = (
                        int(confirmation_weight_raw)
                        if confirmation_weight_raw is not None
                        else None
                    )
                    confirmation_poc_ratio = _safe_confirmation_ratio(
                        confirmation_weight,
                        weight_to_confirm,
                    )
                    collateral_resp = await self.client.get_participant_collateral(p["index"])
                    collateral = _calc_participant_collateral_status(collateral_params, 
                        weight_to_confirm, collateral_resp)
                    
                    participant = ParticipantStats(
                        index=p["index"],
                        address=p["address"],
                        weight=epoch_data_for_participant.get("weight", 0),
                        validator_key=epoch_data_for_participant.get("validator_key"),
                        inference_url=p.get("inference_url"),
                        status=p.get("status"),
                        models=epoch_data_for_participant.get("models", []),
                        current_epoch_stats=CurrentEpochStats(**p["current_epoch_stats"]),
                        seed_signature=epoch_data_for_participant.get("seed_signature"),
                        ml_nodes_map=epoch_data_for_participant.get("ml_nodes_map", {}),
                        weight_to_confirm=weight_to_confirm,
                        confirmation_weight=confirmation_weight,
                        confirmation_poc_ratio=confirmation_poc_ratio,
                        collateral_status=CollateralStatus(**collateral)
                    )
                    participants_stats.append(participant)
                    
                    stats_dict = p.copy()
                    stats_dict["weight"] = epoch_data_for_participant.get("weight", 0)
                    stats_dict["models"] = epoch_data_for_participant.get("models", [])
                    stats_dict["validator_key"] = epoch_data_for_participant.get("validator_key")
                    stats_dict["seed_signature"] = epoch_data_for_participant.get("seed_signature")
                    stats_dict["_ml_nodes_map"] = epoch_data_for_participant.get("ml_nodes_map", {})
                    stats_dict["weight_to_confirm"] = weight_to_confirm
                    stats_dict["confirmation_weight"] = confirmation_weight
                    stats_dict["confirmation_poc_ratio"] = confirmation_poc_ratio
                    stats_dict["collateral_status"] = collateral
                    stats_for_saving.append(stats_dict)
                except Exception as e:
                    logger.warning(f"Failed to parse participant {p.get('index', 'unknown')}: {e}")
            
            active_participants_list = epoch_data["active_participants"]["participants"]
            participants_stats = await self.merge_jail_and_health_data(epoch_id, participants_stats, height, active_participants_list)
            participants_stats = await self.merge_confirmation_data(epoch_id, participants_stats, height, active_participants_list)
            
            latest_info = await self.client.get_latest_epoch()
            latest_epoch_index = latest_info["latest_epoch"]["index"]
            
            next_poc_start_block = None
            set_new_validators_block = None
            current_block_height = None
            current_block_timestamp = None
            avg_block_time = None
            
            if epoch_id == latest_epoch_index:
                next_poc_start_block = latest_info["epoch_stages"]["next_poc_start"]
                set_new_validators_block = latest_info["next_epoch_stages"]["set_new_validators"]
                current_block_height = latest_info["block_height"]
                
                current_block_data = await self.client.get_block(current_block_height)
                current_block_timestamp = current_block_data["result"]["block"]["header"]["time"]
                
                avg_block_time = await self._calculate_avg_block_time(current_block_height)
            elif epoch_id == latest_info.get("next_epoch_stages", {}).get("epoch_index"):
                next_poc_start_block = latest_info["next_epoch_stages"]["next_poc_start"]
                set_new_validators_block = None
                current_block_height = latest_info["block_height"]
                
                current_block_data = await self.client.get_block(current_block_height)
                current_block_timestamp = current_block_data["result"]["block"]["header"]["time"]
                
                avg_block_time = await self._calculate_avg_block_time(current_block_height)

            hardware = await self.cache_db.get_participants_hardware_map_by_epoch(epoch_id)

            response = InferenceResponse(
                epoch_id=epoch_id,
                height=height,
                participants=participants_stats,
                hardware=hardware,
                cached_at=datetime.utcnow().isoformat(),
                is_current=True,
                current_block_height=current_block_height,
                current_block_timestamp=current_block_timestamp,
                avg_block_time=avg_block_time,
                next_poc_start_block=next_poc_start_block,
                set_new_validators_block=set_new_validators_block
            )
            
            await self.cache_db.save_stats_batch(
                epoch_id=epoch_id,
                height=height,
                participants_stats=stats_for_saving
            )
            
            self.current_epoch_id = epoch_id
            self.current_epoch_data = response
            self.last_fetch_time = current_time
            
            asyncio.create_task(self.warm_participant_cache(
                epoch_data["active_participants"]["participants"],
                epoch_id,
                batch_size=10
            ))
            
            logger.info(f"Fetched current epoch {epoch_id} stats at height {height}: {len(participants_stats)} participants")
            
            return response
            
        except Exception as e:
            logger.error(f"Error fetching current epoch stats: {e}")
            if self.current_epoch_data:
                logger.info("Returning cached current epoch data due to error")
                return self.current_epoch_data
            raise
    
    async def get_historical_epoch_stats(self, epoch_id: int, height: Optional[int] = None, calculate_rewards_sync: bool = False) -> InferenceResponse:
        is_finished = await self.cache_db.is_epoch_finished(epoch_id)
        
        try:
            target_height = await self.get_canonical_height(epoch_id, height)
        except Exception as e:
            logger.error(f"Failed to determine target height for epoch {epoch_id}: {e}")
            raise
        
        cached_stats = await self.cache_db.get_stats(epoch_id, height=target_height)
        if cached_stats:
            logger.info(f"Returning cached stats for epoch {epoch_id} at height {target_height}")

            if not is_finished:
                try:
                    data = await self.client.get_epoch_group_data(epoch_id)
                    epoch_group_data = data.get("epoch_group_data", {})
                    await self.cache_db.mark_epoch_finished(epoch_id, target_height, epoch_group_data)
                except Exception as e:
                    logger.warning(f"Failed to mark epoch {epoch_id} as finished from cached stats path: {e}")

            participants_stats = []
            for stats_dict in cached_stats:
                try:
                    stats_copy = dict(stats_dict)
                    stats_copy.pop("_cached_at", None)
                    stats_copy.pop("_height", None)

                    participant = ParticipantStats(**stats_copy)
                    participants_stats.append(participant)
                except Exception as e:
                    logger.warning(f"Failed to parse cached participant: {e}")

            epoch_data = await self.get_epoch_participants(epoch_id)
            active_participants_list = epoch_data["active_participants"]["participants"]
            participants_stats = await self.merge_jail_and_health_data(epoch_id, participants_stats, target_height, active_participants_list)
            participants_stats = await self.merge_confirmation_data(epoch_id, participants_stats, target_height, active_participants_list)

            total_rewards_gnk = await self.cache_db.get_epoch_total_rewards(epoch_id)
            if total_rewards_gnk is None or total_rewards_gnk == 0:
                if total_rewards_gnk == 0:
                    logger.warning(f"Detected invalid cached total rewards (0 GNK) for epoch {epoch_id}, deleting and recalculating")
                    await self.cache_db.delete_epoch_total_rewards(epoch_id)
                
                if calculate_rewards_sync:
                    logger.info(f"Calculating total rewards synchronously for epoch {epoch_id}")
                    await self._calculate_and_cache_total_rewards(epoch_id)
                    total_rewards_gnk = await self.cache_db.get_epoch_total_rewards(epoch_id)
                else:
                    asyncio.create_task(self._calculate_and_cache_total_rewards(epoch_id))

            hardware = await self.cache_db.get_participants_hardware_map_by_epoch(epoch_id)
            return InferenceResponse(
                epoch_id=epoch_id,
                height=target_height,
                participants=participants_stats,
                hardware=hardware,
                cached_at=cached_stats[0].get("_cached_at"),
                is_current=False,
                total_assigned_rewards_gnk=total_rewards_gnk
            )
        
        try:
            logger.info(f"Fetching historical epoch {epoch_id} at height {target_height}")
            
            all_participants_data = await self.client.get_all_participants(height=target_height)
            participants_list = all_participants_data.get("participant", [])
            
            epoch_data = await self.get_epoch_participants(epoch_id)
            params = (await self.client.get_inference_params())["params"]
            root_group = (
                await self.client.get_epoch_group_data(epoch_id, height=target_height)
            ).get("epoch_group_data", {})
            root_weights = _validation_weight_map(root_group)
            scaled_weights = await self._build_scaled_epoch_weight_data(
                epoch_id,
                params,
                root_group,
                height=target_height,
            )
            active_indices = {
                p["index"] for p in epoch_data["active_participants"]["participants"]
            }
            
            epoch_participant_data = {
                p["index"]: {
                    "weight": _int_field(root_weights.get(p["index"], p), "weight"),
                    "models": p.get("models", []),
                    "validator_key": p.get("validator_key"),
                    "seed_signature": p.get("seed", {}).get("signature"),
                    "ml_nodes_map": scaled_weights.get(p["index"], {}).get("ml_nodes_map", {})
                }
                for p in epoch_data["active_participants"]["participants"]
            }
            
            active_participants = [
                p for p in participants_list if p["index"] in active_indices
            ]
            
            participants_stats = []
            stats_for_saving = []
            for p in active_participants:
                try:
                    epoch_data_for_participant = epoch_participant_data.get(p["index"], {})
                    scaled_data = scaled_weights.get(p["index"], {})
                    root_member = root_weights.get(p["index"], {})
                    weight_to_confirm = int(scaled_data.get("weight_to_confirm", 0))
                    confirmation_weight_raw = root_member.get("confirmation_weight")
                    confirmation_weight = (
                        int(confirmation_weight_raw)
                        if confirmation_weight_raw is not None
                        else None
                    )
                    confirmation_poc_ratio = _safe_confirmation_ratio(
                        confirmation_weight,
                        weight_to_confirm,
                    )
                    
                    participant = ParticipantStats(
                        index=p["index"],
                        address=p["address"],
                        weight=epoch_data_for_participant.get("weight", 0),
                        validator_key=epoch_data_for_participant.get("validator_key"),
                        inference_url=p.get("inference_url"),
                        status=p.get("status"),
                        models=epoch_data_for_participant.get("models", []),
                        current_epoch_stats=CurrentEpochStats(**p["current_epoch_stats"]),
                        seed_signature=epoch_data_for_participant.get("seed_signature"),
                        ml_nodes_map=epoch_data_for_participant.get("ml_nodes_map", {}),
                        weight_to_confirm=weight_to_confirm,
                        confirmation_weight=confirmation_weight,
                        confirmation_poc_ratio=confirmation_poc_ratio,
                    )
                    participants_stats.append(participant)
                    
                    stats_dict = p.copy()
                    stats_dict["weight"] = epoch_data_for_participant.get("weight", 0)
                    stats_dict["models"] = epoch_data_for_participant.get("models", [])
                    stats_dict["validator_key"] = epoch_data_for_participant.get("validator_key")
                    stats_dict["seed_signature"] = epoch_data_for_participant.get("seed_signature")
                    stats_dict["_ml_nodes_map"] = epoch_data_for_participant.get("ml_nodes_map", {})
                    stats_dict["weight_to_confirm"] = weight_to_confirm
                    stats_dict["confirmation_weight"] = confirmation_weight
                    stats_dict["confirmation_poc_ratio"] = confirmation_poc_ratio
                    stats_for_saving.append(stats_dict)
                except Exception as e:
                    logger.warning(f"Failed to parse participant {p.get('index', 'unknown')}: {e}")
            
            await self.cache_db.save_stats_batch(
                epoch_id=epoch_id,
                height=target_height,
                participants_stats=stats_for_saving
            )
            
            active_participants_list = epoch_data["active_participants"]["participants"]

            if height is None and not is_finished:
                data = await self.client.get_epoch_group_data(epoch_id)
                finished_epoch_group = data.get("epoch_group_data", {})
                await self.cache_db.mark_epoch_finished(epoch_id, target_height, finished_epoch_group)
            
            participants_stats = await self.merge_jail_and_health_data(epoch_id, participants_stats, target_height, active_participants_list)
            participants_stats = await self.merge_confirmation_data(epoch_id, participants_stats, target_height, active_participants_list)
            
            total_rewards_gnk = await self.cache_db.get_epoch_total_rewards(epoch_id)
            if total_rewards_gnk is None:
                asyncio.create_task(self._calculate_and_cache_total_rewards(epoch_id))

            hardware = await self.cache_db.get_participants_hardware_map_by_epoch(epoch_id)

            response = InferenceResponse(
                epoch_id=epoch_id,
                height=target_height,
                participants=participants_stats,
                hardware=hardware,
                cached_at=datetime.utcnow().isoformat(),
                is_current=False,
                total_assigned_rewards_gnk=total_rewards_gnk
            )
            
            logger.info(f"Fetched and cached historical epoch {epoch_id} at height {target_height}: {len(participants_stats)} participants")
            
            return response
            
        except Exception as e:
            logger.error(f"Error fetching historical epoch {epoch_id}: {e}")
            raise
    
    async def _mark_epoch_finished_if_needed(self, current_epoch_id: int, current_height: int):
        if self.current_epoch_id is None:
            # On first startup, check if the previous epoch needs to be marked as finished
            prev_epoch_id = current_epoch_id - 1
            if prev_epoch_id >= 1 and not await self.cache_db.is_epoch_finished(prev_epoch_id):
                logger.info(f"Startup: marking previous epoch {prev_epoch_id} as finished")
                try:
                    await self.get_historical_epoch_stats(prev_epoch_id, calculate_rewards_sync=True)
                    logger.info(f"Startup: marked epoch {prev_epoch_id} as finished")
                except Exception as e:
                    logger.error(f"Startup: failed to mark epoch {prev_epoch_id} as finished: {e}")
            return

        if current_epoch_id > self.current_epoch_id:
            old_epoch_id = self.current_epoch_id
            is_already_finished = await self.cache_db.is_epoch_finished(old_epoch_id)

            if not is_already_finished:
                logger.info(f"Epoch transition detected: {old_epoch_id} -> {current_epoch_id}")

                try:
                    await self.get_historical_epoch_stats(old_epoch_id, calculate_rewards_sync=True)
                    logger.info(f"Marked epoch {old_epoch_id} as finished and cached final stats with total rewards")
                except Exception as e:
                    logger.error(f"Failed to mark epoch {old_epoch_id} as finished: {e}")
    
    async def fetch_and_cache_jail_statuses(self, epoch_id: int, height: int, active_participants: List[Dict[str, Any]]):
        try:
            validators = await self.client.get_all_validators(height=height)
            validators_with_tokens = [v for v in validators if v.get("tokens") and int(v.get("tokens")) > 0]
            
            active_indices = {p["index"] for p in active_participants}
            participant_map = {p["index"]: p for p in active_participants}
            
            validator_by_operator = {}
            for v in validators_with_tokens:
                operator_address = v.get("operator_address", "")
                if operator_address:
                    validator_by_operator[operator_address] = v
            
            jail_statuses = []
            now_utc = datetime.now(timezone.utc)
            
            for participant_index in active_indices:
                participant = participant_map.get(participant_index)
                if not participant:
                    continue
                
                valoper_address = self.client.convert_bech32_address(participant_index, "gonkavaloper")
                if not valoper_address:
                    continue
                
                validator = validator_by_operator.get(valoper_address)
                if not validator:
                    continue
                
                consensus_pub = (
                    (validator.get("consensus_pubkey") or {}).get("key")
                    or (validator.get("consensus_pubkey") or {}).get("value")
                    or ""
                )
                
                participant_validator_key = participant.get("validator_key", "")
                
                consensus_key_mismatch = False
                if consensus_pub and participant_validator_key:
                    consensus_key_mismatch = consensus_pub != participant_validator_key
                
                is_jailed = bool(validator.get("jailed"))
                valcons_addr = self.client.pubkey_to_valcons(consensus_pub) if consensus_pub else None
                
                jailed_until = None
                ready_to_unjail = False
                
                if is_jailed and valcons_addr:
                    signing_info = await self.client.get_signing_info(valcons_addr, height=height)
                    if signing_info:
                        jailed_until_str = signing_info.get("jailed_until")
                        if jailed_until_str and "1970-01-01" not in jailed_until_str:
                            jailed_until = jailed_until_str
                            try:
                                jailed_until_dt = datetime.fromisoformat(jailed_until_str.replace("Z", "")).replace(tzinfo=timezone.utc)
                                ready_to_unjail = now_utc > jailed_until_dt
                            except Exception:
                                pass
                
                description = validator.get("description", {})
                moniker = description.get("moniker", "").strip()
                identity = description.get("identity", "").strip()
                website = description.get("website", "").strip()
                
                if moniker and moniker.startswith("gonkavaloper"):
                    moniker = ""
                
                keybase_username = None
                keybase_picture_url = None
                if identity:
                    keybase_username, keybase_picture_url = await self.client.get_keybase_info(identity)
                
                jail_statuses.append({
                    "participant_index": participant_index,
                    "is_jailed": is_jailed,
                    "jailed_until": jailed_until,
                    "ready_to_unjail": ready_to_unjail,
                    "valcons_address": valcons_addr,
                    "moniker": moniker if moniker else None,
                    "identity": identity if identity else None,
                    "keybase_username": keybase_username,
                    "keybase_picture_url": keybase_picture_url,
                    "website": website if website else None,
                    "validator_consensus_key": consensus_pub if consensus_pub else None,
                    "consensus_key_mismatch": consensus_key_mismatch if consensus_pub and participant_validator_key else None
                })
            
            await self.cache_db.save_jail_status_batch(epoch_id, jail_statuses)
            logger.info(f"Cached jail statuses for {len(jail_statuses)} participants in epoch {epoch_id}")
            
        except Exception as e:
            logger.error(f"Failed to fetch and cache jail statuses: {e}")
    
    async def fetch_and_cache_node_health(self, active_participants: List[Dict[str, Any]]):
        try:
            health_statuses = []
            
            for participant in active_participants:
                participant_index = participant.get("index")
                inference_url = participant.get("inference_url")
                
                if not participant_index:
                    continue
                
                health_result = await self.client.check_node_health(inference_url)
                
                health_statuses.append({
                    "participant_index": participant_index,
                    "is_healthy": health_result["is_healthy"],
                    "error_message": health_result["error_message"],
                    "response_time_ms": health_result["response_time_ms"]
                })
            
            await self.cache_db.save_node_health_batch(health_statuses)
            logger.info(f"Cached health statuses for {len(health_statuses)} participants")
            
        except Exception as e:
            logger.error(f"Failed to fetch and cache node health: {e}")
    
    async def merge_jail_and_health_data(self, epoch_id: int, participants: List[ParticipantStats], height: int, active_participants: List[Dict[str, Any]]) -> List[ParticipantStats]:
        try:
            jail_statuses_list = await self.cache_db.get_jail_status(epoch_id)
            jail_map = {}
            if jail_statuses_list:
                jail_map = {j["participant_index"]: j for j in jail_statuses_list}
            else:
                logger.info(f"No cached jail statuses for epoch {epoch_id}, fetching inline")
                await self.fetch_and_cache_jail_statuses(epoch_id, height, active_participants)
                jail_statuses_list = await self.cache_db.get_jail_status(epoch_id)
                if jail_statuses_list:
                    jail_map = {j["participant_index"]: j for j in jail_statuses_list}
            
            health_statuses_list = await self.cache_db.get_node_health()
            health_map = {}
            if health_statuses_list:
                health_map = {h["participant_index"]: h for h in health_statuses_list}
            else:
                logger.info("No cached health statuses, fetching inline")
                await self.fetch_and_cache_node_health(active_participants)
                health_statuses_list = await self.cache_db.get_node_health()
                if health_statuses_list:
                    health_map = {h["participant_index"]: h for h in health_statuses_list}
            
            for participant in participants:
                jail_info = jail_map.get(participant.index)
                if jail_info:
                    participant.is_jailed = jail_info["is_jailed"]
                    participant.jailed_until = jail_info["jailed_until"]
                    participant.ready_to_unjail = jail_info["ready_to_unjail"]
                    participant.moniker = jail_info.get("moniker")
                    participant.identity = jail_info.get("identity")
                    participant.keybase_username = jail_info.get("keybase_username")
                    participant.keybase_picture_url = jail_info.get("keybase_picture_url")
                    participant.website = jail_info.get("website")
                    participant.validator_consensus_key = jail_info.get("validator_consensus_key")
                    participant.consensus_key_mismatch = jail_info.get("consensus_key_mismatch")
                
                health_info = health_map.get(participant.index)
                if health_info:
                    participant.node_healthy = health_info["is_healthy"]
                    participant.node_health_checked_at = health_info["last_check"]
            
            return participants
            
        except Exception as e:
            logger.error(f"Failed to merge jail and health data: {e}")
            return participants
    
    async def get_participant_details(
        self,
        participant_id: str,
        epoch_id: int,
        height: Optional[int] = None
    ) -> Optional[ParticipantDetailsResponse]:
        try:
            if self.current_epoch_id is None:
                latest_info = await self.client.get_latest_epoch()
                current_epoch_id = latest_info["latest_epoch"]["index"]
                self.current_epoch_id = current_epoch_id
            else:
                current_epoch_id = self.current_epoch_id
            
            is_current = (epoch_id == current_epoch_id)
            
            participant = None
            if is_current and self.current_epoch_data:
                for p in self.current_epoch_data.participants:
                    if p.index == participant_id:
                        participant = p
                        break
                
                if participant and participant.confirmation_poc_ratio is None and participant.weight_to_confirm is not None and participant.weight_to_confirm > 0:
                    logger.info(f"Participant {participant_id} missing confirmation data, refreshing")
                    participant = None
            
            if not participant:
                if is_current:
                    stats = await self.get_current_epoch_stats()
                else:
                    stats = await self.get_historical_epoch_stats(epoch_id, height)
                
                for p in stats.participants:
                    if p.index == participant_id:
                        participant = p
                        break
            
            if not participant:
                return None
            
            if epoch_id == current_epoch_id:
                epoch_ids = [current_epoch_id - i for i in range(1, 6) if current_epoch_id - i > 0]
            elif epoch_id < current_epoch_id:
                epoch_ids = [epoch_id - i for i in range(5, -1, -1) if epoch_id - i > 0]
            else:
                epoch_ids = []
            
            rewards_data = await self.cache_db.get_rewards_for_participant(participant_id, epoch_ids) if epoch_ids else []
            cached_epoch_ids = {r["epoch_id"] for r in rewards_data}
            missing_epoch_ids = [eid for eid in epoch_ids if eid not in cached_epoch_ids]
            
            warm_keys_data = await self.cache_db.get_warm_keys(epoch_id, participant_id)
            hardware_nodes_data = await self.cache_db.get_hardware_nodes(epoch_id, participant_id)
            
            fetch_tasks = []
            
            if missing_epoch_ids:
                logger.info(f"Fetching missing rewards inline for epochs {missing_epoch_ids}")
                for missing_epoch in missing_epoch_ids:
                    fetch_tasks.append(('reward', missing_epoch, 
                        self.client.get_epoch_performance_summary(missing_epoch, participant_id)))
            
            if warm_keys_data is None:
                logger.info(f"Fetching warm keys inline for participant {participant_id}")
                fetch_tasks.append(('warm_keys', None, self.client.get_authz_grants(participant_id)))
            
            if hardware_nodes_data is None:
                logger.info(f"Fetching hardware nodes inline for participant {participant_id}")
                fetch_tasks.append(('hardware', None, self.client.get_hardware_nodes(participant_id)))
            else:
                has_empty_poc_weight = any(r.get("poc_weight") in (None, "", 0) for r in hardware_nodes_data)
                if has_empty_poc_weight:
                    logger.info(f"Fetching hardware nodes inline for participant {participant_id}")
                    fetch_tasks.append(('hardware', None, self.client.get_hardware_nodes(participant_id)))
            
            cached_stats = await self.cache_db.get_participant_stats(participant_id, epoch_id, height)
            scaled_detail = {}
            scaled_ml_nodes_map = {}
            try:
                params = (await self.client.get_inference_params())["params"]
                if is_current:
                    root_group = (
                        await self.client.get_current_epoch_group_data()
                    ).get("epoch_group_data", {})
                else:
                    root_group = (
                        await self.client.get_epoch_group_data(epoch_id, height=height)
                    ).get("epoch_group_data", {})

                root_member = _validation_weight_map(root_group).get(participant_id, {})
                participant.weight = _int_field(root_member, "weight", participant.weight)

                scaled_epoch = await self._build_scaled_epoch_weight_data(
                    epoch_id,
                    params,
                    root_group,
                    height=height,
                )
                scaled_detail = scaled_epoch.get(participant_id, {})
                scaled_ml_nodes_map = scaled_detail.get("ml_nodes_map", {})
                if scaled_detail:
                    participant.weight_to_confirm = int(scaled_detail.get("weight_to_confirm", 0))
                    confirmation_weight_raw = root_member.get("confirmation_weight")
                    participant.confirmation_weight = (
                        int(confirmation_weight_raw)
                        if confirmation_weight_raw is not None
                        else None
                    )
                    participant.confirmation_poc_ratio = _safe_confirmation_ratio(
                        participant.confirmation_weight,
                        participant.weight_to_confirm,
                    )
            except Exception as e:
                logger.warning(f"Failed to compute scaled participant detail weights for {participant_id}: {e}")
            if fetch_tasks:
                results = await asyncio.gather(*[task[2] for task in fetch_tasks], return_exceptions=True)
                
                newly_fetched_rewards = []
                for i, (task_type, task_epoch_id, _) in enumerate(fetch_tasks):
                    result = results[i]
                    
                    if isinstance(result, Exception):
                        logger.debug(f"Fetch failed for {task_type}: {result}")
                        continue
                    
                    if task_type == 'reward':
                        perf = result.get("epochPerformanceSummary", {})
                        newly_fetched_rewards.append({
                            "epoch_id": task_epoch_id,
                            "participant_id": participant_id,
                            "rewarded_coins": perf.get("rewarded_coins", "0"),
                            "claimed": perf.get("claimed", False)
                        })
                    elif task_type == 'warm_keys':
                        warm_keys_data = result if result else []
                        try:
                            await self.cache_db.save_warm_keys_batch(epoch_id, participant_id, warm_keys_data)
                        except Exception as e:
                            logger.warning(f"Failed to save warm keys for {participant_id}: {e}")
                    elif task_type == 'hardware':
                        hardware_nodes_data = result if result else []
                        ml_nodes_map = scaled_ml_nodes_map or (participant.ml_nodes_map if participant.ml_nodes_map else {})
                        if not ml_nodes_map:
                            if cached_stats:
                                for s in cached_stats:
                                    if s.get("index") == participant_id:
                                        ml_nodes_map = s.get("_ml_nodes_map", {})
                                        break
                        if ml_nodes_map:
                            for node in hardware_nodes_data:
                                local_id = node.get("local_id")
                                if local_id and local_id in ml_nodes_map:
                                    node["poc_weight"] = ml_nodes_map[local_id]
                        try:
                            await self.cache_db.save_hardware_nodes_batch(epoch_id, participant_id, hardware_nodes_data)
                            logger.debug(f"Participant Updated {len(hardware_nodes_data)} hardware nodes for {participant_id}")
                        except Exception as e:
                            logger.warning(f"Failed to save hardware nodes for {participant_id}: {e}")
                
                if newly_fetched_rewards:
                    await self.cache_db.save_reward_batch(newly_fetched_rewards)
                    logger.info(f"Cached {len(newly_fetched_rewards)} inline-fetched rewards")
                    rewards_data.extend(newly_fetched_rewards)
            
            if warm_keys_data is None:
                warm_keys_data = []
            if hardware_nodes_data is None:
                hardware_nodes_data = []
            
            rewards = []
            for reward_data in rewards_data:
                rewarded_coins = reward_data.get("rewarded_coins", "0")
                gnk = int(rewarded_coins) // 1_000_000_000 if rewarded_coins != "0" else 0
                
                rewards.append(RewardInfo(
                    epoch_id=reward_data["epoch_id"],
                    assigned_reward_gnk=gnk,
                    claimed=reward_data["claimed"]
                ))
            
            rewards.sort(key=lambda r: r.epoch_id, reverse=True)
            
            seed = None
            if participant.seed_signature:
                seed = SeedInfo(
                    participant=participant_id,
                    epoch_index=epoch_id,
                    signature=participant.seed_signature
                )
            else:
                if cached_stats:
                    for s in cached_stats:
                        if s.get("index") == participant_id:
                            seed_sig = s.get("_seed_signature")
                            if seed_sig:
                                seed = SeedInfo(
                                    participant=participant_id,
                                    epoch_index=epoch_id,
                                    signature=seed_sig
                                )
                            break
            
            warm_keys = [
                WarmKeyInfo(
                    grantee_address=wk["grantee_address"],
                    granted_at=wk["granted_at"]
                )
                for wk in warm_keys_data
            ]
            
            ml_nodes_map = participant.ml_nodes_map if participant.ml_nodes_map else {}
            if scaled_ml_nodes_map:
                ml_nodes_map = scaled_ml_nodes_map
            if not ml_nodes_map:
                if cached_stats:
                    for s in cached_stats:
                        if s.get("index") == participant_id:
                            ml_nodes_map = s.get("_ml_nodes_map", {})
                            break
            
            ml_nodes = []
            hardware_by_id = {
                node.get("local_id", ""): node
                for node in (hardware_nodes_data or [])
            }
            scaled_nodes = scaled_detail.get("ml_nodes", [])

            if scaled_nodes:
                nodes_to_render = scaled_nodes
            else:
                nodes_to_render = hardware_nodes_data or []

            for node in nodes_to_render:
                local_id = node.get("local_id", "")
                hardware_node = hardware_by_id.get(local_id, {})
                poc_weight = (
                    node.get("scaled_weight")
                    if node.get("scaled_weight") is not None
                    else ml_nodes_map.get(local_id) if local_id in ml_nodes_map else node.get("poc_weight")
                )
                raw_poc_weight = node.get("raw_poc_weight")

                hardware_list = [
                    HardwareInfo(type=hw["type"], count=hw["count"])
                    for hw in hardware_node.get("hardware", node.get("hardware", []))
                ]
                ml_nodes.append(MLNodeInfo(
                    local_id=local_id,
                    status=hardware_node.get("status", node.get("status", "")),
                    models=node.get("models", hardware_node.get("models", [])),
                    hardware=hardware_list,
                    host=hardware_node.get("host", node.get("host", "")),
                    port=hardware_node.get("port", node.get("port", "")),
                    poc_weight=poc_weight,
                    raw_poc_weight=raw_poc_weight,
                    scaled_weight=node.get("scaled_weight"),
                    model_id=node.get("model_id"),
                    weight_scale_factor=node.get("weight_scale_factor"),
                ))
            
            return ParticipantDetailsResponse(
                participant=participant,
                rewards=rewards,
                seed=seed,
                warm_keys=warm_keys,
                ml_nodes=ml_nodes
            )
            
        except Exception as e:
            logger.error(f"Failed to get participant details: {e}")
            return None
    
    async def poll_participant_rewards(self):
        try:
            logger.info("Polling participant rewards")
            
            height = await self.client.get_latest_height()
            epoch_data = await self.client.get_current_epoch_participants()
            current_epoch = epoch_data["active_participants"]["epoch_group_id"]
            participants = epoch_data["active_participants"]["participants"]
            
            rewards_to_save = []
            
            for participant in participants:
                participant_id = participant["index"]
                
                for epoch_offset in range(1, 7):
                    check_epoch = current_epoch - epoch_offset
                    if check_epoch <= 0:
                        continue
                    
                    cached_reward = await self.cache_db.get_reward(check_epoch, participant_id)
                    if cached_reward and cached_reward["claimed"]:
                        continue
                    
                    try:
                        summary = await self.client.get_epoch_performance_summary(
                            check_epoch,
                            participant_id,
                            height=height
                        )
                        
                        perf = summary.get("epochPerformanceSummary", {})
                        rewarded_coins = perf.get("rewarded_coins", "0")
                        claimed = perf.get("claimed", False)
                        
                        rewards_to_save.append({
                            "epoch_id": check_epoch,
                            "participant_id": participant_id,
                            "rewarded_coins": rewarded_coins,
                            "claimed": claimed
                        })
                        
                    except Exception as e:
                        logger.debug(f"Failed to fetch reward for {participant_id} epoch {check_epoch}: {e}")
                        continue
            
            if rewards_to_save:
                await self.cache_db.save_reward_batch(rewards_to_save)
                logger.info(f"Saved {len(rewards_to_save)} reward records")
            
        except Exception as e:
            logger.error(f"Error polling participant rewards: {e}")
    
    async def poll_warm_keys(self, batch_size: int = 10, check_cache: bool = True):
        try:
            logger.info("Polling warm keys")
            
            epoch_data = await self.client.get_current_epoch_participants()
            current_epoch = epoch_data["active_participants"]["epoch_group_id"]
            participants = epoch_data["active_participants"]["participants"]
            
            async def fetch_warm_key(participant):
                participant_id = participant["index"]
                try:
                    if check_cache:
                        cached = await self.cache_db.get_warm_keys(current_epoch, participant_id)
                        if cached is not None:
                            return None
                    
                    warm_keys = await self.client.get_authz_grants(participant_id)
                    await self.cache_db.save_warm_keys_batch(current_epoch, participant_id, warm_keys)
                    logger.debug(f"Updated {len(warm_keys)} warm keys for {participant_id}")
                    return True
                except Exception as e:
                    logger.debug(f"Failed to fetch warm keys for {participant_id}: {e}")
                    return False
            
            fetched_count = 0
            for i in range(0, len(participants), batch_size):
                batch = participants[i:i+batch_size]
                results = await asyncio.gather(*[fetch_warm_key(p) for p in batch], return_exceptions=True)
                success_count = sum(1 for r in results if r is True)
                fetched_count += success_count
                logger.debug(f"Warm keys batch {i//batch_size + 1}: {success_count}/{len(batch)} fetched")
            
            logger.info(f"Completed warm keys polling: {fetched_count} fetched, {len(participants) - fetched_count} cached")
            
        except Exception as e:
            logger.error(f"Error polling warm keys: {e}")
    
    async def poll_hardware_nodes(self, batch_size: int = 10, check_cache: bool = True):
        try:
            logger.info("Polling hardware nodes")
            
            epoch_data = await self.client.get_current_epoch_participants()
            current_epoch = epoch_data["active_participants"]["epoch_group_id"]
            participants = epoch_data["active_participants"]["participants"]

            epoch_stats = None
            if self.current_epoch_data and self.current_epoch_id == current_epoch:
                epoch_stats = self.current_epoch_data
            else:
                epoch_stats = await self.get_current_epoch_stats()
    
            ml_nodes_map_by_participant = {}
            if epoch_stats:
                for p in epoch_stats.participants:
                    if p.ml_nodes_map:
                        ml_nodes_map_by_participant[p.index] = p.ml_nodes_map
            
            async def fetch_hardware_node(participant):
                participant_id = participant["index"]
                try:
                    if check_cache:
                        cached = await self.cache_db.get_hardware_nodes(current_epoch, participant_id)
                        if cached is not None:
                            has_empty_poc_weight = any(r.get("poc_weight") in (None, "", 0) for r in cached)
                            if not has_empty_poc_weight:
                                return None
                    
                    hardware_nodes = await self.client.get_hardware_nodes(participant_id)
                    ml_nodes_map = ml_nodes_map_by_participant.get(participant_id, {})
                    if ml_nodes_map:
                        for node in hardware_nodes:
                            local_id = node.get("local_id")
                            if local_id and local_id in ml_nodes_map:
                                node["poc_weight"] = ml_nodes_map[local_id]

                    await self.cache_db.save_hardware_nodes_batch(current_epoch, participant_id, hardware_nodes)
                    logger.debug(f"Updated {len(hardware_nodes)} hardware nodes for {participant_id}")
                    return True
                except Exception as e:
                    logger.debug(f"Failed to fetch hardware nodes for {participant_id}: {e}")
                    return False
            
            fetched_count = 0
            for i in range(0, len(participants), batch_size):
                batch = participants[i:i+batch_size]
                results = await asyncio.gather(*[fetch_hardware_node(p) for p in batch], return_exceptions=True)
                success_count = sum(1 for r in results if r is True)
                fetched_count += success_count
                logger.debug(f"Hardware nodes batch {i//batch_size + 1}: {success_count}/{len(batch)} fetched")
            
            logger.info(f"Completed hardware nodes polling: {fetched_count} fetched, {len(participants) - fetched_count} cached")
            
        except Exception as e:
            logger.error(f"Error polling hardware nodes: {e}")
    
    async def warm_participant_cache(self, participants: List[Dict[str, Any]], current_epoch: int, batch_size: int = 10):
        current_time = time.time()
        
        if self.cache_warming_in_progress:
            logger.debug("Cache warming already in progress, skipping")
            return
        
        if self.last_cache_warm_time and (current_time - self.last_cache_warm_time) < 60:
            logger.debug("Cache warming ran recently, skipping")
            return
        
        self.cache_warming_in_progress = True
        self.last_cache_warm_time = current_time
        
        try:
            logger.info(f"Starting cache warming for {len(participants)} participants")
            
            total_warm_keys = 0
            total_hardware = 0
            
            async def warm_warm_keys(participant):
                participant_id = participant["index"]
                try:
                    cached = await self.cache_db.get_warm_keys(current_epoch, participant_id)
                    if cached is None:
                        warm_keys = await self.client.get_authz_grants(participant_id)
                        await self.cache_db.save_warm_keys_batch(current_epoch, participant_id, warm_keys)
                        return True
                except Exception as e:
                    logger.debug(f"Failed to warm warm_keys for {participant_id}: {e}")
                return False
            
            for i in range(0, len(participants), batch_size):
                batch = participants[i:i+batch_size]
                results = await asyncio.gather(*[warm_warm_keys(p) for p in batch], return_exceptions=True)
                total_warm_keys += sum(1 for r in results if r is True)
            
            async def warm_hardware(participant):
                participant_id = participant["index"]
                try:
                    cached = await self.cache_db.get_hardware_nodes(current_epoch, participant_id)
                    if cached is None:
                        hardware_nodes = await self.client.get_hardware_nodes(participant_id)
                        await self.cache_db.save_hardware_nodes_batch(current_epoch, participant_id, hardware_nodes)
                        return True
                except Exception as e:
                    logger.debug(f"Failed to warm hardware_nodes for {participant_id}: {e}")
                return False
            
            for i in range(0, len(participants), batch_size):
                batch = participants[i:i+batch_size]
                results = await asyncio.gather(*[warm_hardware(p) for p in batch], return_exceptions=True)
                total_hardware += sum(1 for r in results if r is True)
            
            logger.info(f"Cache warming completed: {total_warm_keys} warm_keys, {total_hardware} hardware_nodes fetched")
            
        except Exception as e:
            logger.error(f"Error during cache warming: {e}")
        finally:
            self.cache_warming_in_progress = False
    
    async def _calculate_and_cache_total_rewards(self, epoch_id: int, force_update: bool = False):
        try:
            logger.info(f"Calculating total assigned rewards for epoch {epoch_id}")

            epoch_data = await self.get_epoch_participants(epoch_id)
            participants = epoch_data["active_participants"]["participants"]

            total_ugnk = 0
            fetched_count = 0
            rewards_batch = []
            participants_with_rewards = 0

            for participant in participants:
                participant_id = participant["index"]

                try:
                    summary = await self.client.get_epoch_performance_summary(
                        epoch_id,
                        participant_id
                    )
                    perf = summary.get("epochPerformanceSummary", {})
                    rewarded_coins = perf.get("rewarded_coins", "0")
                    rewarded_amount = int(rewarded_coins)
                    total_ugnk += rewarded_amount
                    fetched_count += 1

                    if rewarded_amount > 0:
                        participants_with_rewards += 1

                    rewards_batch.append({
                        "epoch_id": epoch_id,
                        "participant_id": participant_id,
                        "rewarded_coins": rewarded_coins,
                        "claimed": perf.get("claimed", False)
                    })
                except Exception as e:
                    logger.debug(f"Could not fetch reward for {participant_id} in epoch {epoch_id}: {e}")
                    continue

            if total_ugnk == 0 and fetched_count > 0:
                logger.warning(f"Epoch {epoch_id} rewards calculation returned 0 for all {fetched_count} participants - rewards may not be available yet, skipping cache")
                return

            total_gnk = total_ugnk // 1_000_000_000

            cached_total = await self.cache_db.get_epoch_total_rewards(epoch_id)
            if cached_total is not None and cached_total >= total_gnk and not force_update:
                logger.debug(f"Epoch {epoch_id} cached total ({cached_total} GNK) >= new total ({total_gnk} GNK), skipping update")
                return

            if rewards_batch:
                await self.cache_db.save_reward_batch(rewards_batch)
                logger.debug(f"Cached {len(rewards_batch)} participant rewards during total calculation")

            await self.cache_db.save_epoch_total_rewards(epoch_id, total_gnk)
            if cached_total is not None and cached_total > 0:
                logger.info(f"Updated total rewards for epoch {epoch_id}: {cached_total} -> {total_gnk} GNK from {fetched_count}/{len(participants)} participants ({participants_with_rewards} with rewards)")
            else:
                logger.info(f"Calculated and cached total rewards for epoch {epoch_id}: {total_gnk} GNK from {fetched_count}/{len(participants)} participants ({participants_with_rewards} with rewards)")

        except Exception as e:
            logger.error(f"Error calculating epoch total rewards for epoch {epoch_id}: {e}")
    
    async def poll_epoch_total_rewards(self):
        try:
            logger.info("Polling epoch total rewards")

            latest_info = await self.client.get_latest_epoch()
            current_epoch_id = latest_info["latest_epoch"]["index"]

            for offset in range(1, 6):
                epoch_id = current_epoch_id - offset
                if epoch_id <= 0:
                    continue

                cached_total = await self.cache_db.get_epoch_total_rewards(epoch_id)

                if cached_total == 0:
                    logger.warning(f"Detected invalid cached total rewards (0 GNK) for epoch {epoch_id}, recalculating")
                    await self.cache_db.delete_epoch_total_rewards(epoch_id)

                # Always recalculate recent epochs — rewards may still be distributing on-chain
                logger.info(f"Calculating total rewards for epoch {epoch_id} (cached: {cached_total} GNK)")
                await self._calculate_and_cache_total_rewards(epoch_id)

            logger.info("Completed epoch total rewards polling")

        except Exception as e:
            logger.error(f"Error polling epoch total rewards: {e}")
    
    async def fetch_and_cache_confirmation_data(
        self,
        epoch_id: int,
        height: int,
        active_participants: List[Dict[str, Any]]
    ):
        try:
            epoch_group_data = await self.client.get_epoch_group_data(epoch_id, height)
            root_group = epoch_group_data.get("epoch_group_data", {})
            validation_weights = root_group.get("validation_weights", [])
            
            validation_weights_map = {
                vw["member_address"]: vw for vw in validation_weights
            }
            params = (await self.client.get_inference_params())["params"]
            scaled_weights = await self._build_scaled_epoch_weight_data(
                epoch_id,
                params,
                root_group,
                height=height,
            )
            
            participant_statuses: Dict[str, str] = {}
            for participant in active_participants:
                participant_id = participant["index"]
                try:
                    participant_data = await self.client.get_participant_confirmation_data(
                        participant_id, height
                    )
                    participant_info = participant_data.get("participant", {})
                    participant_statuses[participant_id] = participant_info.get("status", "")
                except Exception as e:
                    logger.debug(f"Failed to fetch participant data for {participant_id}: {e}")
                    participant_statuses[participant_id] = ""

            confirmation_data = []

            for participant in active_participants:
                participant_id = participant["index"]

                try:
                    weight_to_confirm = int(
                        scaled_weights.get(participant_id, {}).get("weight_to_confirm", 0)
                    )

                    validation_info = validation_weights_map.get(participant_id, {})
                    confirmation_weight_raw = validation_info.get("confirmation_weight")
                    confirmation_weight = None
                    if confirmation_weight_raw is not None:
                        try:
                            confirmation_weight = int(confirmation_weight_raw)
                        except (ValueError, TypeError):
                            logger.warning(f"Invalid confirmation_weight for {participant_id}: {confirmation_weight_raw}")

                    participant_status = participant_statuses.get(participant_id, "")

                    confirmation_poc_ratio = _safe_confirmation_ratio(
                        confirmation_weight,
                        weight_to_confirm,
                    )
                    if confirmation_poc_ratio is not None:
                        confirmation_poc_ratio = round(confirmation_poc_ratio, 4)

                    confirmation_data.append({
                        "participant_index": participant_id,
                        "weight_to_confirm": weight_to_confirm,
                        "confirmation_weight": confirmation_weight,
                        "confirmation_poc_ratio": confirmation_poc_ratio,
                        "participant_status": participant_status
                    })

                except Exception as e:
                    logger.warning(f"Failed to process confirmation data for {participant_id}: {e}")
                    continue
            
            await self.cache_db.save_confirmation_data_batch(epoch_id, confirmation_data)
            logger.info(f"Cached confirmation data for {len(confirmation_data)} participants in epoch {epoch_id}")
            
        except Exception as e:
            logger.error(f"Error fetching and caching confirmation data: {e}")
    
    async def merge_confirmation_data(
        self,
        epoch_id: int,
        participants: List[ParticipantStats],
        height: int,
        active_participants: List[Dict[str, Any]]
    ) -> List[ParticipantStats]:
        try:
            confirmation_list = await self.cache_db.get_confirmation_data(epoch_id)
            confirmation_map = {}
            
            if confirmation_list:
                confirmation_map = {c["participant_index"]: c for c in confirmation_list}
            
            for participant in participants:
                conf_info = confirmation_map.get(participant.index)
                if conf_info:
                    if participant.weight_to_confirm is None:
                        participant.weight_to_confirm = conf_info["weight_to_confirm"]
                    if participant.confirmation_weight is None:
                        participant.confirmation_weight = conf_info["confirmation_weight"]
                    if participant.confirmation_poc_ratio is None:
                        participant.confirmation_poc_ratio = conf_info["confirmation_poc_ratio"]
                    participant.participant_status = conf_info["participant_status"]
            
            return participants
            
        except Exception as e:
            logger.error(f"Failed to merge confirmation data: {e}")
            return participants
    
    async def get_timeline(self):
        current_time = time.time()
        
        if (self.timeline_cache is not None and 
            self.timeline_cache_time is not None and
            current_time - self.timeline_cache_time < self.timeline_cache_ttl):
            logger.info(f"Returning cached timeline data (age: {current_time - self.timeline_cache_time:.1f}s)")
            return self.timeline_cache
        
        if self.timeline_cache is None:
            cached_data = await self.cache_db.get_timeline_cache()
            if cached_data:
                logger.info("Loading timeline from database cache on startup")
                timeline_dict = cached_data["timeline"]
                try:
                    response = TimelineResponse(
                        current_block=BlockInfo(**timeline_dict["current_block"]),
                        reference_block=BlockInfo(**timeline_dict["reference_block"]),
                        avg_block_time=timeline_dict["avg_block_time"],
                        events=[TimelineEvent(**e) for e in timeline_dict["events"]],
                        current_epoch_start=timeline_dict["current_epoch_start"],
                        current_epoch_index=timeline_dict["current_epoch_index"],
                        epoch_length=timeline_dict["epoch_length"],
                        epoch_stages=timeline_dict.get("epoch_stages"),
                        next_epoch_stages=timeline_dict.get("next_epoch_stages")
                    )
                    self.timeline_cache = response
                    self.timeline_cache_time = current_time - 29
                    return response
                except Exception as e:
                    logger.warning(f"Failed to parse cached timeline data: {e}")
        
        logger.info("Fetching fresh timeline data")
        current_height = await self.client.get_latest_height()
        current_block_data = await self.client.get_block(current_height)
        current_timestamp = current_block_data["result"]["block"]["header"]["time"]
        
        reference_height = current_height - 10000
        reference_block_data = await self.client.get_block(reference_height)
        reference_timestamp = reference_block_data["result"]["block"]["header"]["time"]
        
        current_dt = datetime.fromisoformat(current_timestamp.replace('Z', '+00:00'))
        reference_dt = datetime.fromisoformat(reference_timestamp.replace('Z', '+00:00'))
        
        time_diff_seconds = (current_dt - reference_dt).total_seconds()
        block_diff = current_height - reference_height
        avg_block_time = round(time_diff_seconds / block_diff, 2)
        
        restrictions_data = await self.client.get_restrictions_params()
        restrictions_end_block = int(restrictions_data["params"]["restriction_end_block"])
        
        latest_epoch_info = await self.client.get_latest_epoch()
        current_epoch_start = latest_epoch_info["latest_epoch"]["poc_start_block_height"]
        current_epoch_index = latest_epoch_info["latest_epoch"]["index"]
        epoch_length = latest_epoch_info["epoch_params"]["epoch_length"]
        epoch_stages = latest_epoch_info.get("epoch_stages")
        next_epoch_stages = latest_epoch_info.get("next_epoch_stages")
        
        events = [
            TimelineEvent(
                block_height=restrictions_end_block,
                description="Money Transfer Enabled",
                occurred=current_height >= restrictions_end_block
            )
        ]
        
        response = TimelineResponse(
            current_block=BlockInfo(height=current_height, timestamp=current_timestamp),
            reference_block=BlockInfo(height=reference_height, timestamp=reference_timestamp),
            avg_block_time=avg_block_time,
            events=events,
            current_epoch_start=current_epoch_start,
            current_epoch_index=current_epoch_index,
            epoch_length=epoch_length,
            epoch_stages=epoch_stages,
            next_epoch_stages=next_epoch_stages
        )
        
        self.timeline_cache = response
        self.timeline_cache_time = current_time
        
        try:
            await self.cache_db.save_timeline_cache(response.dict())
        except Exception as e:
            logger.warning(f"Failed to save timeline to database: {e}")
        
        logger.info(f"Cached fresh timeline data")
        
        return response
    
    async def get_current_models(self) -> ModelsResponse:
        if self.current_epoch_id is None:
            try:
                latest_info = await self.client.get_latest_epoch()
                epoch_id = latest_info["latest_epoch"]["index"]
                self.current_epoch_id = epoch_id
            except Exception as e:
                logger.error(f"Failed to get current epoch ID: {e}")
                raise
        else:
            epoch_id = self.current_epoch_id
        
        cached_models = await self.cache_db.get_models(epoch_id)
        cached_api_data = await self.cache_db.get_models_api_cache(epoch_id)
        
        if cached_models and cached_api_data:
            logger.info(f"Returning fully cached models for epoch {epoch_id} from database")
            
            models_all_data = cached_api_data["models_all"]
            models_stats_data = cached_api_data["models_stats"]
            cached_height = cached_api_data.get("cached_height", 0)
            
            stats_list = models_stats_data.get("stats_models", [])
            models_list = models_all_data.get("model", [])
            cached_dict = {m["model_id"]: m for m in cached_models}
            
            models_info = []
            for model in models_list:
                model_id = model["id"]
                cached = cached_dict.get(model_id, {})
                
                models_info.append(ModelInfo(
                    id=model_id,
                    total_weight=cached.get("total_weight", 0),
                    participant_count=cached.get("participant_count", 0),
                    proposed_by=model.get("proposed_by", ""),
                    v_ram=model.get("v_ram", ""),
                    throughput_per_nonce=model.get("throughput_per_nonce", ""),
                    units_of_compute_per_token=model.get("units_of_compute_per_token", ""),
                    hf_repo=model.get("hf_repo", ""),
                    hf_commit=model.get("hf_commit", ""),
                    model_args=model.get("model_args", []),
                    validation_threshold=model.get("validation_threshold", {})
                ))
            
            stats_info = []
            for stat in stats_list:
                stats_info.append(ModelStats(
                    model=stat.get("model", ""),
                    ai_tokens=stat.get("ai_tokens", "0"),
                    inferences=stat.get("inferences", 0)
                ))
            
            current_block_timestamp = None
            avg_block_time = None
            if self.current_epoch_data:
                current_block_timestamp = self.current_epoch_data.current_block_timestamp
                avg_block_time = self.current_epoch_data.avg_block_time
            
            return ModelsResponse(
                epoch_id=epoch_id,
                height=cached_height,
                models=models_info,
                stats=stats_info,
                cached_at=cached_api_data.get("cached_at", datetime.utcnow().isoformat()),
                is_current=True,
                current_block_timestamp=current_block_timestamp,
                avg_block_time=avg_block_time
            )
        
        epoch_data = await self.client.get_current_epoch_participants()
        participants = epoch_data["active_participants"]["participants"]
        height = await self.client.get_latest_height()
        
        cached_models = await self.cache_db.get_models(epoch_id)
        
        if cached_models:
            logger.info(f"Returning cached models for epoch {epoch_id}")
        else:
            logger.info(f"Fetching and aggregating models for epoch {epoch_id}")
            
            model_weights: Dict[str, int] = {}
            model_participant_count: Dict[str, set] = {}
            
            for participant in participants:
                participant_index = participant["index"]
                models = participant.get("models", [])
                ml_nodes_high_level = participant.get("ml_nodes", [])
                
                for model, ml_nodes_entry in zip(models, ml_nodes_high_level):
                    if model not in model_weights:
                        model_weights[model] = 0
                        model_participant_count[model] = set()
                    
                    for ml_node in ml_nodes_entry.get("ml_nodes", []):
                        poc_weight = ml_node.get("poc_weight", 0)
                        model_weights[model] += poc_weight
                    
                    model_participant_count[model].add(participant_index)
            
            models_to_cache = []
            for model_id in model_weights:
                models_to_cache.append({
                    "model_id": model_id,
                    "total_weight": model_weights[model_id],
                    "participant_count": len(model_participant_count[model_id])
                })
            
            if models_to_cache:
                await self.cache_db.save_models_batch(epoch_id, models_to_cache)
            
            cached_models = models_to_cache
        
        cached_api_data = await self.cache_db.get_models_api_cache(epoch_id)
        
        if cached_api_data:
            cached_height = cached_api_data.get("cached_height", "unknown")
            logger.info(f"Using cached models API data for epoch {epoch_id} (cached at height {cached_height}, current height {height})")
            models_all_data = cached_api_data["models_all"]
            models_stats_data = cached_api_data["models_stats"]
        else:
            logger.info(f"Fetching fresh models API data for epoch {epoch_id} at height {height}")
            models_all_data = await self.client.get_models_all()
            models_stats_data = await self.client.get_models_stats()
            
            await self.cache_db.save_models_api_cache(
                epoch_id, height, models_all_data, models_stats_data
            )
        
        stats_list = models_stats_data.get("stats_models", [])
        models_list = models_all_data.get("model", [])
        
        models_dict = {m["id"]: m for m in models_list}
        cached_dict = {m["model_id"]: m for m in cached_models} if cached_models else {}
        
        models_info = []
        for model in models_list:
            model_id = model["id"]
            cached = cached_dict.get(model_id, {})
            
            models_info.append(ModelInfo(
                id=model_id,
                total_weight=cached.get("total_weight", 0),
                participant_count=cached.get("participant_count", 0),
                proposed_by=model.get("proposed_by", ""),
                v_ram=model.get("v_ram", ""),
                throughput_per_nonce=model.get("throughput_per_nonce", ""),
                units_of_compute_per_token=model.get("units_of_compute_per_token", ""),
                hf_repo=model.get("hf_repo", ""),
                hf_commit=model.get("hf_commit", ""),
                model_args=model.get("model_args", []),
                validation_threshold=model.get("validation_threshold", {})
            ))
        
        stats_info = []
        for stat in stats_list:
            stats_info.append(ModelStats(
                model=stat.get("model", ""),
                ai_tokens=stat.get("ai_tokens", "0"),
                inferences=stat.get("inferences", 0)
            ))
        
        current_block_timestamp = None
        avg_block_time = None
        if self.current_epoch_data:
            current_block_timestamp = self.current_epoch_data.current_block_timestamp
            avg_block_time = self.current_epoch_data.avg_block_time
        
        return ModelsResponse(
            epoch_id=epoch_id,
            height=height,
            models=models_info,
            stats=stats_info,
            cached_at=datetime.utcnow().isoformat(),
            is_current=True,
            current_block_timestamp=current_block_timestamp,
            avg_block_time=avg_block_time
        )
    
    async def get_historical_models(self, epoch_id: int, height: Optional[int] = None) -> ModelsResponse:
        epoch_data = await self.get_epoch_participants(epoch_id)
        participants = epoch_data["active_participants"]["participants"]
        target_height = await self.get_canonical_height(epoch_id, height)
        
        cached_models = await self.cache_db.get_models(epoch_id)
        
        if cached_models:
            logger.info(f"Returning cached models for epoch {epoch_id}")
        else:
            logger.info(f"Fetching and aggregating models for epoch {epoch_id}")
            
            model_weights: Dict[str, int] = {}
            model_participant_count: Dict[str, set] = {}
            
            for participant in participants:
                participant_index = participant["index"]
                models = participant.get("models", [])
                ml_nodes_high_level = participant.get("ml_nodes", [])
                
                for model, ml_nodes_entry in zip(models, ml_nodes_high_level):
                    if model not in model_weights:
                        model_weights[model] = 0
                        model_participant_count[model] = set()
                    
                    for ml_node in ml_nodes_entry.get("ml_nodes", []):
                        poc_weight = ml_node.get("poc_weight", 0)
                        model_weights[model] += poc_weight
                    
                    model_participant_count[model].add(participant_index)
            
            models_to_cache = []
            for model_id in model_weights:
                models_to_cache.append({
                    "model_id": model_id,
                    "total_weight": model_weights[model_id],
                    "participant_count": len(model_participant_count[model_id])
                })
            
            if models_to_cache:
                await self.cache_db.save_models_batch(epoch_id, models_to_cache)
            
            cached_models = models_to_cache
        
        cached_api_data = await self.cache_db.get_models_api_cache(epoch_id, target_height)
        
        if cached_api_data:
            logger.info(f"Using cached models API data for historical epoch {epoch_id} at height {target_height}")
            models_all_data = cached_api_data["models_all"]
            models_stats_data = cached_api_data["models_stats"]
        else:
            logger.info(f"Fetching fresh models API data for historical epoch {epoch_id} at height {target_height}")
            models_all_data = await self.client.get_models_all()
            models_stats_data = await self.client.get_models_stats()
            
            await self.cache_db.save_models_api_cache(
                epoch_id, target_height, models_all_data, models_stats_data
            )
        
        stats_list = models_stats_data.get("stats_models", [])
        models_list = models_all_data.get("model", [])
        
        models_dict = {m["id"]: m for m in models_list}
        cached_dict = {m["model_id"]: m for m in cached_models} if cached_models else {}
        
        models_info = []
        for model in models_list:
            model_id = model["id"]
            cached = cached_dict.get(model_id, {})
            
            models_info.append(ModelInfo(
                id=model_id,
                total_weight=cached.get("total_weight", 0),
                participant_count=cached.get("participant_count", 0),
                proposed_by=model.get("proposed_by", ""),
                v_ram=model.get("v_ram", ""),
                throughput_per_nonce=model.get("throughput_per_nonce", ""),
                units_of_compute_per_token=model.get("units_of_compute_per_token", ""),
                hf_repo=model.get("hf_repo", ""),
                hf_commit=model.get("hf_commit", ""),
                model_args=model.get("model_args", []),
                validation_threshold=model.get("validation_threshold", {})
            ))
        
        stats_info = []
        for stat in stats_list:
            stats_info.append(ModelStats(
                model=stat.get("model", ""),
                ai_tokens=stat.get("ai_tokens", "0"),
                inferences=stat.get("inferences", 0)
            ))
        
        current_block_timestamp = None
        avg_block_time = None
        if self.current_epoch_data:
            current_block_timestamp = self.current_epoch_data.current_block_timestamp
            avg_block_time = self.current_epoch_data.avg_block_time
        
        return ModelsResponse(
            epoch_id=epoch_id,
            height=target_height,
            models=models_info,
            stats=stats_info,
            cached_at=datetime.utcnow().isoformat(),
            is_current=False,
            current_block_timestamp=current_block_timestamp,
            avg_block_time=avg_block_time
        )
    
    async def poll_participant_inferences(self):
        try:
            logger.info("Polling participant inferences")
            
            epoch_data = await self.client.get_current_epoch_participants()
            current_epoch = epoch_data["active_participants"]["epoch_group_id"]
            current_epoch_effective_height = epoch_data["active_participants"]["effective_block_height"]
            participants = epoch_data["active_participants"]["participants"]
            participant_indices = {p["index"] for p in participants}
            
            latest_epoch_info = await self.client.get_latest_epoch()
            epoch_length = latest_epoch_info["epoch_params"]["epoch_length"]
            
            logger.info(f"Fetching all inferences (all epochs)")
            all_inferences = await self.client.get_all_inferences()
            logger.info(f"Fetched {len(all_inferences)} total inferences")
            logger.info(f"Current epoch: {current_epoch}, effective_height: {current_epoch_effective_height}, epoch_length: {epoch_length}")
            
            fixed_epoch_count = 0
            for inf in all_inferences:
                if inf.get("epoch_id") == "0":
                    start_height = int(inf.get("start_block_height", 0))
                    if start_height > 0:
                        if start_height >= current_epoch_effective_height:
                            calculated_epoch = current_epoch
                        else:
                            blocks_before_current = current_epoch_effective_height - start_height
                            epochs_back = (blocks_before_current + epoch_length - 1) // epoch_length
                            calculated_epoch = current_epoch - epochs_back
                        
                        if inf.get("status") == "EXPIRED":
                            logger.info(f"EXPIRED inference {inf.get('inference_id')}: start_height={start_height}, calculated_epoch={calculated_epoch}, assigned_to={inf.get('assigned_to')}")
                        
                        inf["epoch_id"] = str(calculated_epoch)
                        fixed_epoch_count += 1
            
            if fixed_epoch_count > 0:
                logger.info(f"Fixed epoch_id for {fixed_epoch_count} inferences with epoch_id='0'")
            
            epoch_distribution = {}
            for inf in all_inferences:
                eid = inf.get("epoch_id", "unknown")
                epoch_distribution[eid] = epoch_distribution.get(eid, 0) + 1
            logger.info(f"Epoch distribution before filtering: {epoch_distribution}")
            
            target_epochs = {str(current_epoch), str(current_epoch - 1)}
            all_inferences = [inf for inf in all_inferences if inf.get("epoch_id") in target_epochs]
            logger.info(f"After filtering by epochs {current_epoch} and {current_epoch - 1}: {len(all_inferences)} inferences")
            
            status_counts = {}
            for inf in all_inferences:
                status = inf.get("status", "UNKNOWN")
                status_counts[status] = status_counts.get(status, 0) + 1
            logger.info(f"Inference status distribution: {status_counts}")
            
            by_participant = {p["index"]: [] for p in participants}
            
            for inf in all_inferences:
                assigned_to = inf.get("assigned_to")
                if assigned_to:
                    if assigned_to not in by_participant:
                        by_participant[assigned_to] = []
                    by_participant[assigned_to].append(inf)
            
            logger.info(f"Grouped inferences for {len(by_participant)} participants (including those with no inferences)")
            
            saved_count = 0
            for participant_id, inferences in by_participant.items():
                try:
                    by_epoch = {}
                    wrong_epoch_count = 0
                    for inf in inferences:
                        epoch_id = inf.get("epoch_id")
                        if epoch_id not in target_epochs:
                            wrong_epoch_count += 1
                            continue
                        
                        status = inf.get("status", "")
                        if status in ["FINISHED", "VALIDATED", "EXPIRED", "INVALIDATED"]:
                            if epoch_id not in by_epoch:
                                by_epoch[epoch_id] = []
                            by_epoch[epoch_id].append(inf)
                    
                    if wrong_epoch_count > 0:
                        logger.warning(f"Participant {participant_id}: filtered out {wrong_epoch_count} inferences with wrong epoch_id")
                    
                    for epoch_str in target_epochs:
                        epoch_id = int(epoch_str)
                        epoch_inferences = by_epoch.get(epoch_str, [])
                        by_status = {
                            "successful": [],
                            "expired": [],
                            "invalidated": []
                        }
                        
                        for inf in epoch_inferences:
                            status = inf.get("status", "")
                            if status in ["FINISHED", "VALIDATED"]:
                                by_status["successful"].append(inf)
                            elif status == "EXPIRED":
                                by_status["expired"].append(inf)
                            elif status == "INVALIDATED":
                                by_status["invalidated"].append(inf)
                        
                        for key in by_status:
                            by_status[key] = sorted(
                                by_status[key],
                                key=lambda x: int(x.get("start_block_timestamp", 0)),
                                reverse=True
                            )[:10]
                        
                        to_save = by_status["successful"] + by_status["expired"] + by_status["invalidated"]
                        
                        await self.cache_db.save_participant_inferences_batch(
                            epoch_id=int(epoch_id),
                            participant_id=participant_id,
                            inferences=to_save
                        )
                        saved_count += len(to_save)
                        logger.info(f"Cached inferences for {participant_id} epoch {epoch_id}: {len(by_status['successful'])} successful, {len(by_status['expired'])} expired, {len(by_status['invalidated'])} invalidated")
                    
                except Exception as e:
                    logger.debug(f"Failed to process inferences for {participant_id}: {e}")
                    continue
            
            logger.info(f"Completed participant inferences polling: {saved_count} inferences cached for {len(by_participant)} participants across epochs {current_epoch} and {current_epoch - 1}")
            
        except Exception as e:
            logger.error(f"Error polling participant inferences: {e}")
    
    async def get_participant_inferences_summary(
        self,
        epoch_id: int,
        participant_id: str
    ) -> Dict[str, Any]:
        try:
            logger.info(f"Fetching inferences summary for participant {participant_id} in epoch {epoch_id}")
            
            cached_inferences = await self.cache_db.get_participant_inferences(
                epoch_id=epoch_id,
                participant_id=participant_id
            )
            
            logger.info(f"Cache result for {participant_id} epoch {epoch_id}: {type(cached_inferences)} with {len(cached_inferences) if cached_inferences is not None else 'None'} items")
            
            if cached_inferences is None:
                logger.warning(f"No cached inferences for {participant_id} in epoch {epoch_id}, returning empty (cache-only mode)")
                return {
                    "epoch_id": epoch_id,
                    "participant_id": participant_id,
                    "successful": [],
                    "expired": [],
                    "invalidated": [],
                    "cached_at": None
                }
            
            successful = []
            expired = []
            invalidated = []
            skipped_count = 0
            
            for inf in cached_inferences:
                try:
                    if not inf.get("inference_id") or not inf.get("status"):
                        skipped_count += 1
                        continue
                    
                    status = inf.get("status", "")
                    if status in ["FINISHED", "VALIDATED"]:
                        successful.append(inf)
                    elif status == "EXPIRED":
                        expired.append(inf)
                    elif status == "INVALIDATED":
                        invalidated.append(inf)
                except Exception as e:
                    logger.warning(f"Skipping invalid inference record for {participant_id}: {e}")
                    skipped_count += 1
                    continue
            
            if skipped_count > 0:
                logger.warning(f"Skipped {skipped_count} invalid inference records for {participant_id} in epoch {epoch_id}")
            
            return {
                "epoch_id": epoch_id,
                "participant_id": participant_id,
                "successful": successful[:10],
                "expired": expired[:10],
                "invalidated": invalidated[:10],
                "cached_at": datetime.utcnow().isoformat() if cached_inferences is not None else None
            }
            
        except Exception as e:
            logger.error(f"Error getting participant inferences summary for {participant_id} epoch {epoch_id}: {e}", exc_info=True)
            return {
                "epoch_id": epoch_id,
                "participant_id": participant_id,
                "successful": [],
                "expired": [],
                "invalidated": [],
                "cached_at": None
            }
    
    async def poll_models_api_cache(self):
        try:
            logger.info("Polling models API cache")
            
            epoch_data = await self.client.get_current_epoch_participants()
            epoch_id = epoch_data["active_participants"]["epoch_group_id"]
            height = await self.client.get_latest_height()
            
            models_all_data = await self.client.get_models_all()
            models_stats_data = await self.client.get_models_stats()
            
            await self.cache_db.save_models_api_cache(
                epoch_id, height, models_all_data, models_stats_data
            )
            logger.info(f"Cached models API data for current epoch {epoch_id} at height {height}")
            
        except Exception as e:
            logger.error(f"Error polling models API cache: {e}")

    def extract_gonka_addresses(self, obj, role_prefix=None):
        results = []
        if isinstance(obj, dict):
            for key, value in obj.items():
                results.extend(self.extract_gonka_addresses(value, key))
        elif isinstance(obj, list):
            for value in obj:
                results.extend(self.extract_gonka_addresses(value, role_prefix=None))
        elif isinstance(obj, str):
            if is_valid_gonka_address(obj):
                if role_prefix is not None:
                    results.append((role_prefix, obj))
        return results
    
    @staticmethod
    def _parse_finalize_transfers(height: int, events: list) -> list:
        """Parse transfer events from finalize_block_events, excluding BeginBlock mint transfers."""
        transfers = []
        for evt in events:
            if evt.get("type") != "transfer":
                continue

            attrs = {}
            for attr in evt.get("attributes", []):
                attrs[attr.get("key", "")] = attr.get("value", "")

            if attrs.get("mode") in ("BeginBlock", "EndBlock"):
                continue

            recipient = attrs.get("recipient", "")
            sender = attrs.get("sender", "")
            amount_raw = attrs.get("amount", "")

            if recipient and sender and amount_raw:
                match = re.match(r"^(\d+)(.+)$", amount_raw)
                if match:
                    transfers.append({
                        "height": height,
                        "tx_hash": "",
                        "msg_type": "PocReward",
                        "sender": sender,
                        "recipient": recipient,
                        "amount_json": json.dumps([{"amount": match.group(1), "denom": match.group(2)}]),
                        "status": "success",
                    })

        return transfers

    @staticmethod
    def _extract_transfer_records(msg: dict, height: int, tx_hash: str, status: str) -> list:
        records = []
        at_type = msg.get("@type", "")
        msg_type_str = at_type.split(".")[-1].replace("Msg", "")

        if "MsgMultiSend" in at_type:
            inputs = msg.get("inputs", [])
            outputs = msg.get("outputs", [])
            from_addr = inputs[0].get("address", "") if inputs else ""
            for output in outputs:
                coins = [{"amount": c.get("amount", "0"), "denom": c.get("denom", "")} for c in output.get("coins", [])]
                records.append({
                    "height": height, "tx_hash": tx_hash, "msg_type": msg_type_str,
                    "sender": from_addr, "recipient": output.get("address", ""),
                    "amount_json": json.dumps(coins), "status": status,
                })
        elif "MsgSend" in at_type:
            coins = [{"amount": c.get("amount", "0"), "denom": c.get("denom", "")} for c in msg.get("amount", [])]
            records.append({
                "height": height, "tx_hash": tx_hash, "msg_type": msg_type_str,
                "sender": msg.get("from_address", ""), "recipient": msg.get("to_address", ""),
                "amount_json": json.dumps(coins), "status": status,
            })
        elif "MsgBatchTransferWithVesting" in at_type:
            sender = msg.get("sender", "")
            for output in msg.get("outputs", []):
                coins = [{"amount": c.get("amount", "0"), "denom": c.get("denom", "")} for c in output.get("amount", [])]
                records.append({
                    "height": height, "tx_hash": tx_hash, "msg_type": msg_type_str,
                    "sender": sender, "recipient": output.get("recipient", ""),
                    "amount_json": json.dumps(coins), "status": status,
                })
        elif "MsgTransferWithVesting" in at_type:
            coins = [{"amount": c.get("amount", "0"), "denom": c.get("denom", "")} for c in msg.get("amount", [])]
            records.append({
                "height": height, "tx_hash": tx_hash, "msg_type": msg_type_str,
                "sender": msg.get("sender", ""), "recipient": msg.get("recipient", ""),
                "amount_json": json.dumps(coins), "status": status,
            })
        elif "MsgTransfer" in at_type and "Ownership" not in at_type:
            token = msg.get("token", {})
            coins = [{"amount": token.get("amount", "0"), "denom": token.get("denom", "")}]
            records.append({
                "height": height, "tx_hash": tx_hash, "msg_type": msg_type_str,
                "sender": msg.get("sender", ""), "recipient": msg.get("receiver", ""),
                "amount_json": json.dumps(coins), "status": status,
            })
        elif "MsgExec" in at_type:
            for inner_msg in msg.get("msgs", []):
                records.extend(InferenceService._extract_transfer_records(inner_msg, height, tx_hash, status))

        return records

    async def fetch_block_data(self, height):
        commit_signatures = []
        transactions = []
        participants = []
        transaction_results = []
        transaction_events = []
        transaction_index_hash_map = {}

        block_results = await self.client.get_block_results(height)
        block_data = await self.client.get_block(height)
        logger.debug(f"[Cache blocks] {height}: Complete data has been obtained. ")

        block = block_data["result"]["block"]
        block["block_id"] = block_data["result"]["block_id"]

        last_commit = block.get("last_commit", {}) or {}
        signatures = last_commit.get("signatures", []) or []
        for idx, signature in enumerate(signatures):
            signature["height"] = height
            signature["index"] = idx
            commit_signatures.append(signature)

        block_txs = block["data"].get("txs", [])
        for idx, tx_base64 in enumerate(block_txs):
            decoded_transaction = self.decode_tx_base64(tx_base64)
            decoded_transaction["index"] = idx
            decoded_transaction["height"] = height
            decoded_transaction["raw_data"] = tx_base64
            decoded_transaction["msg_types"] = self._extract_msg_types(
                decoded_transaction["body"].get("messages", [])
            )
            transactions.append(decoded_transaction)
            transaction_index_hash_map[idx] = decoded_transaction["hash"]

            transaction_hash = decoded_transaction["hash"]
            is_transfer = 1 if ("Send" in json.dumps(decoded_transaction["msg_types"]) or "Transfer" in json.dumps(decoded_transaction["msg_types"])) else 0
            for msg in decoded_transaction["body"].get("messages", []):
                address_hits = self.extract_gonka_addresses(msg)
                for role, address in address_hits:
                    participants.append({
                        "height": height,
                        "transaction_hash": transaction_hash,
                        "address": address,
                        "role": role,
                        "is_transfer": is_transfer,
                    })
                
        result = block_results.get("result", {})
        txs_results = result.get("txs_results", []) or []

        for idx, tx_result in enumerate(txs_results):
            tx_hash = transaction_index_hash_map.get(idx)
            if not tx_hash:
                return {"height": height, "ok": False, "error": "missing tx_hash"}

            transaction_results.append({
                "transaction_hash": tx_hash,
                "height": height,
                "code": tx_result.get("code"),
                "codespace": tx_result.get("codespace"),
                "data": tx_result.get("data"),
                "gas_wanted": tx_result.get("gas_wanted"),
                "gas_used": tx_result.get("gas_used"),
                "info": tx_result.get("info"),
                "log": tx_result.get("log"),
            })
            for event in tx_result.get("events", []) or []:
                event_type = event.get("type")
                for attribute in event.get("attributes", []) or []:
                    transaction_events.append({
                        "height": height,
                        "transaction_hash": tx_hash,
                        "type": event_type,
                        "key": attribute.get("key"),
                        "value": attribute.get("value"),
                        "indexed": attribute.get("indexed"),
                    })        
        finalize_events = result.get("finalize_block_events", []) or []
        transfers = self._parse_finalize_transfers(height, finalize_events)

        tx_code_map = {}
        for tr_result in transaction_results:
            tx_code_map[tr_result["transaction_hash"]] = tr_result.get("code", 0)

        for tx in transactions:
            tx_hash = tx["hash"]
            code = tx_code_map.get(tx_hash, 0)
            status = "success" if code == 0 else "failed"
            messages = tx["body"].get("messages", [])
            for msg in messages:
                transfers.extend(self._extract_transfer_records(msg, height, tx_hash, status))

        return {
            "height": height,
            "block": [block],
            "block_result": [result],
            "commit_signatures": commit_signatures,
            "transactions": transactions,
            "participants": participants,
            "tx_results": transaction_results,
            "tx_events": transaction_events,
            "transfers": transfers,
        }
    
    async def safe_fetch(self, height):
        try:
            result = await self.fetch_block_data(height)

            if not result["block_result"][0].get("height"):
                return {"ok": False, "height": height, "reason": "no_results"}

            return {"ok": True, **result}
        except Exception as e:
            return {"ok": False, "height": height, "error": str(e)}

    async def fetch_and_cache_blocks(self):
        max_blocks = 20
        latest_db_height = await self.cache_db.get_latest_block_height()
        current_height = await self.client.get_latest_height()

        if latest_db_height == 0:
            start_height = 1
        else:
            start_height = latest_db_height + 1

        if start_height > current_height:
            return
        
        end_height = min(current_height + 1, start_height + max_blocks - 1)
        logger.info(f"[Cache blocks] Syncing blocks from {start_height} to {end_height} (chain_height={current_height})")

        blocks_batch = []
        commit_signatures_batch = []
        transactions_batch = []
        participants_batch = []
        block_results_batch = []
        transaction_results_batch = []
        transaction_events_batch = []
        transfers_batch = []

        fetch_results = await asyncio.gather(
            *[self.safe_fetch(h) for h in range(start_height, end_height)]
        )

        commit_upto = None
        for work_result in fetch_results:
            if work_result["ok"]:
                commit_upto = work_result["height"]
            else:
                logger.info(f"[Cache blocks] work_result: {work_result}")
                break

        if commit_upto is None:
            logger.error("[Cache blocks] No contiguous block data to commit, skip")
            return

        to_commits = [r for r in fetch_results if r["ok"] and r["height"] <= commit_upto]
        for work_result in to_commits:
            blocks_batch.extend(work_result["block"])
            commit_signatures_batch.extend(work_result["commit_signatures"])
            transactions_batch.extend(work_result["transactions"])
            participants_batch.extend(work_result["participants"])
            block_results_batch.extend(work_result["block_result"])
            transaction_results_batch.extend(work_result["tx_results"])
            transaction_events_batch.extend(work_result["tx_events"])
            transfers_batch.extend(work_result.get("transfers", []))

        try:
            logger.info(
                f"[Cache blocks] Block batch saved: blocks={len(blocks_batch)}, "
                f"signatures={len(commit_signatures_batch)}, "
                f"transactions={len(transactions_batch)}, "
                f"participants={len(participants_batch)}, "
                f"block_results={len(block_results_batch)}, "
                f"transaction_results={len(transaction_results_batch)}, "
                f"transaction_events={len(transaction_events_batch)}, "
                f"transfers={len(transfers_batch)}, "
            )
            await self.cache_db.save_block_full_batch(
                blocks_batch,
                commit_signatures_batch,
                transactions_batch,
                participants_batch,
                block_results_batch,
                transaction_results_batch,
                transaction_events_batch,
                transfers_batch,
            )
            logger.info(f"[Cache blocks] Batch block data saved successfully, to {commit_upto} count: {len(to_commits)}")
        except Exception as e:
            logger.error(f"[Cache blocks] Batch failed and rolled back: {e}")
            raise e
    
    async def get_transactions(self, limit: int = 100) -> TransactionResponse:
        try:
            if self.current_epoch_id is None:
                latest_info = await self.client.get_latest_epoch()
                self.current_epoch_id = latest_info["latest_epoch"]["index"]
            epoch_id = self.current_epoch_id

            transaction_rows = await self.cache_db.get_latest_transactions(limit=limit)
            latest_height = transaction_rows[0]["height"] if transaction_rows else 0
            transactions = []
            if transaction_rows:
                for tx in transaction_rows:
                    transactions.append(
                        Transaction(
                            height=tx["height"],
                            tx_hash=tx["tx_hash"],
                            messages=json.loads(tx["messages"]),
                            timestamp=tx["timestamp"]
                        )
                    )

            return TransactionResponse(
                epoch_id=epoch_id,
                height=latest_height,
                transactions=transactions
            )

        except Exception as e:
            raise Exception(f"Failed to fetch transactions: {e}")
    
    async def get_transaction(self, tx_hash: str):
        try:
            tx_hash = tx_hash.lower()
            tx_row = await self.cache_db.get_transaction_by_hash(tx_hash)
            if not tx_row:
                return None

            tx_result = await self.cache_db.get_transaction_result_by_hash(tx_hash)
            tx_events = await self.cache_db.get_transaction_events_by_hash(tx_hash)

            events = []
            current_event = None
            for ev in tx_events:
                if current_event is None or current_event["type"] != ev["type"]:
                    current_event = {"type": ev["type"], "attributes": []}
                    events.append(current_event)
                current_event["attributes"].append({
                    "key": ev["key"],
                    "value": ev["value"],
                    "index": ev["indexed"],
                })

            result = {
                "height": str(tx_row["height"]),
                "txhash": tx_row["hash"],
                "timestamp": tx_row["timestamp"],
                "tx": {
                    "body": {
                        "messages": json.loads(tx_row["messages_json"]) if tx_row["messages_json"] else [],
                        "memo": tx_row["memo"],
                    },
                    "auth_info": {
                        "signer_infos": json.loads(tx_row["signer_infos_json"]) if tx_row["signer_infos_json"] else [],
                        "fee": {
                            "amount": json.loads(tx_row["fee_amount_json"]) if tx_row["fee_amount_json"] else [],
                            "gas_limit": tx_row["gas_limit"],
                            "payer": tx_row["payer"],
                            "granter": tx_row["granter"],
                        },
                    },
                    "signatures": json.loads(tx_row["signatures"]) if tx_row["signatures"] else [],
                },
                "events": events,
            }

            if tx_result:
                result["code"] = tx_result["code"]
                result["codespace"] = tx_result["codespace"]
                result["data"] = tx_result["data"]
                result["gas_wanted"] = tx_result["gas_wanted"]
                result["gas_used"] = tx_result["gas_used"]
                result["info"] = tx_result["info"]
                result["raw_log"] = tx_result["log"]

            return result
        except Exception as e:
            raise Exception(f"Failed to fetch transaction: {e}")
    
    async def get_recent_block_stats(self, limit: int = 100) -> BlockStatsResponse:
        blocks = await self.cache_db.get_recent_block_stats(limit)

        if not blocks:
            return BlockStatsResponse(blocks=[])

        return BlockStatsResponse(
            blocks = [
                BlockStats(
                    height=row["height"],
                    tx_count=row["tx_count"],
                    timestamp=row["timestamp"],
                )
                for row in blocks
            ]
        )

    async def get_block_detail(self, height: str):
        try:
            block_row = await self.cache_db.get_block_by_height(int(height))
            if not block_row:
                return None

            signatures = await self.cache_db.get_block_commit_signatures(int(height))
            block_result = await self.cache_db.get_block_result(int(height))
            tx_rows = await self.cache_db.get_transactions_by_height(int(height))
            tx_results = await self.cache_db.get_transaction_results_by_height(int(height))
            tx_events = await self.cache_db.get_transaction_events_by_height(int(height))

            tx_result_map = {r["transaction_hash"]: r for r in tx_results}
            tx_events_map = {}
            for ev in tx_events:
                tx_events_map.setdefault(ev["transaction_hash"], []).append(ev)

            decoded_txs = []
            txs_results = []
            for tx in tx_rows:
                decoded_txs.append({
                    "hash": tx["hash"],
                    "body": {
                        "messages": json.loads(tx["messages_json"]) if tx["messages_json"] else [],
                        "memo": tx["memo"],
                    },
                    "auth_info": {
                        "signer_infos": json.loads(tx["signer_infos_json"]) if tx["signer_infos_json"] else [],
                        "fee": {
                            "amount": json.loads(tx["fee_amount_json"]) if tx["fee_amount_json"] else [],
                            "gas_limit": tx["gas_limit"],
                            "payer": tx["payer"],
                            "granter": tx["granter"],
                        },
                    },
                    "signatures": json.loads(tx["signatures"]) if tx["signatures"] else [],
                    "msg_types": json.loads(tx["msg_types"]) if tx["msg_types"] else [],
                })

                tx_res = tx_result_map.get(tx["hash"])
                if tx_res:
                    txs_results.append({
                        "code": tx_res["code"],
                        "codespace": tx_res["codespace"],
                        "gas_wanted": tx_res["gas_wanted"],
                        "gas_used": tx_res["gas_used"],
                        "log": tx_res["log"],
                        "data": tx_res["data"],
                        "info": tx_res["info"],
                    })
                else:
                    txs_results.append(None)

            block = {
                "header": {
                    "height": str(block_row["height"]),
                    "chain_id": block_row["chain_id"],
                    "time": block_row["time"],
                    "last_commit_hash": block_row["last_commit_hash"],
                    "data_hash": block_row["data_hash"],
                    "validators_hash": block_row["validators_hash"],
                    "next_validators_hash": block_row["next_validators_hash"],
                    "consensus_hash": block_row["consensus_hash"],
                    "app_hash": block_row["app_hash"],
                    "last_results_hash": block_row["last_results_hash"],
                    "evidence_hash": block_row["evidence_hash"],
                    "proposer_address": block_row["proposer_address"],
                    "last_block_id": {
                        "hash": block_row["last_block_id_hash"],
                        "parts": {
                            "total": block_row["last_block_id_parts_total"],
                            "hash": block_row["last_block_id_parts_hash"],
                        },
                    },
                },
                "data": {
                    "txs": decoded_txs,
                },
                "result": {
                    "txs_results": txs_results,
                },
                "evidence": {
                    "evidence": json.loads(block_row["evidence_json"]) if block_row["evidence_json"] else [],
                },
                "last_commit": {
                    "height": str(block_row["last_commit_height"]),
                    "round": block_row["last_commit_round"],
                    "signatures": [
                        {
                            "block_id_flag": sig["block_id_flag"],
                            "validator_address": sig["validator_address"],
                            "timestamp": sig["timestamp"],
                            "signature": sig["signature"],
                        }
                        for sig in signatures
                    ],
                },
            }

            return block
        except Exception as e:
            raise Exception(f"Failed to fetch block: {e}")
    
    def _fetch_geo(self, ip:str) -> Optional[Dict[str, Any]]:
        reader = geoip2.database.Reader('/data/GeoLite2-City.mmdb')
        try:
            r = reader.city(ip)
            region = r.subdivisions.most_specific
            geo = {
                "country": r.country.name,
                "country_code": r.country.iso_code,
                "region": region.name if region else None,
                "region_code": region.iso_code if region else None,
                "city": r.city.name,
                "latitude": r.location.latitude,
                "longitude": r.location.longitude,
            }
            if not geo["country"]:
                return None
            return geo
        except AddressNotFoundError:
            logger.warning(f"GeoIP not found in database, skip ip={ip}")
            return None
        except ValueError as e:
            logger.warning(f"Invalid IP for GeoIP lookup ({ip}): {e}")
            return None
        except Exception:
            logger.exception(f"Unexpected error resolving GeoIP for ip={ip}")
            return None
        
    async def sync_participant_geo_cache(self, active_participants: list[dict]):
        current_nodes: dict[str, dict] = {}
        for p in active_participants:
            participant_index = p.get("index")
            inference_url = p.get("inference_url")
            parsed = urlparse(inference_url)
            host = parsed.hostname
            try:
                ip = ipaddress.ip_address(host)
            except ValueError:
                logger.debug(f"IP is not IPv4Address")
                continue
            current_nodes[participant_index] = {
                "ip": str(ip),
                "inference_url": inference_url,
            }
        logger.info(f"Sync ip geo cache {len(current_nodes)}")

        cached_rows = await self.cache_db.get_all_participant_node_geo()
        cached_map = {r["participant_index"]: r for r in cached_rows}

        active_ids = set(current_nodes.keys())
        await self.cache_db.delete_participant_node_geo_except(list(active_ids))

        for participant_index, node in current_nodes.items():
            ip = node["ip"]
            inference_url = node["inference_url"]

            cached = cached_map.get(participant_index)
            need_refresh = False

            if not cached:
                need_refresh = True
            elif cached["ip"] != ip:
                need_refresh = True
            elif cached["country"] is None:
                need_refresh = True
            else:
                cached_time = datetime.fromisoformat(cached["last_updated"])
                if datetime.utcnow() - cached_time >= timedelta(days=7):
                    need_refresh = True

            if need_refresh:
                logger.info(f"{participant_index}, {inference_url}, {ip}")
                geo = self._fetch_geo(ip)
                if geo:
                    await self.cache_db.upsert_participant_node_geo(
                        participant_index=participant_index,
                        inference_url=inference_url,
                        ip=ip,
                        geo=geo
                    )
        logger.info(
            f"IP geo sync done (inference_url based): active_ips={len(active_ids)}"
        )

    async def get_participants_map(self) -> ParticipantMapResponse:
        rows = await self.cache_db.get_all_participant_node_geo()

        participant_nodes = []
        for r in rows:
            participant_nodes.append(ParticipantMapItem(
                index=r["participant_index"],
                inference_url=r["inference_url"],
                ip=r["ip"],
                country_code=r["country_code"],
                country=r.get("country"),
                region=r.get("region"),
                city=r.get("city"),
                latitude=r.get("latitude"),
                longitude=r.get("longitude"),
                last_updated=r["last_updated"],
            ))

        return ParticipantMapResponse(
            total_participant=len(participant_nodes),
            participants=participant_nodes,
        )

    async def get_address_assets(self, address: str) -> AssetsResponse:
        try:
            balances_data = await self.client.get_balances(address)
            balances = balances_data.get("balances", [])
            total_vesting = []
            epoch_amounts = []
            total_rewarded = 0

            try:
                rewards_data = await self.cache_db.get_all_rewards_for_participant(address)
                vesting_schedule_data = await self.client.get_vesting_schedule(address)
                vesting_schedule = vesting_schedule_data.get("vesting_schedule")
                if vesting_schedule:
                    epoch_amounts = vesting_schedule.get("epoch_amounts", [])
                    total_vesting_amount = 0
                    for epoch_entry in epoch_amounts:
                        coins = epoch_entry.get("coins", [])
                        for coin in coins:
                            if coin.get("denom") == "ngonka":
                                total_vesting_amount += int(coin.get("amount", 0))
                    if total_vesting_amount > 0:
                        total_vesting.append(
                            {
                                "amount": str(total_vesting_amount),
                                "denom": "ngonka"
                            }
                        )
                for reward_data in rewards_data:
                    rewarded_coins = int(reward_data.get("rewarded_coins", "0"))
                    total_rewarded += rewarded_coins
            except Exception:
                pass

            return AssetsResponse(
                address=address,
                balances=balances,
                total_vesting=total_vesting,
                epoch_amounts=epoch_amounts,
                total_rewarded={
                    "amount": str(total_rewarded),
                    "denom": "ngonka"
                }
            )

        except Exception as e:
            logger.error(
                f"Failed to fetch participant assets for {address}: {e}",
                exc_info=True
            )
            return AssetsResponse(
                address=address,
                balances=[],
                total_vesting=[],
                epoch_amounts=[]
            )

    async def get_transaction_by_address(self, address: str, limit: int = 20, offset: int = 0) -> AddressTransactionsResponse:
        total = await self.cache_db.get_transactions_by_address_count(address)
        tx_rows = await self.cache_db.get_transactions_by_address(address, limit=limit, offset=offset)

        transactions = []
        for tx in tx_rows:
            transactions.append(
                Transaction(
                    tx_hash=tx["tx_hash"],
                    height=tx["height"],
                    messages=json.loads(tx["messages"]) if tx["messages"] else [],
                    timestamp=tx["timestamp"],
                    status="success" if tx.get("code", 0) == 0 else "failed",
                )
            )

        return AddressTransactionsResponse(
            address=address,
            total=total,
            transactions=transactions,
        )
    
    @staticmethod
    def _extract_msg_types(messages: list) -> list:
        msg_types = []
        for msg in messages:
            at_type = msg.get("@type", "")
            type_name = at_type.split(".")[-1].replace("Msg", "")
            if "MsgExec" in at_type:
                inner_types = []
                for inner_msg in msg.get("msgs", []):
                    inner_type = inner_msg.get("@type", "").split(".")[-1].replace("Msg", "")
                    if inner_type:
                        inner_types.append(inner_type)
                if inner_types:
                    from collections import Counter
                    counts = Counter(inner_types)
                    parts = []
                    for t, c in counts.items():
                        parts.append(f"{t}×{c}" if c > 1 else t)
                    msg_types.append(f"{type_name} > {', '.join(parts)}")
                else:
                    msg_types.append(type_name)
            else:
                msg_types.append(type_name)
        return msg_types

    async def get_transfer_types_by_address(self, address: str) -> list:
        return await self.cache_db.get_transfer_types_by_address(address)

    async def get_transfer_transactions_by_address(
        self, address: str, limit: int = 20, offset: int = 0,
        msg_type: str = None, time_from: str = None, time_to: str = None,
    ) -> AddressTransfersResponse:
        rows, total = await self.cache_db.get_transfers_by_address(
            address, limit=limit, offset=offset,
            msg_type=msg_type, time_from=time_from, time_to=time_to,
        )

        transfers = [
            TransferTransaction(
                tx_hash=row["tx_hash"],
                height=row["height"],
                msg_type=row["msg_type"],
                from_address=row["sender"],
                to_address=row["recipient"],
                amount=[BalanceInfo(amount=c["amount"], denom=c["denom"]) for c in json.loads(row["amount_json"])],
                status=row["status"],
                timestamp=row.get("timestamp"),
            )
            for row in rows
        ]

        return AddressTransfersResponse(
            address=address,
            total=total,
            transfers=transfers,
        )

    async def get_model_epoch_series(self) -> ModelEpochSeriesResponse:
        models_set = set()

        series = {
            "total_weight": defaultdict(list),
            "hosts": defaultdict(list),
            "inferences": defaultdict(list),
            "ai_tokens": defaultdict(list),
        }
        cache_models = await self.cache_db.get_all_models()
        cached_api_data = await self.cache_db.get_all_models_api_cache()

        for cache_model in cache_models:
            model_id = cache_model["model_id"]
            epoch_id = cache_model["epoch_id"]
            models_set.add(model_id)
            series["total_weight"][model_id].append(EpochSeriesPoint(epoch_id=epoch_id, value=cache_model["total_weight"]))
            series["hosts"][model_id].append(EpochSeriesPoint(epoch_id=epoch_id,value=cache_model["participant_count"]))

        for row in cached_api_data:
            epoch_id = row["epoch_id"]
            models_stats_data = json.loads(row["models_stats_json"])
            stats_list = models_stats_data.get("stats_models", [])
            for stat in stats_list:
                model_id = stat.get("model", "")
                ai_tokens=stat.get("ai_tokens", "0")
                inferences=stat.get("inferences", 0)
                series["inferences"][model_id].append(EpochSeriesPoint(epoch_id=epoch_id,value=int(inferences)))
                series["ai_tokens"][model_id].append(EpochSeriesPoint(epoch_id=epoch_id,value=int(ai_tokens)))

        return ModelEpochSeriesResponse(
            models=sorted(models_set),
            series={
                "total_weight": dict(series["total_weight"]),
                "hosts": dict(series["hosts"]),
                "inferences": dict(series["inferences"]),
                "ai_tokens": dict(series["ai_tokens"]),
            }
        )
    
    async def get_model_token_usage(self, model: str) -> ModelEpochTokenUsageResponse:
        token_usage_data = await self.cache_db.get_model_token_usage_all_epochs(model)

        data = [
            ModelEpochTokenUsageItem(
                epoch=token_usage["epoch_id"],
                prompt_token=token_usage["total_prompt_tokens"],
                completion_token=token_usage["total_completion_tokens"],
                inference_count=token_usage["inference_count"],
            )
            for token_usage in token_usage_data
        ]

        return ModelEpochTokenUsageResponse(model=model,data=data)

    async def get_current_hardware(self) -> HardwaresResponse:
        if self.current_epoch_id is None:
            try:
                latest_info = await self.client.get_latest_epoch()
                epoch_id = latest_info["latest_epoch"]["index"]
                self.current_epoch_id = epoch_id
            except Exception as e:
                logger.error(f"Failed to get current epoch ID: {e}")
                raise
        else:
            epoch_id = self.current_epoch_id

        cache_hardware_all = await self.cache_db.get_hardware_aggregate(epoch_id)
        cache_hardware_model = await self.cache_db.get_hardware_models(epoch_id)
        all_total_weight = 0
        hardware_items = []

        models_map = {}
        for row in cache_hardware_model:
            hardware = row["hardware"]
            model = row["model"]
            models_map.setdefault(hardware, set()).add(model)

        for cache_hardware in cache_hardware_all:
            hardware = cache_hardware["hardware"]
            all_total_weight += int(cache_hardware["total_weight"])
            models = models_map.get(hardware, []) 
            hardware_items.append(
                HardwareStats(
                    id=hardware,
                    amount=int(cache_hardware["amount"]),
                    total_weight=int(cache_hardware["total_weight"]),
                    models=models
                )
            )

        return HardwaresResponse(
            epoch_id=epoch_id,
            is_current=True,
            total_weight=all_total_weight,
            hardware=hardware_items,
        )

    async def get_historical_hardware(self, epoch_id: int, height: Optional[int] = None) -> HardwaresResponse:
        cache_hardware_all = await self.cache_db.get_hardware_aggregate(epoch_id)
        cache_hardware_model = await self.cache_db.get_hardware_models(epoch_id)
        all_total_weight = 0
        hardware_items = []

        models_map = {}
        for row in cache_hardware_model:
            hardware = row["hardware"]
            model = row["model"]
            models_map.setdefault(hardware, set()).add(model)

        for cache_hardware in cache_hardware_all:
            hardware = cache_hardware["hardware"]
            all_total_weight += int(cache_hardware["total_weight"])
            models = models_map.get(hardware, []) 
            hardware_items.append(
                HardwareStats(
                    id=hardware,
                    amount=int(cache_hardware["amount"]),
                    total_weight=int(cache_hardware["total_weight"]),
                    models=models
                )
            )

        return HardwaresResponse(
            epoch_id=epoch_id,
            is_current=False,
            total_weight=all_total_weight,
            hardware=hardware_items,
        )

    async def get_hardware_details(self, hardware: str, epoch_id: int) -> HardwareDetailsResponse:
        rows = await self.cache_db.get_hardware_nodes_by_epoch(epoch_id, hardware)
        ml_nodes: list[MLNodeInfo] = []
        amount = 0
        total_weight = 0
        particiaptes = defaultdict(int)

        for r in rows:
            hardware_list = json.loads(r["hardware_json"] or "[]")

            for hw in hardware_list:
                if hw.get("type") != hardware:
                    continue

                count = int(hw.get("count", 0))
                amount += count
                total_weight += int(r.get("poc_weight") or 0)
                particiaptes[r["participant_id"]] += count

                ml_nodes.append(
                    MLNodeInfo(
                        local_id=r["local_id"],
                        status=r.get("status", ""),
                        models=json.loads(r.get("models_json") or "[]"),
                        hardware=[
                            HardwareInfo(type=hardware, count=count)
                        ],
                        host=r.get("host", ""),
                        port=r.get("port", ""),
                        poc_weight=r.get("poc_weight"),
                    )
                )
    
        particiaptes_list = [
            HardwareParticiapteCount(
                particiapte_id=pid,
                count=count
            ) for pid, count in particiaptes.items()
        ]

        return HardwareDetailsResponse(
            hardware=hardware,
            epoch_id=epoch_id,
            amount=amount,
            total_weight=total_weight,
            particiaptes=particiaptes_list,
            ml_nodes=ml_nodes,
        )

    async def get_hardware_metrics(self) -> HardwareEpochSeriesResponse:
        hardware_set = set()
        series = {
            "amount": defaultdict(list),
            "total_weight": defaultdict(list),
        }

        cache_hardware_all = await self.cache_db.get_hardware_metrics()

        for cache_hardware in cache_hardware_all:
            hardware = cache_hardware["hardware"]
            epoch_id = cache_hardware["epoch_id"]
            hardware_set.add(hardware)
            series["amount"][hardware].append(EpochSeriesPoint(epoch_id=epoch_id, value=cache_hardware["amount"]))
            series["total_weight"][hardware].append(EpochSeriesPoint(epoch_id=epoch_id, value=cache_hardware["total_weight"]))

        return HardwareEpochSeriesResponse(
            hardware=sorted(hardware_set),
            series={
                "amount": dict(series["amount"]),
                "total_weight": dict(series["total_weight"])
            }
        )

    async def get_participant_status(self, participant_index: str, epoch_id: int | None = None) -> bool:
        if epoch_id is None:
            if self.current_epoch_id is None:
                latest_info = await self.client.get_latest_epoch()
                self.current_epoch_id = latest_info["latest_epoch"]["index"]
            epoch_id = self.current_epoch_id
        exists = await self.cache_db.has_participant_in_epoch(epoch_id, participant_index)
        return {
            "participant_id": participant_index,
            "epoch_id": epoch_id,
            "is_participant": exists,
        }
    
    def build_params_module_index(self, app_state: dict) -> dict:
        index = {}
        for module, data in app_state.items():
            if not isinstance(data, dict) or not data: continue
            params = data.get("params")
            if isinstance(params, dict):
                for k in params.keys():
                    index[k] = module
        return index
    
    def merge_params(self, old_params: dict, new_params: dict) -> dict:
        result = copy.deepcopy(old_params)
        for k, v in new_params.items():
            if isinstance(v, dict) and isinstance(result.get(k), dict):
                result[k] = self.merge_params(result[k], v)
            else:
                result[k] = v
        return result

    def diff_params(self, old_params: dict, new_params: dict, prefix: str = None) -> List[Dict[str, Any]]:
        diffs: List[Dict[str, Any]] = []
        keys = set(old_params.keys()) | set(new_params.keys())

        for key in sorted(keys):
            path = f"{prefix}.{key}" if prefix else key
            old_val = old_params.get(key)
            new_val = new_params.get(key)
            if isinstance(old_val, dict) and isinstance(new_val, dict):
                diffs.extend(self.diff_params(old_val, new_val, path))
                continue

            if old_val != new_val:
                diffs.append({
                    "path": path,
                    "old": old_val,
                    "new": new_val
                })
        return diffs
    
    async def resolve_module_from_msg(self, msg: dict, height: int) -> str:
        if self.params_module_index is None:
            genesis = await self.client.get_genesis()
            app_state = genesis["result"]["genesis"]["app_state"]
            self.params_module_index = self.build_params_module_index(app_state)

        params = msg.get("params")
        if not isinstance(params, dict) or not params:
            raise RuntimeError("MsgUpdateParams.params is empty")

        modules = set()
        for key in params.keys():
            module = self.params_module_index.get(key)
            if module:
                modules.add(module)

        if not modules:
            raise RuntimeError(f"Cannot resolve module for MsgUpdateParams keys={list(params.keys())}")
        if len(modules) != 1:
            raise RuntimeError(f"Ambiguous MsgUpdateParams keys={list(params.keys())}, modules={modules}")
        
        return modules.pop()
    
    async def enrich_proposal_detail(self, proposal):
        proposal_id = proposal["id"]
        max_retry = 5
        attempt = 0
        txs = await self.client.get_proposal_transactions(proposal_id)
        while attempt < max_retry:
            attempt += 1
            txs = await self.client.get_proposal_transactions(proposal_id)
            total_vote_txs = txs["vote"]["total"]
            total_submit_txs = txs["submit"]["total"]
            total_deposit_txs = txs["deposit"]["total"]

            if total_vote_txs > 0 and total_submit_txs > 0 and total_deposit_txs > 0:
                break

            logger.info(
                f"Proposal id={proposal_id} has zero tx totals "
                f"(submit={total_submit_txs}, deposit={total_deposit_txs}, vote={total_vote_txs}) "
                f"on attempt {attempt}/{max_retry}, retrying..."
            )
            self.client._rotate_url()

        if total_vote_txs == 0 or total_submit_txs == 0 or total_deposit_txs == 0:
            raise RuntimeError(
                f"Failed to get non-zero tx totals for proposal id={proposal_id} after {max_retry} attempts: "
                f"submit={total_submit_txs}, deposit={total_deposit_txs}, vote={total_vote_txs}"
            )

        vote_txs = txs["vote"]["txs"]
        submit_txs = txs["submit"]["txs"]
        total_vote_txs = txs["vote"]["total"]
        total_submit_txs = txs["submit"]["total"]
        total_deposit_txs = txs["deposit"]["total"]

        submit_time = proposal["submit_time"]
        voting_start_time = proposal["voting_start_time"]
        if submit_time == voting_start_time:
            submit_height = int(submit_txs[0]["height"]) if submit_txs else None
            if submit_height:
                voting_start_height = submit_height
        # else:
        #     voting_start_height = await self.cache_db.get_height_by_time(voting_start_time)

        epoch_id = await self.cache_db.get_epoch_by_height(voting_start_height)
        if not epoch_id:
            if self.current_epoch_id: 
                epoch_id = self.current_epoch_id
            else:
                latest_info = await self.client.get_latest_epoch()
                epoch_id = latest_info["latest_epoch"]["index"]
        logger.info(f"{proposal_id} epoch_id {epoch_id} {voting_start_height}")
        
        epoch_data =  await self.client.get_epoch_group_data(epoch_id)
        total_participants = set()
        for validation  in epoch_data["epoch_group_data"]["validation_weights"]:
            total_participants.add(validation["member_address"])

        voting_end_time = proposal.get("voting_end_time")
        voting_end_height = await self.cache_db.get_height_by_time(voting_end_time) if voting_end_time else None

        try:
            validators = await self.client.get_all_validators(voting_end_height)
        except Exception as e:
            logger.warning(f"get_all_validators failed at height={voting_end_height}, use empty list. error={e}")
            validators = []
        bonded = [v for v in validators if v["status"] == "BOND_STATUS_BONDED"]
        total_weight = sum(int(v["tokens"]) for v in bonded) if bonded else 0
        voted_weight = sum([int(x) for x in proposal["final_tally_result"].values()])

        voters = set()
        for tx in vote_txs:
            for msg in tx["tx"]["body"]["messages"]:
                voter = msg.get("voter")
                if voter: voters.add(voter)

        result = {
            **proposal,
            "epoch_id": epoch_id,
            "voting_start_height": voting_start_height,
            "total_weight": total_weight,
            "voted_weight": voted_weight,
            "total_voters": len(voters),
            "total_participants": len(total_participants),
            "total_vote_txs": total_vote_txs,
            "total_submit_txs": total_submit_txs,
            "total_deposit_txs": total_deposit_txs
        }
        return result
    
    async def fetch_and_cache_proposal(self):
        voting_list = await self.client.get_proposals(status_code=2)
        voting_proposal = []
        if voting_list:
            logger.info(f"Found {len(voting_list)} active voting proposals from chain, caching...")
            tallying_data = await self.client.get_tallying()
            for proposal in voting_list:
                proposal_id = proposal["id"]
                voting_proposal.append(int(proposal_id))
                proposal["code"] = 2
                proposal["tally_params"] = tallying_data["tally_params"]
                tally = await self.client.get_proposal_tally(int(proposal_id))
                proposal["final_tally_result"] = tally["tally"]
                enriched = await self.enrich_proposal_detail(proposal)
                await self.cache_db.save_proposal(enriched)
                logger.info(f"Cached active voting proposal id={proposal_id}")

        db_voting = await self.cache_db.get_proposals_by_code(2)
        if not db_voting:
            logger.info("No voting proposals found in DB.")
            return
        tallying_data = await self.client.get_tallying()
        for proposal in db_voting:
            proposal_id = int(proposal["id"])
            if proposal_id in voting_proposal:
                continue
            raw = await self.client.get_proposal(proposal_id)
            final_proposal = raw["proposal"]
            status = final_proposal.get("status")
            if status == "PROPOSAL_STATUS_VOTING_PERIOD":
                logger.info(f"Proposal id={proposal_id} is still in voting period, skipping final update.")
                continue
            
            final_proposal["tally_params"] = tallying_data["tally_params"]
            enriched = await self.enrich_proposal_detail(final_proposal)
            if status == "PROPOSAL_STATUS_PASSED":
                enriched["code"] = 3
            elif status == "PROPOSAL_STATUS_REJECTED":
                enriched["code"] = 4
            else:
                enriched["code"] = 0
            await self.cache_db.save_proposal(enriched)
            logger.info(f"Proposal id={proposal_id} finalized with status={status}")
            if enriched["code"] == 3:
                msgs = [msg for msg in proposal.get("messages", []) if msg.get("@type", "").endswith("MsgUpdateParams")]
                if not msgs: continue
                height = enriched["voting_start_height"]
                for msg in msgs:
                    module = await self.resolve_module_from_msg(msg, height)
                    old_params = await self.cache_db.get_latest_params_snapshot(module=module, height=height)
                    if old_params is None:
                        raise RuntimeError(f"No base params for module={module}")

                    new_params = self.merge_params(old_params, msg["params"])
                    await self.cache_db.save_params_snapshot(
                        height=height, module=module, params=new_params, proposal_id=proposal_id
                    )

    async def get_proposals(self) -> ProposalsResponse:
        status_map = {2: "voting", 3: "passed", 4: "rejected"}
        data = {}
        for code, name in status_map.items():
            proposals = await self.cache_db.get_proposals_by_code(code)
            data[name] = proposals
        return ProposalsResponse(**data)
    
    async def get_proposal(self, proposal_id: int) -> ProposalDetailResponse:
        proposal_detail = await self.cache_db.get_proposal(proposal_id)
        diff_params = []
        if proposal_detail["code"] == 3:
            height = proposal_detail["voting_start_height"]
            for msg in proposal_detail.get("messages", []):
                if msg.get("@type", "").endswith("MsgUpdateParams"):
                    
                    module = await self.resolve_module_from_msg(msg, height)
                    old_params = await self.cache_db.get_latest_params_snapshot(module=module, height=height)
                    if old_params is None:
                        raise RuntimeError(f"No base params for module={module}")

                    diff_params.append({
                        "@type": msg["@type"],
                        "authority": msg["authority"],
                        "diff_params": self.diff_params(old_params, msg["params"])
                    })

        response = ProposalDetailResponse(
            proposal=proposal_detail,
            diff_params=diff_params,
        )
        return response
    
    async def get_proposal_transactions(self, proposal_id: int) -> ProposalTransactions:
        proposal_detail = await self.cache_db.get_proposal(proposal_id)
        epoch_id = proposal_detail["epoch_id"]
        try:
            epoch_data = await self.get_epoch_participants(epoch_id)
            active_participants_list = epoch_data["active_participants"]["participants"]
            participants_weights_map = {
                participant["index"]: participant for participant in active_participants_list
            }
        except:
            cache_epoch_data = await self.cache_db.get_epoch_status_data(epoch_id)
            if cache_epoch_data:
                validation_weights = cache_epoch_data.get("validation_weights", [])
            else:
                epoch_group_data = await self.client.get_epoch_group_data(epoch_id)
                validation_weights = epoch_group_data.get("epoch_group_data", {}).get("validation_weights", [])
            participants_weights_map = {
                vw["member_address"]: vw for vw in validation_weights
            }
        proposal_txs: ProposalTransactions = await self.client.get_proposal_transactions(proposal_id)
        vote_txs = proposal_txs["vote"]["txs"]
        for vote_tx in vote_txs:
            msg = vote_tx["tx"]["body"]["messages"][0]
            msg["weight"] = participants_weights_map.get(msg.get("voter"), {}).get("weight")
        return proposal_txs
    
    async def poll_market_stats(self):
        result = await self.client.fetch_gonka_orderbook()
        if not result["is_success"]:
            raise Exception(result["error_message"])

        orderbook = result["data"]
        asks = orderbook.get("asks", [])
        bids = orderbook.get("bids", [])

        ask_volume_gnk = Decimal(0)
        ask_volume_usd = Decimal(0)
        bid_volume_gnk = Decimal(0)
        bid_volume_usd = Decimal(0)

        for a in asks:
            quote_raw = Decimal(a["order_balance"])
            price_raw = Decimal(a["price"])
            base_amount = quote_raw / BASE_DECIMALS
            quote_amount = (quote_raw * price_raw) / QUOTE_DECIMALS

            ask_volume_gnk += base_amount
            ask_volume_usd += quote_amount

        for b in bids:
            quote_raw = Decimal(b["order_balance"])
            price_raw = Decimal(b["price"])
            base_smallest = quote_raw / price_raw
            base_amount = base_smallest / BASE_DECIMALS
            quote_amount = quote_raw / QUOTE_DECIMALS

            bid_volume_gnk += base_amount
            bid_volume_usd += quote_amount

        best_ask = min((Decimal(a["price"]) for a in asks), default=Decimal(0)) * Decimal("1000")
        best_bid = max((Decimal(b["price"]) for b in bids), default=Decimal(0)) * Decimal("1000")

        if best_ask > 0 and best_bid > 0:
            price = (best_ask + best_bid) / 2
        else:
            price = Decimal(0)

        if price > 0:
            spread_percent = (best_ask - best_bid) / price * 100
        else:
            spread_percent = Decimal(0)
        
        orderbook_stats = {
            "price": float(price),
            "best_ask": float(best_ask),
            "best_bid": float(best_bid),
            "spread_percent": float(spread_percent),
            "ask_volume_gnk": float(ask_volume_gnk),
            "ask_volume_usd": float(ask_volume_usd),
            "ask_orders_count": len(asks),
            "bid_volume_gnk": float(bid_volume_gnk),
            "bid_volume_usd": float(bid_volume_usd),
            "bid_orders_count": len(bids),
            "updated_at": datetime.utcnow()
        }
    
        limit_orders = await self.client.fetch_gonka_limit_orders_stat()

        if not limit_orders["is_success"]:
            raise Exception(limit_orders["error_message"])

        token_stats = limit_orders["data"]
        await self.cache_db.save_market_stats(orderbook_stats, token_stats)
    
    async def get_market_stats(self) -> MarketStats:
        market_stats = await self.cache_db.get_market_stats()
        orderbook_stats = OrderbookStats(
            price=float(market_stats["price"]),
            best_ask=float(market_stats["best_ask"]),
            best_bid=float(market_stats["best_bid"]),
            spread_percent=float(market_stats["spread_percent"]),
            ask_volume_gnk=float(market_stats["ask_volume_gnk"]),
            ask_volume_usd=float(market_stats["ask_volume_usd"]),
            ask_orders_count=market_stats["ask_orders_count"],
            bid_volume_gnk=float(market_stats["bid_volume_gnk"]),
            bid_volume_usd=float(market_stats["bid_volume_usd"]),
            bid_orders_count=market_stats["bid_orders_count"],
            updated_at=market_stats["orderbook_updated_at"]
        )
        token_stats = TokenStats(
            epoch_id=market_stats["epoch_id"],
            total_mining_rewards=market_stats["total_mining_rewards"],
            user_circulating=market_stats["user_circulating"],
            user_unlocked=market_stats["user_unlocked"],
            user_in_vesting=market_stats["user_in_vesting"],
            user_accounts_count=market_stats["user_accounts_count"],
            genesis_total=market_stats["genesis_total"],
            genesis_unlocked=market_stats["genesis_unlocked"],
            genesis_in_vesting=market_stats["genesis_in_vesting"],
            genesis_accounts_count=market_stats["genesis_accounts_count"],
            module_balance=market_stats["module_balance"],
            module_accounts_count=market_stats["module_accounts_count"],
            community_pool=market_stats["community_pool"],
            total_supply=market_stats["total_supply"],
            updated_at=market_stats["token_updated_at"],
        )
        return MarketStats(
            market_stats = orderbook_stats,
            token_stats = token_stats
        )

    async def repair_all_hardware_poc_weight(self):
        """
        Repair poc_weight for ALL epochs / participants / hardware nodes,
        using the same data path as get_participant_details.
        """
        logger.info("Starting full hardware poc_weight repair (participant-details based)")

        epoch_ids = [105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121]
        logger.info(f"Found {len(epoch_ids)} epochs to repair")

        for epoch_id in epoch_ids:
            try:
                if self.current_epoch_id == epoch_id:
                    stats = await self.get_current_epoch_stats()
                else:
                    stats = await self.get_historical_epoch_stats(epoch_id, height=None)
                    cached_stats = await self.cache_db.get_stats(epoch_id)
                if not stats or not stats.participants:
                    continue

                logger.info(f"Repairing epoch {epoch_id} ({len(stats.participants)} participants)")
                total_fixed = 0
                for participant in stats.participants:
                    participant_id = participant.index
                    ml_nodes_map = participant.ml_nodes_map or {}

                    if not ml_nodes_map and cached_stats:
                        for s in cached_stats:
                            if s.get("index") == participant_id:
                                ml_nodes_map = s.get("_ml_nodes_map", {})
                                break

                    if ml_nodes_map:
                        hardware_nodes = await self.cache_db.get_hardware_nodes(epoch_id, participant_id)
                        if not hardware_nodes:
                            continue
                        for node in hardware_nodes:
                            local_id = node.get("local_id")
                            poc_weight = ml_nodes_map.get(local_id)
                            node["poc_weight"] = poc_weight
                            total_fixed += 1
                        await self.cache_db.save_hardware_nodes_batch(epoch_id, participant_id, hardware_nodes)
                logger.info(f"Hardware poc_weight repair completed, total nodes fixed: {total_fixed}")
            except Exception as e:
                logger.error(f"Failed to repair epoch {epoch_id}: {e}")

    async def collect_history_epoch_status(self):
        latest_info = await self.client.get_latest_epoch()
        current_epoch_id = latest_info["latest_epoch"]["index"]
        cache_epoch = await self.cache_db.get_all_epoch_status()
        existing_epoch = {int(r["epoch_id"]): dict(r) for r in cache_epoch}
        logger.info(f"Existing local epoch_status count: {len(existing_epoch)}, current_epoch_id: {current_epoch_id}")

        for epoch_id in range(0, current_epoch_id):
            status = existing_epoch.get(epoch_id)
            if status and status.get("is_finished"): continue
            try:
                data = await self.client.get_epoch_group_data(epoch_id)
                epoch_data = data.get("epoch_group_data", {})
                last_height = int(epoch_data.get("last_block_height", "0"))
                await self.cache_db.mark_epoch_finished(epoch_id, last_height, epoch_data)
                logger.info(f"Epoch {epoch_id} finished at height {last_height}")
            except Exception as e:
                logger.error(f"Failed to fetch epoch_group_data for {epoch_id}: {e}")
    
    async def collect_history_rewards(self):
        latest_info = await self.client.get_latest_epoch()
        current_epoch_id = latest_info["latest_epoch"]["index"]
        logger.info(f"Collecting history rewards for all participants, current epoch: {current_epoch_id}")

        total_saved = 0
        for epoch_id in range(1, current_epoch_id):
            epoch_data = await self.cache_db.get_epoch_status_data(epoch_id)
            if not epoch_data:
                logger.debug(f"Epoch {epoch_id}: no cached epoch_group_data, skipping")
                continue

            participants = [vw["member_address"] for vw in epoch_data.get("validation_weights", [])]
            if not participants:
                continue

            rewards_batch = []
            for participant_id in participants:
                cached = await self.cache_db.get_reward(epoch_id, participant_id)
                if cached:
                    continue

                try:
                    summary = await self.client.get_epoch_performance_summary(
                        epoch_id, participant_id
                    )
                    perf = summary.get("epochPerformanceSummary", {})
                    rewarded_coins = perf.get("rewarded_coins", "0")
                    claimed = perf.get("claimed", False)

                    if int(rewarded_coins) > 0:
                        rewards_batch.append({
                            "epoch_id": epoch_id,
                            "participant_id": participant_id,
                            "rewarded_coins": rewarded_coins,
                            "claimed": claimed,
                        })
                except Exception as e:
                    logger.debug(f"Epoch {epoch_id} participant {participant_id}: failed to fetch rewards: {e}")

            if rewards_batch:
                await self.cache_db.save_reward_batch(rewards_batch)
                total_saved += len(rewards_batch)

            logger.info(f"Epoch {epoch_id}: {len(rewards_batch)} new rewards from {len(participants)} participants")

        logger.info(f"History rewards collection complete: saved {total_saved} reward records")
        
    async def collect_history_proposals(self):
        tallying_data = await self.client.get_tallying()
        if self.params_module_index is None:
            genesis = await self.client.get_genesis()
            app_state = genesis["result"]["genesis"]["app_state"]
            self.params_module_index = self.build_params_module_index(app_state)
            for module, data in app_state.items():
                if not isinstance(data, dict) or not data: continue
                params = data.get("params")
                if not isinstance(params, dict): continue
                await self.cache_db.save_params_snapshot(height=0, module=module, params=params, proposal_id=None)

        for code in [3, 4]:
            proposals = await self.client.get_proposals(status_code=code)
            proposals.sort(key=lambda p: int(p["id"]))

            for proposal in proposals:
                proposal_id = int(proposal["id"])
                proposal["code"] = code
                proposal["tally_params"] = tallying_data["tally_params"]
                
                enriched = await self.enrich_proposal_detail(proposal)
                await self.cache_db.save_proposal(enriched)

                if code == 3:
                    msgs = [ msg for msg in proposal.get("messages", []) if msg.get("@type", "").endswith("MsgUpdateParams")]
                    if not msgs: continue
                    height = enriched["voting_start_height"]
                    for msg in msgs:
                        module = await self.resolve_module_from_msg(msg, height)
                        old_params = await self.cache_db.get_latest_params_snapshot(module=module, height=height)
                        if old_params is None:
                            raise RuntimeError(f"No base params for module={module}")

                        new_params = self.merge_params(old_params, msg["params"])
                        await self.cache_db.save_params_snapshot(
                            height=height, module=module, params=new_params, proposal_id=proposal_id
                        )

        for code in [3, 4]:
            proposals = await self.cache_db.get_proposals_by_code(code)
            for proposal in proposals:
                voting_end_time = proposal.get("voting_end_time")
                voting_end_height = await self.cache_db.get_height_by_time(voting_end_time) if voting_end_time else None
                try:
                    validators = await self.client.get_all_validators(voting_end_height)
                except Exception as e:
                    logger.warning(f"get_all_validators failed for proposal {proposal['id']} at height={voting_end_height}: {e}")
                    continue
                bonded = [v for v in validators if v["status"] == "BOND_STATUS_BONDED"]
                new_total_weight = sum(int(v["tokens"]) for v in bonded) if bonded else 0
                if new_total_weight and new_total_weight != proposal["total_weight"]:
                    logger.info(f"Updating proposal {proposal['id']} total_weight: {proposal['total_weight']} -> {new_total_weight}")
                    proposal["total_weight"] = new_total_weight
                    await self.cache_db.save_proposal(proposal)
    
    async def repair_all_epoch_total_rewards(self):
        """One-time repair: recalculate total rewards for all historical epochs."""
        try:
            latest_info = await self.client.get_latest_epoch()
            current_epoch_id = latest_info["latest_epoch"]["index"]

            logger.info(f"Starting one-time repair of total rewards for epochs 1 to {current_epoch_id - 1}")

            for epoch_id in range(1, current_epoch_id):
                try:
                    logger.info(f"Repairing total rewards for epoch {epoch_id}/{current_epoch_id - 1}")
                    await self._calculate_and_cache_total_rewards(epoch_id)
                except Exception as e:
                    logger.error(f"Error repairing epoch {epoch_id}: {e}")
                    continue

            logger.info("Completed one-time repair of all epoch total rewards")

        except Exception as e:
            logger.error(f"Error during epoch total rewards repair: {e}")