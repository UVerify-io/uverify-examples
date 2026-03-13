package io.uverify.examples.diploma;

import io.uverify.examples.utils.WalletHelper;
import io.uverify.examples.utils.WalletHelper.WalletHandle;
import io.uverify.sdk.UVerifyClient;
import io.uverify.sdk.apps.UVerifyApps.DiplomaInput;
import io.uverify.sdk.apps.UVerifyApps.DiplomaResult;
import io.uverify.sdk.exception.UVerifyTimeoutException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

/**
 * Batch-issues three academic diploma certificates for TU Munich graduates
 * in a single Cardano preprod transaction.
 *
 * <p>Run:
 * <pre>
 *   mvn exec:java -Dexec.mainClass=io.uverify.examples.diploma.DiplomaExample
 * </pre>
 */
public class DiplomaExample {

    private static final Path WALLET_FILE = Paths.get("wallet.txt");
    private static final String INSTITUTION = "Technical University of Munich";

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

        // --- Graduates ------------------------------------------------------
        List<DiplomaInput> diplomas = List.of(
                new DiplomaInput("TUM-2021-0042", "Maria Müller",
                        "Master of Science in Computer Science",
                        INSTITUTION, "2024-06-28", "Summa Cum Laude"),
                new DiplomaInput("TUM-2021-0117", "Felix Schmidt",
                        "Master of Science in Computer Science",
                        INSTITUTION, "2024-06-28"),
                new DiplomaInput("TUM-2021-0284", "Layla Hassan",
                        "Master of Science in Electrical Engineering",
                        INSTITUTION, "2024-06-28", "Magna Cum Laude")
        );

        // --- Issue ----------------------------------------------------------
        System.out.println("Issuing " + diplomas.size() + " diplomas …");
        for (DiplomaInput d : diplomas) {
            System.out.println("  • " + d.getName() + " — " + d.getDegree());
        }

        try {
            DiplomaResult result = client.apps.issueDiploma(wallet.address, diplomas);
            System.out.println("\nTransaction submitted. Waiting for on-chain confirmation …");

            String firstHash = result.getCertificates().get(0).getHash();
            UVerifyClient.waitFor(() -> {
                var certs = client.verify(firstHash);
                return certs.isEmpty() ? null : certs;
            }, 300_000, 2_000);

            System.out.println("All diplomas confirmed on-chain.\n");
            System.out.println("Verification deep links (share with each graduate):");
            for (var cert : result.getCertificates()) {
                System.out.println("  " + cert.getName() + ": " + cert.getVerifyUrl());
            }
            System.out.println("\nDone. All diplomas are permanently anchored on Cardano.");

        } catch (UVerifyTimeoutException e) {
            System.err.println(
                    "\nTimed out waiting for confirmation. The transaction may still be processing.\n"
                    + "Re-run the script to check again or increase the timeout if this happens repeatedly.");
            System.exit(1);
        }
    }
}
