const STUDENTS_SHEET = 'Students';
const FORMER_STUDENTS_SHEET = 'Former Students';
const GRADUATES_SHEET = 'Graduates';
const AUDIT_SHEET = 'Roster Audit';
const STUDENT_ID_COLUMN = 12;
const REQUIRED_HEADERS = [
  'Grade',
  'Student-FN',
  'Student-LN',
  'Parent-1-FN',
  'Parent-1-LN',
  'EMAIL-1',
  'Parent-1-#',
  'Parent-2-FN',
  'Parent-2-LN',
  'Parent-2-#',
  'EMAIL-2',
  'Student-ID',
];
const ARCHIVE_HEADERS = [...REQUIRED_HEADERS, 'Archive-Date', 'School-Year', 'Reason'];
const GRADE_ORDER = ['PS', 'PK', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('WVCS Roster')
    .addItem('Ensure Student IDs', 'ensureStudentIds')
    .addItem('Sort Students', 'sortStudents')
    .addItem('Export CSV A:K Only', 'exportRosterCsv')
    .addToUi();
}

function getSheet_(name) {
  const spreadsheet = SpreadsheetApp.getActive();
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function ensureHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const missing = headers.some((header, index) => current[index] !== header);
  if (missing) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function normalizeGrade_(grade) {
  const clean = String(grade || '').trim().toUpperCase();
  if (clean === 'PREK' || clean === 'PRE-K') return 'PK';
  if (clean === 'KINDERGARTEN') return 'K';
  return clean;
}

function gradeIndex_(grade) {
  const index = GRADE_ORDER.indexOf(normalizeGrade_(grade));
  return index === -1 ? 999 : index;
}

function ensureStudentIds() {
  const sheet = getSheet_(STUDENTS_SHEET);
  ensureHeaders_(sheet, REQUIRED_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const range = sheet.getRange(2, 1, lastRow - 1, STUDENT_ID_COLUMN);
  const rows = range.getValues();
  let changed = false;
  const nextRows = rows.map((row) => {
    const hasStudent = row.slice(0, 3).some((value) => String(value || '').trim());
    if (hasStudent && !String(row[STUDENT_ID_COLUMN - 1] || '').trim()) {
      row[STUDENT_ID_COLUMN - 1] = Utilities.getUuid();
      changed = true;
    }
    return row;
  });

  if (changed) range.setValues(nextRows);
  sortStudents();
}

function sortStudents() {
  const sheet = getSheet_(STUDENTS_SHEET);
  ensureHeaders_(sheet, REQUIRED_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;

  const rows = sheet.getRange(2, 1, lastRow - 1, STUDENT_ID_COLUMN).getValues();
  const activeRows = rows.filter((row) => row.some((value) => String(value || '').trim()));
  activeRows.sort((a, b) => {
    const gradeSort = gradeIndex_(a[0]) - gradeIndex_(b[0]);
    if (gradeSort !== 0) return gradeSort;
    const lastSort = String(a[2] || '').localeCompare(String(b[2] || ''), undefined, { sensitivity: 'base' });
    if (lastSort !== 0) return lastSort;
    return String(a[1] || '').localeCompare(String(b[1] || ''), undefined, { sensitivity: 'base' });
  });

  const blankRows = Array.from({ length: rows.length - activeRows.length }, () => Array(STUDENT_ID_COLUMN).fill(''));
  sheet.getRange(2, 1, rows.length, STUDENT_ID_COLUMN).setValues([...activeRows, ...blankRows]);
}

function addStudentFromValues(values) {
  const sheet = getSheet_(STUDENTS_SHEET);
  ensureHeaders_(sheet, REQUIRED_HEADERS);
  const row = REQUIRED_HEADERS.map((_, index) => values[index] || '');
  row[STUDENT_ID_COLUMN - 1] = row[STUDENT_ID_COLUMN - 1] || Utilities.getUuid();
  sheet.appendRow(row);
  sortStudents();
}

function archiveStudentRow(rowNumber, archiveSheetName, reason) {
  const studentSheet = getSheet_(STUDENTS_SHEET);
  const archiveSheet = getSheet_(archiveSheetName);
  ensureHeaders_(archiveSheet, ARCHIVE_HEADERS);
  const row = studentSheet.getRange(rowNumber, 1, 1, STUDENT_ID_COLUMN).getValues()[0];
  if (!row.some((value) => String(value || '').trim())) return;

  archiveSheet.appendRow([...row, new Date(), currentSchoolYear_(), reason || 'Archived from roster']);
  studentSheet.deleteRow(rowNumber);
  sortStudents();
}

function moveStudentToFormer(rowNumber, reason) {
  archiveStudentRow(rowNumber, FORMER_STUDENTS_SHEET, reason || 'Former student');
}

function moveStudentToGraduates(rowNumber, reason) {
  archiveStudentRow(rowNumber, GRADUATES_SHEET, reason || 'Graduated');
}

function currentSchoolYear_() {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

function exportRosterCsv() {
  const sheet = getSheet_(STUDENTS_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return;
  const rows = sheet.getRange(1, 1, lastRow, 11).getDisplayValues();
  const csv = rows.map((row) => row.map(csvCell_).join(',')).join('\n');
  DriveApp.createFile(`WVCS-roster-${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')}.csv`, csv, MimeType.CSV);
}

function csvCell_(value) {
  const text = String(value || '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
