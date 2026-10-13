import type { Abi, ContractFunctionArgs, ContractFunctionName, Hash, TransactionReceipt } from "viem";
import type { Config } from "wagmi";
import { getConnection, simulateContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { chain } from "./config";
import { arcFees } from "./wagmi";

/** Makes sure the connected wallet is on the app's chain, prompting a switch if needed. */
export async function ensureChain(config: Config) {
  if (getConnection(config).chainId !== chain.id) {
    await switchChain(config, { chainId: chain.id });
  }
}

/**
 * Simulates, sends and waits for a contract write. Simulation surfaces readable revert
 * reasons before the wallet prompt. Resolves only once the transaction is mined
 * successfully (Arc finalizes on inclusion); throws on rejection or onchain failure.
 */
export async function sendContractTx<
  const abi extends Abi,
  functionName extends ContractFunctionName<abi, "nonpayable">,
>(
  config: Config,
  params: {
    address: `0x${string}`;
    abi: abi;
    functionName: functionName;
    args: ContractFunctionArgs<abi, "nonpayable", functionName>;
  },
  onSubmitted?: (hash: Hash) => void,
): Promise<TransactionReceipt> {
  await ensureChain(config);
  const account = getConnection(config).address;
  if (!account) throw new Error("Connect your wallet first.");

  // Generic-heavy wagmi types don't narrow well through this wrapper; params are typed above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { request } = await simulateContract(config, { ...(params as any), account, chainId: chain.id });
  const fees = await arcFees(config);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hash = await writeContract(config, { ...(request as any), ...fees });
  onSubmitted?.(hash);

  const receipt = await waitForTransactionReceipt(config, { hash, chainId: chain.id });
  if (receipt.status !== "success") throw new Error("The transaction failed onchain. No funds were moved.");
  return receipt;
}
