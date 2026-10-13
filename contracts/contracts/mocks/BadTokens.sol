// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IGiftRegistry {
    function withdraw(uint256 registryId) external;
    function contribute(uint256 registryId, uint256 giftId, uint256 amount) external;
}

/// @dev Test-only token that takes a 1% fee on transfers.
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xdead), fee);
            value -= fee;
        }
        super._update(from, to, value);
    }
}

/// @dev Test-only token whose transfers return false instead of reverting.
contract FalseReturningToken is ERC20 {
    bool public fail;

    constructor() ERC20("False", "FALSE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFail(bool fail_) external {
        fail = fail_;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (fail) return false;
        return super.transfer(to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (fail) return false;
        return super.transferFrom(from, to, value);
    }
}

/// @dev Test-only token that tries to re-enter the registry during a transfer.
contract ReentrantToken is ERC20 {
    IGiftRegistry public target;
    uint256 public registryId;
    bool public reenterWithdraw;
    bool public armed;

    constructor() ERC20("Reenter", "RE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(IGiftRegistry target_, uint256 registryId_, bool reenterWithdraw_) external {
        target = target_;
        registryId = registryId_;
        reenterWithdraw = reenterWithdraw_;
        armed = true;
    }

    function disarm() external {
        armed = false;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && from != address(0)) {
            armed = false;
            if (reenterWithdraw) {
                target.withdraw(registryId);
            } else {
                target.contribute(registryId, type(uint256).max, 10_000);
            }
        }
    }
}

/// @dev Test-only token with the wrong number of decimals (18), to test constructor checks.
contract EighteenDecimalToken is ERC20 {
    constructor() ERC20("Eighteen", "E18") {}
}

/// @dev Test-only 6-decimal token with a USDC-style blocklist: transfers to or from a
///      blocklisted address revert (Arc docs: "A value transfer to or from a blocklisted
///      address reverts").
contract BlocklistToken is ERC20 {
    mapping(address => bool) public blocked;

    constructor() ERC20("Blocklist USD", "BUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[from] && !blocked[to], "Blocklisted");
        super._update(from, to, value);
    }
}
