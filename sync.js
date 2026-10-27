import { query } from "./db.js";
import { deleteNonexistentInvoices } from "./delete-nonexistent-loop.js";

export const FIELD_LABELS = {
  tgl: "Tanggal",
  harga: "Harga",
  berat: "Berat",
  barang: "Nama barang",
};
export const FIELDS = Object.keys(FIELD_LABELS);

// Excel row key holding each field's value; purchase tables use the *_beli columns.
const VALUE_KEYS = {
  tgl: "tgl",
  harga: "harga",
  berat: "berat",
  barang: "nama_barang",
};
const SELL = { invoiceKey: "no_faktur", suffix: "" };
const BUY = { invoiceKey: "no_faktur_beli", suffix: "_beli" };

// Which DB columns each Excel field writes, per table.
const updates = [
  {
    table: "TT_JUAL_DETAIL",
    matchColumn: "NO_FAKTUR_JUAL",
    ...SELL,
    columns: { harga: ["HARGA_JUAL", "DPP_DETAIL"] },
  },
  {
    table: "TT_JUAL_HEAD",
    matchColumn: "NO_FAKTUR_JUAL",
    ...SELL,
    columns: {
      harga: ["DPP_BRUTO_RP", "DPP_NETTO_RP", "JML_JUAL_RP", "DIBAYAR_RP"],
      tgl: ["TGL_SYSTEM", "TGL_FAKTUR_JUAL"],
    },
  },
  {
    table: "TH_CASH_DAILY",
    matchColumn: "DESKRIPSI",
    ...SELL,
    columns: { harga: ["JUMLAH_RP"], tgl: ["TANGGAL"] },
  },
  {
    table: "TT_JUAL_SALES",
    matchColumn: "NO_FAKTUR_JUAL",
    ...SELL,
    columns: {
      harga: ["JML_JUAL_RP"],
      tgl: ["TGL_SYSTEM", "TGL_FAKTUR_JUAL"],
    },
  },
  {
    table: "TT_BELI_HEAD",
    matchColumn: "NO_FAKTUR_BELI",
    ...BUY,
    columns: {
      harga: [
        "DPP_NETTO_RP",
        "DPP_BRUTO_RP",
        "DPP_INTERN_RP",
        "JML_BELI_RP",
        "JML_BELI_INTERN",
      ],
      tgl: ["TGL_SYSTEM", "TGL_FAKTUR_BELI"],
      berat: ["TOT_BERAT"],
    },
  },
  {
    table: "TT_BELI_DETAIL",
    matchColumn: "NO_FAKTUR_BELI",
    ...BUY,
    columns: {
      harga: ["HARGA_BELI", "DPP_DET_RP", "JML_DET_RP"],
      berat: ["BERAT"],
      barang: ["NAMA_BARANG"],
    },
  },
];

const isEmpty = (value) =>
  value == null ||
  value === "" ||
  (typeof value === "number" && !Number.isFinite(value));

const buildUpdate = (
  { table, matchColumn, columns, invoiceKey, suffix },
  fields,
  row,
) => {
  const invoice = row[invoiceKey];
  if (!invoice) return { skip: "no invoice number" };
  const set = [];
  const params = [];
  for (const field of fields) {
    if (!columns[field]) continue;
    const value = row[VALUE_KEYS[field] + suffix];
    if (field === "barang" && isEmpty(value)) continue;
    if (isEmpty(value)) return { skip: `invalid ${field}` };
    for (const column of columns[field]) {
      set.push(`${column}=?`);
      params.push(value);
    }
  }
  if (!set.length) return null;
  params.push(invoice);
  return {
    invoice,
    sql: `UPDATE ${table} SET ${set.join(", ")} WHERE ${matchColumn}=?`,
    params,
  };
};

export const synchronize = async ({
  connection,
  rows,
  dryRun,
  log,
  fields = FIELDS,
}) => {
  fields = fields.filter((f) => FIELDS.includes(f));
  const summary = {
    updated: 0,
    deleted: 0,
    notFound: 0,
    failed: 0,
    skipped: 0,
  };

  for (const row of rows) {
    for (const def of updates) {
      const { table, matchColumn } = def;
      const update = buildUpdate(def, fields, row);
      if (!update) continue;
      if (update.skip) {
        summary.skipped++;
        log(
          "yellow",
          `[SKIP] ${table} (${row.no_faktur || row.no_faktur_beli}): ${update.skip}`,
        );
        continue;
      }
      const invoice = update.invoice;
      try {
        if (dryRun) {
          const result = await query(
            connection,
            `SELECT COUNT(*) AS count FROM ${table} WHERE ${matchColumn}=?`,
            [invoice],
          );
          const matchedRows = Number(result[0].count);
          const message = `[DRY RUN] ${invoice} -> ${table}: fields=${fields.join("/")}, matching rows=${matchedRows}`;
          if (matchedRows) summary.updated++;
          else summary.notFound++;
          log(matchedRows ? "green" : "yellow", message);
        } else {
          const result = await query(connection, update.sql, update.params);
          const message = `[OK] ${invoice} -> ${table}: fields=${fields.join("/")}, affected=${result.affectedRows}`;
          if (result.affectedRows) summary.updated++;
          else summary.notFound++;
          log(result.affectedRows ? "green" : "yellow", message);
        }
      } catch (err) {
        summary.failed++;
        log("red", `[FAIL] ${invoice} -> ${table}: ${err.message}`);
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
