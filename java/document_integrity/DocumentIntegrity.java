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

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.LinkedHashMap;
import java.util.List;

class DocumentIntegrity {

    static final Path WALLET_FILE  = Path.of("wallet.txt");
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
            BACKEND_URL = "https://api.uverify.io";
            VERIFY_URL  = "https://app.preprod.uverify.io/verify";
        } else {
            BACKEND_URL = "http://localhost:9090";
            VERIFY_URL  = "http://localhost:3000/verify";
        }
    }

    static final String AUTHOR     = "Fabian Bormann";
    static final String INSTITUTION = "Technical University of Musterstadt";
    static final String THESIS_TITLE =
            "Master's thesis: Impact of Blockchain Technology on Academic Record Keeping";
    static final String FILE_LOCATION =
            "https://fileshare.university.tld/thesis/sample_thesis.zip";

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

        var filePath = Path.of("sample_thesis.zip");
        byte[] fileBytes;
        if (Files.exists(filePath)) {
            fileBytes = Files.readAllBytes(filePath);
        } else {
            fileBytes = "This is a placeholder for sample_thesis.zip.".getBytes(StandardCharsets.UTF_8);
            Files.write(filePath, fileBytes);
            System.out.println("Created placeholder sample_thesis.zip for demo purposes.\n");
        }

        var fileName      = filePath.getFileName().toString();
        var fileHash      = sha256hex(fileBytes);
        var fileSizeBytes = fileBytes.length;

        System.out.println("Certifying \"" + fileName + "\" (" + fileSizeBytes + " bytes) …");
        System.out.println("SHA-256: " + fileHash + "\n");

        var metadata = new LinkedHashMap<String, String>();
        metadata.put("uverify_template_id", "documentIntegrity");
        metadata.put("title",              THESIS_TITLE);
        metadata.put("issuer",             INSTITUTION);
        metadata.put("uv_url_filename",    sha256hex(fileName.getBytes(StandardCharsets.UTF_8)));
        metadata.put("location",           FILE_LOCATION);
        metadata.put("file_size",          String.valueOf(fileSizeBytes));
        metadata.put("file_type",          "application/zip");
        metadata.put("file_hint",          "ZIP archive, not password protected");
        metadata.put("description",
                "You received this link because you were sent a copy of \"" + fileName + "\". "
                + "The file is available at: " + FILE_LOCATION + ". "
                + "To confirm no one has tampered with it, drop the file into the area below — "
                + "the SHA-256 fingerprint will be compared against the blockchain record.");
        metadata.put("uv_url_author", sha256hex(AUTHOR.getBytes(StandardCharsets.UTF_8)));

        var json = new ObjectMapper();
        var cert = new CertificateData(fileHash, "SHA-256", json.writeValueAsString(metadata));

        try {
            client.issueCertificates(wallet.address, List.of(cert));
            System.out.println("Transaction submitted. Waiting for on-chain confirmation …");

            UVerifyClient.waitFor(() -> {
                var result = client.verify(fileHash);
                return result.isEmpty() ? null : result;
            }, 300_000, 2_000);

            System.out.println("Certificate confirmed on-chain.\n");
            System.out.println("Share this URL with the verifier:");
            var verifyUrl = VERIFY_URL + "/" + fileHash
                    + "?filename=" + URLEncoder.encode(fileName, StandardCharsets.UTF_8)
                    + "&author=" + URLEncoder.encode(AUTHOR, StandardCharsets.UTF_8);
            System.out.println("  " + verifyUrl);

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
            Account account = new Account("mainnet".equals(DocumentIntegrity.NETWORK) ? Networks.mainnet() : Networks.testnet());
            return from(account, account.mnemonic());
        }

        static Wallet from(String mnemonic) {
            return from(new Account("mainnet".equals(DocumentIntegrity.NETWORK) ? Networks.mainnet() : Networks.testnet(), mnemonic), mnemonic);
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
