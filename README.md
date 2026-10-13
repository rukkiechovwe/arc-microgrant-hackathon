# Gift Registry on Arc

Create a gift registry for a wedding, birthday, graduation, baby shower, housewarming, anniversary or any other celebration. Share one link. Friends and family contribute **USDC on Arc Mainnet** toward individual gifts (many people can fund one big gift together) or send a general cash gift. Only the registry owner can withdraw, and the smart contract enforces that.

| | |
|---|---|
| Live app | _pending: add your Vercel URL after deploying_ |
| Network | Arc Mainnet, chain ID `5042` |
| GiftRegistry contract | _pending: see `contracts/deployments/arcMainnet.json` after deploying_ |
| USDC (ERC-20 interface) | [`0x3600000000000000000000000000000000000000`](https://explorer.arc.io/address/0x3600000000000000000000000000000000000000), 6 decimals |
| Explorer | https://explorer.arc.io |

Arc network values come from the official docs ([connect to Arc](https://docs.arc.io/arc/references/connect-to-arc), [contract addresses](https://docs.arc.io/arc/references/contract-addresses), [gas and fees](https://docs.arc.io/arc/references/gas-and-fees)). They were also checked against the live RPC: `eth_chainId` returns `0x13b2`, and `symbol()` and `decimals()` at the USDC address return `USDC` and `6`.

## How Arc is used

- **USDC is the payment currency and the gas token.** Guests pay a sub-cent fee in the same USDC they gift, so they don't need a separate gas token.
- **All money movement happens in the `GiftRegistry` contract.** Guests approve and contribute USDC through the ERC-20 interface at `0x3600…0000`, and owners withdraw.
- **Progress bars read directly from the contract.** Totals can't be faked by the app or its database.
- **Arc finalizes transactions on inclusion.** The UI shows success after one confirmed receipt, and only once that receipt contains the expected `Contributed` event.
- **Arc rejects transactions priced below 20 gwei.** Arc's mempool drops transactions with `maxFeePerGas` under 20 gwei, so the frontend enforces that floor (`lib/wagmi.ts`).

## Architecture

```
contracts/                 Hardhat 3 project
  contracts/GiftRegistry.sol     the only production contract
  contracts/mocks/               test-only tokens (mock USDC, fee-on-transfer, false-returning, re-entrant)
  test/GiftRegistry.ts           29 unit tests (node:test + viem)
  test/SecurityReview.ts         randomized invariant test + documented limitations (6 tests)
  scripts/deploy.ts              deploy to Arc Mainnet (dry-runs locally without --network)
  scripts/smoke.ts               real create → approve → contribute → withdraw check
  scripts/local-setup.ts         mock USDC + registry on a local Hardhat node
app/                       Next.js 16 App Router
  page.tsx                       homepage
  create/page.tsx                create a registry
  r/[id]/page.tsx                public registry page (contribute, withdraw)
  api/registries/...             metadata + contribution-note API (server-side only)
components/                UI (CreateRegistryForm, RegistryView, ContributeDialog, WithdrawPanel, …)
lib/                       chain config, wagmi/viem setup, tx helper, formatting, metadata schema
supabase/schema.sql        database tables
```

Stack: Next.js 16, React 19, Tailwind CSS 4, wagmi 3 + viem 2 (injected wallets such as MetaMask and Rabby), Supabase, Hardhat 3, OpenZeppelin Contracts 5, Solidity 0.8.28.

### Smart contract rules

- `createRegistry(metadataHash, giftTargets[])` makes `msg.sender` the owner. Targets are in USDC base units (6 decimals) and must each be at least 0.01 USDC. A registry can have at most 50 gifts.
- `contribute(registryId, giftId, amount)`:
  - Pulls USDC with `SafeERC20.safeTransferFrom` and checks the balance actually increased by `amount`.
  - Requires `amount` of at least 0.01 USDC.
  - Pass `giftId = type(uint256).max` for the general cash fund, which has no cap.
  - **A gift can't be overfunded.** A contribution larger than what the gift still needs reverts with `ExceedsRemaining(remaining)`. Once a gift is funded it is marked complete and stops accepting contributions.
- `withdraw(registryId)`: **only the owner, at any time**, receives everything contributed and not yet withdrawn. `withdrawTo(registryId, to)` sends it to another address the owner chooses, e.g. if the owner's address has been blocklisted by USDC and can't receive.
  - `totalWithdrawn` is updated before the transfer, so the same funds can't be withdrawn twice.
  - Per-gift progress is unchanged, so guests still see what each gift raised.
  - *Why no "target reached" rule?* Locking funds until a target is met would trap money in gifts that never fill, and fixing that would need refund logic. Gifts are gifts to the owner either way, so "withdraw any time" is the simplest rule that never traps funds.
- **Ownership transfer** is two-step: the owner calls `transferRegistryOwnership(id, newWallet)`, then the new wallet calls `acceptRegistryOwnership(id)`. Proposing `address(0)` cancels. The old owner keeps control until the new one accepts.
- **Closing:** `setRegistryClosed(id, true/false)` (owner only) stops or resumes new contributions. Withdrawals always work.
- **Mistaken direct transfers.** USDC sent straight to the contract (a wallet "Send" of the ERC-20 token instead of `contribute`) belongs to no registry. The contract tracks `totalOwed`, everything contributed and not yet withdrawn across all registries.
  - Only the **excess** (`balance - totalOwed`) can be recovered, via `recoverExcess()`.
  - Only the `recoveryAddress` set at deployment (the deployer) can call it, and that address can't be changed.
  - It can never touch registry funds; tests check this.
  - Native USDC value transfers to the contract are rejected outright, because it has no `receive` function.
- **Constructor checks.** The token address must have contract code and report 6 decimals. This catches obvious mistakes, but it can't prove the address is Circle's USDC. The deploy script hardcodes the documented address and verifies `symbol()` and `decimals()` on chain, and `npm run check:testnet` / `check:arc` re-checks a deployment.
- Protections:
  - `ReentrancyGuard` on every function that moves funds.
  - Checks-effects-interactions ordering.
  - Custom errors.
  - No upgradeability and no pause. The only privileged role is the recovery address, which is limited to excess funds, so nobody but a registry's owner can move that registry's funds.
- Only an address and a hash are stored onchain. Personal details stay offchain.

Events: `RegistryCreated`, `Contributed`, `Withdrawn`, `OwnershipTransferStarted`, `OwnershipTransferred`, `RegistryClosedSet`, `ExcessRecovered`.

Security review: `contracts/test/SecurityReview.ts` runs a randomized test of 300 random operations, checking the accounting rules after every step, and documents the remaining limitations.

### How onchain and offchain data are linked

| Data | Where | Trust |
|---|---|---|
| Owner, gift targets, amounts raised, amounts withdrawn | Contract | Source of truth, read live by the browser |
| Title, names, descriptions, image links, naira rate | Supabase `registries.metadata_json` | Verified by hash |
| Contributor name and note | Supabase `contributions` | Amount, gift and sender come from the verified tx receipt; name and note are self-reported |

1. The browser serializes the registry details to JSON, computes `keccak256(json)`, and sends `createRegistry(hash, targets)`. The details include the **owner wallet** and the **link slug**, so both are covered by the onchain hash.
2. After the transaction confirms, it posts `{registryId, json}` to `/api/registries`. The server reads the registry from Arc and stores the details **only if**:
   - the hash matches the onchain `metadataHash`
   - the gift count matches
   - the owner named inside matches the onchain owner

   Nobody can attach different details to someone else's registry, and a copycat registry that reuses the same hash is rejected.
3. The registry page re-hashes the details and hides them if they don't match the chain.
4. If step 2 fails (for example, a network error), the details are kept in the owner's browser. The registry page then offers the owner a **"Publish my registry details"** button.
5. After a contribution confirms, the browser posts the tx hash (plus optional name and note) to `/api/registries/[id]/contributions`. The server fetches the receipt itself and stores only `Contributed` events from our contract. Contributions made outside the app still count in every total, because totals come from the contract; they just won't have a note.

### Currency

Targets are stored and contributed **in USDC**. Owners can optionally enter a naira-per-USDC rate:
- If they price gifts in naira, each target is converted to USDC at that rate (rounded up to the cent) before it's stored onchain.
- Naira figures are always labelled as "at the owner's rate".
- The app doesn't convert to naira, and it doesn't buy or deliver physical gifts.

### Registry links

Links look like `/r/ada-and-tundes-wedding-2274681a67cd`: the title plus 12 random hex characters, generated in the browser. The slug is part of the hashed details, so nobody can change or claim someone else's link, and links can't be guessed by counting. The database enforces one slug per registry. Old numeric links (`/r/3`) still work and redirect to the slug.

Registry amounts and owners are public on the blockchain. Random links keep registries out of easy browsing in the app, but they don't make the onchain data private.

## Running locally

Requirements: Node 22+ and a browser wallet (MetaMask or Rabby).

```bash
npm install                        # frontend
cd contracts && npm install        # contracts
npm test                           # 35 contract tests
npm run deploy:dry                 # dry-run the deploy script on a throwaway chain
npm run smoke:dry                  # dry-run the full create/contribute/withdraw flow
```

Full app against a local chain (no real funds):

```bash
cd contracts
npm run node                       # terminal 1: local chain, prints test private keys
npm run local-setup                # terminal 2: deploys mock USDC + registry, prints env vars
# paste the printed values into ../.env.local, then from the repo root:
npm run dev
```

`npm run e2e:local` then runs 20 automated checks against the running app and chain:
- real local transactions for create, contribute and withdraw
- tampered metadata rejected (409)
- fake or non-contribution tx hashes rejected (404 / 422)
- amounts sourced from the chain
- pages render

Import one of the Hardhat test private keys into a **separate test wallet profile**, and add network `http://127.0.0.1:8545` with chain ID 31337. Without Supabase keys, local dev stores data in `.data/dev-db.json`.

## Testing on Arc Testnet (free USDC)

Arc Testnet (chain ID `5042002`, explorer https://explorer.testnet.arc.io) behaves like Mainnet but uses free test USDC. USDC is at the same address, `0x3600…0000`.

1. Get test USDC at https://faucet.circle.com (choose Arc Testnet) for the deployer wallet and for a second "guest" wallet.
2. Store your key and deploy:
   ```bash
   cd contracts
   npx hardhat keystore set ARC_PRIVATE_KEY
   npm run deploy:testnet
   npm run smoke:testnet
   ```
   The deploy step writes the address to `deployments/arcTestnet.json`.
3. In `.env.local`, set `NEXT_PUBLIC_CHAIN_ID=5042002` and `NEXT_PUBLIC_REGISTRY_ADDRESS=<address>`, then remove `NEXT_PUBLIC_USDC_ADDRESS` and `RPC_URL`. Run `npm run dev`. The header shows a **Testnet** badge.

## Deploying to Arc Mainnet

### 1. Fund a deployer wallet
Use a **fresh wallet** used only for deploying. Send it about **1 USDC on Arc Mainnet**. Deployment costs well under that (gas is paid in USDC), and the smoke test uses 0.07 USDC, which it withdraws back to the wallet.

### 2. Store the key in Hardhat's encrypted keystore (never in a file or chat)
```bash
cd contracts
npx hardhat keystore set ARC_PRIVATE_KEY      # prompts for a password and the key
```

### 3. Deploy
```bash
npm run deploy:arc
```
The script checks that it's on chain 5042, that the token at `0x3600…0000` is 6-decimal USDC, and that the wallet holds USDC. It then deploys, waits for the receipt, and writes `deployments/arcMainnet.json` with the address and transaction hash.

### 4. Real onchain smoke test
```bash
npm run smoke:arc
```
This creates a registry, approves 0.07 USDC, contributes 0.05 to a gift and 0.02 as a general gift, then withdraws. It prints an explorer link for each transaction.

### 5. Verify the source on the explorer
The explorer is behind a Cloudflare challenge, so automated verification from the CLI may not work. Try manual verification in the explorer UI (contract page → "Verify & publish") with these settings:
- Compiler `v0.8.28`
- EVM version `cancun`
- Optimizer enabled, 200 runs
- Constructor argument: the USDC address

`npx hardhat compile --build-profile production` reproduces the exact build.

## Supabase setup

1. Create a project at https://supabase.com.
2. In SQL Editor, run `supabase/schema.sql`. If you ran an older version before, also run `supabase/migrations/002_registry_slugs.sql`.
3. From Project Settings → API, copy the **Project URL** and the **service_role** key.
4. Use them as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. They're server-only; never give them a `NEXT_PUBLIC_` prefix.

RLS is enabled with no policies, so the tables can only be reached through the app's API routes.

## Vercel deployment

1. Push this repo to GitHub, then on vercel.com choose **Add New → Project** and import it. The framework is Next.js and the root directory is the repo root.
2. Set these environment variables (see `.env.example`):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `5042` |
| `NEXT_PUBLIC_REGISTRY_ADDRESS` | deployed contract address |
| `SUPABASE_URL` | from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase |
| `RPC_URL` | optional; defaults to `https://rpc.mainnet.arc.io` |

3. Deploy, then test the live URL (see the checklist below).

## Known limitations (MVP)

- Wallet support is limited to browser-injected wallets (MetaMask, Rabby, Coinbase Wallet extension, or a wallet app's in-app browser). WalletConnect isn't included.
- A registry's details can't be edited after creation, because the hash is fixed onchain.
- Display names aren't verified. Anyone can create a registry with the same title. Guests should use the link they were sent; the page also shows the owner's wallet address.
- Contributor names and notes are unauthenticated. Anyone who knows a tx hash could submit the note first; the amount shown is always the verified onchain amount.
- If the owner loses their wallet, nobody can withdraw that registry's funds. The recovery address can't touch them by design.
- USDC itself is an upgradeable contract operated by Circle, a standard trust assumption for USDC on every chain.
- The contract hasn't been professionally audited.

## Arc Microgrants submission checklist

- [ ] `npm test` passes in `contracts/`
- [ ] Contract deployed to Arc Mainnet; address and tx hash added to the table above
- [ ] `npm run smoke:arc` passed; explorer links recorded below
- [ ] Contract source verified on explorer.arc.io (or verification attempt documented)
- [ ] Supabase schema applied; Vercel env vars set
- [ ] Live URL: create a registry → contribute from a second wallet → the contribution shows on the page → owner withdraws
- [ ] Wallet-rejection, insufficient-USDC and wrong-network states checked on the live URL
- [ ] Public GitHub repo with this README

### Onchain evidence
_Add the deployment and smoke-test transaction links here after running steps 3–4._
