pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


contract P2PInsuranceFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error InvalidBatch();
    error InvalidCooldown();
    error ReplayDetected();
    error StateMismatch();
    error InvalidProof();
    error BatchNotClosed();
    error BatchEmpty();
    error InvalidClaimAmount();
    error NotEnoughEvidence();

    struct Claim {
        address claimant;
        euint32 encryptedAmount;
        euint32 encryptedEvidenceScore;
        bool exists;
    }

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    struct Batch {
        uint256 id;
        bool isOpen;
        uint256 claimCount;
        uint256 totalEncryptedAmount; // Sum of encrypted amounts for the batch
        uint256 totalEncryptedEvidenceScore; // Sum of encrypted evidence scores for the batch
        uint256 averageEncryptedEvidenceScore; // Will be encrypted
        bool initialized;
    }

    mapping(uint256 => Batch) public batches;
    mapping(uint256 => mapping(uint256 => Claim)) public batchClaims; // batchId => claimIndex => Claim
    mapping(uint256 => DecryptionContext) public decryptionContexts;
    mapping(address => bool) public isProvider;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    address public owner;
    bool public paused;
    uint256 public cooldownSeconds;
    uint256 public currentBatchId;
    uint256 public constant MIN_CLAIMS_PER_BATCH = 1;
    uint256 public constant MAX_CLAIMS_PER_BATCH = 10;
    uint256 public constant MIN_EVIDENCE_SCORE = 1;
    uint256 public constant MAX_EVIDENCE_SCORE = 100;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownChanged(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId, uint256 claimCount);
    event ClaimSubmitted(address indexed claimant, uint256 indexed batchId, uint256 claimIndex);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 averageEvidenceScore);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier submissionRateLimited() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastSubmissionTime[msg.sender] = block.timestamp;
        _;
    }

    modifier decryptionRateLimited() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true; // Owner is also a provider by default
        emit ProviderAdded(owner);
        cooldownSeconds = 60; // Default cooldown
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function setCooldown(uint256 newCooldownSeconds) external onlyOwner {
        if (newCooldownSeconds == 0) revert InvalidCooldown();
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownChanged(oldCooldown, newCooldown);
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function openBatch() external onlyProvider whenNotPaused {
        currentBatchId++;
        Batch storage batch = batches[currentBatchId];
        batch.id = currentBatchId;
        batch.isOpen = true;
        batch.claimCount = 0;
        batch.totalEncryptedAmount = 0;
        batch.totalEncryptedEvidenceScore = 0;
        // averageEncryptedEvidenceScore will be computed later
        batch.initialized = FHE.isInitialized();
        emit BatchOpened(currentBatchId);
    }

    function submitClaim(
        uint256 batchId,
        uint32 amount,
        uint32 evidenceScore
    ) external whenNotPaused submissionRateLimited {
        if (!_isBatchOpen(batchId)) revert InvalidBatch();
        if (amount == 0) revert InvalidClaimAmount();
        if (evidenceScore < MIN_EVIDENCE_SCORE || evidenceScore > MAX_EVIDENCE_SCORE) revert InvalidClaimAmount();

        Batch storage batch = batches[batchId];
        if (batch.claimCount >= MAX_CLAIMS_PER_BATCH) revert InvalidBatch(); // Batch full

        uint256 claimIndex = batch.claimCount;
        Claim storage newClaim = batchClaims[batchId][claimIndex];
        newClaim.claimant = msg.sender;
        newClaim.encryptedAmount = FHE.asEuint32(amount);
        newClaim.encryptedEvidenceScore = FHE.asEuint32(evidenceScore);
        newClaim.exists = true;

        batch.totalEncryptedAmount = FHE.add(batch.totalEncryptedAmount, newClaim.encryptedAmount);
        batch.totalEncryptedEvidenceScore = FHE.add(batch.totalEncryptedEvidenceScore, newClaim.encryptedEvidenceScore);
        batch.claimCount++;

        emit ClaimSubmitted(msg.sender, batchId, claimIndex);
    }

    function closeBatch(uint256 batchId) external onlyProvider whenNotPaused {
        Batch storage batch = batches[batchId];
        if (!_isBatchOpen(batchId)) revert InvalidBatch();
        if (batch.claimCount < MIN_CLAIMS_PER_BATCH) revert BatchEmpty();

        batch.isOpen = false;
        // Compute average evidence score (still encrypted)
        // average = total_score / claim_count
        // FHE.div is not available, so we'll compute total_score * (1/claim_count) if claim_count is known and small
        // For simplicity, we'll just store totalEncryptedEvidenceScore and claimCount, and compute average later if needed
        // Or, if claimCount is small and known, we can compute 1/claimCount as a fixed-point number and multiply
        // For this example, we'll assume DAO will handle this or we'll decrypt total and count separately.
        // Let's compute average = total_score * (1/claim_count) using FHE.mul
        // This requires 1/claim_count to be a uint32.
        // If claimCount is 0, this would be an issue, but we checked MIN_CLAIMS_PER_BATCH.
        uint32 inverseClaimCount = uint32(1) / uint32(batch.claimCount); // This is integer division, not ideal for FHE
        // A better approach for FHE might be to multiply by a fixed-point representation of 1/claimCount
        // Or, decrypt totalEncryptedEvidenceScore and claimCount separately.
        // For this example, we'll store the total and count, and the DAO can compute the average after decryption.
        // So, we won't compute averageEncryptedEvidenceScore here.

        emit BatchClosed(batchId, batch.claimCount);
    }

    function requestBatchDecryption(uint256 batchId) external onlyProvider whenNotPaused decryptionRateLimited {
        Batch storage batch = batches[batchId];
        if (batch.isOpen) revert BatchNotClosed();
        if (batch.claimCount == 0) revert BatchEmpty();

        // We want to decrypt the average evidence score for the batch
        // We'll decrypt: totalEncryptedEvidenceScore and claimCount (though claimCount is public)
        // But to follow the pattern, let's say we want to decrypt the average.
        // However, FHE division is complex. We'll decrypt totalEncryptedEvidenceScore and then divide by claimCount off-chain.
        // So, we only need to decrypt one value: batch.totalEncryptedEvidenceScore

        // 1. Prepare Ciphertexts
        // We are only decrypting one value: totalEncryptedEvidenceScore
        euint32[] memory ctsToDecrypt = new euint32[](1);
        ctsToDecrypt[0] = batch.totalEncryptedEvidenceScore;

        // 2. Compute State Hash
        bytes32 stateHash = _hashCiphertexts(ctsToDecrypt);

        // 3. Request Decryption
        uint256 requestId = FHE.requestDecryption(ctsToDecrypt, this.myCallback.selector);

        // 4. Store Context
        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        DecryptionContext storage ctx = decryptionContexts[requestId];

        // a. Replay Guard
        if (ctx.processed) revert ReplayDetected();

        // b. State Verification
        // Rebuild cts array from current contract storage in the exact same order as in step 1.
        Batch storage batch = batches[ctx.batchId];
        euint32[] memory currentCts = new euint32[](1);
        currentCts[0] = batch.totalEncryptedEvidenceScore;
        bytes32 currentHash = _hashCiphertexts(currentCts);

        if (currentHash != ctx.stateHash) {
            revert StateMismatch();
        }

        // c. Proof Verification
        FHE.checkSignatures(requestId, cleartexts, proof);

        // d. Decode & Finalize
        // We expect one cleartext value (uint32)
        if (cleartexts.length != 32) revert InvalidProof(); // Expecting one uint32 (32 bytes)

        uint32 totalEvidenceScore = abi.decode(cleartexts, (uint32));
        uint256 averageEvidenceScore = batch.claimCount > 0 ? totalEvidenceScore / uint32(batch.claimCount) : 0;

        ctx.processed = true;

        emit DecryptionCompleted(requestId, ctx.batchId, averageEvidenceScore);
    }

    function _isBatchOpen(uint256 batchId) internal view returns (bool) {
        Batch storage batch = batches[batchId];
        return batch.id == batchId && batch.isOpen;
    }

    function _hashCiphertexts(euint32[] memory cts) internal pure returns (bytes32) {
        // Encode each euint32 to bytes32 and then hash the concatenated array
        bytes32[] memory ctsAsBytes32 = new bytes32[](cts.length);
        for (uint256 i = 0; i < cts.length; i++) {
            ctsAsBytes32[i] = FHE.toBytes32(cts[i]);
        }
        return keccak256(abi.encode(ctsAsBytes32, address(this)));
    }

    function _initIfNeeded() internal {
        if (!FHE.isInitialized()) {
            // This would be called by an initializer or constructor in a real scenario
            // For this contract, we assume FHE is initialized by the deployer or a separate call
            // We don't have an explicit initializer here, so this is a placeholder.
            // In a real contract, you might have an initialize function that calls FHE.init() if needed.
            revert("FHE not initialized");
        }
    }

    // Example of how to use _initIfNeeded if we had an initializer
    // function initialize() public onlyOwner {
    //     _initIfNeeded();
    //     // ... other initialization logic
    // }

    // Helper to check if FHE is initialized (public for testing)
    function isFheInitialized() external view returns (bool) {
        return FHE.isInitialized();
    }
}