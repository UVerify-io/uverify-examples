package io.uverify.examples.laboratoryreport;

import io.uverify.examples.utils.WalletHelper;
import io.uverify.examples.utils.WalletHelper.WalletHandle;
import io.uverify.sdk.UVerifyClient;
import io.uverify.sdk.apps.UVerifyApps.LaboratoryReportInput;
import io.uverify.sdk.apps.UVerifyApps.LaboratoryReportResult;
import io.uverify.sdk.exception.UVerifyTimeoutException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Issues two GDPR-safe laboratory report certificates for patients in a single
 * Cardano preprod transaction.
 *
 * <p>Run:
 * <pre>
 *   mvn exec:java -Dexec.mainClass=io.uverify.examples.laboratoryreport.LaboratoryReportExample
 * </pre>
 */
public class LaboratoryReportExample {

    private static final Path WALLET_FILE = Paths.get("wallet.txt");
    private static final String LAB_NAME    = "Berlin Medical Diagnostics GmbH";
    private static final String LAB_CONTACT = "results@bmd-lab.example";

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

        // --- Report data ----------------------------------------------------
        List<LaboratoryReportInput> reports = List.of(
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

        // --- Issue ----------------------------------------------------------
        System.out.println("Issuing " + reports.size() + " lab reports in a single transaction …");
        for (LaboratoryReportInput r : reports) {
            System.out.println("  • " + r.getReportId() + " — " + r.getPatientName());
        }

        try {
            LaboratoryReportResult result = client.apps.issueLaboratoryReport(wallet.address, reports);
            System.out.println("\nTransaction submitted. Waiting for on-chain confirmation …");

            String firstHash = result.getCertificates().get(0).getHash();
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
                    + "Re-run the script to check again or increase the timeout if this happens repeatedly.");
            System.exit(1);
        }
    }
}
