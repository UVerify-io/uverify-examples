package io.uverify.examples.productverification;

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
 * Issues a product authentication certificate on Cardano preprod. The
 * resulting URL is encoded as a QR code on the product label — scanning it
 * takes the customer to an immutable, blockchain-verified product page.
 *
 * <p>Run:
 * <pre>
 *   mvn exec:java -Dexec.mainClass=io.uverify.examples.productverification.ProductVerificationExample
 * </pre>
 */
public class ProductVerificationExample {

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

        // --- Product data ---------------------------------------------------
        String productName    = "Organic Cotton Signature Tee";
        String manufacturer   = "EcoWear GmbH";
        String productionDate = "2024-10-01";
        String materialInfo   = "100% GOTS-certified organic cotton. Machine wash 30°C. Do not tumble dry.";
        String serialNumber   = "EW-2024-TC-00847";
        String imageUrl       = "https://images.ecowear.example/tc-00847.jpg";

        String runId    = UUID.randomUUID().toString();
        String dataHash = WalletHelper.sha256hex(manufacturer + serialNumber + runId);

        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put("uverify_template_id",   "productVerification");
        metadata.put("uverify_update_policy", "first");
        metadata.put("productName",           productName);
        metadata.put("manufacturer",          manufacturer);
        metadata.put("productionDate",        productionDate);
        metadata.put("materialInfo",          materialInfo);
        metadata.put("serialNumber",          serialNumber);
        metadata.put("imageUrl",              imageUrl);

        ObjectMapper json = new ObjectMapper();
        CertificateData cert = new CertificateData(dataHash, "SHA-256", json.writeValueAsString(metadata));

        // --- Issue ----------------------------------------------------------
        System.out.println("Issuing product authentication certificate for \"" + productName + "\" …");
        System.out.println("  Serial : " + serialNumber);
        System.out.println("  Hash   : " + dataHash + "\n");

        try {
            client.issueCertificates(wallet.address, List.of(cert));
            System.out.println("Transaction submitted. Waiting for on-chain confirmation …");

            UVerifyClient.waitFor(() -> {
                var result = client.verify(dataHash);
                return result.isEmpty() ? null : result;
            }, 300_000, 2_000);

            System.out.println("Product authentication certificate confirmed on-chain.\n");
            System.out.println("Product authentication URL (encode as QR code on the product label):");
            System.out.println("  " + VERIFY_URL + "/" + dataHash);
            System.out.println("\nDone. The product authentication certificate is permanently anchored on Cardano.");

        } catch (UVerifyTimeoutException e) {
            System.err.println(
                    "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
                    + "Re-run the script to check again or increase the timeout if this happens repeatedly.");
            System.exit(1);
        }
    }
}
