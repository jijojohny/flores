const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentCreditScore edge cases", function () {
  let creditScore;
  let deployer, stranger;

  beforeEach(async function () {
    [deployer, stranger] = await ethers.getSigners();
    creditScore = await ethers.deployContract("AgentCreditScore");
  });

  it("reverts recordTransaction from unauthorized caller", async function () {
    await expect(
      creditScore.connect(stranger).recordTransaction(1n, ethers.parseEther("1"))
    ).to.be.revertedWith("Not authorized recorder");
  });

  it("returns tier D for agent with no activity", async function () {
    expect(await creditScore.getCreditScore(99n)).to.equal(150n);
    expect(await creditScore.getTier(99n)).to.equal("D");
  });

  it("caps volume and transaction components in getCreditScore", async function () {
    const agentId = 1n;
    const big = ethers.parseEther("50");
    for (let i = 0; i < 40; i++) {
      await creditScore.recordTransaction(agentId, big);
    }
    const score = await creditScore.getCreditScore(agentId);
    expect(score).to.be.at.most(900n);
    expect(await creditScore.getTier(agentId)).to.equal("A");
  });

  it("owner can tune tier params and getTierBorrowLimit updates", async function () {
    await creditScore.setTierParams(800, 400, 200, ethers.parseEther("200"), ethers.parseEther("80"), ethers.parseEther("30"));
    expect(await creditScore.getTierBorrowLimit("C")).to.equal(ethers.parseEther("30"));
  });
});

describe("MicroLendingPool edge cases", function () {
  let identityRegistry, creditScore, mockUsdc, lendingPool;
  let deployer, agentOwner, lender;
  let borrowerAgentId;

  beforeEach(async function () {
    [deployer, agentOwner, lender] = await ethers.getSigners();
    identityRegistry = await ethers.deployContract("IdentityRegistry");
    creditScore = await ethers.deployContract("AgentCreditScore");
    mockUsdc = await ethers.deployContract("MockUSDC");
    lendingPool = await ethers.deployContract("MicroLendingPool", [
      await mockUsdc.getAddress(),
      await creditScore.getAddress(),
      await identityRegistry.getAddress(),
    ]);
    await creditScore.addAuthorizedRecorder(await lendingPool.getAddress());

    await mockUsdc.mintTo(lender.address, ethers.parseEther("1000"));
    await mockUsdc.mintTo(agentOwner.address, ethers.parseEther("1000"));

    const tx = await identityRegistry.connect(agentOwner).register('data:application/json,{"name":"Borrower"}');
    const receipt = await tx.wait();
    const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "AgentRegistered");
    borrowerAgentId = ev.args[0];
  });

  async function reachTierC(agentId) {
    const amount = ethers.parseEther("1");
    for (let i = 0; i < 5; i++) {
      await creditScore.recordTransaction(agentId, amount);
    }
  }

  it("reverts when amount exceeds tier limit", async function () {
    await reachTierC(borrowerAgentId);
    expect(await creditScore.getTier(borrowerAgentId)).to.equal("C");

    await mockUsdc.connect(lender).approve(await lendingPool.getAddress(), ethers.parseEther("200"));
    await lendingPool.connect(lender).deposit(ethers.parseEther("200"));

    await expect(
      lendingPool.connect(agentOwner).requestLoan(borrowerAgentId, ethers.parseEther("21"))
    ).to.be.revertedWith("Amount exceeds tier limit");
  });

  it("reverts on insufficient pool liquidity", async function () {
    await reachTierC(borrowerAgentId);
    await expect(
      lendingPool.connect(agentOwner).requestLoan(borrowerAgentId, ethers.parseEther("5"))
    ).to.be.revertedWith("Insufficient pool liquidity");
  });

  it("reverts markDefault before loan is overdue", async function () {
    await reachTierC(borrowerAgentId);
    await mockUsdc.connect(lender).approve(await lendingPool.getAddress(), ethers.parseEther("50"));
    await lendingPool.connect(lender).deposit(ethers.parseEther("50"));

    await lendingPool.connect(agentOwner).requestLoan(borrowerAgentId, ethers.parseEther("5"));

    await expect(lendingPool.liquidateOverdue(borrowerAgentId)).to.be.revertedWith("Loan not yet overdue");
  });

  it("reverts repayLoan when no active loan", async function () {
    await expect(lendingPool.connect(agentOwner).repayLoan(borrowerAgentId, 0)).to.be.revertedWith("No active loan");
  });

  it("partial repay applies interest first then principal", async function () {
    await reachTierC(borrowerAgentId);
    await mockUsdc.connect(lender).approve(await lendingPool.getAddress(), ethers.parseEther("100"));
    await lendingPool.connect(lender).deposit(ethers.parseEther("100"));
    await lendingPool.connect(agentOwner).requestLoan(borrowerAgentId, ethers.parseEther("10"));

    await ethers.provider.send("hardhat_mine", [ethers.toQuantity(1000n)]);

    const [, interestBefore] = await lendingPool.totalDebt(borrowerAgentId);
    expect(interestBefore).to.be.gt(0n);

    const pay = interestBefore / 2n;
    await mockUsdc.connect(agentOwner).approve(await lendingPool.getAddress(), pay);
    await lendingPool.connect(agentOwner).repayLoan(borrowerAgentId, pay);

    const loan = await lendingPool.getLoan(borrowerAgentId);
    expect(loan.active).to.be.true;
    expect(loan.interestOwed).to.be.lt(interestBefore);
    expect(loan.principal).to.equal(ethers.parseEther("10"));
  });

  it("drawMore increases principal within tier cap", async function () {
    await reachTierC(borrowerAgentId);
    await mockUsdc.connect(lender).approve(await lendingPool.getAddress(), ethers.parseEther("200"));
    await lendingPool.connect(lender).deposit(ethers.parseEther("200"));
    await lendingPool.connect(agentOwner).requestLoan(borrowerAgentId, ethers.parseEther("10"));
    await lendingPool.connect(agentOwner).drawMore(borrowerAgentId, ethers.parseEther("5"));

    const loan = await lendingPool.getLoan(borrowerAgentId);
    expect(loan.principal).to.equal(ethers.parseEther("15"));
  });

  it("strike reduces effective borrow limit bps", async function () {
    await reachTierC(borrowerAgentId);
    await mockUsdc.connect(lender).approve(await lendingPool.getAddress(), ethers.parseEther("200"));
    await lendingPool.connect(lender).deposit(ethers.parseEther("200"));

    await lendingPool.setLiquidationParams(50, 5, 100, 2500, 7500);

    await lendingPool.connect(agentOwner).requestLoan(borrowerAgentId, ethers.parseEther("20"));
    await ethers.provider.send("hardhat_mine", ["0xC51F"]);
    await lendingPool.liquidateOverdue(borrowerAgentId);

    expect(await lendingPool.defaultStrikeCount(borrowerAgentId)).to.equal(1n);
    expect(await lendingPool.getEffectiveBorrowLimitBps(borrowerAgentId)).to.equal(7500n);
  });
});
