const { expect } = require("chai");
const { ethers, network } = require("hardhat");

/**
 * The constructor's verifier-override guard.
 *
 * The override exists so the state machine can be tested without a live attestation
 * round. Left ungated it would be a backdoor: a deployment pointed at a verifier that
 * approves every proof would emit PaymentVerified events indistinguishable on-chain
 * from real ones. The guard makes that impossible off the local test chain.
 *
 * This file asserts the correct behaviour for whichever chain id it runs under, so it
 * passes both in the default suite (31337) and under `npm run test:override-guard`,
 * which re-runs it with the chain id set to Coston2's 114.
 */
describe("verifier override guard", function () {
  let factory, mockAddress, chainId;

  before(async function () {
    chainId = Number((await ethers.provider.getNetwork()).chainId);
    factory = await ethers.getContractFactory("LatePayShield");
    const mock = await (await ethers.getContractFactory("MockFdcVerification")).deploy();
    mockAddress = await mock.getAddress();
  });

  it("always allows the zero address, which resolves the enshrined FdcVerification", async function () {
    const shield = await factory.deploy(ethers.ZeroAddress);
    await shield.waitForDeployment();
    expect(await shield.fdcVerificationOverride()).to.equal(ethers.ZeroAddress);
  });

  if (Number(process.env.HARDHAT_CHAIN_ID || 31337) === 31337) {
    it("permits the override on the local test chain (31337)", async function () {
      expect(chainId).to.equal(31337);
      const shield = await factory.deploy(mockAddress);
      await shield.waitForDeployment();
      expect(await shield.fdcVerificationOverride()).to.equal(mockAddress);
    });
  } else {
    it("rejects the override on a non-local chain, so no live deploy can fake proofs", async function () {
      expect(chainId).to.not.equal(31337);
      await expect(factory.deploy(mockAddress))
        .to.be.revertedWithCustomError(factory, "VerifierOverrideNotAllowed")
        .withArgs(chainId);
    });

    it("rejects it even when the deployer is the one asking", async function () {
      const [, other] = await ethers.getSigners();
      await expect(
        factory.connect(other).deploy(other.address)
      ).to.be.revertedWithCustomError(factory, "VerifierOverrideNotAllowed");
    });
  }

  it(`reports network chainId ${process.env.HARDHAT_CHAIN_ID || 31337}`, function () {
    expect(network.config.chainId).to.equal(chainId);
  });
});
