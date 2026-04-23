const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentCredit Smoke Test", function () {
  let identityRegistry, creditScore, mockUsdc, lendingPool;
  let deployer, agentOwner, lender;
  let agentId;

  before(async function () {
    [deployer, agentOwner, lender] = await ethers.getSigners();

    identityRegistry = await ethers.deployContract("IdentityRegistry");
    await ethers.deployContract("ReputationRegistry");
    await ethers.deployContract("ValidationRegistry");
    creditScore = await ethers.deployContract("AgentCreditScore");
    mockUsdc = await ethers.deployContract("MockUSDC");
    lendingPool = await ethers.deployContract("MicroLendingPool", [
      await mockUsdc.getAddress(),
      await creditScore.getAddress(),
      await identityRegistry.getAddress(),
    ]);

    await creditScore.addAuthorizedRecorder(await lendingPool.getAddress());

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
    const amount = ethers.parseEther("1");

    for (let i = 0; i < 20; i++) {
      await creditScore.recordTransaction(agentId, amount);
    }

    const score = await creditScore.getCreditScore(agentId);
    const tier = await creditScore.getTier(agentId);

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
    await lendingPool.connect(agentOwner).requestLoan(agentId, loanAmount);

    const loan = await lendingPool.getLoan(agentId);
    expect(loan.active).to.be.true;
    expect(loan.principal).to.equal(loanAmount);
  });

  it("rejects second loan while one is active", async function () {
    await expect(
      lendingPool.connect(agentOwner).requestLoan(agentId, ethers.parseEther("5"))
    ).to.be.revertedWith("Active loan already exists");
  });

  it("rejects loan from non-owner of agentId", async function () {
    await identityRegistry.connect(lender).register('data:application/json,{"name":"OtherAgent"}');
    const otherId = 2n;

    await expect(
      lendingPool.connect(agentOwner).requestLoan(otherId, ethers.parseEther("5"))
    ).to.be.revertedWith("Not agent owner");
  });

  it("agent repays loan in full (0 = entire debt, interest first)", async function () {
    const scoreBefore = await creditScore.getCreditScore(agentId);

    await mockUsdc.connect(agentOwner).approve(await lendingPool.getAddress(), ethers.MaxUint256);
    await lendingPool.connect(agentOwner).repayLoan(agentId, 0);

    const loan = await lendingPool.getLoan(agentId);
    expect(loan.active).to.be.false;

    const scoreAfter = await creditScore.getCreditScore(agentId);
    expect(scoreAfter).to.be.greaterThanOrEqual(scoreBefore);
  });

  it("after max strikes borrower is frozen forever", async function () {
    await lendingPool.setLiquidationParams(120, 1, 100, 2500, 7500);

    await lendingPool.connect(agentOwner).requestLoan(agentId, ethers.parseEther("5"));

    await ethers.provider.send("hardhat_mine", ["0xC51F"]);

    await lendingPool.markDefault(agentId);
    expect(await lendingPool.hasDefaulted(agentId)).to.be.true;

    await expect(
      lendingPool.connect(agentOwner).requestLoan(agentId, ethers.parseEther("1"))
    ).to.be.revertedWith("Borrowing frozen");
  });
});
