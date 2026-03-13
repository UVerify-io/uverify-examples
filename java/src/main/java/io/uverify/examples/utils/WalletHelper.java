package io.uverify.examples.utils;

import com.bloxbean.cardano.client.account.Account;
import com.bloxbean.cardano.client.common.model.Networks;
import com.bloxbean.cardano.client.transaction.spec.Transaction;
import com.bloxbean.cardano.client.util.HexUtil;
import io.uverify.sdk.callback.DataSignature;
import io.uverify.sdk.callback.MessageSignCallback;
import io.uverify.sdk.callback.TransactionSignCallback;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Cardano headless-wallet helper for UVerify examples.
 *
 * <p>Uses <a href="https://github.com/bloxbean/cardano-client-lib">cardano-client-lib</a>
 * (com.bloxbean.cardano:cardano-client-lib:0.5.1) to derive keys, sign
 * transactions, and sign CIP-30 messages from a BIP-39 mnemonic phrase.
 *
 * <p>Usage:
 * <pre>{@code
 * WalletHandle wallet = WalletHelper.createWallet();          // new wallet
 * WalletHandle wallet = WalletHelper.createWallet(mnemonic);  // restore
 * }</pre>
 */
public final class WalletHelper {

    private WalletHelper() {}

    /** Immutable value object returned by {@link #createWallet}. */
    public static final class WalletHandle {
        public final String address;
        public final String mnemonic;
        public final MessageSignCallback signMessage;
        public final TransactionSignCallback signTx;

        private WalletHandle(
                String address,
                String mnemonic,
                MessageSignCallback signMessage,
                TransactionSignCallback signTx) {
            this.address = address;
            this.mnemonic = mnemonic;
            this.signMessage = signMessage;
            this.signTx = signTx;
        }
    }

    /**
     * Create a new wallet with a randomly generated 24-word mnemonic.
     */
    public static WalletHandle createWallet() {
        Account account = new Account(Networks.testnet());
        return build(account, account.mnemonic());
    }

    /**
     * Restore a wallet from an existing 24-word mnemonic phrase.
     *
     * @param mnemonicPhrase space-separated 24-word BIP-39 phrase
     */
    public static WalletHandle createWallet(String mnemonicPhrase) {
        Account account = new Account(Networks.testnet(), mnemonicPhrase);
        return build(account, mnemonicPhrase);
    }

    // -------------------------------------------------------------------------

    private static WalletHandle build(Account account, String mnemonic) {
        String address = account.baseAddress();

        MessageSignCallback signMessage = message -> signData(account, address, message);
        TransactionSignCallback signTx = unsignedTxHex -> signTransaction(account, unsignedTxHex);

        return new WalletHandle(address, mnemonic, signMessage, signTx);
    }

    /**
     * CIP-8 / CIP-30 {@code signData} — signs a challenge message and returns
     * a {@link DataSignature} containing the CBOR-encoded COSESign1 and COSEKey.
     */
    private static DataSignature signData(Account account, String address, String message) {
        try {
            com.bloxbean.cardano.client.cip.cip30.DataSignature ds =
                    account.signData(address, HexUtil.encodeHexString(
                            message.getBytes(StandardCharsets.UTF_8)));
            return new DataSignature(ds.getKey(), ds.getSignature());
        } catch (Exception e) {
            throw new RuntimeException("CIP-8 message signing failed: " + e.getMessage(), e);
        }
    }

    /**
     * Signs a CBOR-hex unsigned transaction and returns the witness-set CBOR-hex.
     */
    private static String signTransaction(Account account, String unsignedTxHex) {
        try {
            byte[] txBytes = HexUtil.decodeHexString(unsignedTxHex);
            Transaction tx = Transaction.deserialize(txBytes);
            Transaction signed = account.sign(tx);
            return HexUtil.encodeHexString(signed.getWitnessSet().serialize());
        } catch (Exception e) {
            throw new RuntimeException("Transaction signing failed: " + e.getMessage(), e);
        }
    }

    // -------------------------------------------------------------------------
    // Utility

    /** Compute a lowercase hex SHA-256 digest of the given UTF-8 string. */
    public static String sha256hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e); // SHA-256 is always available
        }
    }
}
