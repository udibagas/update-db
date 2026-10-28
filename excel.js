import XLSX from "xlsx";
import mapper from "./mapper/index.js";

export const EXCEL_SCHEMAS = ["A", "B"];

export const readExcel = (path, schema = "A") => {
  if (!EXCEL_SCHEMAS.includes(schema)) {
    throw new Error(
      `Invalid Excel schema. Choose from: ${EXCEL_SCHEMAS.join(", ")}`,
    );
  }

  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils
    .sheet_to_json(sheet, { header: 1 })
    .slice(1)
    .map((row) => mapper[schema](row))
    .filter((row) => row.no_faktur || row.no_faktur_beli);
};
