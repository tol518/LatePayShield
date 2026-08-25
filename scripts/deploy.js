const { network, ethers, run } = require("hardhat");

async function main() {
  if (network.config.chainId !== 114 && network.name !== "hardhat") {
    throw new Error(
      `Refusing to deploy to chainId ${network.config.chainId}. Coston2 (114) only.`
    );
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} C2FLR`);
  if (balance === 0n) {
    throw new Error("Deployer has no C2FLR. Fund it at https://faucet.flare.network/coston2");
  }

  // Zero override => the contract resolves the real enshrined FdcVerification
  // via ContractRegistry. Never pass a non-zero address outside tests.
  const shield = await (await ethers.getContractFactory("LatePayShield")).deploy(
    ethers.ZeroAddress
  );
  await shield.waitForDeployment();

  const address = await shield.getAddress();
  console.log(`\nLatePayShield deployed: ${address}`);
  console.log(`Explorer: https://coston2-explorer.flare.network/address/${address}`);
  console.log(`\nAdd to .env:\nLATEPAY_SHIELD_ADDRESS=${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
