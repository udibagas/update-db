# update-db

A command-line utility that reads invoice numbers and prices from an Excel
spreadsheet, updates matching MySQL records, and removes records that are not
listed in the spreadsheet.

## Requirements

- Node.js
- pnpm
- A MySQL server running on `localhost`
- A database account with permission to update and delete rows in the tables
  listed below; dry-run mode also requires `SELECT` permission
- An Excel workbook (`.xlsx`) with invoice numbers and prices

## Setup

Install the project dependencies:

```sh
pnpm install
```

## Spreadsheet format

The script reads the **first worksheet**. It expects a header row followed by
data in columns A and B:

| Invoice number | Price |
| --- | ---: |
| INV-001 | 125000 |
| INV-002 | 89000 |

The first row is always skipped as a header. Invoice numbers are trimmed and
treated as text; store them as text in Excel to preserve leading zeros. Prices
must be parseable as numbers. Rows without an invoice number are ignored, and
rows with an invalid price are skipped for updates.

## Run

```sh
node index.js <user> <password> <database> <excelFile>
```

For example:

```sh
node index.js app_user 'your-password' sales_db ./invoices.xlsx
```

Before a normal run, the script displays a warning naming the target database
and asks you to type `YES` to continue. Any other response, including an empty
response, cancels the run before it connects to MySQL. Dry-run mode does not ask
for confirmation because it does not execute database changes.

To inspect the matching and deletion counts without changing the database, add
`--dry-run`:

```sh
node index.js --dry-run app_user 'your-password' sales_db ./invoices.xlsx
```

Dry-run mode connects to MySQL and runs read-only count queries to report the
rows that match each update and the rows that would be deleted. It does not run
any `UPDATE` or `DELETE` statements. The database account must have permission
to read the relevant tables.

For each invoice and table, the output shows the number of matching rows. In
the summary, **Updates planned** counts invoice-and-table combinations with at
least one match (not the total number of matching database rows), and **Rows to
delete** is the total number of rows that match the deletion criteria across
the four tables. Dry-run results are a point-in-time preview; database contents
may change before a normal run.

The database host is fixed to `localhost` in the script. The program reports
updates or planned updates, rows with no match, skipped rows, failures, and
deletions or planned deletions in the terminal.

## Database changes

For each valid spreadsheet row, the utility updates these fields:

| Table | Match column | Fields set to the spreadsheet price |
| --- | --- | --- |
| `TT_JUAL_DETAIL` | `NO_FAKTUR_JUAL` | `HARGA_JUAL`, `DPP_DETAIL` |
| `TT_JUAL_HEAD` | `NO_FAKTUR_JUAL` | `DPP_BRUTO_RP`, `DPP_NETTO_RP`, `JML_JUAL_RP`, `DIBAYAR_RP` |
| `TH_CASH_DAILY` | `DESKRIPSI` | `JUMLAH_RP` |
| `TT_JUAL_SALES` | `NO_FAKTUR_JUAL` | `JML_JUAL_RP` |

After processing updates, it **deletes rows from all four tables** when the
table's match column is `NULL` or its value is not among the invoice numbers
read from the spreadsheet. This deletion list includes invoice numbers from
rows whose prices were invalid, even though those rows do not get updated. If
the spreadsheet contains no invoice numbers, deletion is skipped.

> **Warning:** A normal run can make substantial, irreversible changes to your
> database. Dry-run counts are only a preview; they do not lock the database
> or guarantee the later update/delete will affect the same records. A normal
> run does not use a transaction. The confirmation prompt is an extra safeguard,
> not a replacement for backing up the database, verifying the workbook and
> target database, and testing with a non-production database. A short or
> incomplete workbook can cause records to be deleted.
