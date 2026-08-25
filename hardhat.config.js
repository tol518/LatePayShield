require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const COSTON2_RPC_URL =
  process.env.COSTON2_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc";
const COSTON2_PRIVATE_KEY = process.env.COSTON2_PRIVATE_KEY;

/**
 * Network config verified against https://dev.flare.network/network/overview
 * on 25 August 2026. Re-check before demo day.
 *
 * Only testnets are configured on purpose. Adding a mainnet entry here would
 * make it possible for demo data to target real funds.
 */
module.exports = {
  solidity: {
    version: "0.8.25",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Coston2 does not reliably support post-Paris opcodes (e.g. PUSH0).
      evmVersion: "paris",
    },
  },
  networks: {
    // chainId is overridable ONLY for the in-memory test chain, so the constructor's
    // verifier-override guard can be exercised against a non-local chain id. It has no
    // effect on any real network.
    hardhat: { chainId: Number(process.env.HARDHAT_CHAIN_ID || 31337) },
    coston2: {
      url: COSTON2_RPC_URL,
      chainId: 114,
      accounts: COSTON2_PRIVATE_KEY ? [COSTON2_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: { coston2: "no-api-key-needed" },
    customChains: [
      {
        network: "coston2",
        chainId: 114,
        urls: {
          apiURL: "https://coston2-explorer.flare.network/api",
          browserURL: "https://coston2-explorer.flare.network",
        },
      },
    ],
  },
};
