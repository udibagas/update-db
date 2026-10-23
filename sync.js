import { query } from "./db.js";

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

export const synchronize = async ({ connection, rows, dryRun, log }) => {
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
      log("yellow", `[SKIP] ${row.no_faktur}: invalid price`);
      continue;
    }

    for (const { table, matchColumn, sql, getParams } of updates) {
      try {
        if (dryRun) {
          const result = await query(
            connection,
            `SELECT COUNT(*) AS count FROM ${table} WHERE ${matchColumn}=?`,
            [row.no_faktur],
          );
          const matchedRows = Number(result[0].count);
          const message = `[DRY RUN] ${row.no_faktur} -> ${table}: price=${row.price}, matching rows=${matchedRows}`;
          if (matchedRows) summary.updated++;
          else summary.notFound++;
          log(matchedRows ? "green" : "yellow", message);
        } else {
          const result = await query(connection, sql, getParams(row));
          const message = `[OK] ${row.no_faktur} -> ${table}: price=${row.price}, affected=${result.affectedRows}`;
          if (result.affectedRows) summary.updated++;
          else summary.notFound++;
          log(result.affectedRows ? "green" : "yellow", message);
        }
      } catch (err) {
        summary.failed++;
        log(
          "red",
          `[FAIL] ${row.no_faktur} -> ${table}: ${err.message} ${row.berat}`,
        );
      }
    }
  }

  const invoiceNumbers = [...new Set(rows.map(({ no_faktur }) => no_faktur))];
  if (invoiceNumbers.length === 0) {
    log("yellow", "Skipping deletion: no invoice numbers found in Excel");
  } else {
    const placeholders = invoiceNumbers.map(() => "?").join(", ");
    for (const [table, column] of deletions) {
      const predicate = `(${column} NOT IN (${placeholders}) OR ${column} IS NULL)`;
      try {
        if (dryRun) {
          const result = await query(
            connection,
            `SELECT COUNT(*) AS count FROM ${table} WHERE ${predicate}`,
            invoiceNumbers,
          );
          const count = Number(result[0].count);
          summary.deleted += count;
          log(
            "yellow",
            `[DRY RUN] ${table}: rows that would be removed=${count}`,
          );
        } else {
          const result = await query(
            connection,
            `DELETE FROM ${table} WHERE ${predicate}`,
            invoiceNumbers,
          );
          summary.deleted += result.affectedRows;
          log("green", `[DELETE] ${table}: removed=${result.affectedRows}`);
        }
      } catch (err) {
        summary.failed++;
        log("red", `[FAIL] deleting from ${table}: ${err.message}`);
      }
    }
  }

  return summary;
};
