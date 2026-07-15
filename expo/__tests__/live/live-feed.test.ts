import { parseCursor, formatCursor, mapRow } from '@/backend/trpc/routes/live';

describe('Live feed helpers', () => {
  describe('parseCursor', () => {
    it('returns null on empty/missing input', () => {
      expect(parseCursor(undefined)).toBeNull();
      expect(parseCursor(null)).toBeNull();
      expect(parseCursor('')).toBeNull();
    });

    it('returns null on malformed strings', () => {
      expect(parseCursor('not-a-cursor')).toBeNull();
      expect(parseCursor('|abc')).toBeNull();
      expect(parseCursor('2026-01-01T00:00:00.000Z|')).toBeNull();
      expect(parseCursor('2026-01-01T00:00:00.000Z|not-a-uuid')).toBeNull();
      expect(parseCursor('garbage|11111111-1111-1111-1111-111111111111')).toBeNull();
    });

    it('parses well-formed cursor', () => {
      const id = '11111111-2222-3333-4444-555555555555';
      const iso = '2026-05-01T12:00:00.000Z';
      const parsed = parseCursor(`${iso}|${id}`);
      expect(parsed).not.toBeNull();
      expect(parsed!.id).toBe(id);
      expect(parsed!.ts.toISOString()).toBe(iso);
    });
  });

  describe('formatCursor', () => {
    it('round-trips through parseCursor', () => {
      const id = '11111111-2222-3333-4444-555555555555';
      const ts = new Date('2026-05-01T12:00:00.000Z');
      const cur = formatCursor(ts, id);
      const parsed = parseCursor(cur);
      expect(parsed!.id).toBe(id);
      expect(parsed!.ts.toISOString()).toBe(ts.toISOString());
    });
  });

  describe('mapRow', () => {
    const baseRow = {
      id: 'req-1',
      category_name: 'Сантехник',
      city: 'Тюмень',
      created_at: '2026-05-01T10:00:00.000Z',
      completed_at: '2026-05-02T10:00:00.000Z',
      before_urls: [
        'https://cdn.example.com/a.jpg',
        'https://cdn.example.com/b.jpg',
        'https://cdn.example.com/c.jpg',
        'https://cdn.example.com/d.jpg',
      ],
      after_urls: ['https://cdn.example.com/done.jpg'],
      executor_id: 'exec-1',
      executor_first_name: 'Иван',
      executor_last_name: 'Петров',
      executor_avatar_url: 'https://cdn.example.com/avatar.jpg',
      executor_rating: 4.7,
      executor_completed_count: 12,
      likes_count: 5,
      liked_by_me: true,
    };

    it('caps photo arrays at 3 items', () => {
      const item = mapRow(baseRow);
      expect(item.beforePhotos).toHaveLength(3);
      expect(item.afterPhotos).toHaveLength(1);
    });

    it('drops unsafe URIs', () => {
      const item = mapRow({
        ...baseRow,
        before_urls: ['https://ok.com/x.jpg', 'javascript:alert(1)', '   '],
        after_urls: null,
      });
      expect(item.beforePhotos).toEqual(['https://ok.com/x.jpg']);
      expect(item.afterPhotos).toEqual([]);
    });

    it('builds executor DTO with full name', () => {
      const item = mapRow(baseRow);
      expect(item.executor).not.toBeNull();
      expect(item.executor!.id).toBe('exec-1');
      expect(item.executor!.name).toBe('Иван Петров');
      expect(item.executor!.rating).toBeCloseTo(4.7, 1);
      expect(item.executor!.completedCount).toBe(12);
    });

    it('sets executor=null when no executor_id', () => {
      const item = mapRow({ ...baseRow, executor_id: null });
      expect(item.executor).toBeNull();
    });

    it('reflects likedByMe and likesCount', () => {
      const item = mapRow(baseRow);
      expect(item.likedByMe).toBe(true);
      expect(item.likesCount).toBe(5);
      const item2 = mapRow({ ...baseRow, liked_by_me: false, likes_count: 0 });
      expect(item2.likedByMe).toBe(false);
      expect(item2.likesCount).toBe(0);
    });
  });
});
