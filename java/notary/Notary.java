///usr/bin/env jbang "$0" "$@" ; exit $?
//DEPS io.uverify:uverify-sdk:0.1.3
//DEPS com.bloxbean.cardano:cardano-client-lib:0.5.1
//DEPS com.fasterxml.jackson.core:jackson-databind:2.17.0
//JAVA 17+

import com.bloxbean.cardano.client.account.Account;
import com.bloxbean.cardano.client.common.model.Networks;
import com.bloxbean.cardano.client.cip.cip30.DataSignature;
import com.bloxbean.cardano.client.transaction.spec.Transaction;
import com.bloxbean.cardano.client.util.HexUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.uverify.sdk.UVerifyClient;
import io.uverify.sdk.callback.MessageSignCallback;
import io.uverify.sdk.callback.TransactionSignCallback;
import io.uverify.sdk.exception.UVerifyTimeoutException;
import io.uverify.sdk.model.CertificateData;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

class Notary {

    static final Path WALLET_FILE = Path.of("wallet.txt");
    static final String NETWORK;
    static final String BACKEND_URL;
    static final String VERIFY_URL;

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
            VERIFY_URL  = "https://app.uverify.io/verify";
        } else if ("preprod".equals(net)) {
            BACKEND_URL = "https://api.preprod.uverify.io";
            VERIFY_URL  = "https://app.preprod.uverify.io/verify";
        } else {
            BACKEND_URL = "http://localhost:9090";
            VERIFY_URL  = "http://localhost:3000/verify";
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

        var today = LocalDate.now().toString();
        var json  = new ObjectMapper();

        // 1 — Certify sample_document.txt
        System.out.println("Certifying file …");
        var docPath = Path.of("sample_document.txt");
        var docBytes = Files.exists(docPath)
                ? Files.readAllBytes(docPath)
                : "Sample document placeholder.".getBytes(StandardCharsets.UTF_8);
        var docHash = sha256hex(docBytes);
        var docMeta = new LinkedHashMap<String, String>();
        docMeta.put("type", "document");
        docMeta.put("path", "https://username:password@example.tld/files/sample_document.txt");
        certify(client, wallet.address, docHash, json.writeValueAsString(docMeta));
        System.out.println("Certified! " + VERIFY_URL + "/" + docHash + "\n");

        // 2 — Certify a service agreement
        System.out.println("Certifying contract …");
        var contract = """
                SERVICE AGREEMENT

                This Service Agreement is entered into on %s
                between Acme Corp ("Provider") and John Doe ("Client").

                1. Services.        Provider delivers software development services per SOW-001.
                2. Payment.         Client pays EUR 5,000 upon completion of each milestone.
                3. Confidentiality. Both parties keep all project details strictly confidential.
                4. Governing law.   This Agreement is governed by the laws of Germany.

                Signed by both parties.""".formatted(today);
        var contractHash = sha256hex(contract.getBytes(StandardCharsets.UTF_8));
        var contractMeta = new LinkedHashMap<String, String>();
        contractMeta.put("contract_type",   "service_agreement");
        contractMeta.put("contract_id",     UUID.randomUUID().toString());
        contractMeta.put("contract_server", "https://contracts.example.tld");
        contractMeta.put("date",            today);
        certify(client, wallet.address, contractHash, json.writeValueAsString(contractMeta));
        System.out.println("Certified! " + VERIFY_URL + "/" + contractHash + "\n");

        // 3 — Certify song lyrics
        System.out.println("Certifying song …");
        var song = """
                The Immutable Record

                Verse 1:
                The blockchain never lies,
                every hash a testament,
                written in the morning skies,
                a proof that time has lent.

                Chorus:
                Immutable and true,
                a fingerprint in chain,
                no one can undo
                what we forever claim.

                Verse 2:
                A song, a word, a deed,
                all anchored to the block,
                the world can verify
                what time has come to lock.""";
        var songHash = sha256hex(song.getBytes(StandardCharsets.UTF_8));
        var songMeta = new LinkedHashMap<String, String>();
        songMeta.put("genre",  "rock");
        songMeta.put("author", "Alice Smith");
        songMeta.put("date",   today);
        certify(client, wallet.address, songHash, json.writeValueAsString(songMeta));
        System.out.println("Certified! " + VERIFY_URL + "/" + songHash + "\n");

        System.out.println("All certificates are permanently recorded on Cardano.");
    }

    static void certify(UVerifyClient client, String address,
                        String hash, String metadata) throws Exception {
        try {
            client.issueCertificates(address,
                    List.of(new CertificateData(hash, "SHA-256", metadata)));
            UVerifyClient.waitFor(() -> {
                var certs = client.verify(hash);
                return certs.isEmpty() ? null : certs;
            }, 300_000, 2_000);
        } catch (UVerifyTimeoutException e) {
            System.err.println(
                    "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
                    + "Re-run to check again or increase the timeout if this happens repeatedly.");
            System.exit(1);
        }
    }

    static String sha256hex(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(data);
            var sb = new StringBuilder(64);
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
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
            Account account = new Account("mainnet".equals(Notary.NETWORK) ? Networks.mainnet() : Networks.testnet());
            return from(account, account.mnemonic());
        }

        static Wallet from(String mnemonic) {
            return from(new Account("mainnet".equals(Notary.NETWORK) ? Networks.mainnet() : Networks.testnet(), mnemonic), mnemonic);
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
