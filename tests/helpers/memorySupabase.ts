export type MemoryRow = Record<string, any>;
export type MemoryTables = Record<string, MemoryRow[]>;

type MemoryError = { message: string; code?: string };

export class MemoryQuery implements PromiseLike<{ data: MemoryRow[]; error: MemoryError | null }> {
  private filters: Array<(row: MemoryRow) => boolean> = [];
  private operation: "select" | "update" | "insert" | "delete" = "select";
  private patch: MemoryRow = {};
  private orderBy: { column: string; ascending: boolean } | null = null;
  private rowLimit: number | null = null;

  constructor(
    private readonly tables: MemoryTables,
    private readonly table: string,
    private readonly errors: Record<string, MemoryError> = {},
  ) {}

  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(row[column])); return this; }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }
  limit(value: number) { this.rowLimit = value; return this; }
  update(patch: MemoryRow) { this.operation = "update"; this.patch = patch; return this; }
  insert(row: MemoryRow) { this.operation = "insert"; this.patch = row; return this; }
  delete() { this.operation = "delete"; return this; }

  private matchingRows() {
    let rows = [...(this.tables[this.table] ?? [])].filter((row) => this.filters.every((filter) => filter(row)));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows.sort((left, right) => {
        const comparison = String(left[column] ?? "").localeCompare(String(right[column] ?? ""));
        return ascending ? comparison : -comparison;
      });
    }
    if (this.rowLimit !== null) rows = rows.slice(0, this.rowLimit);
    return rows;
  }

  private executeMany() {
    if (this.errors[this.table]) return { data: [] as MemoryRow[], error: this.errors[this.table] };
    if (this.operation === "insert") {
      const row = { id: `${this.table}-${(this.tables[this.table] ?? []).length + 1}`, ...this.patch };
      (this.tables[this.table] ??= []).push(row);
      return { data: [{ ...row }], error: null };
    }
    const matches = this.matchingRows();
    if (this.operation === "delete") {
      this.tables[this.table] = (this.tables[this.table] ?? []).filter((candidate) => !matches.includes(candidate));
      return { data: matches.map((row) => ({ ...row })), error: null };
    }
    if (this.operation === "update") {
      matches.forEach((row) => Object.assign(row, this.patch));
    }
    return { data: matches.map((row) => ({ ...row })), error: null };
  }

  async maybeSingle() {
    const result = this.executeMany();
    return { data: result.data[0] ?? null, error: result.error };
  }

  async single() {
    const result = this.executeMany();
    return { data: result.data[0] ?? null, error: result.error };
  }

  then<TResult1 = { data: MemoryRow[]; error: MemoryError | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: MemoryRow[]; error: MemoryError | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.executeMany()).then(onfulfilled, onrejected);
  }
}

export function memorySupabase(tables: MemoryTables, errors: Record<string, MemoryError> = {}) {
  return {
    tables,
    from(table: string) { return new MemoryQuery(tables, table, errors); },
  };
}
