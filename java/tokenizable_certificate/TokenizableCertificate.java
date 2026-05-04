///usr/bin/env jbang "$0" "$@" ; exit $?
//DEPS io.uverify:uverify-sdk:0.1.3
//DEPS com.bloxbean.cardano:cardano-client-lib:0.5.1
//DEPS com.fasterxml.jackson.core:jackson-databind:2.17.0
//JAVA 17+

import com.bloxbean.cardano.client.account.Account;
import com.bloxbean.cardano.client.address.Address;
import com.bloxbean.cardano.client.common.model.Networks;
import com.bloxbean.cardano.client.cip.cip30.DataSignature;
import com.bloxbean.cardano.client.transaction.spec.Transaction;
import com.bloxbean.cardano.client.util.HexUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.uverify.sdk.UVerifyClient;
import io.uverify.sdk.apps.UVerifyApps.TokenizableCertificateInput;
import io.uverify.sdk.apps.UVerifyApps.TokenizableCertificateResult;
import io.uverify.sdk.apps.UVerifyApps.TokenizableConfig;
import io.uverify.sdk.apps.UVerifyApps.RedeemTokenizableCertificateInput;
import io.uverify.sdk.callback.MessageSignCallback;
import io.uverify.sdk.callback.TransactionSignCallback;
import io.uverify.sdk.exception.UVerifyTimeoutException;
import io.uverify.sdk.model.CertificateData;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;

class TokenizableCertificate {

