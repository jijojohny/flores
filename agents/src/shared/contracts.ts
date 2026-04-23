import { getContract } from "viem";
import { publicClient, deployerWallet, analystWallet, lenderWallet, auditorWallet } from "../chain.js";
import {
  IDENTITY_REGISTRY, REPUTATION_REGISTRY, VALIDATION_REGISTRY,
  CREDIT_SCORE, MOCK_USDC, LENDING_POOL,
} from "../config.js";

// ─── ABIs (minimal — only functions we call) ──────────────────

export const identityRegistryAbi = [
  { name: "register",    type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentURI", type: "string" }],                                                                                          outputs: [{ name: "agentId", type: "uint256" }] },
  { name: "ownerOf",     type: "function", stateMutability: "view",       inputs: [{ name: "tokenId", type: "uint256" }],                                                                                          outputs: [{ type: "address" }] },
  { name: "totalSupply", type: "function", stateMutability: "view",       inputs: [],                                                                                                                              outputs: [{ type: "uint256" }] },
  { name: "AgentRegistered", type: "event", inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "owner", type: "address", indexed: true }, { name: "agentURI", type: "string", indexed: false }] },
] as const;

export const reputationRegistryAbi = [
  {
    name: "giveFeedback", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "agentId",      type: "uint256" }, { name: "value",       type: "int128"  },
      { name: "valueDecimals",type: "uint8"   }, { name: "tag1",        type: "string"  },
      { name: "tag2",         type: "string"  }, { name: "endpoint",    type: "string"  },
      { name: "feedbackURI",  type: "string"  }, { name: "feedbackHash",type: "bytes32" },
    ],
    outputs: [],
  },
  { name: "FeedbackGiven", type: "event", inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "from", type: "address", indexed: true }, { name: "value", type: "int128", indexed: false }, { name: "tag1", type: "string", indexed: false }, { name: "tag2", type: "string", indexed: false }] },
] as const;

export const validationRegistryAbi = [
  {
    name: "submitValidation", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "agentId",  type: "uint256" }, { name: "taskId",   type: "uint256" },
      { name: "passed",   type: "bool"    }, { name: "proofURI", type: "string"  },
    ],
    outputs: [],
  },
  { name: "ValidationSubmitted", type: "event", inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "taskId", type: "uint256", indexed: true }, { name: "passed", type: "bool", indexed: false }, { name: "proofURI", type: "string", indexed: false }, { name: "validator", type: "address", indexed: true }] },
] as const;

export const creditScoreAbi = [
  { name: "recordTransaction", type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentId", type: "uint256" }, { name: "amountWei", type: "uint256" }], outputs: [] },
  { name: "recordRepayment",   type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentId", type: "uint256" }, { name: "onTime",    type: "bool"    }], outputs: [] },
  { name: "getCreditScore",    type: "function", stateMutability: "view",       inputs: [{ name: "agentId", type: "uint256" }],                                          outputs: [{ name: "score", type: "uint256" }] },
  { name: "getTier",           type: "function", stateMutability: "view",       inputs: [{ name: "agentId", type: "uint256" }],                                          outputs: [{ name: "",      type: "string"  }] },
  { name: "getTierBorrowLimit", type: "function", stateMutability: "view", inputs: [{ name: "tier", type: "string" }], outputs: [{ type: "uint256" }] },
  { name: "getTierBorrowLimitForAgent", type: "function", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "getProfile",        type: "function", stateMutability: "view",       inputs: [{ name: "agentId", type: "uint256" }],                                          outputs: [{ name: "", type: "tuple", components: [{ name: "totalTransactions", type: "uint256" }, { name: "totalVolumeWei", type: "uint256" }, { name: "successfulRepayments", type: "uint256" }, { name: "defaults", type: "uint256" }, { name: "firstActivityBlock", type: "uint256" }, { name: "lastActivityBlock", type: "uint256" }] }] },
  { name: "TransactionRecorded", type: "event", inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "amountWei", type: "uint256", indexed: false }, { name: "recorder", type: "address", indexed: false }] },
] as const;

export const mockUsdcAbi = [
  { name: "approve",     type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "transfer",    type: "function", stateMutability: "nonpayable", inputs: [{ name: "to",      type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "transferFrom",type: "function", stateMutability: "nonpayable", inputs: [{ name: "from",    type: "address" }, { name: "to",     type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "balanceOf",   type: "function", stateMutability: "view",       inputs: [{ name: "account", type: "address" }],                                         outputs: [{ type: "uint256" }] },
  { name: "Transfer",    type: "event",    inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }] },
] as const;

export const lendingPoolAbi = [
  { name: "deposit",      type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount",   type: "uint256" }], outputs: [] },
  { name: "requestLoan",  type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentId",  type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "drawMore",     type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentId",  type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "repayLoan",    type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentId",  type: "uint256" }, { name: "maxPayment", type: "uint256" }], outputs: [] },
  { name: "liquidateOverdue", type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentId", type: "uint256" }], outputs: [] },
  { name: "markDefault",  type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentId",  type: "uint256" }], outputs: [] },
  { name: "getPoolStats", type: "function", stateMutability: "view",       inputs: [], outputs: [{ name: "balance", type: "uint256" }, { name: "issued", type: "uint256" }, { name: "repaid", type: "uint256" }, { name: "active", type: "uint256" }] },
  { name: "getLoan",      type: "function", stateMutability: "view",       inputs: [{ name: "agentId",  type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "principal", type: "uint256" }, { name: "interestOwed", type: "uint256" }, { name: "lastAccrualBlock", type: "uint256" }, { name: "issuedBlock", type: "uint256" }, { name: "dueBlock", type: "uint256" }, { name: "active", type: "bool" }] }] },
  { name: "totalDebt",    type: "function", stateMutability: "view",       inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ name: "principal", type: "uint256" }, { name: "interest", type: "uint256" }, { name: "total", type: "uint256" }] },
  { name: "utilizationWad", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "currentBorrowAprWad", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getEffectiveBorrowLimitBps", type: "function", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "defaultStrikeCount", type: "function", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "hasDefaulted", type: "function", stateMutability: "view",       inputs: [{ name: "agentId",  type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "LoanIssued",   type: "event",    inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "amount", type: "uint256", indexed: false }, { name: "tier", type: "string", indexed: false }] },
  { name: "LoanRepaid",   type: "event",    inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "principalPaid", type: "uint256", indexed: false }, { name: "interestPaid", type: "uint256", indexed: false }, { name: "closed", type: "bool", indexed: false }, { name: "onTime", type: "bool", indexed: false }] },
] as const;

// ─── Typed contract instances ─────────────────────────────────

export const identityRegistry = getContract({ address: IDENTITY_REGISTRY,   abi: identityRegistryAbi,   client: { public: publicClient, wallet: deployerWallet } });
export const reputationReg    = getContract({ address: REPUTATION_REGISTRY,  abi: reputationRegistryAbi, client: { public: publicClient, wallet: auditorWallet  } });
export const validationReg    = getContract({ address: VALIDATION_REGISTRY,  abi: validationRegistryAbi, client: { public: publicClient, wallet: auditorWallet  } });
export const creditScore       = getContract({ address: CREDIT_SCORE,         abi: creditScoreAbi,        client: { public: publicClient, wallet: deployerWallet } });
export const mockUsdc          = getContract({ address: MOCK_USDC,            abi: mockUsdcAbi,           client: { public: publicClient, wallet: analystWallet  } });
export const lendingPool       = getContract({ address: LENDING_POOL,         abi: lendingPoolAbi,        client: { public: publicClient, wallet: analystWallet  } });
