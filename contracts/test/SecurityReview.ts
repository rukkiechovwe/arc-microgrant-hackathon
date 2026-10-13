// Security review probes for GiftRegistry: a randomized invariant test plus tests that
// document known limitations (they assert the CURRENT behaviour, so they pass while the
// limitation exists and should be updated if the contract changes).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, maxUint256, parseUnits, toHex } from "viem";

const usdc = (v: string) => parseUnits(v, 6);
const META = keccak256(toHex("security-review"));
const GENERAL = maxUint256;

describe("Security review", async () => {
  const { viem } = await network.create();
  const wallets = await viem.getWalletClients();
  const [deployer, ownerA, ownerB, guest1, guest2, guest3, recovery] = wallets;

  it("invariants hold across 300 random operations", async () => {
    const token = await viem.deployContract("MockUSDC");
    const registry = await viem.deployContract("GiftRegistry", [token.address, recovery.account.address]);
    const owners = [ownerA, ownerB, guest1]; // tracks current owners as ownership changes
    const actors = [ownerA, ownerB, guest1, guest2, guest3];
    for (const w of actors) {
      await token.write.mint([w.account.address, usdc("1000000")]);
      await token.write.approve([registry.address, maxUint256], { account: w.account });
    }
    // Three registries with a few gifts each.
    await registry.write.createRegistry([META, [usdc("100"), usdc("7.5"), usdc("2500")]], { account: ownerA.account });
    await registry.write.createRegistry([META, [usdc("50")]], { account: ownerB.account });
    await registry.write.createRegistry([META, []], { account: guest1.account });
    const ids = [1n, 2n, 3n];

    // Deterministic PRNG so failures are reproducible.
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return Math.floor((seed / 2 ** 31) * n); // use high bits; low bits of an LCG cycle badly
    };
    const stats = { contributed: 0, rejected: 0, withdrawn: 0, direct: 0, recovered: 0, admin: 0 };
    const attempts = [0, 0, 0, 0]; // contribute, withdraw, direct transfer, recover

    for (let step = 0; step < 300; step++) {
      const op = rand(10);
      attempts[op < 6 ? 0 : op < 8 ? 1 : op < 9 ? 2 : 3]++;
      const actor = actors[rand(actors.length)];
      try {
        if (op < 6) {
          const id = ids[rand(3)];
          const [, targets] = await registry.read.getRegistry([id]);
          const giftId = targets.length === 0 || rand(4) === 0 ? GENERAL : BigInt(rand(targets.length));
          const amount = BigInt(10_000 + rand(60_000_000)); // 0.01 - 60 USDC
          await registry.write.contribute([id, giftId, amount], { account: actor.account });
          stats.contributed++;
        } else if (op < 8) {
          const i = rand(3);
          const caller = rand(4) === 0 ? actor.account : owners[i].account;
          if (rand(2) === 0) await registry.write.withdraw([ids[i]], { account: caller });
          else await registry.write.withdrawTo([ids[i], actors[rand(actors.length)].account.address], { account: caller });
          stats.withdrawn++;
        } else if (op < 9) {
          await token.write.transfer([registry.address, BigInt(1 + rand(5_000_000))], { account: actor.account });
          stats.direct++;
        } else if (rand(2) === 0) {
          await registry.write.recoverExcess({ account: rand(3) === 0 ? actor.account : recovery.account });
          stats.recovered++;
        } else {
          // Owners occasionally close/reopen or hand over registries; strangers try too.
          const i = rand(3);
          const caller = rand(4) === 0 ? actor.account : owners[i].account;
          if (rand(2) === 0) {
            await registry.write.setRegistryClosed([ids[i], rand(2) === 0], { account: caller });
          } else {
            const next = actors[rand(actors.length)];
            await registry.write.transferRegistryOwnership([ids[i], next.account.address], { account: caller });
            await registry.write.acceptRegistryOwnership([ids[i]], { account: next.account });
            owners[i] = next;
          }
          stats.admin++;
        }
      } catch {
        stats.rejected++; // reverts are expected (overfunding, non-owner, nothing to withdraw...)
      }

      // Invariants, checked after every single step.
      const balance = await token.read.balanceOf([registry.address]);
      const owed = await registry.read.totalOwed();
      let sumAvailable = 0n;
      for (const id of ids) {
        const [r, targets, raised] = await registry.read.getRegistry([id]);
        assert.ok(r.totalWithdrawn <= r.totalRaised, "withdrawn <= raised");
        let giftSum = 0n;
        targets.forEach((t, i) => {
          assert.ok(raised[i] <= t, `gift ${i} of registry ${id} overfunded`);
          giftSum += raised[i];
        });
        assert.equal(giftSum + r.generalRaised, r.totalRaised, "gift + general == totalRaised");
        sumAvailable += r.totalRaised - r.totalWithdrawn;
      }
      assert.equal(owed, sumAvailable, "totalOwed == sum of available");
      assert.ok(balance >= owed, "contract holds at least what it owes");
      assert.equal(await registry.read.excessBalance(), balance - owed, "excess == balance - owed");
    }

    // Every (current) owner can still withdraw everything they're owed; the contract stays solvent.
    for (const id of ids) {
      if ((await registry.read.availableToWithdraw([id])) > 0n) {
        const [r] = await registry.read.getRegistry([id]);
        const current = actors.find((a) => a.account.address.toLowerCase() === r.owner.toLowerCase())!;
        await registry.write.withdraw([id], { account: current.account });
      }
    }
    assert.equal(await registry.read.totalOwed(), 0n);
    console.log("      attempts [contribute, withdraw, direct, recover]:", attempts, "successes:", stats);
    assert.ok(stats.recovered > 0 && stats.withdrawn > 0 && stats.direct > 0 && stats.admin > 0, "every operation type was exercised");
  });

  it("FIXED (M1): a blocklisted owner can withdraw to another address with withdrawTo", async () => {
    const token = await viem.deployContract("BlocklistToken");
    const registry = await viem.deployContract("GiftRegistry", [token.address, recovery.account.address]);
    await token.write.mint([guest1.account.address, usdc("100")]);
    await token.write.approve([registry.address, maxUint256], { account: guest1.account });
    await registry.write.createRegistry([META, []], { account: ownerA.account });
    await registry.write.contribute([1n, GENERAL, usdc("100")], { account: guest1.account });

    await token.write.setBlocked([ownerA.account.address, true]);
    await assert.rejects(registry.write.withdraw([1n], { account: ownerA.account }), /Blocklisted/);
    // The funds are owed, so recovery can't take them.
    assert.equal(await registry.read.excessBalance(), 0n);
    // ...but the owner can send them to a different wallet.
    await registry.write.withdrawTo([1n, ownerB.account.address], { account: ownerA.account });
    assert.equal(await token.read.balanceOf([ownerB.account.address]), usdc("100"));
  });

  it("BY DESIGN: the contract allows reusing a metadataHash (the app binds owner + link inside the hash)", async () => {
    const token = await viem.deployContract("MockUSDC");
    const registry = await viem.deployContract("GiftRegistry", [token.address, recovery.account.address]);
    await registry.write.createRegistry([META, [usdc("10")]], { account: ownerA.account });
    // A copycat reads the hash from the public event and creates a lookalike registry.
    await registry.write.createRegistry([META, [usdc("10")]], { account: ownerB.account });
    const [a] = await registry.read.getRegistry([1n]);
    const [b] = await registry.read.getRegistry([2n]);
    assert.equal(a.metadataHash, b.metadataHash);
    assert.notEqual(a.owner, b.owner);
  });

  it("BEHAVIOUR: two guests racing for a gift's last remaining amount - second reverts, nothing lost", async () => {
    const token = await viem.deployContract("MockUSDC");
    const registry = await viem.deployContract("GiftRegistry", [token.address, recovery.account.address]);
    for (const g of [guest1, guest2]) {
      await token.write.mint([g.account.address, usdc("100")]);
      await token.write.approve([registry.address, usdc("10")], { account: g.account });
    }
    await registry.write.createRegistry([META, [usdc("10")]], { account: ownerA.account });
    await registry.write.contribute([1n, 0n, usdc("10")], { account: guest1.account });
    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.contribute([1n, 0n, usdc("10")], { account: guest2.account }),
      registry,
      "ExceedsRemaining",
      [0n],
    );
    assert.equal(await token.read.balanceOf([guest2.account.address]), usdc("100"), "loser keeps their USDC");
    // Their unused approval is left behind (exact amount only).
    assert.equal(await token.read.allowance([guest2.account.address, registry.address]), usdc("10"));
  });

  it("FIXED (L2): owners can close a registry; until then contributions are accepted", async () => {
    const token = await viem.deployContract("MockUSDC");
    const registry = await viem.deployContract("GiftRegistry", [token.address, recovery.account.address]);
    await token.write.mint([guest1.account.address, usdc("10")]);
    await token.write.approve([registry.address, maxUint256], { account: guest1.account });
    await registry.write.createRegistry([META, []], { account: ownerA.account });
    await registry.write.contribute([1n, GENERAL, usdc("1")], { account: guest1.account });
    await registry.write.withdraw([1n], { account: ownerA.account });
    // Years later, still open until the owner closes it.
    await registry.write.contribute([1n, GENERAL, usdc("1")], { account: guest1.account });
    await registry.write.setRegistryClosed([1n, true], { account: ownerA.account });
    await assert.rejects(registry.write.contribute([1n, GENERAL, usdc("1")], { account: guest1.account }), /RegistryClosed/);
    assert.equal(await registry.read.availableToWithdraw([1n]), usdc("1"));
  });

  it("CHECK: the deployer has no special power over registry funds", async () => {
    const token = await viem.deployContract("MockUSDC", [], { client: { wallet: deployer } });
    const registry = await viem.deployContract("GiftRegistry", [token.address, deployer.account.address]);
    await token.write.mint([guest1.account.address, usdc("10")]);
    await token.write.approve([registry.address, maxUint256], { account: guest1.account });
    await registry.write.createRegistry([META, []], { account: ownerA.account });
    await registry.write.contribute([1n, GENERAL, usdc("10")], { account: guest1.account });
    await viem.assertions.revertWithCustomError(registry.write.withdraw([1n], { account: deployer.account }), registry, "NotOwner");
    await viem.assertions.revertWithCustomError(registry.write.recoverExcess({ account: deployer.account }), registry, "NoExcess");
  });
});
