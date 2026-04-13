// @ts-nocheck
"use client";

/**
 * @module DatabasePanel
 *
 * HYBRID — sql.js (WebAssembly SQLite) integration with simulation fallback.
 *
 * PART 1 — Imports & Types
 * PART 2 — sql.js Engine (WebAssembly SQLite)
 * PART 3 — Schema Browser (tables, columns, indexes, foreign keys)
 * PART 4 — Query History with Favorites
 * PART 5 — Results Table with Inline Editing
 * PART 6 — Results Export (CSV, JSON)
 * PART 7 — Visual Query Builder
 * PART 8 — ER Diagram Visualization
 * PART 9 — Query Execution Plan
 * PART 10 — Main Panel
 */

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Database,
  Play,
  Clock,
  Table2,
  Loader2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Star,
  Download,
  Copy,
  Plus,
  X,
  Eye,
  Key,
  Link2,
  Hash,
  Type,
  Search,
  Save,
  Pencil,
  Check,
  BarChart3,
  FileText,
} from "lucide-react";

export interface DBConnection {
  id: string;
  name: string;
  type: "sqlite" | "postgresql" | "mysql" | "mongodb";
  connectionString: string;
  connected: boolean;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
  error?: string;
}

interface QueryHistoryEntry {
  id: string;
  query: string;
  timestamp: number;
  success: boolean;
  isFavorite: boolean;
}

interface ColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  defaultValue: string | null;
}

interface IndexInfo {
  name: string;
  unique: boolean;
  columns: string[];
}

interface ForeignKeyInfo {
  from: string;
  table: string;
  to: string;
}

interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
  rowCount: number;
}

interface ExecutionPlanStep {
  id: number;
  detail: string;
  selectid?: number;
  order?: number;
}

interface DatabasePanelProps {
  connections: DBConnection[];
  onConnect: (conn: DBConnection) => Promise<boolean>;
  onExecuteQuery: (connectionId: string, query: string) => Promise<QueryResult>;
  tables?: string[];
}

// ============================================================
// PART 2 — sql.js Engine (WebAssembly SQLite)
// ============================================================

type SqlJsDatabase = {
  run: (sql: string) => void;
  exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  close: () => void;
};

type SqlJsStatic = {
  Database: new () => SqlJsDatabase;
};

let _sqlJsPromise: Promise<SqlJsStatic | null> | null = null;

function loadSqlJs(): Promise<SqlJsStatic | null> {
  if (_sqlJsPromise) return _sqlJsPromise;
  _sqlJsPromise = (async () => {
    try {
      const initSqlJs = (await import("sql.js" as any)).default as (
        config?: Record<string, unknown>,
      ) => Promise<SqlJsStatic>;
      const SQL = await initSqlJs({
        locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
      });
      return SQL;
    } catch {
      console.warn("[DatabasePanel] sql.js unavailable, using simulation fallback");
      return null;
    }
  })();
  return _sqlJsPromise;
}

