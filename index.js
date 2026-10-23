import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { connect } from "./db.js";
import { readExcel } from "./excel.js";
import { synchronize } from "./sync.js";

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
        `WARNING: This will update and delete data in database "${database}". Type YES to continue: `,
      ),
    );
    return answer.trim() === "YES";
  } finally {
    readline.close();
  }
};

export const main = async (args = process.argv.slice(2)) => {
  const dryRun = args.includes("--dry-run");
  const [user, password, database, filePath] = args.filter(
    (arg) => arg !== "--dry-run",
  );

  if (!user || !password || !database || !filePath) {
    throw new Error(
      "Usage: node index.js [--dry-run] <user> <password> <database> <excelFile>",
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
    const summary = await synchronize({ connection, rows, dryRun, log });
    log("cyan", "\n===== Summary =====");
    console.log(`Rows read        : ${rows.length}`);
    const updateLabel = dryRun ? "Updates planned  " : "Updates applied  ";
    const deletionLabel = dryRun ? "Rows to delete   " : "Rows deleted     ";
    log("green", `${updateLabel}: ${summary.updated}`);
    log("green", `${deletionLabel}: ${summary.deleted}`);
    log("yellow", `No row matched   : ${summary.notFound}`);
    log("yellow", `Rows skipped     : ${summary.skipped}`);
    log("red", `Updates failed   : ${summary.failed}`);
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
