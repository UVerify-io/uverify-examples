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
import io.uverify.sdk.apps.UVerifyApps.AgentReceiptInput;
import io.uverify.sdk.apps.UVerifyApps.AgentReceiptResult;
import io.uverify.sdk.callback.MessageSignCallback;
import io.uverify.sdk.callback.TransactionSignCallback;
import io.uverify.sdk.exception.UVerifyTimeoutException;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

class AgentReceipt {

    static final Path WALLET_FILE = Path.of("wallet.txt");

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
        BACKEND_URL = "sandbox".equals(net) ? "http://localhost:9090" : "https://api.uverify.io";
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

        // A realistic Level 4 LCP agent receipt. The commerce platform publishes its
        // legal context at /.well-known/legal-context.json. The agent fetches the terms,
        // verifies the ATR hash, then anchors the receipt on-chain via UVerify.
        var receipt = new AgentReceiptInput("txn_" + UUID.randomUUID(),
                "https://datastream.example.com/terms/v2.md")
                // SHA-256 hash of the terms document — verified by the agent before paying.
                .atrHash("0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069")
                .termsFormat("markdown")
                .acceptanceRequired(true)
                .agentName("ResearchBot v2.1")
                // disputeResolution presence signals Level 4
                .disputeResolution(Map.of(
                        "method",      "AAA Commercial Arbitration Rules",
                        "jurisdiction","New York, USA",
                        "contact",     "disputes@datastream.example.com",
                        "clauseId",    "sha256:0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
                        "source",      "https://adr.org/clauses/commercial-arbitration",
                        "catalog",     "https://adr.org/.well-known/dispute-services.json"
                ));

        System.out.println("Issuing Agent Receipt …");
        System.out.println("  Terms   : " + receipt.getTerms());
        System.out.println("  Agent   : " + receipt.getAgentName());
        System.out.println("  Tx ID   : " + receipt.getTransactionId());
        System.out.println("  LCP     : Level 4 — Integrated (derived from disputeResolution)\n");

        try {
            AgentReceiptResult result = client.apps.issueAgentReceipt(wallet.address, receipt);
            System.out.println("Transaction submitted. Waiting for on-chain confirmation …");

            var hash = result.getHash();
            UVerifyClient.waitFor(() -> {
                var certs = client.verify(hash);
                return certs.isEmpty() ? null : certs;
            }, 300_000, 2_000);

            System.out.println("Agent Receipt confirmed on-chain.\n");
            System.out.println("Verification URL (share with auditors or counterparties):");
            System.out.println("  " + result.getVerifyUrl());
            System.out.println("\nDone. The Agent Receipt is permanently anchored on Cardano.");

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
            Account account = new Account("mainnet".equals(AgentReceipt.NETWORK) ? Networks.mainnet() : Networks.testnet());
            return from(account, account.mnemonic());
        }

        static Wallet from(String mnemonic) {
            return from(new Account("mainnet".equals(AgentReceipt.NETWORK) ? Networks.mainnet() : Networks.testnet(), mnemonic), mnemonic);
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
