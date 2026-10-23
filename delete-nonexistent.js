import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { connect, query } from "./db.js";
import { readExcel } from "./excel.js";

const deletions = [
  ["TT_JUAL_DETAIL", "NO_FAKTUR_JUAL"],
  ["TT_JUAL_HEAD", "NO_FAKTUR_JUAL"],
  ["TH_CASH_DAILY", "DESKRIPSI"],
  ["TT_JUAL_SALES", "NO_FAKTUR_JUAL"],
];

const color = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};

const log = (level, message) => {
  const format = color[level];
  console.log(format ? format(message) : message);
};

const confirmChanges = async (database) => {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await readline.question(
      color.red(
        `WARNING: This will delete data from database "${database}". Type YES to continue: `,
      ),
    );
    return answer.trim() === "YES";
  } finally {
    readline.close();
  }
};

export const deleteNonexistentInvoices = async ({
  connection,
  rows,
  dryRun,
  log: writeLog,
}) => {
  const summary = { deleted: 0, failed: 0 };
  const invoiceNumbers = [...new Set(rows.map(({ no_faktur }) => no_faktur))];

  if (invoiceNumbers.length === 0) {
    writeLog("yellow", "Skipping deletion: no invoice numbers found in Excel");
    return summary;
  }

  const placeholders = invoiceNumbers.map(() => "?").join(", ");
  for (const [table, column] of deletions) {
    const predicate = `(${column} NOT IN (${placeholders}) OR ${column} IS NULL)`;
    try {
      const total = await query(
        connection,
        `SELECT COUNT(*) AS count FROM ${table}`,
      );
      writeLog("cyan", `[COUNT] ${table}: current rows=${Number(total[0].count)}`);

      if (dryRun) {
        const result = await query(
          connection,
          `SELECT COUNT(*) AS count FROM ${table} WHERE ${predicate}`,
          invoiceNumbers,
        );
        const count = Number(result[0].count);
        summary.deleted += count;
        writeLog("yellow", `[DRY RUN] ${table}: rows that would be removed=${count}`);
      } else {
        const result = await query(
          connection,
          `DELETE FROM ${table} WHERE ${predicate}`,
          invoiceNumbers,
        );
        summary.deleted += result.affectedRows;
        writeLog("green", `[DELETE] ${table}: removed=${result.affectedRows}`);
      }
    } catch (err) {
      summary.failed++;
      writeLog("red", `[FAIL] deleting from ${table}: ${err.message}`);
    }
  }

  return summary;
};

export const main = async (args = process.argv.slice(2)) => {
  const dryRun = args.includes("--dry-run");
  const [user, password, database, filePath] = args.filter(
    (arg) => arg !== "--dry-run",
  );

  if (!user || !password || !database || !filePath) {
    throw new Error(
      "Usage: node delete-nonexistent.js [--dry-run] <user> <password> <database> <excelFile>",
    );
  }

  const rows = readExcel(filePath);
  log("cyan", `Read ${rows.length} rows from ${filePath}`);
  if (dryRun) {
    log("yellow", "DRY RUN: no database changes will be made");
  } else if (!(await confirmChanges(database))) {
    log("yellow", "Cancelled. No database changes were made.");
    return;
  }

  const connection = await connect(user, password, database);
  try {
    const summary = await deleteNonexistentInvoices({
      connection,
      rows,
      dryRun,
      log,
    });
    log("cyan", "\n===== Deletion Summary =====");
    const deletionLabel = dryRun ? "Rows to delete" : "Rows deleted";
    log("green", `${deletionLabel.padEnd(15)}: ${summary.deleted}`);
    log("red", `Deletions failed : ${summary.failed}`);
  } finally {
    await connection.end();
  }
};

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
