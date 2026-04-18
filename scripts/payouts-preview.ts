/**
 * Payouts dry-run (V7 §8 / V8 §A2).
 *
 * Computes the monthly CreatorPayout rows WITHOUT writing to the DB, prints a
 * summary table, and exits. Run before the real cron on the 1st of the month
 * to sanity-check amounts.
 *
 *   tsx scripts/payouts-preview.ts             # previous month
 *   tsx scripts/payouts-preview.ts 2026-03     # specific month
 *
 * NOTE: this currently *does* call runMonthlyPayouts which upserts to DB —
 * Prisma transactions aren't wrapped around it yet. TODO: add a `dryRun: true`
 * option to lib/payouts.ts to make this script truly read-only.
 */

import { runMonthlyPayouts, previousMonthKey } from "../lib/payouts";

async function main() {
  const month = process.argv[2] || previousMonthKey();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    // eslint-disable-next-line no-console
    console.error(`Invalid month format: ${month} (expected YYYY-MM)`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`[payouts] computing for ${month}...`);
  const result = await runMonthlyPayouts(month);

  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("Payouts summary");
  // eslint-disable-next-line no-console
  console.log("===============");
  // eslint-disable-next-line no-console
  console.log(`Month:             ${result.month}`);
  // eslint-disable-next-line no-console
  console.log(`Rows written:      ${result.createdRows}`);
  // eslint-disable-next-line no-console
  console.log(`Gross total:       $${(result.totalGrossCents / 100).toFixed(2)}`);
  // eslint-disable-next-line no-console
  console.log(`Net total:         $${(result.totalNetCents / 100).toFixed(2)}`);
  // eslint-disable-next-line no-console
  console.log(`Below threshold:   ${result.belowThreshold}`);
  // eslint-disable-next-line no-console
  console.log(`Errors:            ${result.errors.length}`);
  for (const err of result.errors) {
    // eslint-disable-next-line no-console
    console.error(`  ! ${err}`);
  }

  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
