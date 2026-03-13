package io.uverify.examples.digitalproductpassport;

import io.uverify.examples.utils.WalletHelper;
import io.uverify.examples.utils.WalletHelper.WalletHandle;
import io.uverify.sdk.UVerifyClient;
import io.uverify.sdk.apps.UVerifyApps.DigitalProductPassportInput;
import io.uverify.sdk.apps.UVerifyApps.DigitalProductPassportResult;
import io.uverify.sdk.exception.UVerifyTimeoutException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

/**
 * Issues an EU-compliant Digital Product Passport for a manufactured product
 * on Cardano preprod.
 *
 * <p>Run:
 * <pre>
 *   mvn exec:java -Dexec.mainClass=io.uverify.examples.digitalproductpassport.DigitalProductPassportExample
 * </pre>
 */
public class DigitalProductPassportExample {

    private static final Path WALLET_FILE = Paths.get("wallet.txt");

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
        DigitalProductPassportInput product = new DigitalProductPassportInput(
                "EcoCharge Powerbank Pro 200", "GreenTech AG",
                "04012345678901", "EC200-SN-20240815-00847")
                .model("EC-200-2024")
                .origin("Germany")
                .manufactured("2024-08-15")
                .contact("sustainability@greentech-ag.example")
                .brandColor("#1a56db")
                .carbonFootprint("1.2 kg CO₂e")
                .recycledContent("38%")
                .energyClass("A++")
                .warranty("3 years")
                .spareParts("Available until 2034")
                .repairInfo("https://greentech-ag.example/repair/ec-200")
                .recycling("Return to any EU-authorised WEEE recycling point. Remove battery before disposal.")
                .materials(Map.of(
                        "aluminum",        "45%",
                        "recycled_plastic","38%",
                        "lithium_cells",   "12%",
                        "copper",          "5%"))
                .certifications(Map.of(
                        "ce",          "CE Marking",
                        "rohs",        "RoHS Compliant",
                        "energy_star", "Energy Star 8.0",
                        "reach",       "REACH Compliant"));

        // --- Issue ----------------------------------------------------------
        System.out.println("Issuing Digital Product Passport for \"" + product.getName() + "\" …");
        System.out.println("  GTIN   : " + product.getGtin());
        System.out.println("  Serial : " + product.getSerialNumber() + "\n");

        try {
            DigitalProductPassportResult result =
                    client.apps.issueDigitalProductPassport(wallet.address, product);
            System.out.println("Transaction submitted. Waiting for on-chain confirmation …");

            String dataHash = result.getHash();
            UVerifyClient.waitFor(() -> {
                var certs = client.verify(dataHash);
                return certs.isEmpty() ? null : certs;
            }, 300_000, 2_000);

            System.out.println("Digital Product Passport confirmed on-chain.\n");
            System.out.println("Product passport URL (share with customers / regulators):");
            System.out.println("  " + result.getVerifyUrl());
            System.out.println("\nDone. The Digital Product Passport is permanently anchored on Cardano.");

        } catch (UVerifyTimeoutException e) {
            System.err.println(
                    "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
                    + "Re-run the script to check again or increase the timeout if this happens repeatedly.");
            System.exit(1);
        }
    }
}
