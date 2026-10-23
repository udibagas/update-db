import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { connect, query } from "./db.js";
import { readExcel } from "./excel.js";

const tables = [
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
  const invoiceNumbers = new Set(rows.map(({ no_faktur }) => no_faktur));

  if (invoiceNumbers.size === 0) {
    writeLog("yellow", "Skipping deletion: no invoice numbers found in Excel");
    return summary;
  }

  for (const [table, column] of tables) {
    try {
      const dbRows = await query(connection, `SELECT ${column} FROM ${table}`);
      writeLog("cyan", `[COUNT] ${table}: current rows=${dbRows.length}`);

      // Group missing rows by their original column value (NULL included).
      const missing = new Map();
      for (const dbRow of dbRows) {
        const value = dbRow[column];
        const found =
          value !== null && invoiceNumbers.has(String(value).trim());
        if (!found) missing.set(value, (missing.get(value) ?? 0) + 1);
      }

      for (const [value, count] of missing) {
        const label = value === null ? "NULL" : value;
        try {
          if (dryRun) {
            summary.deleted += count;
            writeLog(
              "yellow",
              `[DRY RUN] ${table}: ${label} not in Excel, would remove=${count}`,
            );
          } else {
            const result =
              value === null
                ? await query(
                    connection,
                    `DELETE FROM ${table} WHERE ${column} IS NULL`,
                  )
                : await query(
                    connection,
                    `DELETE FROM ${table} WHERE ${column}=?`,
                    [value],
                  );
            summary.deleted += result.affectedRows;
            writeLog(
              "green",
              `[DELETE] ${table}: ${label} not in Excel, removed=${result.affectedRows}`,
            );
          }
        } catch (err) {
          summary.failed++;
          writeLog("red", `[FAIL] deleting ${label} from ${table}: ${err.message}`);
        }
      }

      if (missing.size === 0) {
        writeLog("green", `[OK] ${table}: all rows exist in Excel`);
      }
    } catch (err) {
      summary.failed++;
      writeLog("red", `[FAIL] reading ${table}: ${err.message}`);
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
      "Usage: node delete-nonexistent-loop.js [--dry-run] <user> <password> <database> <excelFile>",
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
    log("green", `${deletionLabel.padEnd(16)}: ${summary.deleted}`);
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
