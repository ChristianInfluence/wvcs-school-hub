const STUDENTS_SHEET = 'Students';
const FORMER_STUDENTS_SHEET = 'Former Students';
const GRADUATES_SHEET = 'Graduates';
const SETTINGS_SHEET = 'Settings';
const ADD_STUDENT_SHEET = 'Add Student';
const IMPORT_REVIEW_SHEET = 'Import Review';
const STUDENT_ID_COLUMN = 12;
const REQUIRED_CSV_HEADERS = [
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
];
const STUDENT_HEADERS = [...REQUIRED_CSV_HEADERS, 'Student-ID'];
const LEGACY_ARCHIVE_HEADERS = [...REQUIRED_CSV_HEADERS, 'Archive-Date', 'School-Year', 'Reason'];
const ARCHIVE_HEADERS = [...STUDENT_HEADERS, 'Archive-Date', 'School-Year', 'Reason'];
const GRADE_ORDER = ['PS', 'PK', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('WVCS Roster')
    .addItem('Add Student from Form', 'addStudentFromForm')
    .addItem('Remove Selected Student', 'removeSelectedStudent')
    .addItem('Sort Students', 'sortStudents')
    .addSeparator()
    .addItem('Advance to Next School Year', 'advanceToNextSchoolYear')
    .addItem('Export Active Roster CSV', 'exportActiveRosterCsv')
    .addSeparator()
    .addItem('Ensure Student IDs', 'ensureStudentIds')
    .addItem('Migrate Archive Layouts', 'migrateArchiveLayouts')
    .addToUi();
}

