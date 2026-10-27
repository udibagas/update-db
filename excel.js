import XLSX from "xlsx";

export const EXCEL_SCHEMAS = ["A", "B"];

const pad = (n) => String(n).padStart(2, "0");

const isValidDate = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
};

// Converts an Excel serial number, Date, or text (YYYY-MM-DD, DD/MM/YYYY,
// DD-MM-YYYY) to MySQL's YYYY-MM-DD. Returns null when it can't be parsed.
export const toSqlDate = (value) => {
  let y, m, d;
  if (value instanceof Date) {
    [y, m, d] = [value.getFullYear(), value.getMonth() + 1, value.getDate()];
  } else if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    ({ y, m, d } = parsed);
  } else {
    const text = String(value ?? "").trim();
    let match;
    if (
      (match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/))
    ) {
      [y, m, d] = [match[1], match[2], match[3]].map(Number);
    } else if (
      (match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T].*)?$/))
    ) {
      [d, m, y] = [match[1], match[2], match[3]].map(Number);
    } else {
      return null;
    }
  }
  return isValidDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
};

function mapper(row, schema) {
  if (schema === "A") {
    const [
      no_faktur,
      tgl,
      berat,
      harga,
      nama_barang,
      ,
      no_faktur_beli,
      tgl_beli,
      berat_beli,
      harga_beli,
      nama_barang_beli,
    ] = row;

    return {
      no_faktur: String(no_faktur || "").trim(),
      tgl: toSqlDate(tgl),
      berat: Number(berat),
      harga: Math.round(Number(harga)),
      nama_barang: String(nama_barang || "").trim(),
      no_faktur_beli: String(no_faktur_beli || "").trim(),
      tgl_beli: toSqlDate(tgl_beli),
      berat_beli: Number(berat_beli),
      harga_beli: Math.round(Number(harga_beli)),
      nama_barang_beli: String(nama_barang_beli || "").trim(),
    };
  }

  if (schema === "B") {
    const [
      no_faktur,
      tgl,
      berat,
      kadar,
      harga,
      ,
      no_faktur_beli,
      tgl_beli,
      nama_barang_beli,
      kondisi,
      berat_beli,
      kadar_beli,
      harga_beli,
    ] = row;

    return {
      no_faktur: String(no_faktur || "").trim(),
      tgl: toSqlDate(tgl),
      berat: Number(berat),
      kadar: Number(kadar),
      harga: Math.round(Number(harga)),
      no_faktur_beli: String(no_faktur_beli || "").trim(),
      tgl_beli: toSqlDate(tgl_beli),
      nama_barang_beli: String(nama_barang_beli || "").trim(),
      kondisi: String(kondisi || "").trim(),
      berat_beli: Number(berat_beli),
      kadar_beli: Number(kadar_beli),
      harga_beli: Math.round(Number(harga_beli)),
    };
  }
}

export const readExcel = (path, schema = "A") => {
  if (!EXCEL_SCHEMAS.includes(schema)) {
    throw new Error(`Invalid Excel schema. Choose from: ${EXCEL_SCHEMAS.join(", ")}`);
  }

  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils
    .sheet_to_json(sheet, { header: 1 })
    .slice(1)
    .map((row) => mapper(row, schema))
    .filter((row) => row.no_faktur || row.no_faktur_beli);
};
