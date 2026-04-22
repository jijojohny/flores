import { createPublicClient, http, defineChain, getContract } from "viem";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
export const EXPLORER = "https://testnet.arcscan.app";

import deployments from "../deployments.json";
import agentIds from "../agent-ids.json";

export { deployments, agentIds };

export const ADDRESSES = {
  identityRegistry:   deployments.identityRegistry   as `0x${string}`,
  reputationRegistry: deployments.reputationRegistry as `0x${string}`,
  validationRegistry: deployments.validationRegistry as `0x${string}`,
  agentCreditScore:   deployments.agentCreditScore   as `0x${string}`,
  mockUsdc:           deployments.mockUsdc           as `0x${string}`,
  microLendingPool:   deployments.microLendingPool   as `0x${string}`,
};

export const AGENT_META = [
  { name: "DataAgent",     id: agentIds.DataAgent,     address: "0xA25CB9CC78E4c112bbf8Eab4e6C7746cE1bD4Fa8", role: "Seller" },
  { name: "ComputeAgent",  id: agentIds.ComputeAgent,  address: "0x0fCa078813df3aD8c7658CB5C63c12Cb366fbDd5", role: "Seller" },
  { name: "AnalystAgent",  id: agentIds.AnalystAgent,  address: "0x1215d4fCEd39F3791fBDA4d1e118C19CEd2aA92F", role: "Borrower" },
  { name: "LenderAgent",   id: agentIds.LenderAgent,   address: "0x429662bb69622a37e5Fdf624d771188a26491C8e", role: "Lender" },
  { name: "AuditorAgent",  id: agentIds.AuditorAgent,  address: "0xd1b17d64AcadC3f3b23100E71Df218ed31E26CBc", role: "Auditor" },
];

export const creditScoreAbi = [
  { name: "getCreditScore", type: "function", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "getTier",        type: "function", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "string"  }] },
  { name: "getProfile",     type: "function", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "totalTransactions", type: "uint256" }, { name: "totalVolumeWei", type: "uint256" }, { name: "successfulRepayments", type: "uint256" }, { name: "defaults", type: "uint256" }, { name: "firstActivityBlock", type: "uint256" }, { name: "lastActivityBlock", type: "uint256" }] }] },
  { name: "TransactionRecorded", type: "event", inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "amountWei", type: "uint256", indexed: false }, { name: "recorder", type: "address", indexed: false }] },
] as const;

export const lendingPoolAbi = [
  { name: "getPoolStats", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "balance", type: "uint256" }, { name: "issued", type: "uint256" }, { name: "repaid", type: "uint256" }, { name: "active", type: "uint256" }] },
  { name: "getLoan",      type: "function", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "amount", type: "uint256" }, { name: "issuedBlock", type: "uint256" }, { name: "dueBlock", type: "uint256" }, { name: "active", type: "bool" }] }] },
  { name: "LoanIssued",   type: "event",    inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "amount", type: "uint256", indexed: false }, { name: "tier", type: "string", indexed: false }] },
  { name: "LoanRepaid",   type: "event",    inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "amount", type: "uint256", indexed: false }, { name: "onTime", type: "bool", indexed: false }] },
] as const;
