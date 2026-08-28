import { BrowserProvider, Contract } from 'ethers';
import { LATEPAY_SHIELD_ABI } from './abi.js';
import { COSTON2, CONTRACT_ADDRESS } from './network.js';

function injectedProvider() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No browser wallet was found. Install or enable an EVM wallet, then try again.');
  }
  return window.ethereum;
}

async function switchToCoston2(ethereum) {
  const currentChainId = await ethereum.request({ method: 'eth_chainId' });
  if (currentChainId?.toLowerCase() === COSTON2.chainIdHex) return;

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: COSTON2.chainIdHex }],
    });
  } catch (error) {
    if (error?.code !== 4902) throw error;

    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: COSTON2.chainIdHex,
        chainName: COSTON2.name,
        nativeCurrency: { name: 'Coston2 Flare', symbol: 'C2FLR', decimals: 18 },
        rpcUrls: [COSTON2.rpcUrl],
        blockExplorerUrls: [COSTON2.explorer],
      }],
    });
  }
}

export async function connectCoston2Wallet() {
  const ethereum = injectedProvider();
  await switchToCoston2(ethereum);

  const provider = new BrowserProvider(ethereum);
  await provider.send('eth_requestAccounts', []);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== COSTON2.chainId) {
    throw new Error(`Wallet must be connected to ${COSTON2.name} (chain ${COSTON2.chainId}).`);
  }

  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

export async function registerAgreement(wallet, values) {
  const network = await wallet.provider.getNetwork();
  if (Number(network.chainId) !== COSTON2.chainId) {
    throw new Error(`Wallet changed networks. Switch back to ${COSTON2.name} and try again.`);
  }

  const contract = new Contract(CONTRACT_ADDRESS, LATEPAY_SHIELD_ABI, wallet.signer);
  const transaction = await contract.createAgreement(
    values.invoiceHash,
    values.xrplDestinationHash,
    values.destinationTag,
    values.expectedDrops,
    values.startLedger,
    values.dueAt,
  );
  const receipt = await transaction.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error('The transaction was not confirmed successfully.');
  }

  const created = receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((event) => event?.name === 'AgreementCreated');

  if (!created) {
    throw new Error('The transaction confirmed, but its AgreementCreated event could not be read.');
  }

  return {
    agreementId: Number(created.args.agreementId),
    transactionHash: receipt.hash,
  };
}
