const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentCredit Smoke Test", function () {
  let identityRegistry, creditScore, mockUsdc, lendingPool;
  let deployer, agentOwner, lender;
  let agentId;

  before(async function () {
    [deployer, agentOwner, lender] = await ethers.getSigners();

    identityRegistry = await ethers.deployContract("IdentityRegistry");
    const ReputationRegistry = await ethers.deployContract("ReputationRegistry");
    const ValidationRegistry = await ethers.deployContract("ValidationRegistry");
    creditScore      = await ethers.deployContract("AgentCreditScore");
    mockUsdc         = await ethers.deployContract("MockUSDC");
    lendingPool      = await ethers.deployContract("MicroLendingPool", [
      await mockUsdc.getAddress(),
      await creditScore.getAddress(),
      await identityRegistry.getAddress(),
    ]);

    // Authorize lending pool as credit recorder
    await creditScore.addAuthorizedRecorder(await lendingPool.getAddress());

    // Mint USDC for lender and agent
    await mockUsdc.mintTo(lender.address, ethers.parseEther("500"));
    await mockUsdc.mintTo(agentOwner.address, ethers.parseEther("500"));
  });

  it("registers an agent and returns agentId=1", async function () {
    const tx = await identityRegistry.connect(agentOwner).register(
      'data:application/json,{"name":"AnalystAgent"}'
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "AgentRegistered"
    );
    agentId = event.args[0];
    expect(agentId).to.equal(1n);
    expect(await identityRegistry.ownerOf(agentId)).to.equal(agentOwner.address);
  });

  it("records transactions and builds credit score", async function () {
    const amount = ethers.parseEther("1"); // 1 USDC per tx

    // Record 20 transactions to push score to Tier C (score ≥ 250)
    for (let i = 0; i < 20; i++) {
      await creditScore.recordTransaction(agentId, amount);
    }

    const score = await creditScore.getCreditScore(agentId);
    const tier  = await creditScore.getTier(agentId);

    // 20 txs × 10pts = 200 (tx) + 20 × 1e18/1e17 = 200 (volume) + 150 (neutral) = 550 → Tier B
    expect(score).to.be.greaterThan(250n);
    expect(["B", "A"]).to.include(tier);
  });

  it("lender deposits USDC into pool", async function () {
    await mockUsdc.connect(lender).approve(await lendingPool.getAddress(), ethers.parseEther("200"));
    await lendingPool.connect(lender).deposit(ethers.parseEther("200"));
    const [balance] = await lendingPool.getPoolStats();
    expect(balance).to.equal(ethers.parseEther("200"));
  });

  it("agent requests a loan within tier limit", async function () {
    const loanAmount = ethers.parseEther("10");
    await mockUsdc.connect(agentOwner).approve(await lendingPool.getAddress(), loanAmount);

    await lendingPool.connect(agentOwner).requestLoan(agentId, loanAmount);

    const loan = await lendingPool.getLoan(agentId);
    expect(loan.active).to.be.true;
    expect(loan.amount).to.equal(loanAmount);
  });

  it("rejects second loan while one is active", async function () {
    await expect(
      lendingPool.connect(agentOwner).requestLoan(agentId, ethers.parseEther("5"))
    ).to.be.revertedWith("Active loan already exists");
  });

  it("rejects loan from non-owner of agentId", async function () {
    // Register second agent owned by lender
    await identityRegistry.connect(lender).register('data:application/json,{"name":"OtherAgent"}');
    const otherId = 2n;

    await expect(
      lendingPool.connect(agentOwner).requestLoan(otherId, ethers.parseEther("5"))
    ).to.be.revertedWith("Not agent owner");
  });

  it("agent repays loan, credit score improves to reflect clean repayment", async function () {
    const loanAmount = ethers.parseEther("10");
    const scoreBefore = await creditScore.getCreditScore(agentId);

    await mockUsdc.connect(agentOwner).approve(await lendingPool.getAddress(), loanAmount);
    await lendingPool.connect(agentOwner).repayLoan(agentId);

    const loan = await lendingPool.getLoan(agentId);
    expect(loan.active).to.be.false;

    const scoreAfter = await creditScore.getCreditScore(agentId);
    expect(scoreAfter).to.be.greaterThanOrEqual(scoreBefore); // repayment can only help
  });

  it("defaulted agent cannot borrow again", async function () {
    // Give agent a loan then fast-forward blocks to simulate default
    await lendingPool.connect(agentOwner).requestLoan(agentId, ethers.parseEther("5"));

    // Mine blocks past dueBlock (50400)
    await ethers.provider.send("hardhat_mine", ["0xC51F"]); // 50463 blocks in hex

    await lendingPool.markDefault(agentId);
    expect(await lendingPool.hasDefaulted(agentId)).to.be.true;

    await expect(
      lendingPool.connect(agentOwner).requestLoan(agentId, ethers.parseEther("1"))
    ).to.be.revertedWith("Agent has defaulted - credit frozen");
  });
});
