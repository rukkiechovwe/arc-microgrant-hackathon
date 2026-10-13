import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
} from "viem";
import { formatUsdc } from "./format";

const revertMessages: Record<string, (args?: readonly unknown[]) => string> = {
  AmountTooSmall: () => "The minimum amount is 0.01 USDC.",
  ExceedsRemaining: (args) =>
    `That's more than this gift still needs. Only ${formatUsdc(BigInt(args?.[0] as bigint), { decimals: 2 })} USDC remains.`,
  GiftNotFound: () => "That gift doesn't exist in this registry.",
  RegistryNotFound: () => "This registry doesn't exist on Arc.",
  NotOwner: () => "Only the registry owner can do this.",
  NothingToWithdraw: () => "There are no funds to withdraw yet.",
  InvalidTarget: () => "Every gift needs a target of at least 0.01 USDC.",
  TooManyGifts: () => "A registry can have at most 50 gifts.",
  InvalidMetadata: () => "Registry details are missing.",
  RegistryClosed: () => "This registry is closed and no longer accepting gifts.",
  NotPendingOwner: () => "This wallet hasn't been invited to take over this registry.",
  InvalidRecipient: () => "Enter a valid wallet address to send the funds to.",
  ERC20InsufficientBalance: () => "Your wallet doesn't have enough USDC.",
  ERC20InsufficientAllowance: () => "USDC spending wasn't approved for this amount. Please approve and try again.",
};

/** Turns wallet / RPC / contract errors into a short message a non-crypto user can act on. */
export function friendlyError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return "You cancelled the request in your wallet. Nothing was sent.";
    }
    if (error.walk((e) => e instanceof InsufficientFundsError)) {
      return "Your wallet doesn't have enough USDC to cover this and the small network fee.";
    }
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && revertMessages[name]) return revertMessages[name](reverted.data?.args);
      if (reverted.reason) return `The transaction was rejected: ${reverted.reason}`;
    }
    if (/user (rejected|denied)/i.test(error.message)) {
      return "You cancelled the request in your wallet. Nothing was sent.";
    }
    return error.shortMessage || error.message;
  }
  if (error instanceof Error) {
    if (/user (rejected|denied)/i.test(error.message)) return "You cancelled the request in your wallet. Nothing was sent.";
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
