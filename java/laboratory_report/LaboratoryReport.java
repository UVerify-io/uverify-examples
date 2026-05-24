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
import io.uverify.sdk.apps.UVerifyApps.LaboratoryReportInput;
import io.uverify.sdk.apps.UVerifyApps.LaboratoryReportResult;
import io.uverify.sdk.callback.MessageSignCallback;
import io.uverify.sdk.callback.TransactionSignCallback;
import io.uverify.sdk.exception.UVerifyTimeoutException;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

class LaboratoryReport {

    static final Path WALLET_FILE = Path.of("wallet.txt");
    static final String LAB_NAME    = "Berlin Medical Diagnostics GmbH";
    static final String LAB_CONTACT = "results@bmd-lab.example";

    static final String NETWORK;
    static final String BACKEND_URL;

    static {
        var dotEnv = new java.util.HashMap<String, String>();
        try {
            for (var line : Files.readAllLines(Path.of("../.env"))) {
                var t = line.strip();
                if (t.isEmpty() || t.startsWith("#")) continue;
                int eq = t.indexOf('=');
                if (eq >= 0) dotEnv.put(t.substring(0, eq).strip(), t.substring(eq + 1).strip());
            }
        } catch (Exception ignored) {}
        String net = System.getenv().getOrDefault("UVERIFY_NETWORK",
                         dotEnv.getOrDefault("UVERIFY_NETWORK", "sandbox"));
        NETWORK = net;
        if ("mainnet".equals(net)) {
            BACKEND_URL = "https://api.uverify.io";
        } else if ("preprod".equals(net)) {
            BACKEND_URL = "https://api.preprod.uverify.io";
        } else {
            BACKEND_URL = "http://localhost:9090";
        }
    }

    public static void main(String[] args) throws Exception {
        boolean isNew = !Files.exists(WALLET_FILE);
        var wallet = isNew
                ? Wallet.create()
                : Wallet.from(Files.readString(WALLET_FILE).strip());

        var client = UVerifyClient.builder()
                .baseUrl(BACKEND_URL)
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

        var reports = List.of(
                new LaboratoryReportInput("BMD-2024-10-00123", "Sophie Wagner", LAB_NAME,
                        new LinkedHashMap<>(Map.of(
                                "glucose",       "5.4 mmol/L",
                                "hba1c",         "5.7%",
                                "cholesterol",   "4.9 mmol/L",
                                "hdl",           "1.8 mmol/L",
                                "ldl",           "2.6 mmol/L",
                                "triglycerides", "1.2 mmol/L"
                        ))).contact(LAB_CONTACT).auditable(true),
                new LaboratoryReportInput("BMD-2024-10-00124", "Thomas Richter", LAB_NAME,
                        new LinkedHashMap<>(Map.of(
                                "creatinine", "82 μmol/L",
                                "urea",       "5.8 mmol/L",
                                "egfr",       "91 mL/min/1.73m²",
                                "uric_acid",  "340 μmol/L",
                                "sodium",     "141 mmol/L",
                                "potassium",  "4.1 mmol/L"
                        ))).contact(LAB_CONTACT)
        );

        System.out.println("Issuing " + reports.size() + " lab reports in a single transaction …");
        for (var r : reports) {
            System.out.println("  • " + r.getReportId() + " — " + r.getPatientName());
        }

        try {
            LaboratoryReportResult result = client.apps.issueLaboratoryReport(wallet.address, reports);
            System.out.println("\nTransaction submitted. Waiting for on-chain confirmation …");

            var firstHash = result.getCertificates().get(0).getHash();
            UVerifyClient.waitFor(() -> {
                var certs = client.verify(firstHash);
                return certs.isEmpty() ? null : certs;
            }, 300_000, 2_000);

            System.out.println("All reports confirmed on-chain.\n");
            System.out.println("Verification deep links (share with each patient):");
            for (var cert : result.getCertificates()) {
                System.out.println("  " + cert.getPatientName() + " / " + cert.getReportId());
                System.out.println("    " + cert.getVerifyUrl() + "\n");
            }
            System.out.println("Done. All lab reports are permanently anchored on Cardano.");

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
            Account account = new Account("mainnet".equals(LaboratoryReport.NETWORK) ? Networks.mainnet() : Networks.testnet());
            return from(account, account.mnemonic());
        }

        static Wallet from(String mnemonic) {
            return from(new Account("mainnet".equals(LaboratoryReport.NETWORK) ? Networks.mainnet() : Networks.testnet(), mnemonic), mnemonic);
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
