import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, keccak256, maxUint256, parseUnits, toHex, zeroAddress, zeroHash } from "viem";

const usdc = (v: string) => parseUnits(v, 6);
const META = keccak256(toHex('{"title":"Ada & Tunde"}'));
const GENERAL = maxUint256;

describe("GiftRegistry", async () => {
  const { viem, networkHelpers } = await network.create();
  const [owner, alice, bob, mallory, recovery] = await viem.getWalletClients();

  async function deployFixture() {
    const token = await viem.deployContract("MockUSDC");
    const registry = await viem.deployContract("GiftRegistry", [token.address, recovery.account.address]);
    for (const w of [alice, bob, mallory]) {
      await token.write.mint([w.account.address, usdc("10000")]);
      await token.write.approve([registry.address, maxUint256], { account: w.account });
    }
    // Registry #1 owned by `owner`: fridge (1000 USDC) and blender (50 USDC).
    await registry.write.createRegistry([META, [usdc("1000"), usdc("50")]]);
    return { token, registry };
  }

  describe("createRegistry", () => {
    it("stores owner, metadata hash and gift targets and emits an event", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      const [r, targets, raised] = await registry.read.getRegistry([1n]);
      assert.equal(r.owner, getAddress(owner.account.address));
      assert.equal(r.metadataHash, META);
      assert.deepEqual(targets, [usdc("1000"), usdc("50")]);
      assert.deepEqual(raised, [0n, 0n]);
      assert.equal(await registry.read.registryCount(), 1n);

      await viem.assertions.emitWithArgs(
        registry.write.createRegistry([META, []], { account: alice.account }),
        registry,
        "RegistryCreated",
        [2n, getAddress(alice.account.address), META, []],
      );
    });

    it("allows a registry with only a general fund", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.createRegistry([META, []], { account: alice.account });
      const [, targets] = await registry.read.getRegistry([2n]);
      assert.equal(targets.length, 0);
    });

    it("rejects empty metadata, tiny targets and too many gifts", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await viem.assertions.revertWithCustomError(
        registry.write.createRegistry([zeroHash, [usdc("1")]]),
        registry,
        "InvalidMetadata",
      );
      await viem.assertions.revertWithCustomErrorWithArgs(
        registry.write.createRegistry([META, [usdc("1"), 0n]]),
        registry,
        "InvalidTarget",
        [1n],
      );
      await viem.assertions.revertWithCustomError(
        registry.write.createRegistry([META, Array(51).fill(usdc("1"))]),
        registry,
        "TooManyGifts",
      );
    });

    it("rejects bad constructor arguments", async () => {
      const token = await viem.deployContract("MockUSDC");
      await assert.rejects(viem.deployContract("GiftRegistry", [zeroAddress, recovery.account.address]), /InvalidToken/);
      // An address with no contract code (a plain wallet) is not a token.
      await assert.rejects(viem.deployContract("GiftRegistry", [alice.account.address, recovery.account.address]), /InvalidToken/);
      // A contract that isn't a token at all, and one whose decimals() reverts.
      const notToken = await viem.deployContract("GiftRegistry", [token.address, recovery.account.address]);
      await assert.rejects(viem.deployContract("GiftRegistry", [notToken.address, recovery.account.address]), /InvalidToken/);
      const reverting = await viem.deployContract("RevertingDecimalsToken");
      await assert.rejects(viem.deployContract("GiftRegistry", [reverting.address, recovery.account.address]), /InvalidToken/);
      const e18 = await viem.deployContract("EighteenDecimalToken");
      await assert.rejects(viem.deployContract("GiftRegistry", [e18.address, recovery.account.address]), /InvalidToken/);
      await assert.rejects(viem.deployContract("GiftRegistry", [token.address, zeroAddress]), /InvalidRecoveryAddress/);
    });
  });

  describe("contribute", () => {
    it("pulls USDC, updates gift + totals and emits Contributed", async () => {
      const { token, registry } = await networkHelpers.loadFixture(deployFixture);
      await viem.assertions.emitWithArgs(
        registry.write.contribute([1n, 0n, usdc("100")], { account: alice.account }),
        registry,
        "Contributed",
        [1n, 0n, getAddress(alice.account.address), usdc("100")],
      );
      const [r, , raised] = await registry.read.getRegistry([1n]);
      assert.deepEqual(raised, [usdc("100"), 0n]);
      assert.equal(r.totalRaised, usdc("100"));
      assert.equal(await token.read.balanceOf([registry.address]), usdc("100"));
      assert.equal(await token.read.balanceOf([alice.account.address]), usdc("9900"));
    });

    it("accounts correctly for multiple contributors to the same gift", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.contribute([1n, 0n, usdc("300")], { account: alice.account });
      await registry.write.contribute([1n, 0n, usdc("450.5")], { account: bob.account });
      await registry.write.contribute([1n, 0n, usdc("0.5")], { account: alice.account });
      const [r, , raised] = await registry.read.getRegistry([1n]);
      assert.equal(raised[0], usdc("751"));
      assert.equal(r.totalRaised, usdc("751"));
    });

    it("supports general cash gifts with no cap", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.contribute([1n, GENERAL, usdc("5000")], { account: alice.account });
      await registry.write.contribute([1n, GENERAL, usdc("25")], { account: bob.account });
      const [r, , raised] = await registry.read.getRegistry([1n]);
      assert.equal(r.generalRaised, usdc("5025"));
      assert.equal(r.totalRaised, usdc("5025"));
      assert.deepEqual(raised, [0n, 0n]);
    });

    it("lets a gift be funded exactly to its target, then rejects more", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.contribute([1n, 1n, usdc("30")], { account: alice.account });
      await viem.assertions.revertWithCustomErrorWithArgs(
        registry.write.contribute([1n, 1n, usdc("20.01")], { account: bob.account }),
        registry,
        "ExceedsRemaining",
        [usdc("20")],
      );
      await registry.write.contribute([1n, 1n, usdc("20")], { account: bob.account });
      await viem.assertions.revertWithCustomErrorWithArgs(
        registry.write.contribute([1n, 1n, usdc("0.01")], { account: bob.account }),
        registry,
        "ExceedsRemaining",
        [0n],
      );
      const [, , raised] = await registry.read.getRegistry([1n]);
      assert.equal(raised[1], usdc("50"));
    });

    it("rejects invalid amounts", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await viem.assertions.revertWithCustomError(
        registry.write.contribute([1n, 0n, 0n], { account: alice.account }),
        registry,
        "AmountTooSmall",
      );
      await viem.assertions.revertWithCustomError(
        registry.write.contribute([1n, 0n, 9_999n], { account: alice.account }),
        registry,
        "AmountTooSmall",
      );
    });

    it("rejects unknown registries and gifts", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await viem.assertions.revertWithCustomErrorWithArgs(
        registry.write.contribute([99n, 0n, usdc("1")], { account: alice.account }),
        registry,
        "RegistryNotFound",
        [99n],
      );
      await viem.assertions.revertWithCustomErrorWithArgs(
        registry.write.contribute([1n, 2n, usdc("1")], { account: alice.account }),
        registry,
        "GiftNotFound",
        [2n],
      );
    });

    it("reverts without allowance or balance and records nothing", async () => {
      const { token, registry } = await networkHelpers.loadFixture(deployFixture);
      await token.write.approve([registry.address, 0n], { account: alice.account });
      await assert.rejects(
        registry.write.contribute([1n, 0n, usdc("1")], { account: alice.account }),
        /ERC20InsufficientAllowance/,
      );
      // `owner` approved nothing and holds nothing.
      await token.write.approve([registry.address, maxUint256]);
      await assert.rejects(registry.write.contribute([1n, 0n, usdc("1")]), /ERC20InsufficientBalance/);
      const [r] = await registry.read.getRegistry([1n]);
      assert.equal(r.totalRaised, 0n);
    });
  });

  describe("withdraw", () => {
    it("sends all available funds to the owner and tracks totalWithdrawn", async () => {
      const { token, registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.contribute([1n, 0n, usdc("200")], { account: alice.account });
      await registry.write.contribute([1n, GENERAL, usdc("50")], { account: bob.account });
      assert.equal(await registry.read.availableToWithdraw([1n]), usdc("250"));

      await viem.assertions.emitWithArgs(
        registry.write.withdraw([1n]),
        registry,
        "Withdrawn",
        [1n, getAddress(owner.account.address), getAddress(owner.account.address), usdc("250")],
      );
      assert.equal(await token.read.balanceOf([owner.account.address]), usdc("250"));
      assert.equal(await token.read.balanceOf([registry.address]), 0n);
      const [r, , raised] = await registry.read.getRegistry([1n]);
      assert.equal(r.totalRaised, usdc("250"));
      assert.equal(r.totalWithdrawn, usdc("250"));
      // Gift progress is preserved after withdrawal.
      assert.equal(raised[0], usdc("200"));
    });

    it("only lets the owner withdraw", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.contribute([1n, 0n, usdc("200")], { account: alice.account });
      await viem.assertions.revertWithCustomError(
        registry.write.withdraw([1n], { account: alice.account }),
        registry,
        "NotOwner",
      );
      await viem.assertions.revertWithCustomError(
        registry.write.withdraw([1n], { account: mallory.account }),
        registry,
        "NotOwner",
      );
    });

    it("prevents withdrawing the same funds twice", async () => {
      const { token, registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.contribute([1n, 0n, usdc("200")], { account: alice.account });
      await registry.write.withdraw([1n]);
      await viem.assertions.revertWithCustomError(registry.write.withdraw([1n]), registry, "NothingToWithdraw");

      // New contributions after a withdrawal are withdrawable, but only the new part.
      await registry.write.contribute([1n, 0n, usdc("30")], { account: bob.account });
      await registry.write.withdraw([1n]);
      assert.equal(await token.read.balanceOf([owner.account.address]), usdc("230"));
    });

    it("rejects withdrawing from an empty registry", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await viem.assertions.revertWithCustomError(registry.write.withdraw([1n]), registry, "NothingToWithdraw");
    });

    it("keeps registries' funds isolated from each other", async () => {
      const { token, registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.createRegistry([META, [usdc("100")]], { account: mallory.account });
      await registry.write.contribute([1n, 0n, usdc("500")], { account: alice.account });
      await registry.write.contribute([2n, 0n, usdc("10")], { account: bob.account });

      await registry.write.withdraw([2n], { account: mallory.account });
      await viem.assertions.revertWithCustomError(
        registry.write.withdraw([2n], { account: mallory.account }),
        registry,
        "NothingToWithdraw",
      );
      await viem.assertions.revertWithCustomError(
        registry.write.withdraw([1n], { account: mallory.account }),
        registry,
        "NotOwner",
      );
      assert.equal(await token.read.balanceOf([registry.address]), usdc("500"));
      assert.equal(await registry.read.availableToWithdraw([1n]), usdc("500"));
    });
  });

  describe("withdrawTo", () => {
    it("lets the owner send available funds to another address", async () => {
      const { token, registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.contribute([1n, 0n, usdc("120")], { account: alice.account });
      await viem.assertions.emitWithArgs(
        registry.write.withdrawTo([1n, mallory.account.address]),
        registry,
        "Withdrawn",
        [1n, getAddress(owner.account.address), getAddress(mallory.account.address), usdc("120")],
      );
      assert.equal(await token.read.balanceOf([mallory.account.address]), usdc("10120"));
      await viem.assertions.revertWithCustomError(registry.write.withdraw([1n]), registry, "NothingToWithdraw");
    });

    it("only lets the owner choose a recipient, and rejects the zero address", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.contribute([1n, 0n, usdc("10")], { account: alice.account });
      await viem.assertions.revertWithCustomError(
        registry.write.withdrawTo([1n, mallory.account.address], { account: mallory.account }),
        registry,
        "NotOwner",
      );
      await viem.assertions.revertWithCustomError(registry.write.withdrawTo([1n, zeroAddress]), registry, "InvalidRecipient");
    });

    it("rejects the registry contract and the token contract as recipients", async () => {
      const { token, registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.contribute([1n, 0n, usdc("10")], { account: alice.account });
      // Sending to the registry itself would turn owed funds into recoverable "excess".
      await viem.assertions.revertWithCustomError(registry.write.withdrawTo([1n, registry.address]), registry, "InvalidRecipient");
      // Sending to the token contract would strand the funds there.
      await viem.assertions.revertWithCustomError(registry.write.withdrawTo([1n, token.address]), registry, "InvalidRecipient");
      assert.equal(await registry.read.totalOwed(), usdc("10"));
      assert.equal(await registry.read.excessBalance(), 0n);
    });
  });

  describe("ownership transfer", () => {
    it("is two-step: the owner proposes, the new wallet accepts and can withdraw", async () => {
      const { token, registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.contribute([1n, GENERAL, usdc("40")], { account: alice.account });
      await viem.assertions.emitWithArgs(
        registry.write.transferRegistryOwnership([1n, bob.account.address]),
        registry,
        "OwnershipTransferStarted",
        [1n, getAddress(owner.account.address), getAddress(bob.account.address)],
      );
      // Still the old owner until accepted.
      let [r] = await registry.read.getRegistry([1n]);
      assert.equal(r.owner, getAddress(owner.account.address));
      assert.equal(r.pendingOwner, getAddress(bob.account.address));

      await viem.assertions.emitWithArgs(
        registry.write.acceptRegistryOwnership([1n], { account: bob.account }),
        registry,
        "OwnershipTransferred",
        [1n, getAddress(owner.account.address), getAddress(bob.account.address)],
      );
      [r] = await registry.read.getRegistry([1n]);
      assert.equal(r.owner, getAddress(bob.account.address));
      assert.equal(r.pendingOwner, zeroAddress);

      await viem.assertions.revertWithCustomError(registry.write.withdraw([1n]), registry, "NotOwner");
      await registry.write.withdraw([1n], { account: bob.account });
      assert.equal(await token.read.balanceOf([bob.account.address]), usdc("10040"));
    });

    it("rejects strangers proposing or accepting, and supports cancelling", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await viem.assertions.revertWithCustomError(
        registry.write.transferRegistryOwnership([1n, mallory.account.address], { account: mallory.account }),
        registry,
        "NotOwner",
      );
      // Nothing pending: nobody can accept.
      await viem.assertions.revertWithCustomError(
        registry.write.acceptRegistryOwnership([1n], { account: mallory.account }),
        registry,
        "NotPendingOwner",
      );
      await registry.write.transferRegistryOwnership([1n, bob.account.address]);
      await viem.assertions.revertWithCustomError(
        registry.write.acceptRegistryOwnership([1n], { account: mallory.account }),
        registry,
        "NotPendingOwner",
      );
      // Owner cancels by proposing the zero address; Bob can no longer accept.
      await registry.write.transferRegistryOwnership([1n, zeroAddress]);
      await viem.assertions.revertWithCustomError(
        registry.write.acceptRegistryOwnership([1n], { account: bob.account }),
        registry,
        "NotPendingOwner",
      );
    });
  });

  describe("closing a registry", () => {
    it("blocks new contributions but never withdrawals, and can be reopened", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.contribute([1n, 0n, usdc("10")], { account: alice.account });
      await viem.assertions.emitWithArgs(registry.write.setRegistryClosed([1n, true]), registry, "RegistryClosedSet", [1n, true]);

      await viem.assertions.revertWithCustomErrorWithArgs(
        registry.write.contribute([1n, GENERAL, usdc("1")], { account: bob.account }),
        registry,
        "RegistryClosed",
        [1n],
      );
      await registry.write.withdraw([1n]);

      await registry.write.setRegistryClosed([1n, false]);
      await registry.write.contribute([1n, GENERAL, usdc("1")], { account: bob.account });
    });

    it("only lets the owner close or reopen", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await viem.assertions.revertWithCustomError(
        registry.write.setRegistryClosed([1n, true], { account: mallory.account }),
        registry,
        "NotOwner",
      );
    });
  });

  describe("excess recovery", () => {
    it("tracks totalOwed across registries, contributions and withdrawals", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.createRegistry([META, []], { account: mallory.account });
      await registry.write.contribute([1n, 0n, usdc("300")], { account: alice.account });
      await registry.write.contribute([2n, GENERAL, usdc("40")], { account: bob.account });
      assert.equal(await registry.read.totalOwed(), usdc("340"));
      await registry.write.withdraw([1n]);
      assert.equal(await registry.read.totalOwed(), usdc("40"));
      assert.equal(await registry.read.excessBalance(), 0n);
    });

    it("recovers only USDC sent directly, never registry funds", async () => {
      const { token, registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.contribute([1n, 0n, usdc("500")], { account: alice.account });
      // Bob sends 25 USDC straight to the contract by mistake.
      await token.write.transfer([registry.address, usdc("25")], { account: bob.account });
      assert.equal(await registry.read.excessBalance(), usdc("25"));

      await viem.assertions.emitWithArgs(
        registry.write.recoverExcess({ account: recovery.account }),
        registry,
        "ExcessRecovered",
        [getAddress(recovery.account.address), usdc("25")],
      );
      assert.equal(await token.read.balanceOf([recovery.account.address]), usdc("25"));
      // Registry funds are untouched and the owner can still withdraw all of them.
      assert.equal(await token.read.balanceOf([registry.address]), usdc("500"));
      await viem.assertions.revertWithCustomError(
        registry.write.recoverExcess({ account: recovery.account }),
        registry,
        "NoExcess",
      );
      await registry.write.withdraw([1n]);
      assert.equal(await token.read.balanceOf([owner.account.address]), usdc("500"));
      assert.equal(await token.read.balanceOf([registry.address]), 0n);
    });

    it("only lets the recovery address recover, including registry owners", async () => {
      const { token, registry } = await networkHelpers.loadFixture(deployFixture);
      await token.write.transfer([registry.address, usdc("5")], { account: bob.account });
      for (const w of [owner, alice, mallory]) {
        await viem.assertions.revertWithCustomError(
          registry.write.recoverExcess({ account: w.account }),
          registry,
          "NotRecoveryAddress",
        );
      }
    });

    it("has nothing to recover when all funds are owed", async () => {
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      await registry.write.contribute([1n, GENERAL, usdc("10")], { account: alice.account });
      await viem.assertions.revertWithCustomError(
        registry.write.recoverExcess({ account: recovery.account }),
        registry,
        "NoExcess",
      );
    });
  });

  describe("token edge cases", () => {
    it("rejects tokens that deliver less than the stated amount", async () => {
      const fee = await viem.deployContract("FeeOnTransferToken");
      const registry = await viem.deployContract("GiftRegistry", [fee.address, recovery.account.address]);
      await registry.write.createRegistry([META, []]);
      await fee.write.mint([alice.account.address, usdc("100")]);
      await fee.write.approve([registry.address, maxUint256], { account: alice.account });
      await viem.assertions.revertWithCustomError(
        registry.write.contribute([1n, GENERAL, usdc("10")], { account: alice.account }),
        registry,
        "TransferAmountMismatch",
      );
    });

    it("reverts when the token returns false instead of reverting", async () => {
      const t = await viem.deployContract("FalseReturningToken");
      const registry = await viem.deployContract("GiftRegistry", [t.address, recovery.account.address]);
      await registry.write.createRegistry([META, []]);
      await t.write.mint([alice.account.address, usdc("100")]);
      await t.write.approve([registry.address, maxUint256], { account: alice.account });

      await registry.write.contribute([1n, GENERAL, usdc("10")], { account: alice.account });
      await t.write.setFail([true]);
      await viem.assertions.revertWithCustomError(
        registry.write.contribute([1n, GENERAL, usdc("10")], { account: alice.account }),
        registry,
        "SafeERC20FailedOperation",
      );
      await viem.assertions.revertWithCustomError(registry.write.withdraw([1n]), registry, "SafeERC20FailedOperation");
      // The failed withdrawal rolled back, so the funds are still withdrawable later.
      await t.write.setFail([false]);
      await registry.write.withdraw([1n]);
      assert.equal(await t.read.balanceOf([owner.account.address]), usdc("10"));
    });

    it("blocks reentrancy from contribute and withdraw", async () => {
      const t = await viem.deployContract("ReentrantToken");
      const registry = await viem.deployContract("GiftRegistry", [t.address, recovery.account.address]);
      await registry.write.createRegistry([META, []]);
      await t.write.mint([alice.account.address, usdc("100")]);
      await t.write.approve([registry.address, maxUint256], { account: alice.account });

      await t.write.arm([registry.address, 1n, false]);
      await viem.assertions.revertWithCustomError(
        registry.write.contribute([1n, GENERAL, usdc("10")], { account: alice.account }),
        registry,
        "ReentrancyGuardReentrantCall",
      );

      await t.write.disarm();
      await registry.write.contribute([1n, GENERAL, usdc("10")], { account: alice.account });
      await t.write.arm([registry.address, 1n, true]);
      await viem.assertions.revertWithCustomError(
        registry.write.withdraw([1n]),
        registry,
        "ReentrancyGuardReentrantCall",
      );
      assert.equal(await registry.read.availableToWithdraw([1n]), usdc("10"));
    });
  });
});