function getSheet_(name) {
  const spreadsheet = SpreadsheetApp.getActive();
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function getCurrentSchoolYear_() {
  return String(getSheet_(SETTINGS_SHEET).getRange('B2').getDisplayValue() || '').trim();
}

function setCurrentSchoolYear_(schoolYear) {
  getSheet_(SETTINGS_SHEET).getRange('B2').setValue(schoolYear);
}

function nextSchoolYear_(schoolYear) {
  const match = String(schoolYear || '').match(/^(\d{4})-(\d{2}|\d{4})$/);
  if (!match) throw new Error('Settings!B2 must use a school year like 2026-27.');
  const start = Number(match[1]) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function ensureHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasData = sheet.getLastRow() > 1;
  const isBlank = current.every((value) => String(value || '').trim() === '');
  const matches = headers.every((header, index) => String(current[index] || '').trim() === header);
  if (matches) return;
  if (isBlank || !hasData) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  throw new Error(`${sheet.getName()} headers do not match the expected WVCS roster layout.`);
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

function rowHasStudent_(row) {
  return row.slice(0, 3).some((value) => String(value || '').trim());
}

function ensureStudentIds() {
  const sheet = getSheet_(STUDENTS_SHEET);
  ensureHeaders_(sheet, STUDENT_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const range = sheet.getRange(2, 1, lastRow - 1, STUDENT_ID_COLUMN);
  const rows = range.getValues();
  let changed = false;
  rows.forEach((row) => {
    if (rowHasStudent_(row) && !String(row[STUDENT_ID_COLUMN - 1] || '').trim()) {
      row[STUDENT_ID_COLUMN - 1] = Utilities.getUuid();
      changed = true;
    }
  });

  if (changed) range.setValues(rows);
  sortStudents();
}

function sortStudents() {
  const sheet = getSheet_(STUDENTS_SHEET);
  ensureHeaders_(sheet, STUDENT_HEADERS);
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

function addStudentFromForm() {
  const ui = SpreadsheetApp.getUi();
  const addSheet = getSheet_(ADD_STUDENT_SHEET);
  const studentSheet = getSheet_(STUDENTS_SHEET);
  ensureHeaders_(studentSheet, STUDENT_HEADERS);

  const values = readAddStudentValues_(addSheet);
  if (!values[0] || !values[1] || !values[2]) {
    ui.alert('Add Student', 'Grade, student first name, and student last name are required.', ui.ButtonSet.OK);
    return;
  }

  const response = ui.alert(
    'Add Student',
    `Add ${values[1]} ${values[2]} to grade ${values[0]}?`,
    ui.ButtonSet.OK_CANCEL
  );
  if (response !== ui.Button.OK) return;

  studentSheet.appendRow([...values, Utilities.getUuid()]);
  sortStudents();
  clearAddStudentForm_(addSheet);
  ui.alert('Add Student', 'Student added to the active roster.', ui.ButtonSet.OK);
}

function readAddStudentValues_(sheet) {
  const labels = REQUIRED_CSV_HEADERS;
  const displayValues = sheet.getDataRange().getDisplayValues();
  const byLabel = {};
  displayValues.forEach((row) => {
    const label = String(row[0] || '').trim();
    if (labels.includes(label)) byLabel[label] = String(row[1] || '').trim();
  });
  if (Object.keys(byLabel).length) return labels.map((label) => byLabel[label] || '');

  return sheet.getRange(2, 1, 1, 11).getValues()[0].map((value) => String(value || '').trim());
}

function clearAddStudentForm_(sheet) {
  const displayValues = sheet.getDataRange().getDisplayValues();
  const labeledRows = displayValues
    .map((row, index) => ({ label: String(row[0] || '').trim(), rowNumber: index + 1 }))
    .filter((entry) => REQUIRED_CSV_HEADERS.includes(entry.label));
  if (labeledRows.length) {
    labeledRows.forEach((entry) => sheet.getRange(entry.rowNumber, 2).clearContent());
    return;
  }
  sheet.getRange(2, 1, 1, 11).clearContent();
}

function removeSelectedStudent() {
  const ui = SpreadsheetApp.getUi();
  const sheet = getSheet_(STUDENTS_SHEET);
  const selected = sheet.getActiveRange();
  if (!selected || selected.getRow() < 2) {
    ui.alert('Remove Selected Student', 'Select a student row on the Students sheet first.', ui.ButtonSet.OK);
    return;
  }

  const rowNumber = selected.getRow();
  const row = sheet.getRange(rowNumber, 1, 1, STUDENT_ID_COLUMN).getValues()[0];
  if (!rowHasStudent_(row)) {
    ui.alert('Remove Selected Student', 'The selected row does not contain a student.', ui.ButtonSet.OK);
    return;
  }

  if (!String(row[STUDENT_ID_COLUMN - 1] || '').trim()) {
    row[STUDENT_ID_COLUMN - 1] = Utilities.getUuid();
    sheet.getRange(rowNumber, 1, 1, STUDENT_ID_COLUMN).setValues([row]);
  }

  const reasonPrompt = ui.prompt(
    'Remove Selected Student',
    `Move ${row[1]} ${row[2]} to Former Students? Optional reason:`,
    ui.ButtonSet.OK_CANCEL
  );
  if (reasonPrompt.getSelectedButton() !== ui.Button.OK) return;

  archiveRow_(row, FORMER_STUDENTS_SHEET, reasonPrompt.getResponseText() || 'Former student');
  sheet.deleteRow(rowNumber);
  ui.alert('Remove Selected Student', 'Student moved to Former Students.', ui.ButtonSet.OK);
}

function archiveRow_(row, archiveSheetName, reason) {
  const archiveSheet = getSheet_(archiveSheetName);
  migrateArchiveSheet_(archiveSheet);
  archiveSheet.appendRow([...row, new Date(), getCurrentSchoolYear_(), reason || 'Archived']);
}

function migrateArchiveLayouts() {
  migrateArchiveSheet_(getSheet_(FORMER_STUDENTS_SHEET));
  migrateArchiveSheet_(getSheet_(GRADUATES_SHEET));
  SpreadsheetApp.getUi().alert('Archive Migration', 'Former Students and Graduates layouts are ready.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function migrateArchiveSheet_(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const lastColumn = Math.max(sheet.getLastColumn(), 15);
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values[0].map((value) => String(value || '').trim());
  const current = ARCHIVE_HEADERS.every((header, index) => headers[index] === header);
  const legacy = LEGACY_ARCHIVE_HEADERS.every((header, index) => headers[index] === header);

  if (current) {
    if (lastRow > 1) {
      const dataRange = sheet.getRange(2, 1, lastRow - 1, 15);
      const data = dataRange.getValues();
      let changed = false;
      data.forEach((row) => {
        if (row.some((value) => String(value || '').trim()) && !String(row[11] || '').trim()) {
          row[11] = Utilities.getUuid();
          changed = true;
        }
      });
      if (changed) dataRange.setValues(data);
    }
    return;
  }

  if (!legacy && lastRow > 1) {
    throw new Error(`${sheet.getName()} does not match the known legacy archive layout.`);
  }

  const migrated = [ARCHIVE_HEADERS];
  for (let index = 1; index < values.length; index += 1) {
    const row = values[index];
    const hasData = row.some((value) => String(value || '').trim());
    migrated.push([
      ...row.slice(0, 11),
      hasData ? Utilities.getUuid() : '',
      row[11] || '',
      row[12] || '',
      row[13] || '',
    ]);
  }
  sheet.getRange(1, 1, migrated.length, 15).setValues(migrated);
}

function advanceToNextSchoolYear() {
  const ui = SpreadsheetApp.getUi();
  const currentYear = getCurrentSchoolYear_();
  const nextYear = nextSchoolYear_(currentYear);
  const response = ui.alert(
    'Advance to Next School Year',
    `Create a backup, graduate 12th grade, and advance ${currentYear} to ${nextYear}?`,
    ui.ButtonSet.OK_CANCEL
  );
  if (response !== ui.Button.OK) return;

  ensureStudentIds();
  migrateArchiveLayouts();
  createAnnualBackup_(currentYear);

  const sheet = getSheet_(STUDENTS_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, STUDENT_ID_COLUMN).getValues();
    const promoted = [];
    rows.forEach((row) => {
      if (!row.some((value) => String(value || '').trim())) return;
      const grade = normalizeGrade_(row[0]);
      if (grade === '12') {
        archiveRow_(row, GRADUATES_SHEET, 'Graduated');
      } else {
        const currentIndex = GRADE_ORDER.indexOf(grade);
        if (currentIndex !== -1) {
          row[0] = GRADE_ORDER[currentIndex + 1];
          promoted.push(row);
        }
      }
    });
    const blankRows = Array.from({ length: rows.length - promoted.length }, () => Array(STUDENT_ID_COLUMN).fill(''));
    sheet.getRange(2, 1, rows.length, STUDENT_ID_COLUMN).setValues([...promoted, ...blankRows]);
  }

  setCurrentSchoolYear_(nextYear);
  sortStudents();
  ui.alert('Advance to Next School Year', `Roster advanced to ${nextYear}.`, ui.ButtonSet.OK);
}

function createAnnualBackup_(schoolYear) {
  const spreadsheet = SpreadsheetApp.getActive();
  const file = DriveApp.getFileById(spreadsheet.getId());
  const parents = file.getParents();
  const folder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd-HHmm');
  file.makeCopy(`WVCS Student Roster Backup ${schoolYear} ${date}`, folder);
}

function exportActiveRosterCsv() {
  const sheet = getSheet_(STUDENTS_SHEET);
  ensureHeaders_(sheet, STUDENT_HEADERS);
  const lastRow = sheet.getLastRow();
  const rows = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 11).getDisplayValues() : [];
  const csvRows = [REQUIRED_CSV_HEADERS, ...rows.filter((row) => row.some((value) => String(value || '').trim()))];
  const csv = csvRows.map((row) => row.map(csvCell_).join(',')).join('\n');
  const spreadsheet = SpreadsheetApp.getActive();
  const file = DriveApp.getFileById(spreadsheet.getId());
  const parents = file.getParents();
  const folder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  folder.createFile(`WVCS-active-roster-${date}.csv`, csv, MimeType.CSV);
  SpreadsheetApp.getUi().alert('Export Active Roster CSV', 'CSV exported to the spreadsheet folder.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function csvCell_(value) {
  const text = String(value || '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
