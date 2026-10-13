// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GiftRegistry
/// @notice Gift registries funded in USDC. Each registry has an owner, a list of gift
///         funding targets, and a general "cash gift" fund. Anyone can contribute; only
///         the registry owner can withdraw. Gift names, descriptions and other metadata
///         live offchain and are bound to the registry by `metadataHash`.
/// @dev Withdrawal rule: the owner may withdraw everything that has been contributed and
///      not yet withdrawn, at any time, to their own wallet or any address they choose. Funds are never locked behind a target, so they
///      cannot be trapped in the contract. Individual gifts cannot be funded beyond their
///      target; the general fund has no cap.
///      Recovery: USDC sent straight to this contract (not via `contribute`) belongs to no
///      registry. Only that excess - balance minus `totalOwed` - can be recovered, and only
///      by `recoveryAddress`, which is fixed at deployment. It can never touch registry funds.
///      Owners can hand a registry to another wallet (two-step: propose, then accept) and can
///      close it to new contributions; closing never affects withdrawals.
contract GiftRegistry is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Pseudo gift id that routes a contribution to the registry's general fund.
    uint256 public constant GENERAL_FUND = type(uint256).max;
    /// @notice Smallest accepted contribution / gift target: 0.01 USDC (6 decimals).
    uint256 public constant MIN_AMOUNT = 10_000;
    uint256 public constant MAX_GIFTS = 50;

    IERC20 public immutable usdc;
    /// @notice The only address that can recover excess USDC. Fixed at deployment.
    address public immutable recoveryAddress;

    /// @notice USDC currently owed to registry owners: contributed and not yet withdrawn,
    ///         summed over all registries. The contract's balance should never be below this.
    uint256 public totalOwed;

    struct Registry {
        address owner;
        uint64 createdAt;
        bool closed;
        address pendingOwner;
        bytes32 metadataHash;
        uint256 totalRaised;
        uint256 totalWithdrawn;
        uint256 generalRaised;
    }

    /// @notice Number of registries created. Registry ids are 1..registryCount.
    uint256 public registryCount;

    mapping(uint256 registryId => Registry) private _registries;
    mapping(uint256 registryId => uint256[]) private _giftTargets;
    mapping(uint256 registryId => uint256[]) private _giftRaised;

    event RegistryCreated(
        uint256 indexed registryId, address indexed owner, bytes32 metadataHash, uint256[] giftTargets
    );
    event Contributed(
        uint256 indexed registryId, uint256 indexed giftId, address indexed contributor, uint256 amount
    );
    event Withdrawn(uint256 indexed registryId, address indexed owner, address indexed to, uint256 amount);
    event OwnershipTransferStarted(uint256 indexed registryId, address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(uint256 indexed registryId, address indexed previousOwner, address indexed newOwner);
    event RegistryClosedSet(uint256 indexed registryId, bool closed);
    event ExcessRecovered(address indexed to, uint256 amount);

    error InvalidToken();
    error InvalidMetadata();
    error TooManyGifts();
    error InvalidTarget(uint256 giftId);
    error RegistryNotFound(uint256 registryId);
    error GiftNotFound(uint256 giftId);
    error AmountTooSmall();
    error ExceedsRemaining(uint256 remaining);
    error NotOwner();
    error NothingToWithdraw();
    error TransferAmountMismatch();
    error InvalidRecoveryAddress();
    error NotRecoveryAddress();
    error NoExcess();
    error InvalidRecipient();
    error NotPendingOwner();
    error RegistryClosed(uint256 registryId);

    /// @dev These checks catch obvious mistakes (no contract, wrong decimals). They cannot
    ///      prove the token is Circle's USDC - the deploy script checks the documented address.
    constructor(IERC20 usdc_, address recoveryAddress_) {
        if (address(usdc_).code.length == 0) revert InvalidToken();
        if (IERC20Metadata(address(usdc_)).decimals() != 6) revert InvalidToken();
        if (recoveryAddress_ == address(0)) revert InvalidRecoveryAddress();
        usdc = usdc_;
        recoveryAddress = recoveryAddress_;
    }

    /// @notice Create a registry owned by the caller.
    /// @param metadataHash keccak256 of the offchain metadata JSON (title, gift names, ...).
    /// @param giftTargets Funding target for each gift, in USDC base units (6 decimals).
    function createRegistry(bytes32 metadataHash, uint256[] calldata giftTargets)
        external
        returns (uint256 registryId)
    {
        if (metadataHash == bytes32(0)) revert InvalidMetadata();
        if (giftTargets.length > MAX_GIFTS) revert TooManyGifts();

        registryId = ++registryCount;
        Registry storage r = _registries[registryId];
        r.owner = msg.sender;
        r.createdAt = uint64(block.timestamp);
        r.metadataHash = metadataHash;

        uint256[] storage targets = _giftTargets[registryId];
        uint256[] storage raised = _giftRaised[registryId];
        for (uint256 i = 0; i < giftTargets.length; i++) {
            if (giftTargets[i] < MIN_AMOUNT) revert InvalidTarget(i);
            targets.push(giftTargets[i]);
            raised.push(0);
        }

        emit RegistryCreated(registryId, msg.sender, metadataHash, giftTargets);
    }

    /// @notice Contribute USDC to a gift (or to the general fund with `GENERAL_FUND`).
    /// @dev Caller must first `approve` this contract for at least `amount` USDC.
    function contribute(uint256 registryId, uint256 giftId, uint256 amount) external nonReentrant {
        Registry storage r = _getRegistry(registryId);
        if (r.closed) revert RegistryClosed(registryId);
        if (amount < MIN_AMOUNT) revert AmountTooSmall();

        if (giftId == GENERAL_FUND) {
            r.generalRaised += amount;
        } else {
            uint256[] storage raised = _giftRaised[registryId];
            if (giftId >= raised.length) revert GiftNotFound(giftId);
            uint256 remaining = _giftTargets[registryId][giftId] - raised[giftId];
            if (amount > remaining) revert ExceedsRemaining(remaining);
            raised[giftId] += amount;
        }
        r.totalRaised += amount;
        totalOwed += amount;

        // Pull the funds and make sure exactly `amount` arrived, so accounting can never
        // exceed what the contract actually holds.
        uint256 balanceBefore = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        if (usdc.balanceOf(address(this)) - balanceBefore != amount) revert TransferAmountMismatch();

        emit Contributed(registryId, giftId, msg.sender, amount);
    }

    /// @notice Withdraw all available (contributed but not yet withdrawn) funds to the owner.
    function withdraw(uint256 registryId) external nonReentrant {
        _withdraw(registryId, msg.sender);
    }

    /// @notice Withdraw all available funds to another address chosen by the owner, e.g. if
    ///         the owner's own address can no longer receive USDC (blocklisted).
    function withdrawTo(uint256 registryId, address to) external nonReentrant {
        if (to == address(0)) revert InvalidRecipient();
        _withdraw(registryId, to);
    }

    /// @notice Step 1 of handing the registry to another wallet. `newOwner = address(0)`
    ///         cancels a pending transfer. The current owner stays in control until accepted.
    function transferRegistryOwnership(uint256 registryId, address newOwner) external {
        Registry storage r = _getRegistry(registryId);
        if (msg.sender != r.owner) revert NotOwner();
        r.pendingOwner = newOwner;
        emit OwnershipTransferStarted(registryId, r.owner, newOwner);
    }

    /// @notice Step 2: the proposed wallet accepts and becomes the owner (including the
    ///         right to withdraw everything not yet withdrawn).
    function acceptRegistryOwnership(uint256 registryId) external {
        Registry storage r = _getRegistry(registryId);
        if (r.pendingOwner == address(0) || msg.sender != r.pendingOwner) revert NotPendingOwner();
        address previous = r.owner;
        r.owner = msg.sender;
        r.pendingOwner = address(0);
        emit OwnershipTransferred(registryId, previous, msg.sender);
    }

    /// @notice Close (or reopen) the registry to new contributions. Withdrawals always work.
    function setRegistryClosed(uint256 registryId, bool closed) external {
        Registry storage r = _getRegistry(registryId);
        if (msg.sender != r.owner) revert NotOwner();
        r.closed = closed;
        emit RegistryClosedSet(registryId, closed);
    }

    /// @notice Full registry state in a single call.
    function getRegistry(uint256 registryId)
        external
        view
        returns (
            Registry memory registry,
            uint256[] memory giftTargets,
            uint256[] memory giftRaised
        )
    {
        registry = _getRegistry(registryId);
        giftTargets = _giftTargets[registryId];
        giftRaised = _giftRaised[registryId];
    }

    function availableToWithdraw(uint256 registryId) external view returns (uint256) {
        Registry storage r = _getRegistry(registryId);
        return r.totalRaised - r.totalWithdrawn;
    }

    /// @notice USDC held by the contract that no registry is owed (e.g. sent by mistake).
    function excessBalance() public view returns (uint256) {
        uint256 balance = usdc.balanceOf(address(this));
        return balance > totalOwed ? balance - totalOwed : 0;
    }

    /// @notice Send excess USDC (never registry funds) to `recoveryAddress`.
    function recoverExcess() external nonReentrant {
        if (msg.sender != recoveryAddress) revert NotRecoveryAddress();
        uint256 excess = excessBalance();
        if (excess == 0) revert NoExcess();
        usdc.safeTransfer(recoveryAddress, excess);
        emit ExcessRecovered(recoveryAddress, excess);
    }

    function _withdraw(uint256 registryId, address to) private {
        Registry storage r = _getRegistry(registryId);
        if (msg.sender != r.owner) revert NotOwner();

        uint256 available = r.totalRaised - r.totalWithdrawn;
        if (available == 0) revert NothingToWithdraw();

        r.totalWithdrawn += available;
        totalOwed -= available;
        usdc.safeTransfer(to, available);

        emit Withdrawn(registryId, r.owner, to, available);
    }

    function _getRegistry(uint256 registryId) private view returns (Registry storage r) {
        r = _registries[registryId];
        if (r.owner == address(0)) revert RegistryNotFound(registryId);
    }
}
