const fs = require("fs");
const path = require("path");
const { network, ethers } = require("hardhat");
const { EVIDENCE_DIR, latestEvidence } = require("../lib/fdc-proof");

const FDC_HUB = "0x48aC463d7975828989331F4De43341627b9c5f1D";
const FDC_REQUEST_FEE_CONFIGURATIONS =
  "0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e";
const FLARE_CONTRACT_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

const feeAbi = [
  "function getRequestFee(bytes calldata _data) external view returns (uint256)",
];
const hubAbi = [
  "function requestAttestation(bytes calldata _data) external payable",
  "event AttestationRequest(bytes data, uint256 fee)",
];
const registryAbi = [
  "function getContractAddressByName(string calldata _name) external view returns (address)",
];
const protocolsV2Abi = [
  "function firstVotingRoundStartTs() external view returns (uint64)",
  "function votingEpochDurationSeconds() external view returns (uint64)",
];

async function main() {
  if (network.config.chainId !== 114) {
    throw new Error("Refusing to submit outside Coston2 (chain ID 114).");
  }

  const prepared = latestEvidence("fdc-request-");
  const request = process.env.FDC_ABI_ENCODED_REQUEST || prepared?.requestBytes;
  if (!request || !ethers.isHexString(request) || request.length < 4) {
    throw new Error(
      "No request bytes. Run `npm run fdc:prepare`, or set FDC_ABI_ENCODED_REQUEST in .env " +
        "to the public 0x... value returned by the FDC verifier."
    );
  }
  if (prepared && request === prepared.requestBytes) {
    console.log(`Request source: ${prepared.file}`);
  }

  const [submitter] = await ethers.getSigners();
  if (!submitter) {
    throw new Error("Set COSTON2_PRIVATE_KEY in .env for a throwaway, faucet-funded Coston2 account.");
  }

  const feeConfigurations = new ethers.Contract(
    FDC_REQUEST_FEE_CONFIGURATIONS,
    feeAbi,
    ethers.provider
  );
  const fee = await feeConfigurations.getRequestFee(request);
  const balance = await ethers.provider.getBalance(submitter.address);

  console.log(`Submitter: ${submitter.address}`);
  console.log(`FDC fee:   ${fee.toString()} wei (${ethers.formatEther(fee)} C2FLR)`);
  console.log(`Balance:   ${ethers.formatEther(balance)} C2FLR`);

  if (balance < fee) {
    throw new Error("Insufficient C2FLR for the FDC fee. Fund the throwaway account at https://faucet.flare.network/coston2");
  }

  const hub = new ethers.Contract(FDC_HUB, hubAbi, submitter);
  const tx = await hub.requestAttestation(request, { value: fee });
  console.log(`Submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  const block = await ethers.provider.getBlock(receipt.blockNumber);
  console.log(`Confirmed in block ${receipt.blockNumber}`);
  console.log(`Explorer: https://coston2-explorer.flare.network/tx/${tx.hash}`);
  if (block) {
    const registry = new ethers.Contract(
      FLARE_CONTRACT_REGISTRY,
      registryAbi,
      ethers.provider
    );
    const systemsManagerAddress = await registry.getContractAddressByName(
      "FlareSystemsManager"
    );
    const systemsManager = new ethers.Contract(
      systemsManagerAddress,
      protocolsV2Abi,
      ethers.provider
    );
    const firstVotingRoundStartTs = await systemsManager.firstVotingRoundStartTs();
    const votingEpochDurationSeconds = await systemsManager.votingEpochDurationSeconds();
    const roundId =
      (BigInt(block.timestamp) - firstVotingRoundStartTs) /
      votingEpochDurationSeconds;
    console.log(`Voting round (calculated): ${roundId}`);
    console.log(`Finalizations: https://coston2-systems-explorer.flare.network/voting-round/${roundId}?tab=fdc`);

    // The round is only derivable from this block, so it is recorded next to the
    // request bytes rather than left for someone to copy out of the console.
    const outPath =
      prepared && request === prepared.requestBytes
        ? prepared.file
        : path.join(EVIDENCE_DIR, `fdc-request-${tx.hash.slice(2).toUpperCase()}.json`);
    const existing = prepared && outPath === prepared.file ? prepared : {};
    delete existing.file;
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          ...existing,
          requestBytes: request,
          submittedAt: new Date().toISOString(),
          submitter: submitter.address,
          submissionTransaction: tx.hash,
          blockNumber: receipt.blockNumber,
          votingRoundId: Number(roundId),
          systemsExplorer: `https://coston2-systems-explorer.flare.network/voting-round/${roundId}?tab=fdc`,
          explorer: `https://coston2-explorer.flare.network/tx/${tx.hash}`,
        },
        null,
        2
      ) + "\n"
    );
    console.log(`\nSaved: ${outPath}`);
    console.log(`\nNext: npm run fdc:proof (waits for the round to finalize)`);
  }
}

main().catch((error) => {
  console.error(`\nFDC submission failed: ${error.message}`);
  process.exitCode = 1;
});
