import mysql from "mysql";
import XLSX from "xlsx";

const [user, password, database, filePath] = process.argv.slice(2);

const connection = mysql.createConnection({
  host: "localhost",
  user: user,
  password: password,
  database: database,
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
    .map(([no_faktur, price]) => ({
      no_faktur: String(no_faktur ?? "").trim(),
      price: Number(price),
    }))
    .filter((r) => r.no_faktur);
};

const updates = [
  [
    "TT_JUAL_DETAIL",
    "UPDATE TT_JUAL_DETAIL SET HARGA_JUAL=?, DPP_DETAIL=? WHERE NO_FAKTUR_JUAL=?",
    ({ no_faktur, price }) => [price, price, no_faktur],
  ],
  [
    "TT_JUAL_HEAD",
    "UPDATE TT_JUAL_HEAD SET DPP_BRUTO_RP=?, DPP_NETTO_RP=?, JML_JUAL_RP=?, DIBAYAR_RP=? WHERE NO_FAKTUR_JUAL=?",
    ({ no_faktur, price }) => [price, price, price, price, no_faktur],
  ],
  [
    "TH_CASH_DAILY",
    "UPDATE TH_CASH_DAILY SET JUMLAH_RP=? WHERE DESKRIPSI=?",
    ({ no_faktur, price }) => [price, no_faktur],
  ],
  [
    "TT_JUAL_SALES",
    "UPDATE TT_JUAL_SALES SET JML_JUAL_RP=? WHERE NO_FAKTUR_JUAL=?",
    ({ no_faktur, price }) => [price, no_faktur],
  ],
];

const deletions = [
  ["TT_JUAL_DETAIL", "NO_FAKTUR_JUAL"],
  ["TT_JUAL_HEAD", "NO_FAKTUR_JUAL"],
  ["TH_CASH_DAILY", "DESKRIPSI"],
  ["TT_JUAL_SALES", "NO_FAKTUR_JUAL"],
];

const main = async () => {
  if (!filePath) {
    console.error(
      "Usage: node index.js <user> <password> <database> <excelFile>",
    );
    process.exit(1);
  }

  const rows = readExcel(filePath);
  console.log(color.cyan(`Read ${rows.length} rows from ${filePath}`));

  connection.connect();

  const summary = { updated: 0, deleted: 0, notFound: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    if (Number.isNaN(row.price)) {
      summary.skipped++;
      console.log(color.yellow(`[SKIP] ${row.no_faktur}: invalid price`));
      continue;
    }
    for (const [table, sql, getParams] of updates) {
      try {
        const result = await query(sql, getParams(row));
        const msg = `[OK] ${row.no_faktur} -> ${table}: price=${row.price}, affected=${result.affectedRows}`;
        if (result.affectedRows) summary.updated++;
        else summary.notFound++;
        console.log(result.affectedRows ? color.green(msg) : color.yellow(msg));
      } catch (err) {
        summary.failed++;
        console.error(
          color.red(`[FAIL] ${row.no_faktur} -> ${table}: ${err.message}`),
        );
      }
    }
  }

  const invoiceNumbers = [...new Set(rows.map(({ no_faktur }) => no_faktur))];
  if (invoiceNumbers.length === 0) {
    console.log(color.yellow("Skipping deletion: no invoice numbers found in Excel"));
  } else {
    const placeholders = invoiceNumbers.map(() => "?").join(", ");
    for (const [table, column] of deletions) {
      try {
        const result = await query(
          `DELETE FROM ${table} WHERE ${column} IS NULL OR ${column} NOT IN (${placeholders})`,
          invoiceNumbers,
        );
        summary.deleted += result.affectedRows;
        console.log(
          color.green(`[DELETE] ${table}: removed=${result.affectedRows}`),
        );
      } catch (err) {
        summary.failed++;
        console.error(color.red(`[FAIL] deleting from ${table}: ${err.message}`));
      }
    }
  }

  console.log(color.cyan("\n===== Summary ====="));
  console.log(`Rows read        : ${rows.length}`);
  console.log(color.green(`Updates applied  : ${summary.updated}`));
  console.log(color.green(`Rows deleted     : ${summary.deleted}`));
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
