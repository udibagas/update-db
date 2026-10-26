import { resolve, dirname, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import express from "express";
import multer from "multer";
import { connect } from "./db.js";
import { readExcel } from "./excel.js";
import { synchronize, FIELDS } from "./sync.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ALLOWED_EXT = [".xlsx", ".xls", ".csv"];

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    cb(null, ALLOWED_EXT.includes(extname(file.originalname).toLowerCase())),
});

export const createApp = () => {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", resolve(__dirname, "views"));
  app.use(express.static(resolve(__dirname, "public")));
  app.use(express.urlencoded({ extended: false }));

  app.get("/", (req, res) => {
    res.render("index", { error: null, form: { fields: FIELDS } });
  });

  app.post("/sync", upload.single("file"), async (req, res) => {
    const { user, password, database } = req.body;
    const dryRun = req.body.dryRun === "on";
    const raw = req.body.fields ?? [];
    const fields = [].concat(raw).filter((f) => FIELDS.includes(f));
    const form = { user, database, dryRun, fields };
    const fail = (error) => res.status(400).render("index", { error, form });

    try {
      if (!req.file) {
        return fail("Please upload an Excel file (.xlsx, .xls or .csv).");
      }
      if (!fields.length) {
        return fail("Select at least one field to update.");
      }
      if (!user || !password || !database) {
        return fail("User, password and database are required.");
      }
      if (!dryRun && req.body.confirm !== "YES") {
        return fail('Type YES to confirm changes to the database.');
      }

      const rows = readExcel(req.file.path);
      const logs = [];
      const log = (level, message) => logs.push({ level, message });

      const connection = await connect(user, password, database);
      try {
        const summary = await synchronize({
          connection,
          rows,
          dryRun,
          log,
          fields,
        });
        res.render("result", {
          database,
          dryRun,
          fileName: req.file.originalname,
          rowCount: rows.length,
          summary,
          logs,
        });
      } finally {
        await connection.end();
      }
    } catch (err) {
      fail(err.message);
    } finally {
      if (req.file) await rm(req.file.path, { force: true });
    }
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(400).render("index", { error: err.message, form: { fields: FIELDS } });
  });

  return app;
};

export const startServer = (port = process.env.PORT || 3000) =>
  createApp().listen(port, () =>
    console.log(`Web app running at http://localhost:${port}`),
  );

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) startServer();
