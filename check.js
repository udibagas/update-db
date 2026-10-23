import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connect, query } from "./db.js";

const tables = [
  "TT_JUAL_DETAIL",
  "TT_JUAL_HEAD",
  "TH_CASH_DAILY",
  "TT_JUAL_SALES",
];

export const main = async (args = process.argv.slice(2)) => {
  const [user, password, database] = args;
  if (!user || !password || !database) {
    throw new Error("Usage: node check.js <user> <password> <database>");
  }

  const connection = await connect(user, password, database);
  try {
    for (const table of tables) {
      const result = await query(
        connection,
        `SELECT COUNT(*) AS count FROM ${table}`,
      );
      console.log(`${table}: ${result[0].count} rows`);
    }
  } finally {
    await connection.end();
  }
};

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
