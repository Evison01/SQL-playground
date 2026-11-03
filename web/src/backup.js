import { newWorkspace } from "./storage.js";
const MAX_BYTES = 20 * 1024 * 1024;
export function serializeWorkspace(workspace) {
  return JSON.stringify({
    format: "sql-playground",
    version: 1,
    workspace: {
      ...workspace,
      bytes: workspace.bytes ? Array.from(workspace.bytes) : null,
    },
  });
}
export function parseWorkspace(text) {
  if (text.length > MAX_BYTES)
    throw new Error("Backup exceeds the 20 MB limit.");
  const value = JSON.parse(text);
  const data = value.workspace;
  if (
    value.format !== "sql-playground" ||
    value.version !== 1 ||
    !data ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    typeof data.sql !== "string"
  )
    throw new Error("Not a supported SQL Playground backup.");
  if (
    data.bytes !== null &&
    (!Array.isArray(data.bytes) ||
      data.bytes.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
  )
    throw new Error("Invalid database bytes.");
  if (
    data.bytes &&
    (data.bytes.length < 16 ||
      String.fromCharCode(...data.bytes.slice(0, 16)) !== "SQLite format 3\0")
  )
    throw new Error("Backup does not contain a SQLite database.");
  if (
    !Array.isArray(data.saved) ||
    data.saved.some(
      (q) => typeof q.name !== "string" || typeof q.sql !== "string",
    )
  )
    throw new Error("Invalid saved queries.");
  if (
    !Array.isArray(data.history) ||
    data.history.some(
      (q) =>
        typeof q.sql !== "string" ||
        !Number.isFinite(q.at) ||
        !Number.isFinite(q.elapsed) ||
        (q.error !== null && typeof q.error !== "string"),
    )
  )
    throw new Error("Invalid query history.");
  return {
    ...newWorkspace(data.name.trim().slice(0, 80) + " (imported)", data.sql),
    dataset: ["instagram", "bookstore", "blank"].includes(data.dataset)
      ? data.dataset
      : "instagram",
    bytes: data.bytes ? new Uint8Array(data.bytes) : null,
    saved: data.saved.map((q) => ({
      id: crypto.randomUUID(),
      name: q.name.slice(0, 80),
      sql: q.sql,
    })),
    history: data.history
      .slice(0, 100)
      .map((q) => ({ ...q, id: crypto.randomUUID() })),
  };
}
export function csvResult(result) {
  const cell = (value) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
  return [result.columns, ...result.rows]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
export function download(name, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
