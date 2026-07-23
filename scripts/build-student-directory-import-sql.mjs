import fs from "node:fs";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/build-student-directory-import-sql.mjs input.csv output.sql");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

function sqlString(value) {
  return `'${String(value || "").trim().replaceAll("'", "''")}'`;
}

const csv = fs.readFileSync(inputPath, "utf8");
const rows = parseCsv(csv)
  .slice(1)
  .filter((row) => row.some((value) => String(value || "").trim()));

const values = rows
  .map((row) => {
    const padded = Array.from({ length: 11 }, (_, index) => row[index] || "");
    return `(${padded.map(sqlString).join(", ")})`;
  })
  .join(",\n");

const sql = `insert into public.student_directory (
  grade,
  student_first_name,
  student_last_name,
  parent1_first_name,
  parent1_last_name,
  email1,
  phone1,
  parent2_first_name,
  parent2_last_name,
  phone2,
  email2
) values
${values};
`;

fs.writeFileSync(outputPath, sql);
console.log(`Prepared ${rows.length} student rows.`);
