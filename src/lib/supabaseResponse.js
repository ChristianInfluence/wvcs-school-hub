export function firstReturnedRow(data, fallbackMessage = "Record was not found or you do not have permission to update it.") {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(fallbackMessage);
  return row;
}
