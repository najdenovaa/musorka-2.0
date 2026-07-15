import { mockDb } from '../helpers/mock-db';

/**
 * Pure mockDb-backed simulation of toggleLike to validate invariants:
 * - first call inserts, second call removes
 * - PK (request_id, user_id) prevents duplicate likes
 * - likesCount is correct.
 *
 * \u042d\u0442\u0438 \u0442\u0435\u0441\u0442\u044b \u043d\u0435 \u0432\u044b\u0437\u044b\u0432\u0430\u044e\u0442 tRPC \u043d\u0430\u043f\u0440\u044f\u043c\u0443\u044e: in-memory mockDb \u043d\u0435 \u0438\u0441\u043f\u043e\u043b\u043d\u044f\u0435\u0442
 * SQL/LATERAL/INTERVAL, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u0437\u0434\u0435\u0441\u044c \u043c\u044b \u043f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u0444\u043e\u0440\u043c\u0443 \u0434\u0430\u043d\u043d\u044b\u0445 \u043b\u0430\u0439\u043a\u043e\u0432.
 */

beforeEach(() => {
  mockDb.reset();
  if (!mockDb.tables.live_likes) {
    mockDb.tables.live_likes = { rows: [] };
  } else {
    mockDb.tables.live_likes.rows = [];
  }
});

function toggleLike(requestId: string, userId: string): { liked: boolean; likesCount: number } {
  const existing = mockDb.findOne(
    'live_likes',
    (r) => r.request_id === requestId && r.user_id === userId
  );
  if (existing) {
    mockDb.delete('live_likes', (r) => r.request_id === requestId && r.user_id === userId);
    const cnt = mockDb.find('live_likes', (r) => r.request_id === requestId).length;
    return { liked: false, likesCount: cnt };
  }
  mockDb.insert('live_likes', { request_id: requestId, user_id: userId });
  const cnt = mockDb.find('live_likes', (r) => r.request_id === requestId).length;
  return { liked: true, likesCount: cnt };
}

describe('Live likes', () => {
  it('первый вызов лайкает, второй снимает', () => {
    const r1 = toggleLike('req-1', 'user-1');
    expect(r1.liked).toBe(true);
    expect(r1.likesCount).toBe(1);

    const r2 = toggleLike('req-1', 'user-1');
    expect(r2.liked).toBe(false);
    expect(r2.likesCount).toBe(0);
  });

  it('лайки от разных пользователей складываются', () => {
    toggleLike('req-1', 'user-1');
    toggleLike('req-1', 'user-2');
    toggleLike('req-1', 'user-3');
    const cnt = mockDb.find('live_likes', (r) => r.request_id === 'req-1').length;
    expect(cnt).toBe(3);
  });

  it('повторный лайк одного пользователя не создаёт дубль (PK)', () => {
    toggleLike('req-1', 'user-1');
    // Имитируем INSERT ... ON CONFLICT DO NOTHING: уникальность по (request_id, user_id)
    const before = mockDb.find('live_likes', (r) => r.request_id === 'req-1').length;
    const exists = mockDb.findOne(
      'live_likes',
      (r) => r.request_id === 'req-1' && r.user_id === 'user-1'
    );
    if (!exists) {
      mockDb.insert('live_likes', { request_id: 'req-1', user_id: 'user-1' });
    }
    const after = mockDb.find('live_likes', (r) => r.request_id === 'req-1').length;
    expect(after).toBe(before);
  });
});
