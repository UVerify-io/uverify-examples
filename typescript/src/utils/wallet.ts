import { MeshCardanoHeadlessWallet, AddressType } from '@meshsdk/wallet';
import { KoiosProvider } from '@meshsdk/core';
import bip39 from 'bip39';

const provider = new KoiosProvider('preprod');

export interface WalletHandle {
  wallet: MeshCardanoHeadlessWallet;
  address: string;
  mnemonic: string;
  signMessage: (message: string) => Promise<{ key: string; signature: string }>;
  signTx: (unsignedTx: string) => Promise<string>;
}

/**
 * Create a Cardano headless wallet from a mnemonic (or generate a fresh one).
 *
 * @param mnemonic - 24-word mnemonic phrase. A new wallet is generated when omitted.
 */
export async function createWallet(mnemonic?: string): Promise<WalletHandle> {
  const phrase = mnemonic ?? bip39.generateMnemonic();
  const words = phrase.split(' ');

  const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
    networkId: 0, // preprod testnet
    walletAddressType: AddressType.Base,
    fetcher: provider,
    submitter: provider,
    mnemonic: words,
  });

  const address = await wallet.getChangeAddressBech32();

  return {
    wallet,
    address,
    mnemonic: phrase,
    signMessage: (message: string) => wallet.signData(address, message),
    signTx: (unsignedTx: string) => wallet.signTx(unsignedTx, true),
  };
}
