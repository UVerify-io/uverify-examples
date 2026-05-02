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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

class PetNecklace {

    static final Path WALLET_FILE = Path.of("wallet.txt");
    static final String VERIFY_URL = "https://app.preprod.uverify.io/verify";

    record Pet(String petName, String ownerName, String phone,
               String species, String breed, String note) {}

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

        var pets = List.of(
                new Pet("Luna",  "Emma Schneider", "+49 30 12345678",
                        "Dog", "Golden Retriever", "Very friendly! Please call if found."),
                new Pet("Mochi", "Jonas Weber",    "+49 89 98765432",
                        "Cat", "Siamese",          "Indoor cat — please do not let outside.")
        );

        var runId = UUID.randomUUID().toString();
        var json = new ObjectMapper();
        var certs = new ArrayList<CertificateData>();

        for (var p : pets) {
            var dataHash = sha256hex(p.petName() + p.phone() + runId);
            var metadata = new LinkedHashMap<String, String>();
            metadata.put("uverify_template_id",   "petNecklace");
            metadata.put("uverify_update_policy", "restricted");
            metadata.put("pet_name",              p.petName());
            metadata.put("uv_url_owner_name",     sha256hex(p.ownerName()));
            metadata.put("uv_url_phone",          sha256hex(p.phone()));
            metadata.put("species",               p.species());
            if (!p.breed().isEmpty()) metadata.put("breed", p.breed());
            if (!p.note().isEmpty())  metadata.put("note",  p.note());
            certs.add(new CertificateData(dataHash, "SHA-256", json.writeValueAsString(metadata)));
        }

        System.out.println("Issuing " + pets.size() + " pet necklace certificate(s) …");
        for (var p : pets) {
            System.out.println("  • " + p.petName() + " (" + p.species()
                    + (p.breed().isEmpty() ? "" : " · " + p.breed()) + ")");
        }

        try {
            client.issueCertificates(wallet.address, certs);
            System.out.println("\nTransaction submitted. Waiting for on-chain confirmation …");

            var firstHash = certs.get(0).getHash();
            UVerifyClient.waitFor(() -> {
                var result = client.verify(firstHash);
                return result.isEmpty() ? null : result;
            }, 300_000, 2_000);

            System.out.println("All pet certificates confirmed on-chain.\n");
            System.out.println("Necklace tag QR-code URLs:");
            for (int i = 0; i < pets.size(); i++) {
                var p = pets.get(i);
                var url = VERIFY_URL + "/" + certs.get(i).getHash()
                        + "?owner_name=" + p.ownerName()
                        + "&phone=" + p.phone();
                System.out.println("  " + p.petName());
                System.out.println("    " + url + "\n");
            }
            System.out.println("Done. All pet certificates are permanently anchored on Cardano.");

        } catch (UVerifyTimeoutException e) {
            System.err.println(
                    "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
                    + "Re-run to check again or increase the timeout if this happens repeatedly.");
            System.exit(1);
        }
    }

    static String sha256hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
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
