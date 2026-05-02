///usr/bin/env jbang "$0" "$@" ; exit $?
//DEPS io.uverify:uverify-sdk:0.1.3
//DEPS com.bloxbean.cardano:cardano-client-lib:0.5.1
//JAVA 17+

import com.bloxbean.cardano.client.account.Account;
import com.bloxbean.cardano.client.common.model.Networks;
import com.bloxbean.cardano.client.cip.cip30.DataSignature;
import com.bloxbean.cardano.client.transaction.spec.Transaction;
import com.bloxbean.cardano.client.util.HexUtil;
import io.uverify.sdk.UVerifyClient;
import io.uverify.sdk.apps.UVerifyApps.CertificateOfInsuranceInput;
import io.uverify.sdk.apps.UVerifyApps.CertificateOfInsuranceResult;
import io.uverify.sdk.callback.MessageSignCallback;
import io.uverify.sdk.callback.TransactionSignCallback;
import io.uverify.sdk.exception.UVerifyTimeoutException;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

class CertificateOfInsurance {

    static final Path WALLET_FILE = Path.of("wallet.txt");

    public static void main(String[] args) throws Exception {
        boolean isNew = !Files.exists(WALLET_FILE);
        var wallet = isNew
                ? Wallet.create()
                : Wallet.from(Files.readString(WALLET_FILE).strip());

        var client = UVerifyClient.builder()
                .signMessage(wallet.signMessage)
                .signTx(wallet.signTx)
                .build();

        if (isNew) {
            Files.writeString(WALLET_FILE, wallet.mnemonic);
            System.out.println("Created new wallet: " + wallet.address);
            System.out.println("Mnemonic saved to wallet.txt. Keep this file safe.\n");
            var funded = client.fundWallet(wallet.address);
            System.out.println("Funded by tx: " + funded.getTxHash());
            System.out.println("Waiting 90 s for funding to confirm on-chain …");
            Thread.sleep(90_000);
        } else {
            System.out.println("Restored wallet: " + wallet.address + "\n");
        }

        var coi = new CertificateOfInsuranceInput(
                "AI-GL-2025-049891",
                "Acme Insurance AG",
                "TechBuild GmbH")
                .producer("Schmidt Insurance Brokers")
                .insuredAddress("Unter den Linden 12, 10117 Musterstadt, Germany")
                .effectiveDate("2025-01-01")
                .expirationDate("2027-01-01")
                .certificateHolder("City of Musterstadt — Department of Infrastructure")
                .certificateHolderAddress("Musterstadt Str. 1, 10117 Musterstadt, Germany")
                .additionalInsured(true)
                .waiverOfSubrogation(false)
                .coverages(Map.of(
                        "general_liability",    "2,000,000",
                        "workers_compensation", "1,000,000",
                        "auto_liability",       "1,000,000",
                        "umbrella",             "5,000,000"
                ));

        System.out.println("Issuing Certificate of Insurance …");
        System.out.println("  Policy  : " + coi.getPolicyNumber());
        System.out.println("  Insured : " + coi.getInsured());
        System.out.println("  Holder  : " + coi.getCertificateHolder());
        System.out.println("  Valid   : " + coi.getEffectiveDate() + " → " + coi.getExpirationDate() + "\n");

        try {
            CertificateOfInsuranceResult result =
                    client.apps.issueCertificateOfInsurance(wallet.address, coi);
            System.out.println("Transaction submitted. Waiting for on-chain confirmation …");

            var hash = result.getHash();
            UVerifyClient.waitFor(() -> {
                var certs = client.verify(hash);
                return certs.isEmpty() ? null : certs;
            }, 300_000, 2_000);

            System.out.println("Certificate of Insurance confirmed on-chain.\n");
            System.out.println("Verification URL (share with certificate holder or auditors):");
            System.out.println("  " + result.getVerifyUrl());
            System.out.println("\nDone. The Certificate of Insurance is permanently anchored on Cardano.");

        } catch (UVerifyTimeoutException e) {
            System.err.println(
                    "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
                    + "Re-run to check again or increase the timeout if this happens repeatedly.");
            System.exit(1);
        }
    }

    static class Wallet {
        final String address;
        final String mnemonic;
        final MessageSignCallback signMessage;
        final TransactionSignCallback signTx;

        Wallet(String address, String mnemonic,
               MessageSignCallback signMessage, TransactionSignCallback signTx) {
            this.address = address;
            this.mnemonic = mnemonic;
            this.signMessage = signMessage;
            this.signTx = signTx;
        }

        static Wallet create() {
            Account account = new Account(Networks.testnet());
            return from(account, account.mnemonic());
        }

        static Wallet from(String mnemonic) {
            return from(new Account(Networks.testnet(), mnemonic), mnemonic);
        }

        private static Wallet from(Account account, String mnemonic) {
            String address = account.baseAddress();
            MessageSignCallback signMessage = msg -> {
                DataSignature ds = account.signData(address,
                        HexUtil.encodeHexString(msg.getBytes(StandardCharsets.UTF_8)));
                return new io.uverify.sdk.callback.DataSignature(ds.getKey(), ds.getSignature());
            };
            TransactionSignCallback signTx = txHex -> {
                Transaction tx = Transaction.deserialize(HexUtil.decodeHexString(txHex));
                return HexUtil.encodeHexString(account.sign(tx).getWitnessSet().serialize());
            };
            return new Wallet(address, mnemonic, signMessage, signTx);
        }
    }
}
