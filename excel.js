import XLSX from "xlsx";

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

export const readExcel = (path) => {
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils
    .sheet_to_json(sheet, { header: 1 })
    .slice(1)
    .map(([no_faktur, tgl, price, kadar]) => ({
      no_faktur: String(no_faktur || "").trim(),
      tgl: toSqlDate(tgl),
      price: Number(price),
      kadar,
    }))
    .filter((row) => row.no_faktur);
};
