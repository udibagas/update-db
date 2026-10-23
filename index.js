import mysql from "mysql";
import XLSX from "xlsx";
import { createInterface } from "node:readline/promises";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const [user, password, database, filePath] = args.filter(
  (arg) => arg !== "--dry-run",
);

const connection = mysql.createConnection({
  host: "localhost",
  user: user,
  password: password,
  database: database,
  insecureAuth: true,
  ssl: {
    rejectUnauthorized: false,
  },
});

const color = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const query = (sql, params) =>
  new Promise((resolve, reject) =>
    connection.query(sql, params, (err, result) =>
      err ? reject(err) : resolve(result),
    ),
  );

const readExcel = (path) => {
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils
    .sheet_to_json(sheet, { header: 1 })
    .slice(1)
    .map(([no_faktur, tgl, berat, price]) => ({
      no_faktur: String(no_faktur || "").trim(),
      tgl: String(tgl || "").trim(),
      berat: Number(berat),
      price: price,
    }))
    .filter((r) => r.no_faktur);
};

const confirmChanges = async () => {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let answer;
  try {
    answer = await readline.question(
      color.red(
        `WARNING: This will update and delete data in database "${database}". Type YES to continue: `,
      ),
    );
  } finally {
    readline.close();
  }
  return answer.trim() === "YES";
};

const updates = [
  {
    table: "TT_JUAL_DETAIL",
    matchColumn: "NO_FAKTUR_JUAL",
    sql: "UPDATE TT_JUAL_DETAIL SET HARGA_JUAL=?, DPP_DETAIL=?, BERAT=? WHERE NO_FAKTUR_JUAL=?",
    getParams: ({ no_faktur, berat, price }) => [
      price,
      price,
      berat,
      no_faktur,
    ],
  },
  {
    table: "TT_JUAL_HEAD",
    matchColumn: "NO_FAKTUR_JUAL",
    sql: "UPDATE TT_JUAL_HEAD SET DPP_BRUTO_RP=?, DPP_NETTO_RP=?, JML_JUAL_RP=?, DIBAYAR_RP=?, BERAT=? WHERE NO_FAKTUR_JUAL=?",
    getParams: ({ no_faktur, berat, price }) => [
      price,
      price,
      price,
      price,
      berat,
      no_faktur,
    ],
  },
  {
    table: "TH_CASH_DAILY",
    matchColumn: "DESKRIPSI",
    sql: "UPDATE TH_CASH_DAILY SET JUMLAH_RP=? WHERE DESKRIPSI=?",
    getParams: ({ no_faktur, price }) => [price, no_faktur],
  },
  {
    table: "TT_JUAL_SALES",
    matchColumn: "NO_FAKTUR_JUAL",
    sql: "UPDATE TT_JUAL_SALES SET JML_JUAL_RP=? WHERE NO_FAKTUR_JUAL=?",
    getParams: ({ no_faktur, price }) => [price, no_faktur],
  },
];

const deletions = [
  ["TT_JUAL_DETAIL", "NO_FAKTUR_JUAL"],
  ["TT_JUAL_HEAD", "NO_FAKTUR_JUAL"],
  ["TH_CASH_DAILY", "DESKRIPSI"],
  ["TT_JUAL_SALES", "NO_FAKTUR_JUAL"],
];

const main = async () => {
  if (!user || !password || !database || !filePath) {
    console.error(
      "Usage: node index.js [--dry-run] <user> <password> <database> <excelFile>",
    );
    process.exit(1);
  }

  const rows = readExcel(filePath);
  console.log(color.cyan(`Read ${rows.length} rows from ${filePath}`));
  if (dryRun) {
    console.log(color.yellow("DRY RUN: no database changes will be made"));
  } else if (!(await confirmChanges())) {
    console.log(color.yellow("Cancelled. No database changes were made."));
    return;
  }

  connection.connect();

  const summary = {
    updated: 0,
    deleted: 0,
    notFound: 0,
    failed: 0,
    skipped: 0,
  };

  for (const row of rows) {
    if (Number.isNaN(row.price)) {
      summary.skipped++;
      console.log(color.yellow(`[SKIP] ${row.no_faktur}: invalid price`));
      continue;
    }
    for (const { table, matchColumn, sql, getParams } of updates) {
      try {
        if (dryRun) {
          const result = await query(
            `SELECT COUNT(*) AS count FROM ${table} WHERE ${matchColumn}=?`,
            [row.no_faktur],
          );
          const matchedRows = Number(result[0].count);
          const msg = `[DRY RUN] ${row.no_faktur} -> ${table}: price=${row.price}, matching rows=${matchedRows}`;
          if (matchedRows) summary.updated++;
          else summary.notFound++;
          console.log(matchedRows ? color.green(msg) : color.yellow(msg));
        } else {
          const result = await query(sql, getParams(row));
          const msg = `[OK] ${row.no_faktur} -> ${table}: price=${row.price}, affected=${result.affectedRows}`;
          if (result.affectedRows) summary.updated++;
          else summary.notFound++;
          console.log(
            result.affectedRows ? color.green(msg) : color.yellow(msg),
          );
        }
      } catch (err) {
        summary.failed++;
        console.error(
          color.red(
            `[FAIL] ${row.no_faktur} -> ${table}: ${err.message} ${row.berat}`,
          ),
        );
      }
    }
  }

  const invoiceNumbers = [...new Set(rows.map(({ no_faktur }) => no_faktur))];
  if (invoiceNumbers.length === 0) {
    console.log(
      color.yellow("Skipping deletion: no invoice numbers found in Excel"),
    );
  } else {
    const placeholders = invoiceNumbers.map(() => "?").join(", ");
    for (const [table, column] of deletions) {
      try {
        if (dryRun) {
          const result = await query(
            `SELECT COUNT(*) AS count FROM ${table} WHERE ${column} IS NULL OR ${column} NOT IN (${placeholders})`,
            invoiceNumbers,
          );
          const count = Number(result[0].count);
          summary.deleted += count;
          console.log(
            color.yellow(
              `[DRY RUN] ${table}: rows that would be removed=${count}`,
            ),
          );
        } else {
          const result = await query(
            `DELETE FROM ${table} WHERE ${column} IS NULL OR ${column} NOT IN (${placeholders})`,
            invoiceNumbers,
          );
          summary.deleted += result.affectedRows;
          console.log(
            color.green(`[DELETE] ${table}: removed=${result.affectedRows}`),
          );
        }
      } catch (err) {
        summary.failed++;
        console.error(
          color.red(`[FAIL] deleting from ${table}: ${err.message}`),
        );
      }
    }
  }

  console.log(color.cyan("\n===== Summary ====="));
  console.log(`Rows read        : ${rows.length}`);
  const updateLabel = dryRun ? "Updates planned  " : "Updates applied  ";
  const deletionLabel = dryRun ? "Rows to delete   " : "Rows deleted     ";
  console.log(color.green(`${updateLabel}: ${summary.updated}`));
  console.log(color.green(`${deletionLabel}: ${summary.deleted}`));
  console.log(color.yellow(`No row matched   : ${summary.notFound}`));
  console.log(color.yellow(`Rows skipped     : ${summary.skipped}`));
  console.log(color.red(`Updates failed   : ${summary.failed}`));

  connection.end();
};

main().catch((err) => {
  console.error(err);
  connection.end();
  process.exit(1);
});
