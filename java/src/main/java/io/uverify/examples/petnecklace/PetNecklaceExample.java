package io.uverify.examples.petnecklace;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.uverify.examples.utils.WalletHelper;
import io.uverify.examples.utils.WalletHelper.WalletHandle;
import io.uverify.sdk.UVerifyClient;
import io.uverify.sdk.exception.UVerifyTimeoutException;
import io.uverify.sdk.model.CertificateData;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

/**
 * Issues lost-pet necklace certificates for two pets on Cardano preprod.
 * Owner contact details are hashed on-chain (GDPR-safe) and revealed only
 * via URL parameters when a finder scans the necklace tag.
 *
 * <p>Run:
 * <pre>
 *   mvn exec:java -Dexec.mainClass=io.uverify.examples.petnecklace.PetNecklaceExample
 * </pre>
 */
public class PetNecklaceExample {

    private static final Path WALLET_FILE = Paths.get("wallet.txt");
    private static final String VERIFY_URL = "https://app.preprod.uverify.io/verify";

    public static void main(String[] args) throws Exception {
        // --- Wallet setup ---------------------------------------------------
        boolean isNew = !Files.exists(WALLET_FILE);
        WalletHandle wallet = isNew
                ? WalletHelper.createWallet()
                : WalletHelper.createWallet(Files.readString(WALLET_FILE).strip());

        UVerifyClient client = UVerifyClient.builder()
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

        // --- Pet data -------------------------------------------------------
        record Pet(String petName, String ownerName, String phone,
                   String species, String breed, String note) {}

        List<Pet> pets = List.of(
                new Pet("Luna",  "Emma Schneider", "+49 30 12345678",
                        "Dog", "Golden Retriever", "Very friendly! Please call if found."),
                new Pet("Mochi", "Jonas Weber",    "+49 89 98765432",
                        "Cat", "Siamese",          "Indoor cat — please do not let outside.")
        );

        String runId = UUID.randomUUID().toString();
        ObjectMapper json = new ObjectMapper();
        List<CertificateData> certs = new ArrayList<>();

        for (Pet p : pets) {
            String dataHash = WalletHelper.sha256hex(p.petName() + p.phone() + runId);

            Map<String, String> metadata = new LinkedHashMap<>();
            metadata.put("uverify_template_id",   "petNecklace");
            metadata.put("uverify_update_policy", "restricted");
            metadata.put("pet_name",              p.petName());
            metadata.put("uv_url_owner_name",     WalletHelper.sha256hex(p.ownerName()));
            metadata.put("uv_url_phone",          WalletHelper.sha256hex(p.phone()));
            metadata.put("species",               p.species());
            if (p.breed() != null && !p.breed().isEmpty())
                metadata.put("breed", p.breed());
            if (p.note() != null && !p.note().isEmpty())
                metadata.put("note", p.note());

            certs.add(new CertificateData(dataHash, "SHA-256", json.writeValueAsString(metadata)));
        }

        // --- Issue ----------------------------------------------------------
        System.out.println("Issuing " + pets.size() + " pet necklace certificate(s) …");
        for (Pet p : pets) {
            String breed = p.breed().isEmpty() ? "" : " · " + p.breed();
            System.out.println("  • " + p.petName() + " (" + p.species() + breed + ")");
        }

        try {
            client.issueCertificates(wallet.address, certs);
            System.out.println("\nTransaction submitted. Waiting for on-chain confirmation …");

            String firstHash = certs.get(0).getHash();
            UVerifyClient.waitFor(() -> {
                var result = client.verify(firstHash);
                return result.isEmpty() ? null : result;
            }, 300_000, 2_000);

            System.out.println("All pet certificates confirmed on-chain.\n");
            System.out.println("Necklace tag QR-code URLs:");
            for (int i = 0; i < pets.size(); i++) {
                Pet p    = pets.get(i);
                String hash = certs.get(i).getHash();
                String url  = VERIFY_URL + "/" + hash
                        + "?owner_name=" + p.ownerName()
                        + "&phone=" + p.phone();
                System.out.println("  " + p.petName());
                System.out.println("    " + url + "\n");
            }
            System.out.println("Done. All pet certificates are permanently anchored on Cardano.");

        } catch (UVerifyTimeoutException e) {
            System.err.println(
                    "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
                    + "Re-run the script to check again or increase the timeout if this happens repeatedly.");
            System.exit(1);
        }
    }
}
