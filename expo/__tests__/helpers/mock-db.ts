type Row = Record<string, any>;

interface MockTable {
  rows: Row[];
}

class MockDatabase {
  tables: Record<string, MockTable> = {};
  queryLog: Array<{ text: string; values?: any[] }> = [];
  private _timeOffset = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.queryLog = [];
    this._timeOffset = 0;
    this.tables = {
      users: { rows: [] },
      user_devices: { rows: [] },
      user_addresses: { rows: [] },
      user_category_subscriptions: { rows: [] },
      service_categories: { rows: [] },
      service_requests: { rows: [] },
      service_request_files: { rows: [] },
      request_responses: { rows: [] },
      request_ignores: { rows: [] },
      reviews: { rows: [] },
      chats: { rows: [] },
      chat_participants: { rows: [] },
      chat_messages: { rows: [] },
      notifications: { rows: [] },
      push_tokens: { rows: [] },
      verification_codes: { rows: [] },
    };

    this.seedCategories();
  }

  seedCategories() {
    const categories = [
      { id: 'cat-trash', name: 'Вынос бытового мусора', slug: 'trash_takeout' },
      { id: 'cat-plumbing', name: 'Сантехник', slug: 'plumbing' },
      { id: 'cat-electric', name: 'Электрик', slug: 'electrician' },
      { id: 'cat-cleaning', name: 'Клининг', slug: 'cleaning' },
    ];
    this.tables.service_categories.rows = categories;
  }

  now(): Date {
    this._timeOffset += 1;
    return new Date(Date.now() + this._timeOffset);
  }

  insert(table: string, row: Row): Row {
    if (!row.id) row.id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!row.created_at) row.created_at = this.now().toISOString();
    this.tables[table]?.rows.push(row);
    return row;
  }

  find(table: string, predicate: (row: Row) => boolean): Row[] {
    return this.tables[table]?.rows.filter(predicate) || [];
  }

  findOne(table: string, predicate: (row: Row) => boolean): Row | undefined {
    return this.tables[table]?.rows.find(predicate);
  }

  update(table: string, predicate: (row: Row) => boolean, updates: Partial<Row>): number {
    let count = 0;
    const rows = this.tables[table]?.rows || [];
    for (const row of rows) {
      if (predicate(row)) {
        Object.assign(row, updates);
        count++;
      }
    }
    return count;
  }

  delete(table: string, predicate: (row: Row) => boolean): number {
    const t = this.tables[table];
    if (!t) return 0;
    const before = t.rows.length;
    t.rows = t.rows.filter((r) => !predicate(r));
    return before - t.rows.length;
  }
}

export const mockDb = new MockDatabase();
export type { Row };
