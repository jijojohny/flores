import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ARC_RPC_URL,
  DEPLOYER_PK, DATA_AGENT_PK, COMPUTE_AGENT_PK,
  ANALYST_AGENT_PK, LENDER_AGENT_PK, AUDITOR_AGENT_PK,
} from "./config.js";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_RPC_URL ?? "https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

const transport = http(ARC_RPC_URL ?? "https://rpc.testnet.arc.network");

export const publicClient = createPublicClient({ chain: arcTestnet, transport });

// One wallet client per agent — each signs its own transactions
export const deployerWallet  = createWalletClient({ account: privateKeyToAccount(DEPLOYER_PK),      chain: arcTestnet, transport });
export const dataWallet      = createWalletClient({ account: privateKeyToAccount(DATA_AGENT_PK),    chain: arcTestnet, transport });
export const computeWallet   = createWalletClient({ account: privateKeyToAccount(COMPUTE_AGENT_PK), chain: arcTestnet, transport });
export const analystWallet   = createWalletClient({ account: privateKeyToAccount(ANALYST_AGENT_PK), chain: arcTestnet, transport });
export const lenderWallet    = createWalletClient({ account: privateKeyToAccount(LENDER_AGENT_PK),  chain: arcTestnet, transport });
export const auditorWallet   = createWalletClient({ account: privateKeyToAccount(AUDITOR_AGENT_PK), chain: arcTestnet, transport });

// Convenience: address for each wallet
export const DEPLOYER_ADDR  = deployerWallet.account.address;
export const DATA_ADDR      = dataWallet.account.address;
export const COMPUTE_ADDR   = computeWallet.account.address;
export const ANALYST_ADDR   = analystWallet.account.address;
export const LENDER_ADDR    = lenderWallet.account.address;
export const AUDITOR_ADDR   = auditorWallet.account.address;
