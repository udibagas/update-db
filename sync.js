import { query } from "./db.js";
import { deleteNonexistentInvoices } from "./delete-nonexistent-loop.js";

export const FIELDS = ["tgl", "price", "kadar"];

// Which DB columns each Excel field writes, per table.
const updates = [
  {
    table: "TT_JUAL_DETAIL",
    matchColumn: "NO_FAKTUR_JUAL",
    columns: {
      price: ["HARGA_JUAL", "DPP_DETAIL"],
      kadar: ["KADAR"],
    },
  },
  {
    table: "TT_JUAL_HEAD",
    matchColumn: "NO_FAKTUR_JUAL",
    columns: {
      price: ["DPP_BRUTO_RP", "DPP_NETTO_RP", "JML_JUAL_RP", "DIBAYAR_RP"],
      tgl: ["TGL_SYSTEM", "TGL_FAKTUR_JUAL"],
    },
  },
  {
    table: "TH_CASH_DAILY",
    matchColumn: "DESKRIPSI",
    columns: { price: ["JUMLAH_RP"], tgl: ["TANGGAL"] },
  },
  {
    table: "TT_JUAL_SALES",
    matchColumn: "NO_FAKTUR_JUAL",
    columns: {
      price: ["JML_JUAL_RP"],
      tgl: ["TGL_SYSTEM", "TGL_FAKTUR_JUAL"],
    },
  },
];

const buildUpdate = ({ table, matchColumn, columns }, fields, row) => {
  const set = [];
  const params = [];
  for (const field of fields) {
    for (const column of columns[field] ?? []) {
      set.push(`${column}=?`);
      params.push(row[field]);
    }
  }
  if (!set.length) return null;
  params.push(row.no_faktur);
  return {
    sql: `UPDATE ${table} SET ${set.join(", ")} WHERE ${matchColumn}=?`,
    params,
  };
};

export const synchronize = async ({ connection, rows, dryRun, log, fields = FIELDS }) => {
  fields = fields.filter((f) => FIELDS.includes(f));
  const summary = {
    updated: 0,
    deleted: 0,
    notFound: 0,
    failed: 0,
    skipped: 0,
  };

  for (const row of rows) {
    if (fields.includes("price") && !Number.isFinite(row.price)) {
      summary.skipped++;
      log("yellow", `[SKIP] ${row.no_faktur}: invalid price`);
      continue;
    }

    if (fields.includes("tgl") && !row.tgl) {
      summary.skipped++;
      log("yellow", `[SKIP] ${row.no_faktur}: invalid date`);
      continue;
    }

    if (fields.includes("kadar") && (row.kadar === "" || row.kadar == null)) {
      summary.skipped++;
      log("yellow", `[SKIP] ${row.no_faktur}: empty kadar`);
      continue;
    }

    for (const def of updates) {
      const { table, matchColumn } = def;
      const update = buildUpdate(def, fields, row);
      if (!update) continue;
      try {
        if (dryRun) {
          const result = await query(
            connection,
            `SELECT COUNT(*) AS count FROM ${table} WHERE ${matchColumn}=?`,
            [row.no_faktur],
          );
          const matchedRows = Number(result[0].count);
          const message = `[DRY RUN] ${row.no_faktur} -> ${table}: fields=${fields.join("/")}, matching rows=${matchedRows}`;
          if (matchedRows) summary.updated++;
          else summary.notFound++;
          log(matchedRows ? "green" : "yellow", message);
        } else {
          const result = await query(connection, update.sql, update.params);
          const message = `[OK] ${row.no_faktur} -> ${table}: fields=${fields.join("/")}, affected=${result.affectedRows}`;
          if (result.affectedRows) summary.updated++;
          else summary.notFound++;
          log(result.affectedRows ? "green" : "yellow", message);
        }
      } catch (err) {
        summary.failed++;
        log(
          "red",
          `[FAIL] ${row.no_faktur} -> ${table}: ${err.message}`,
        );
      }
    }
  }

  const deletion = await deleteNonexistentInvoices({
    connection,
    rows,
    dryRun,
    log,
  });
  summary.deleted += deletion.deleted;
  summary.failed += deletion.failed;

  return summary;
};
