// Minimal, dependency-free CSV parser that handles quoted fields,
// commas/newlines inside quotes, and doubled-quote escaping ("").

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }

    if (char === "\r") {
      i++;
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }

    field += char;
    i++;
  }

  // flush last field/row (file may not end with newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // drop fully-empty trailing rows
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

// Convert parsed rows (first row = header) into an array of plain objects.
function rowsToRecords(rows) {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const record = {};
    for (let c = 0; c < header.length; c++) {
      record[header[c]] = r[c] !== undefined ? r[c] : "";
    }
    records.push(record);
  }
  return records;
}

module.exports = { parseCSV, rowsToRecords };
