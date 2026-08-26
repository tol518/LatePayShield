const { network, ethers } = require("hardhat");

const abi = [
  "function fdcVerificationOverride() view returns (address)",
  "function nextAgreementId() view returns (uint256)",
];

async function main() {
  if (network.config.chainId !== 114) {
    throw new Error("Refusing to check a network other than Coston2 (chain ID 114).");
  }

  const address = process.env.LATEPAY_SHIELD_ADDRESS;
  if (!address || !ethers.isAddress(address)) {
    throw new Error("Set LATEPAY_SHIELD_ADDRESS in .env to the deployed Coston2 contract.");
  }

  const code = await ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(`No deployed bytecode found at ${address}.`);
  }

  const shield = new ethers.Contract(address, abi, ethers.provider);
  const [override, nextAgreementId] = await Promise.all([
    shield.fdcVerificationOverride(),
    shield.nextAgreementId(),
  ]);

  console.log(`Chain ID:                  ${network.config.chainId}`);
  console.log(`Contract:                  ${address}`);
  console.log(`Deployed bytecode:         ${(code.length - 2) / 2} bytes`);
  console.log(`FDC verification override: ${override}`);
  console.log(`Next agreement ID:         ${nextAgreementId}`);
  console.log(`Explorer: https://coston2-explorer.flare.network/address/${address}`);
}

main().catch((error) => {
  console.error(`\nDeployment check failed: ${error.message}`);
  process.exitCode = 1;
});
