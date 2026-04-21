const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying from:", deployer.address);
  console.log("Network:", network.name, "| Chain ID:", network.config.chainId);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "USDC\n");

  const deployments = {
    network: network.name,
    chainId: network.config.chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  // ── 1. ERC-8004 registries ────────────────────────────────────
  process.stdout.write("Deploying IdentityRegistry... ");
  const IdentityRegistry = await ethers.deployContract("IdentityRegistry");
  await IdentityRegistry.waitForDeployment();
  deployments.identityRegistry = await IdentityRegistry.getAddress();
  console.log(deployments.identityRegistry);

  process.stdout.write("Deploying ReputationRegistry... ");
  const ReputationRegistry = await ethers.deployContract("ReputationRegistry");
  await ReputationRegistry.waitForDeployment();
  deployments.reputationRegistry = await ReputationRegistry.getAddress();
  console.log(deployments.reputationRegistry);

  process.stdout.write("Deploying ValidationRegistry... ");
  const ValidationRegistry = await ethers.deployContract("ValidationRegistry");
  await ValidationRegistry.waitForDeployment();
  deployments.validationRegistry = await ValidationRegistry.getAddress();
  console.log(deployments.validationRegistry);

  // ── 2. Credit scoring ─────────────────────────────────────────
  process.stdout.write("Deploying AgentCreditScore... ");
  const AgentCreditScore = await ethers.deployContract("AgentCreditScore");
  await AgentCreditScore.waitForDeployment();
  deployments.agentCreditScore = await AgentCreditScore.getAddress();
  console.log(deployments.agentCreditScore);

  // ── 3. Mock USDC ──────────────────────────────────────────────
  process.stdout.write("Deploying MockUSDC... ");
  const MockUSDC = await ethers.deployContract("MockUSDC");
  await MockUSDC.waitForDeployment();
  deployments.mockUsdc = await MockUSDC.getAddress();
  console.log(deployments.mockUsdc);

  // ── 4. Lending pool (depends on 1, 2, 3) ─────────────────────
  process.stdout.write("Deploying MicroLendingPool... ");
  const MicroLendingPool = await ethers.deployContract("MicroLendingPool", [
    deployments.mockUsdc,
    deployments.agentCreditScore,
    deployments.identityRegistry,
  ]);
  await MicroLendingPool.waitForDeployment();
  deployments.microLendingPool = await MicroLendingPool.getAddress();
  console.log(deployments.microLendingPool);

  // ── 5. Authorize lending pool to call recordRepayment ─────────
  process.stdout.write("Authorizing MicroLendingPool as credit recorder... ");
  const authTx = await AgentCreditScore.addAuthorizedRecorder(deployments.microLendingPool);
  await authTx.wait();
  console.log("done (tx:", authTx.hash, ")");
  deployments.authorizationTx = authTx.hash;

  // ── 6. Mint MockUSDC to all agent wallets ─────────────────────
  const agentKeys = [
    process.env.DATA_AGENT_PRIVATE_KEY,
    process.env.COMPUTE_AGENT_PRIVATE_KEY,
    process.env.ANALYST_AGENT_PRIVATE_KEY,
    process.env.LENDER_AGENT_PRIVATE_KEY,
    process.env.AUDITOR_AGENT_PRIVATE_KEY,
  ].filter(Boolean);

  const agentAddresses = agentKeys.map((pk) => {
    const wallet = new ethers.Wallet(pk);
    return wallet.address;
  });

  const mintAmount = ethers.parseEther("1000"); // 1000 USDC each
  console.log("\nMinting 1000 MockUSDC to each agent...");
  for (const addr of agentAddresses) {
    const tx = await MockUSDC.mintTo(addr, mintAmount);
    await tx.wait();
    console.log(" →", addr);
  }

  // ── 7. Write deployments.json ─────────────────────────────────
  const outPath = path.join(__dirname, "../../deployments.json");
  fs.writeFileSync(outPath, JSON.stringify(deployments, null, 2));
  console.log("\n✓ deployments.json written to", outPath);

  // ── 8. Print Arc explorer links ───────────────────────────────
  const explorer = "https://testnet.arcscan.app";
  console.log("\n─── Arc Block Explorer Links ───────────────────────────");
  const contractNames = [
    ["IdentityRegistry",   deployments.identityRegistry],
    ["ReputationRegistry", deployments.reputationRegistry],
    ["ValidationRegistry", deployments.validationRegistry],
    ["AgentCreditScore",   deployments.agentCreditScore],
    ["MockUSDC",           deployments.mockUsdc],
    ["MicroLendingPool",   deployments.microLendingPool],
  ];
  for (const [name, addr] of contractNames) {
    console.log(`${name.padEnd(22)} ${explorer}/address/${addr}`);
  }
  console.log(`${"AuthorizationTx".padEnd(22)} ${explorer}/tx/${deployments.authorizationTx}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
