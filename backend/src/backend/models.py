from pydantic import BaseModel, Field, computed_field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime


class CurrentEpochStats(BaseModel):
    inference_count: str
    missed_requests: str
    earned_coins: str
    rewarded_coins: str
    burned_coins: str
    validated_inferences: str
    invalidated_inferences: str

class CollateralStatus(BaseModel):
    potential_weight: int
    effective_weight: int
    collateral_ratio: float
    needed_ngonka: str


class ConfirmationRateEstimate(BaseModel):
    value: float
    source: str
    state: str


class ParticipantStats(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    index: str
    address: str
    weight: int
    validator_key: Optional[str] = None
    inference_url: Optional[str] = None
    status: Optional[str] = None
    models: List[str] = []
    current_epoch_stats: CurrentEpochStats
    is_jailed: Optional[bool] = None
    jailed_until: Optional[str] = None
    ready_to_unjail: Optional[bool] = None
    node_healthy: Optional[bool] = None
    node_health_checked_at: Optional[str] = None
    moniker: Optional[str] = None
    identity: Optional[str] = None
    keybase_username: Optional[str] = None
    keybase_picture_url: Optional[str] = None
    website: Optional[str] = None
    validator_consensus_key: Optional[str] = None
    consensus_key_mismatch: Optional[bool] = None
    seed_signature: Optional[str] = None
    ml_nodes_map: Optional[Dict[str, int]] = None
    weight_to_confirm: Optional[int] = None
    confirmation_weight: Optional[int] = None
    confirmation_poc_ratio: Optional[float] = None
    confirmation_poc_ratio_source: Optional[str] = None
    confirmation_poc_ratio_state: Optional[str] = None
    confirmation_poc_ratio_estimate: Optional[ConfirmationRateEstimate] = None
    participant_status: Optional[str] = None
    collateral_status: Optional[CollateralStatus] = None
    
    @computed_field
    @property
    def missed_rate(self) -> float:
        missed = int(self.current_epoch_stats.missed_requests)
        inferences = int(self.current_epoch_stats.inference_count)
        total = missed + inferences
        
        if total == 0:
            return 0.0
        
        return round(missed / total, 4)
    
    @computed_field
    @property
    def invalidation_rate(self) -> float:
        invalidated = int(self.current_epoch_stats.invalidated_inferences)
        inferences = int(self.current_epoch_stats.inference_count)
        
        if inferences == 0:
            return 0.0
        
        return round(invalidated / inferences, 4)


class HardwareParticipants(BaseModel):
    hardware: str
    participants: List[str]


class InferenceResponse(BaseModel):
    epoch_id: int
    height: int
    participants: List[ParticipantStats]
    hardware: Optional[List[HardwareParticipants]]
    cached_at: Optional[str] = None
    is_current: bool = False
    total_assigned_rewards_gnk: Optional[int] = None
    current_block_height: Optional[int] = None
    current_block_timestamp: Optional[str] = None
    avg_block_time: Optional[float] = None
    next_poc_start_block: Optional[int] = None
    set_new_validators_block: Optional[int] = None


class EpochParticipant(BaseModel):
    index: str
    validator_key: str
    weight: int
    inference_url: str
    models: List[str]


class EpochInfo(BaseModel):
    epoch_group_id: int
    poc_start_block_height: int
    effective_block_height: int
    created_at_block_height: int
    participants: List[EpochParticipant]


class RewardInfo(BaseModel):
    epoch_id: int
    assigned_reward_gnk: int
    claimed: bool


class SeedInfo(BaseModel):
    participant: str
    epoch_index: int
    signature: str


class WarmKeyInfo(BaseModel):
    grantee_address: str
    granted_at: str


class HardwareInfo(BaseModel):
    type: str
    count: int


class MLNodeInfo(BaseModel):
    local_id: str
    status: str
    models: List[str]
    hardware: List[HardwareInfo]
    host: str
    port: str
    poc_weight: Optional[int] = None
    raw_poc_weight: Optional[int] = None
    scaled_weight: Optional[int] = None
    model_id: Optional[str] = None
    weight_scale_factor: Optional[str] = None


class ParticipantDetailsResponse(BaseModel):
    participant: ParticipantStats
    rewards: List[RewardInfo]
    seed: Optional[SeedInfo]
    warm_keys: List[WarmKeyInfo]
    ml_nodes: List[MLNodeInfo]


class LatestEpochInfo(BaseModel):
    block_height: int
    latest_epoch: dict
    phase: str


class BlockInfo(BaseModel):
    height: int
    timestamp: str


class TimelineEvent(BaseModel):
    block_height: int
    description: str
    occurred: bool


class TimelineResponse(BaseModel):
    current_block: BlockInfo
    reference_block: BlockInfo
    avg_block_time: float
    events: List[TimelineEvent]
    current_epoch_start: int
    current_epoch_index: int
    epoch_length: int
    epoch_stages: Optional[Dict[str, Any]] = None
    next_epoch_stages: Optional[Dict[str, Any]] = None


class ModelInfo(BaseModel):
    id: str
    total_weight: int
    participant_count: int
    proposed_by: str
    v_ram: str
    throughput_per_nonce: str
    units_of_compute_per_token: str
    hf_repo: str
    hf_commit: str
    model_args: List[str]
    validation_threshold: dict


class ModelStats(BaseModel):
    model: str
    ai_tokens: str
    inferences: int


class ModelsResponse(BaseModel):
    epoch_id: int
    height: int
    models: List[ModelInfo]
    stats: List[ModelStats]
    cached_at: str
    is_current: bool
    current_block_timestamp: Optional[str] = None
    avg_block_time: Optional[float] = None


class InferenceDetail(BaseModel):
    inference_id: str
    status: str
    start_block_height: str
    start_block_timestamp: str
    validated_by: List[str]
    prompt_hash: Optional[str] = None
    response_hash: Optional[str] = None
    prompt_payload: Optional[str] = None
    response_payload: Optional[str] = None
    prompt_token_count: Optional[str] = None
    completion_token_count: Optional[str] = None
    model: Optional[str] = None


class ParticipantInferencesResponse(BaseModel):
    epoch_id: int
    participant_id: str
    successful: List[InferenceDetail]
    expired: List[InferenceDetail]
    invalidated: List[InferenceDetail]
    cached_at: Optional[str] = None


class BalanceInfo(BaseModel):
    amount: str
    denom: str


class Transaction(BaseModel):
    height: int
    tx_hash: str
    messages: List[str]
    timestamp: Optional[str] = None
    status: Optional[str] = None


class TransactionResponse(BaseModel):
    epoch_id: int
    height: int
    transactions: List[Transaction]

class AddressTransactionsResponse(BaseModel):
    address: str
    total: int
    transactions: List[Transaction]


class TransferTransaction(BaseModel):
    height: int
    tx_hash: str
    msg_type: str
    from_address: str
    to_address: str
    amount: List[BalanceInfo]
    status: str
    timestamp: Optional[str] = None


class AddressTransfersResponse(BaseModel):
    address: str
    total: int
    transfers: List[TransferTransaction]


class ParticipantMapItem(BaseModel):
    index: str
    inference_url: str
    ip: str
    country_code: Optional[str]
    country: Optional[str]
    region: Optional[str]
    city: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    last_updated: str


class ParticipantMapResponse(BaseModel):
    total_participant: int
    participants: List[ParticipantMapItem]


class EpochSchedule(BaseModel):
    coins: List[BalanceInfo]

class AssetsResponse(BaseModel):
    address: str
    balances: List[BalanceInfo]
    total_vesting: List[BalanceInfo]
    epoch_amounts: List[EpochSchedule]
    total_rewarded: BalanceInfo

class EpochSeriesPoint(BaseModel):
    epoch_id: int
    value: int

class ModelSeries(BaseModel):
    total_weight: Dict[str, List[EpochSeriesPoint]]
    hosts: Dict[str, List[EpochSeriesPoint]]
    inferences: Dict[str, List[EpochSeriesPoint]]
    ai_tokens: Dict[str, List[EpochSeriesPoint]]

class ModelEpochSeriesResponse(BaseModel):
    models: List[str]
    series: ModelSeries

class ModelEpochTokenUsageItem(BaseModel):
    epoch: int
    prompt_token: int
    completion_token: int
    inference_count: int

class ModelEpochTokenUsageResponse(BaseModel):
    model: str
    data: List[ModelEpochTokenUsageItem]


class HardwareStats(BaseModel):
    id: str
    amount: int
    total_weight: int
    models: List[str]


class HardwaresResponse(BaseModel):
    epoch_id: int
    is_current: bool
    total_weight: int
    hardware: List[HardwareStats]

class HardwareParticiapteCount(BaseModel):
    particiapte_id: str
    count: int

class HardwareDetailsResponse(BaseModel):
    hardware: str
    epoch_id: int
    amount: int
    total_weight: int
    particiaptes: List[HardwareParticiapteCount]
    ml_nodes: List[MLNodeInfo]

class HardwareSeries(BaseModel):
    amount: Dict[str, List[EpochSeriesPoint]]
    total_weight: Dict[str, List[EpochSeriesPoint]]


class HardwareEpochSeriesResponse(BaseModel):
    hardware: List[str]
    series: HardwareSeries


class BlockStats(BaseModel):
    height: int
    tx_count: int
    timestamp: str


class BlockStatsResponse(BaseModel):
    blocks: List[BlockStats]


class FinalTallyResult(BaseModel):
    yes_count: str
    abstain_count: str
    no_count: str
    no_with_veto_count: str


class TallyParams(BaseModel):
    quorum: str
    threshold: str
    veto_threshold: str


class TotalDeposit(BaseModel):
    denom: str
    amount: str


class ProposalModel(BaseModel):
    id: int
    status: str
    code: int
    metadata: Optional[str]
    title: str
    summary: str
    proposer: str
    expedited: bool
    failed_reason: Optional[str]
    submit_time: str
    deposit_end_time: str
    voting_start_time: str
    voting_end_time: str
    final_tally_result: FinalTallyResult
    tally_params: TallyParams
    epoch_id: int
    voting_start_height: int
    total_weight: int
    voted_weight: int
    total_voters: int
    total_participants: int
    total_vote_txs: int
    total_submit_txs: int
    total_deposit_txs: int
    total_deposit: List[TotalDeposit]
    messages: List[Any]


class ProposalsResponse(BaseModel):
    passed: Optional[List[ProposalModel]] = None
    rejected: Optional[List[ProposalModel]] = None
    voting: Optional[List[ProposalModel]] = None


class ProposalTransaction(BaseModel):
    total: int
    txs: List[Any]


class ProposalTransactions(BaseModel):
    deposit: ProposalTransaction
    submit: ProposalTransaction
    vote: ProposalTransaction


class ProposalDetailResponse(BaseModel):
    proposal: ProposalModel
    diff_params: Optional[List[Any]] = None


class OrderbookStats(BaseModel):
    price: float
    best_ask: float
    best_bid: float
    spread_percent: float
    ask_volume_gnk: float
    ask_volume_usd: float
    ask_orders_count: int
    bid_volume_gnk: float
    bid_volume_usd: float
    bid_orders_count: int
    updated_at: datetime


class TokenStats(BaseModel):
    epoch_id: int
    total_mining_rewards: float
    user_circulating: float
    user_unlocked: float
    user_in_vesting: float
    user_accounts_count: int
    genesis_total: float
    genesis_unlocked: float
    genesis_in_vesting: float
    genesis_accounts_count: int
    module_balance: float
    module_accounts_count: int
    community_pool: float
    total_supply: float
    updated_at: datetime

class MarketStats(BaseModel):
    market_stats : OrderbookStats
    token_stats: TokenStats