    static final Path WALLET_FILE           = Path.of("wallet.txt");
    static final Path RECIPIENT_WALLET_FILE = Path.of("recipient_wallet.txt");
    static final Path SEED_UTXO_FILE        = Path.of("seed_utxo.txt");
    static final String NETWORK;
    static final String BACKEND_URL;
    static final String CEXPLORER_TX_URL;
    static final String CHAIN_VIEWER_URL;

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
            BACKEND_URL      = "https://api.uverify.io";
            CEXPLORER_TX_URL = "https://cexplorer.io/tx";
            CHAIN_VIEWER_URL = "https://cexplorer.io";
        } else if ("preprod".equals(net)) {
            BACKEND_URL      = "https://api.uverify.io";
            CEXPLORER_TX_URL = "https://preprod.cexplorer.io/tx";
            CHAIN_VIEWER_URL = "https://preprod.cexplorer.io";
        } else {
            BACKEND_URL      = "http://localhost:9090";
            CEXPLORER_TX_URL = "http://localhost:3001";
            CHAIN_VIEWER_URL = "http://localhost:3001";
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 0 || (!args[0].equals("create") && !args[0].equals("redeem"))) {
            printUsage();
            System.exit(1);
        }

        var command = args[0];

        var assetName      = getArg(args, "--asset-name");
        var ownerAddress   = getArg(args, "--recipient-wallet");
        var documentText   = getArg(args, "--document-text");
        var documentPath   = getArg(args, "--document-path");
        var argTxHash      = getArg(args, "--init-utxo-tx-hash");
        var argOutputIndex = getArg(args, "--init-utxo-output-index");
        var argKey         = getArg(args, "--key");
        var argIssuerName  = getArg(args, "--issuer-name");
        var argDescription = getArg(args, "--description");
        var argIpfsImage   = getArg(args, "--ipfs-image");
        var argAssetClass  = getArg(args, "--asset-class");

        if (assetName == null) {
            System.err.println("Error: --asset-name is required.");
            printUsage();
            System.exit(1);
        }
        if (command.equals("create")) {
            if (documentText != null && documentPath != null) {
                System.err.println("Error: --document-text and --document-path are mutually exclusive.");
                System.exit(1);
            }
            if (documentText == null && documentPath == null) {
                System.err.println("Error: one of --document-text or --document-path is required for create.");
                printUsage();
                System.exit(1);
            }
        }
        if (command.equals("redeem") && argKey == null) {
            System.err.println("Error: --key is required for redeem.");
            printUsage();
            System.exit(1);
        }

        // Issuer wallet
        boolean issuerIsNew = !Files.exists(WALLET_FILE);
        var issuerWallet = issuerIsNew
                ? Wallet.create()
                : Wallet.from(Files.readString(WALLET_FILE).strip());

        var client = UVerifyClient.builder()
                .baseUrl(BACKEND_URL)
                .signMessage(issuerWallet.signMessage)
                .signTx(issuerWallet.signTx)
                .build();

        if (issuerIsNew) {
            Files.writeString(WALLET_FILE, issuerWallet.mnemonic);
            System.out.println("Created new issuer wallet: " + issuerWallet.address);
            System.out.println("Mnemonic saved to wallet.txt. Keep this file safe.\n");
            var funded = client.fundWallet(issuerWallet.address);
            System.out.println("Funded by tx: " + funded.getTxHash());
            System.out.println("Waiting 90 s for funding to confirm on-chain …");
            Thread.sleep(90_000);
        } else {
            System.out.println("Restored issuer wallet: " + issuerWallet.address + "\n");
        }

        // Recipient wallet
        boolean recipientIsNew = !Files.exists(RECIPIENT_WALLET_FILE);
        var recipientWallet = recipientIsNew
                ? Wallet.create()
                : Wallet.from(Files.readString(RECIPIENT_WALLET_FILE).strip());

        if (recipientIsNew) {
            Files.writeString(RECIPIENT_WALLET_FILE, recipientWallet.mnemonic);
            System.out.println("Created new recipient wallet: " + recipientWallet.address);
            System.out.println("Mnemonic saved to recipient_wallet.txt. Keep this file safe.");
            System.out.println("Funding recipient wallet …\n");
            var funded = client.fundWallet(recipientWallet.address,
                    recipientWallet.signMessage);
            System.out.println("Funded by tx: " + funded.getTxHash());
            System.out.println("Waiting 90 s for funding to confirm on-chain …");
            Thread.sleep(90_000);
        } else {
            System.out.println("Restored recipient wallet: " + recipientWallet.address + "\n");
        }

        var effectiveRecipientAddress = ownerAddress != null ? ownerAddress : recipientWallet.address;
        if (ownerAddress == null) {
            System.out.println("No --recipient-wallet provided — using managed recipient wallet: "
                    + effectiveRecipientAddress);
        }

        var assetNameHex = assetName.chars()
                .mapToObj(c -> String.format("%02x", c))
                .reduce("", String::concat);

        // Seed UTxO
        String initUtxoTxHash;
        int initUtxoOutputIndex;

        if (argTxHash != null && argOutputIndex != null) {
            initUtxoTxHash = argTxHash;
            initUtxoOutputIndex = Integer.parseInt(argOutputIndex);
            System.out.println("Using provided seed UTxO: " + initUtxoTxHash + "#" + initUtxoOutputIndex);
        } else if (Files.exists(SEED_UTXO_FILE)) {
            var parts = Files.readString(SEED_UTXO_FILE).strip().split(":");
            initUtxoTxHash = parts[0];
            initUtxoOutputIndex = Integer.parseInt(parts[1]);
            System.out.println("Loaded seed UTxO from seed_utxo.txt: "
                    + initUtxoTxHash + "#" + initUtxoOutputIndex);
        } else {
            System.err.println(
                    "Error: no seed UTxO available.\n"
                    + "Provide --init-utxo-tx-hash and --init-utxo-output-index on the first run.\n"
                    + "Find a UTxO in your issuer wallet via the chain viewer at " + CHAIN_VIEWER_URL + ".");
            System.exit(1);
            return;
        }

        if (argTxHash != null && argOutputIndex != null) {
            Files.writeString(SEED_UTXO_FILE, initUtxoTxHash + ":" + initUtxoOutputIndex);
        }

        var json = new ObjectMapper();

        if (command.equals("create")) {
            byte[] docBytes = documentPath != null
                    ? Files.readAllBytes(Path.of(documentPath))
                    : documentText.getBytes(StandardCharsets.UTF_8);
            var key = sha256hex(docBytes);

            if (documentPath != null) System.out.println("\nDocument hash (from file " + documentPath + "): " + key);
            else                      System.out.println("\nDocument hash (from text): " + key);
            System.out.println("Issuing tokenizable certificate …\n");

            var deployerKeyHash = paymentKeyHashFromAddress(issuerWallet.address);

            var certMetadata = new LinkedHashMap<String, String>();
            certMetadata.put("asset_name", assetName);
            if (argIssuerName  != null) certMetadata.put("issuer_name",  argIssuerName);
            if (argDescription != null) certMetadata.put("description",  argDescription);
            if (argAssetClass  != null) certMetadata.put("asset_class",  argAssetClass);
            if (argIpfsImage   != null) certMetadata.put("ipfs_image",   argIpfsImage);

            try {
                var input = new TokenizableCertificateInput()
                        .certificate(new CertificateData(key, "SHA-256", json.writeValueAsString(certMetadata)))
                        .ownerAddress(effectiveRecipientAddress)
                        .assetNameHex(assetNameHex)
                        .initUtxoTxHash(initUtxoTxHash)
                        .initUtxoOutputIndex(initUtxoOutputIndex)
                        .config(new TokenizableConfig(deployerKeyHash, List.of(deployerKeyHash)));

                TokenizableCertificateResult result =
                        client.apps.issueTokenizableCertificate(issuerWallet.address, input);

                System.out.println("Transaction submitted: " + CEXPLORER_TX_URL + "/" + result.getTxHash());
                UVerifyClient.waitFor(() -> {
                    var certs = client.verify(key);
                    return certs.isEmpty() ? null : certs;
                }, 300_000, 2_000);

                System.out.println("Certificate confirmed on-chain.");
                System.out.println("Verify at: " + result.getVerifyUrl());

                var status = client.apps.getTokenizableCertificateStatus(
                        key, initUtxoTxHash, initUtxoOutputIndex);
                System.out.println("Claimed: " + status.isClaimed());
                System.out.println("\nTo redeem, run:");
                System.out.println("  jbang TokenizableCertificate.java redeem"
                        + " --asset-name \"" + assetName + "\""
                        + " --recipient-wallet \"" + effectiveRecipientAddress + "\""
                        + " --key \"" + key + "\"");

            } catch (UVerifyTimeoutException e) {
                System.err.println("Timed out waiting for confirmation. Re-run to check again.");
                System.exit(1);
            }
        }

        if (command.equals("redeem")) {
            var key = argKey;
            System.out.println("\nRedeeming tokenizable certificate with key: " + key + " …\n");

            try {
                var input = new RedeemTokenizableCertificateInput()
                        .key(key)
                        .claimerAddress(recipientWallet.address)
                        .initUtxoTxHash(initUtxoTxHash)
                        .initUtxoOutputIndex(initUtxoOutputIndex)
                        .assetNameHex(assetNameHex);

                var txHash = client.apps.redeemTokenizableCertificate(input, recipientWallet.signTx);
                System.out.println("Transaction submitted: " + CEXPLORER_TX_URL + "/" + txHash);

                UVerifyClient.waitFor(() -> {
                    var status = client.apps.getTokenizableCertificateStatus(
                            key, initUtxoTxHash, initUtxoOutputIndex);
                    return status.isClaimed() ? status : null;
                }, 300_000, 2_000);

                System.out.println("Certificate successfully redeemed on-chain.");
                var status = client.apps.getTokenizableCertificateStatus(
                        key, initUtxoTxHash, initUtxoOutputIndex);
                System.out.println("Claimed: " + status.isClaimed());
                if (status.getOwner() != null) System.out.println("Owner: " + status.getOwner());

            } catch (UVerifyTimeoutException e) {
                System.err.println("Timed out waiting for confirmation. Re-run to check again.");
                System.exit(1);
            }
        }
    }

    static String getArg(String[] args, String flag) {
        for (int i = 0; i < args.length - 1; i++) {
            if (args[i].equals(flag)) return args[i + 1];
        }
        return null;
    }

    static void printUsage() {
        System.err.println("""
                Usage:
                  jbang TokenizableCertificate.java create --asset-name <name>
                                                           (--document-text <text> | --document-path <path>)
                                                           [--recipient-wallet <addr>]
                                                           [--init-utxo-tx-hash <hash> --init-utxo-output-index <idx>]
                                                           [--issuer-name <name>] [--description <text>]
                                                           [--asset-class <class>] [--ipfs-image <cid>]

                  jbang TokenizableCertificate.java redeem --asset-name <name> --key <hash>
                                                           [--recipient-wallet <addr>]
                                                           [--init-utxo-tx-hash <hash> --init-utxo-output-index <idx>]

                Notes:
                  - Issuer wallet is loaded from / saved to wallet.txt.
                  - Recipient wallet is loaded from / saved to recipient_wallet.txt.
                  - Seed UTxO is loaded from / saved to seed_utxo.txt.
                    Provide --init-utxo-tx-hash and --init-utxo-output-index on first run
                    (use the chain viewer at \
                """ + CHAIN_VIEWER_URL + " to find a UTxO).");
    }

    static String paymentKeyHashFromAddress(String bech32) {
        byte[] addrBytes = new Address(bech32).getBytes();
        return HexUtil.encodeHexString(Arrays.copyOfRange(addrBytes, 1, 29));
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
            Account account = new Account("mainnet".equals(TokenizableCertificate.NETWORK) ? Networks.mainnet() : Networks.testnet());
            return from(account, account.mnemonic());
        }

        static Wallet from(String mnemonic) {
            return from(new Account("mainnet".equals(TokenizableCertificate.NETWORK) ? Networks.mainnet() : Networks.testnet(), mnemonic), mnemonic);
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