function executeOnDb(db: SqlJsDatabase, sql: string): QueryResult {
  const start = performance.now();
  try {
    const results = db.exec(sql);
    const elapsed = Math.round(performance.now() - start);
    if (results.length === 0) {
      return {
        columns: ["result"],
        rows: [{ result: "Query executed successfully" }],
        rowCount: 0,
        executionTime: elapsed,
      };
    }
    const first = results[0];
    const rows: Record<string, unknown>[] = first.values.map((row) => {
      const obj: Record<string, unknown> = {};
      first.columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
    return { columns: first.columns, rows, rowCount: rows.length, executionTime: elapsed };
  } catch (err: unknown) {
    const elapsed = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    return { columns: [], rows: [], rowCount: 0, executionTime: elapsed, error: message };
  }
}

function introspectTables(db: SqlJsDatabase): string[] {
  try {
    const results = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
    );
    if (results.length === 0) return [];
    return results[0].values.map((row) => String(row[0]));
  } catch {
    return [];
  }
}

function introspectTableSchema(db: SqlJsDatabase, tableName: string): TableSchema {
  const columns: ColumnInfo[] = [];
  const indexes: IndexInfo[] = [];
  const foreignKeys: ForeignKeyInfo[] = [];
  let rowCount = 0;

  try {
    // Column info via PRAGMA
    const colResults = db.exec(`PRAGMA table_info("${tableName}");`);
    if (colResults.length > 0) {
      for (const row of colResults[0].values) {
        columns.push({
          name: String(row[1]),
          type: String(row[2] ?? "TEXT"),
          notnull: row[3] === 1,
          pk: row[5] === 1,
          defaultValue: row[4] != null ? String(row[4]) : null,
        });
      }
    }

    // Index info
    const idxResults = db.exec(`PRAGMA index_list("${tableName}");`);
    if (idxResults.length > 0) {
      for (const row of idxResults[0].values) {
        const idxName = String(row[1]);
        const isUnique = row[2] === 1;
        const idxCols: string[] = [];
        const idxInfoResults = db.exec(`PRAGMA index_info("${idxName}");`);
        if (idxInfoResults.length > 0) {
          for (const iRow of idxInfoResults[0].values) {
            idxCols.push(String(iRow[2]));
          }
        }
        indexes.push({ name: idxName, unique: isUnique, columns: idxCols });
      }
    }

    // Foreign keys
    const fkResults = db.exec(`PRAGMA foreign_key_list("${tableName}");`);
    if (fkResults.length > 0) {
      for (const row of fkResults[0].values) {
        foreignKeys.push({
          table: String(row[2]),
          from: String(row[3]),
          to: String(row[4]),
        });
      }
    }

    // Row count
    const countResults = db.exec(`SELECT COUNT(*) FROM "${tableName}";`);
    if (countResults.length > 0 && countResults[0].values.length > 0) {
      rowCount = Number(countResults[0].values[0][0]) || 0;
    }
  } catch {
    // Schema introspection can fail on virtual tables
  }

  return { name: tableName, columns, indexes, foreignKeys, rowCount };
}

function getExecutionPlan(db: SqlJsDatabase, sql: string): ExecutionPlanStep[] {
  try {
    const results = db.exec(`EXPLAIN QUERY PLAN ${sql}`);
    if (results.length === 0) return [];
    return results[0].values.map((row) => ({
      id: Number(row[0]),
      selectid: Number(row[1]),
      order: Number(row[2]),
      detail: String(row[3]),
    }));
  } catch {
    return [];
  }
}

// ============================================================
// PART 3 — Schema Browser (tables, columns, indexes, foreign keys)
// ============================================================

function SchemaBrowser({
  db,
  tables,
  onSelect,
}: {
  db: SqlJsDatabase | null;
  tables: string[];
  onSelect: (table: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [schemas, setSchemas] = useState<Record<string, TableSchema>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const toggleTable = useCallback(
    (tableName: string) => {
      if (expandedTable === tableName) {
        setExpandedTable(null);
        return;
      }
      setExpandedTable(tableName);
      if (db && !schemas[tableName]) {
        setSchemas((prev) => ({
          ...prev,
          [tableName]: introspectTableSchema(db, tableName),
        }));
      }
    },
    [expandedTable, db, schemas],
  );

  const filteredTables = useMemo(() => {
    if (!searchQuery.trim()) return tables;
    const q = searchQuery.toLowerCase();
    return tables.filter((t) => t.toLowerCase().includes(q));
  }, [tables, searchQuery]);

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-text-tertiary hover:text-text-primary"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Tables ({tables.length})
      </button>

      {expanded && (
        <div className="pb-1">
          {/* Search */}
          <div className="px-2 pb-1">
            <div className="flex items-center gap-1 rounded border border-border bg-bg-secondary/40 px-1.5 py-0.5">
              <Search size={10} className="text-text-tertiary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter tables..."
                className="flex-1 bg-transparent text-[10px] text-text-primary outline-none"
              />
            </div>
          </div>

          {filteredTables.map((t) => {
            const schema = schemas[t];
            const isExpanded = expandedTable === t;

            return (
              <div key={t}>
                <div className="flex items-center">
                  <button
                    onClick={() => toggleTable(t)}
                    className="shrink-0 px-1 py-1 text-text-tertiary hover:text-text-primary"
                  >
                    {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  </button>
                  <button
                    onClick={() => onSelect(t)}
                    className="flex flex-1 items-center gap-1.5 py-1 pr-2 text-xs text-text-secondary hover:text-text-primary"
                  >
                    <Table2 size={12} className="text-blue-400" />
                    <span className="truncate">{t}</span>
                    {schema && (
                      <span className="ml-auto text-[9px] text-text-tertiary">
                        {schema.rowCount} rows
                      </span>
                    )}
                  </button>
                </div>

                {/* Column details */}
                {isExpanded && schema && (
                  <div className="ml-5 border-l border-border/30 pl-2 pb-1">
                    {schema.columns.map((col) => (
                      <div
                        key={col.name}
                        className="flex items-center gap-1 py-0.5 text-[10px] text-text-tertiary"
                      >
                        {col.pk ? (
                          <Key size={9} className="text-yellow-400" />
                        ) : (
                          <Type size={9} />
                        )}
                        <span className="text-text-secondary">{col.name}</span>
                        <span className="font-mono text-[9px]">{col.type}</span>
                        {col.notnull && (
                          <span className="text-[8px] text-accent-red">NOT NULL</span>
                        )}
                      </div>
                    ))}

                    {/* Indexes */}
                    {schema.indexes.length > 0 && (
                      <div className="mt-1 pt-1 border-t border-border/20">
                        <span className="text-[9px] font-bold uppercase text-text-tertiary">
                          Indexes
                        </span>
                        {schema.indexes.map((idx) => (
                          <div
                            key={idx.name}
                            className="flex items-center gap-1 py-0.5 text-[10px] text-text-tertiary"
                          >
                            <Hash size={9} />
                            <span>{idx.name}</span>
                            {idx.unique && (
                              <span className="text-[8px] text-accent-purple">UNIQUE</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Foreign keys */}
                    {schema.foreignKeys.length > 0 && (
                      <div className="mt-1 pt-1 border-t border-border/20">
                        <span className="text-[9px] font-bold uppercase text-text-tertiary">
                          Foreign Keys
                        </span>
                        {schema.foreignKeys.map((fk, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1 py-0.5 text-[10px] text-text-tertiary"
                          >
                            <Link2 size={9} className="text-green-400" />
                            <span>
                              {fk.from} → {fk.table}.{fk.to}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// PART 4 — Query History with Favorites
// ============================================================

function HistoryList({
  history,
  onSelect,
  onToggleFavorite,
}: {
  history: QueryHistoryEntry[];
  onSelect: (query: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const displayed = showFavoritesOnly ? history.filter((h) => h.isFavorite) : history;

  return (
    <div>
      <div className="flex items-center justify-between px-2 py-1.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-text-tertiary hover:text-text-primary"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          History ({history.length})
        </button>
        {expanded && (
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={`text-[10px] ${showFavoritesOnly ? "text-yellow-400" : "text-text-tertiary"} hover:text-yellow-400`}
          >
            <Star size={10} fill={showFavoritesOnly ? "currentColor" : "none"} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="max-h-48 overflow-y-auto pb-1">
          {displayed.length === 0 && (
            <div className="px-3 py-2 text-[10px] text-text-tertiary">
              {showFavoritesOnly ? "No favorites yet" : "No query history"}
            </div>
          )}
          {displayed.map((h) => (
            <div key={h.id} className="flex items-center group">
              <button
                onClick={() => onToggleFavorite(h.id)}
                className={`shrink-0 px-1 py-1 ${h.isFavorite ? "text-yellow-400" : "text-transparent group-hover:text-text-tertiary"}`}
              >
                <Star size={9} fill={h.isFavorite ? "currentColor" : "none"} />
              </button>
              <button
                onClick={() => onSelect(h.query)}
                className={`flex flex-1 items-start gap-1 pr-2 py-1 text-xs hover:bg-bg-secondary/60 ${
                  h.success ? "text-text-secondary" : "text-red-400"
                }`}
              >
                <Clock size={10} className="mt-0.5 shrink-0" />
                <span className="truncate font-mono text-[10px]">{h.query}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// PART 5 — Results Table with Inline Editing
// ============================================================

function ResultsTable({
  result,
  db,
  tableName,
  onRefresh,
}: {
  result: QueryResult | null;
  db: SqlJsDatabase | null;
  tableName: string | null;
  onRefresh: () => void;
}) {
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = useCallback((rowIdx: number, col: string, currentValue: unknown) => {
    setEditingCell({ row: rowIdx, col });
    setEditValue(currentValue == null ? "" : String(currentValue));
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingCell || !db || !tableName) return;

    const row = result?.rows[editingCell.row];
    if (!row) return;

    // Find primary key column (first column as fallback)
    const pkCol = result?.columns[0];
    if (!pkCol) return;

    const pkValue = row[pkCol];
    const escapedVal = editValue.replace(/'/g, "''");
    const sql = `UPDATE "${tableName}" SET "${editingCell.col}" = '${escapedVal}' WHERE "${pkCol}" = '${pkValue}';`;

    try {
      db.run(sql);
      onRefresh();
    } catch (err) {
      console.error("[DatabasePanel] Inline edit failed:", err);
    }
    setEditingCell(null);
  }, [editingCell, editValue, db, tableName, result, onRefresh]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        Run a query to see results
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-red-400">
        <AlertTriangle size={14} />
        {result.error}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-bg-primary">
          <tr>
            {result.columns.map((col) => (
              <th
                key={col}
                className="border-b border-border px-3 py-1.5 text-left font-medium text-text-secondary"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-bg-secondary/60 group">
              {result.columns.map((col) => {
                const isEditing =
                  editingCell?.row === ri && editingCell?.col === col;

                return (
                  <td
                    key={col}
                    className="border-b border-border px-3 py-1 text-text-primary relative"
                    onDoubleClick={() => db && tableName && startEdit(ri, col, row[col])}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") cancelEdit();
                          }}
                          autoFocus
                          className="w-full rounded border border-accent-green bg-bg-secondary px-1 py-0.5 text-xs outline-none"
                        />
                        <button onClick={commitEdit} className="text-accent-green">
                          <Check size={10} />
                        </button>
                        <button onClick={cancelEdit} className="text-text-tertiary">
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span>{row[col] == null ? "NULL" : String(row[col])}</span>
                        {db && tableName && (
                          <button
                            onClick={() => startEdit(ri, col, row[col])}
                            className="absolute right-1 top-1 hidden group-hover:inline text-text-tertiary hover:text-text-primary"
                          >
                            <Pencil size={9} />
                          </button>
                        )}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border px-3 py-1 text-[10px] text-text-tertiary">
        {result.rowCount} rows returned in {result.executionTime}ms
        {db && tableName && (
          <span className="ml-2 text-accent-purple">(double-click to edit)</span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// PART 6 — Results Export (CSV, JSON)
// ============================================================

function ExportButtons({ result }: { result: QueryResult | null }) {
  if (!result || result.error || result.rows.length === 0) return null;

  const exportCsv = useCallback(() => {
    if (!result) return;
    const header = result.columns.join(",");
    const rows = result.rows.map((row) =>
      result.columns.map((col) => {
        const val = row[col];
        if (val == null) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "query-results.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result]);

  const exportJson = useCallback(() => {
    if (!result) return;
    const json = JSON.stringify(result.rows, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "query-results.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result]);

  const copyToClipboard = useCallback(() => {
    if (!result) return;
    const text = result.rows
      .map((row) => result.columns.map((col) => String(row[col] ?? "")).join("\t"))
      .join("\n");
    navigator.clipboard.writeText(`${result.columns.join("\t")}\n${text}`);
  }, [result]);

  return (
    <div className="flex items-center gap-1 border-t border-border px-2 py-1">
      <button
        onClick={exportCsv}
        className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-text-tertiary hover:bg-bg-secondary/60 hover:text-text-primary"
      >
        <Download size={10} /> CSV
      </button>
      <button
        onClick={exportJson}
        className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-text-tertiary hover:bg-bg-secondary/60 hover:text-text-primary"
      >
        <FileText size={10} /> JSON
      </button>
      <button
        onClick={copyToClipboard}
        className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-text-tertiary hover:bg-bg-secondary/60 hover:text-text-primary"
      >
        <Copy size={10} /> Copy
      </button>
    </div>
  );
}

// ============================================================
// PART 7 — Visual Query Builder
// ============================================================

function VisualQueryBuilder({
  tables,
  db,
  onQueryGenerated,
}: {
  tables: string[];
  db: SqlJsDatabase | null;
  onQueryGenerated: (sql: string) => void;
}) {
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [whereClause, setWhereClause] = useState("");
  const [orderBy, setOrderBy] = useState("");
  const [limitCount, setLimitCount] = useState("100");
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [joinTable, setJoinTable] = useState("");
  const [joinOn, setJoinOn] = useState("");

  useEffect(() => {
    if (!selectedTable || !db) {
      setTableColumns([]);
      return;
    }
    const schema = introspectTableSchema(db, selectedTable);
    setTableColumns(schema.columns.map((c) => c.name));
    setSelectedColumns([]);
  }, [selectedTable, db]);

  const toggleColumn = useCallback((col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  }, []);

  const generateQuery = useCallback(() => {
    if (!selectedTable) return;
    const cols = selectedColumns.length > 0 ? selectedColumns.join(", ") : "*";
    let sql = `SELECT ${cols}\nFROM "${selectedTable}"`;
    if (joinTable && joinOn) {
      sql += `\nJOIN "${joinTable}" ON ${joinOn}`;
    }
    if (whereClause.trim()) {
      sql += `\nWHERE ${whereClause}`;
    }
    if (orderBy.trim()) {
      sql += `\nORDER BY ${orderBy}`;
    }
    if (limitCount.trim()) {
      sql += `\nLIMIT ${limitCount}`;
    }
    sql += ";";
    onQueryGenerated(sql);
  }, [selectedTable, selectedColumns, whereClause, orderBy, limitCount, joinTable, joinOn, onQueryGenerated]);

  return (
    <div className="rounded border border-border/20 bg-bg-primary/20 p-2 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        <Eye size={12} /> Visual Query Builder
      </div>

      {/* Table selection */}
      <div>
        <label className="text-[10px] text-text-tertiary">FROM</label>
        <select
          value={selectedTable}
          onChange={(e) => setSelectedTable(e.target.value)}
          className="w-full rounded border border-border bg-bg-secondary/40 px-2 py-1 text-xs text-text-primary outline-none"
        >
          <option value="">Select table...</option>
          {tables.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Column selection */}
      {tableColumns.length > 0 && (
        <div>
          <label className="text-[10px] text-text-tertiary">SELECT columns</label>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {tableColumns.map((col) => (
              <button
                key={col}
                onClick={() => toggleColumn(col)}
                className={`rounded px-1.5 py-0.5 text-[10px] border ${
                  selectedColumns.includes(col)
                    ? "border-accent-green bg-accent-green/15 text-accent-green"
                    : "border-border bg-bg-secondary/20 text-text-tertiary"
                }`}
              >
                {col}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* JOIN */}
      <div className="flex gap-1">
        <div className="flex-1">
          <label className="text-[10px] text-text-tertiary">JOIN (optional)</label>
          <select
            value={joinTable}
            onChange={(e) => setJoinTable(e.target.value)}
            className="w-full rounded border border-border bg-bg-secondary/40 px-2 py-1 text-[10px] text-text-primary outline-none"
          >
            <option value="">No join</option>
            {tables.filter((t) => t !== selectedTable).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        {joinTable && (
          <div className="flex-1">
            <label className="text-[10px] text-text-tertiary">ON</label>
            <input
              type="text"
              value={joinOn}
              onChange={(e) => setJoinOn(e.target.value)}
              placeholder="t1.id = t2.id"
              className="w-full rounded border border-border bg-bg-secondary/40 px-2 py-1 text-[10px] text-text-primary outline-none"
            />
          </div>
        )}
      </div>

      {/* WHERE */}
      <div>
        <label className="text-[10px] text-text-tertiary">WHERE</label>
        <input
          type="text"
          value={whereClause}
          onChange={(e) => setWhereClause(e.target.value)}
          placeholder="e.g. age > 18 AND name LIKE '%John%'"
          className="w-full rounded border border-border bg-bg-secondary/40 px-2 py-1 text-[10px] text-text-primary outline-none"
        />
      </div>

      {/* ORDER BY + LIMIT */}
      <div className="flex gap-1">
        <div className="flex-1">
          <label className="text-[10px] text-text-tertiary">ORDER BY</label>
          <input
            type="text"
            value={orderBy}
            onChange={(e) => setOrderBy(e.target.value)}
            placeholder="e.g. name ASC"
            className="w-full rounded border border-border bg-bg-secondary/40 px-2 py-1 text-[10px] text-text-primary outline-none"
          />
        </div>
        <div className="w-16">
          <label className="text-[10px] text-text-tertiary">LIMIT</label>
          <input
            type="text"
            value={limitCount}
            onChange={(e) => setLimitCount(e.target.value)}
            className="w-full rounded border border-border bg-bg-secondary/40 px-2 py-1 text-[10px] text-text-primary outline-none"
          />
        </div>
      </div>

      <button
        onClick={generateQuery}
        disabled={!selectedTable}
        className="flex w-full items-center justify-center gap-1 rounded bg-accent-green/15 px-2 py-1.5 text-xs font-medium text-accent-green hover:bg-accent-green/25 disabled:opacity-50"
      >
        <Play size={12} /> Generate & Run
      </button>
    </div>
  );
}

// ============================================================
// PART 8 — ER Diagram Visualization (ASCII)
// ============================================================

function ERDiagram({ db, tables }: { db: SqlJsDatabase | null; tables: string[] }) {
  const [visible, setVisible] = useState(false);

  const diagram = useMemo(() => {
    if (!db || tables.length === 0) return "";
    const schemas = tables.map((t) => introspectTableSchema(db, t));
    const lines: string[] = [];

    for (const schema of schemas) {
      const boxWidth = Math.max(
        schema.name.length + 4,
        ...schema.columns.map((c) => c.name.length + c.type.length + 6),
      );
      const hLine = "+" + "-".repeat(boxWidth) + "+";

      lines.push(hLine);
      lines.push(
        "| " +
          schema.name.toUpperCase().padEnd(boxWidth - 2) +
          " |",
      );
      lines.push(hLine);

      for (const col of schema.columns) {
        const prefix = col.pk ? "PK " : "   ";
        const colStr = `${prefix}${col.name}: ${col.type}`;
        lines.push("| " + colStr.padEnd(boxWidth - 2) + " |");
      }
      lines.push(hLine);

      // Show foreign key relationships
      for (const fk of schema.foreignKeys) {
        lines.push(`  ${schema.name}.${fk.from} --> ${fk.table}.${fk.to}`);
      }

      lines.push("");
    }

    return lines.join("\n");
  }, [db, tables]);

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setVisible(!visible)}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-text-tertiary hover:text-text-primary"
      >
        {visible ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        ER Diagram
      </button>
      {visible && (
        <div className="max-h-60 overflow-auto px-2 pb-2">
          <pre className="whitespace-pre font-mono text-[9px] text-text-secondary bg-bg-secondary/30 rounded p-2">
            {diagram || "No tables available"}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PART 9 — Query Execution Plan
// ============================================================

function ExecutionPlanDisplay({ plan }: { plan: ExecutionPlanStep[] }) {
  if (plan.length === 0) return null;

  return (
    <div className="border-t border-border p-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1">
        <BarChart3 size={12} /> Execution Plan
      </div>
      <div className="space-y-0.5">
        {plan.map((step) => (
          <div key={step.id} className="flex items-start gap-1.5 text-[10px]">
            <span className="shrink-0 font-mono text-text-tertiary">
              {String(step.id).padStart(2, "0")}
            </span>
            <span className="text-text-secondary">{step.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// PART 10 — Main Panel
// ============================================================

export default function DatabasePanel({
  connections,
  onConnect,
  onExecuteQuery,
  tables = [],
}: DatabasePanelProps) {
  const [activeConn, setActiveConn] = useState<string>(connections[0]?.id ?? "");
  const [query, setQuery] = useState("SELECT * FROM ");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<QueryHistoryEntry[]>([]);
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlanStep[]>([]);
  const [showQueryBuilder, setShowQueryBuilder] = useState(false);
  const [lastTableName, setLastTableName] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // sql.js real database state
  const [sqlJsReady, setSqlJsReady] = useState(false);
  const [liveTables, setLiveTables] = useState<string[]>([]);
  const dbRef = useRef<SqlJsDatabase | null>(null);

  // Initialize sql.js on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const SQL = await loadSqlJs();
      if (cancelled || !SQL) return;
      try {
        const db = new SQL.Database();
        dbRef.current = db;
        setSqlJsReady(true);
      } catch {
        // Failed to create DB — stay in simulation mode
      }
    })();
    return () => {
      cancelled = true;
      if (dbRef.current) {
        try { dbRef.current.close(); } catch { /* ignore */ }
        dbRef.current = null;
      }
    };
  }, []);

  const refreshTables = useCallback(() => {
    if (dbRef.current) {
      setLiveTables(introspectTables(dbRef.current));
    }
  }, []);

  const effectiveTables = sqlJsReady && liveTables.length > 0 ? liveTables : tables;

  const execute = useCallback(async () => {
    if (!query.trim()) return;
    if (!sqlJsReady && !activeConn) return;
    setRunning(true);
    setExecutionPlan([]);

    try {
      let res: QueryResult;
      if (sqlJsReady && dbRef.current) {
        // Get execution plan for SELECT queries
        const trimmedQuery = query.trim().toUpperCase();
        if (trimmedQuery.startsWith("SELECT")) {
          const plan = getExecutionPlan(dbRef.current, query);
          setExecutionPlan(plan);
        }

        res = executeOnDb(dbRef.current, query);
        refreshTables();

        // Track which table was queried for inline editing
        const tableMatch = query.match(/FROM\s+["']?(\w+)["']?/i);
        setLastTableName(tableMatch ? tableMatch[1] : null);
      } else {
        res = await onExecuteQuery(activeConn, query);
        setLastTableName(null);
      }

      setResult(res);
      setHistory((h) => [
        {
          id: `q-${Date.now()}`,
          query: query.trim(),
          timestamp: Date.now(),
          success: !res.error,
          isFavorite: false,
        },
        ...h.slice(0, 99),
      ]);
    } catch (err) {
      setResult({
        columns: [],
        rows: [],
        rowCount: 0,
        executionTime: 0,
        error: String(err),
      });
    } finally {
      setRunning(false);
    }
  }, [activeConn, query, onExecuteQuery, sqlJsReady, refreshTables]);

  const toggleFavorite = useCallback((id: string) => {
    setHistory((h) =>
      h.map((entry) =>
        entry.id === id ? { ...entry, isFavorite: !entry.isFavorite } : entry,
      ),
    );
  }, []);

  const refreshResult = useCallback(() => {
    if (query.trim()) execute();
  }, [query, execute]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      execute();
    }
  };

  const handleQueryFromBuilder = useCallback((sql: string) => {
    setQuery(sql);
    // Auto-execute
    setTimeout(() => {
      setQuery(sql);
    }, 0);
  }, []);

  // Mode badge
  const MODE_BADGE = (
    <div className={`flex items-center gap-1.5 border-b border-border/30 px-3 py-1 ${sqlJsReady ? "bg-emerald-950/30" : "bg-amber-950/30"}`}>
      <Database size={12} className={sqlJsReady ? "text-emerald-400" : "text-amber-400"} />
      <span className={`text-[9px] font-medium ${sqlJsReady ? "text-emerald-300" : "text-amber-300"}`}>
        {sqlJsReady ? "sql.js SQLite (Real)" : "(Simulated)"}
      </span>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {MODE_BADGE}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-52 shrink-0 border-r border-border overflow-y-auto bg-bg-secondary/50">
          <div className="border-b border-border px-2 py-2">
            <select
              value={activeConn}
              onChange={(e) => setActiveConn(e.target.value)}
              className="w-full rounded bg-bg-secondary/40 px-2 py-1 text-xs text-text-primary border border-border outline-none"
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <SchemaBrowser
            db={dbRef.current}
            tables={effectiveTables}
            onSelect={(t) => setQuery(`SELECT * FROM "${t}" LIMIT 100;`)}
          />

          <HistoryList
            history={history}
            onSelect={setQuery}
            onToggleFavorite={toggleFavorite}
          />

          <ERDiagram db={dbRef.current} tables={effectiveTables} />
        </div>

        {/* Main area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Query editor */}
          <div className="border-b border-border p-2">
            {/* Visual query builder toggle */}
            <div className="mb-1 flex items-center justify-between">
              <button
                onClick={() => setShowQueryBuilder(!showQueryBuilder)}
                className={`flex items-center gap-1 text-[10px] ${showQueryBuilder ? "text-accent-green" : "text-text-tertiary"} hover:text-text-primary`}
              >
                <Eye size={10} />
                {showQueryBuilder ? "Hide" : "Show"} Visual Builder
              </button>
              <span className="text-[10px] text-text-tertiary">Ctrl+Enter to execute</span>
            </div>

            {showQueryBuilder && (
              <div className="mb-2">
                <VisualQueryBuilder
                  tables={effectiveTables}
                  db={dbRef.current}
                  onQueryGenerated={(sql) => {
                    setQuery(sql);
                    // Auto-run after a tick so query state updates
                    setTimeout(execute, 50);
                  }}
                />
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
              className="w-full resize-none rounded border border-border bg-bg-secondary/80 px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent-purple/50"
              placeholder="Enter SQL query... (Ctrl+Enter to execute)"
            />
            <div className="mt-1 flex items-center justify-end">
              <button
                onClick={execute}
                disabled={running}
                className="flex items-center gap-1 rounded bg-accent-green px-3 py-1 text-xs text-bg-primary hover:bg-accent-green/80 disabled:opacity-50 transition-colors"
              >
                {running ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Play size={12} />
                )}
                Execute
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-hidden">
              <ResultsTable
                result={result}
                db={dbRef.current}
                tableName={lastTableName}
                onRefresh={refreshResult}
              />
            </div>
            <ExportButtons result={result} />
            <ExecutionPlanDisplay plan={executionPlan} />
          </div>
        </div>
      </div>
    </div>
  );
}
