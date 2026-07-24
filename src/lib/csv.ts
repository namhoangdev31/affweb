export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV có trường quoted chưa đóng.");
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function csvRecords(input: string): Array<Record<string, string>> {
  const [headers, ...rows] = parseCsv(input);
  if (!headers?.length) return [];
  const normalizedHeaders = headers.map((header) => header.trim().replace(/^\uFEFF/, ""));
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error("CSV có tên cột trùng nhau.");
  }
  return rows.map((row) =>
    Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index]?.trim() ?? ""]))
  );
}
