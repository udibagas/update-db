import XLSX from "xlsx";

export const readExcel = (path) => {
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils
    .sheet_to_json(sheet, { header: 1 })
    .slice(1)
    .map(([no_faktur, tgl, berat, price]) => ({
      no_faktur: String(no_faktur || "").trim(),
      tgl: String(tgl || "").trim(),
      berat: Number(berat),
      price,
    }))
    .filter((row) => row.no_faktur);
};
