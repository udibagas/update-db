import { readExcel } from "./excel.js";
const [path, schema = "A"] = process.argv.slice(2);
const excelData = readExcel(path, schema);
console.table(excelData.slice(0, 10));
