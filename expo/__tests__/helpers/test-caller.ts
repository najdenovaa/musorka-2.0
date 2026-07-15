import { mockDb, Row } from './mock-db';
import { hashPassword, verifyPassword, generateDeviceKey, generateUuid } from '@/backend/db/helpers';

export interface TestUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string;
  email: string;
  password_hash: string;
  role: 'client' | 'executor' | 'admin' | 'support';
  city: string;
  rating: number;
  rating_count: number;
  requests_count: number;
  completed_count: number;
  avatar_url: string | null;
  is_blocked: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  const id = overrides.id || generateUuid();
  const user: TestUser = {
    id,
    first_name: 'Тест',
    last_name: 'Пользователь',
    phone: `+7900${Math.floor(1000000 + Math.random() * 9000000)}`,
    email: `test${Date.now()}@test.com`,
    password_hash: hashPassword('password123'),
    role: 'client',
    city: 'Тюмень',
    rating: 5.0,
    rating_count: 0,
    requests_count: 0,
    completed_count: 0,
    avatar_url: null,
    is_blocked: false,
    email_verified: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };

  mockDb.insert('users', { ...user });

  const deviceKey = generateDeviceKey();
  mockDb.insert('user_devices', {
    id: generateUuid(),
    user_id: user.id,
    device_key: deviceKey,
    device_name: 'Test device',
    platform: 'app',
    is_revoked: false,
  });

  return user;
}

export function createVerifiedEmail(email: string, type: string = 'registration'): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  mockDb.insert('verification_codes', {
    id: generateUuid(),
    email: email.toLowerCase(),
    code,
    type,
    attempts: 0,
    used: true,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  });
  return code;
}

export function createPendingVerificationCode(email: string, type: string = 'registration'): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  mockDb.insert('verification_codes', {
    id: generateUuid(),
    email: email.toLowerCase(),
    code,
    type,
    attempts: 0,
    used: false,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  });
  return code;
}

export function createServiceRequest(clientId: string, overrides: Partial<Row> = {}): Row {
  const reqId = generateUuid();
  const request: Row = {
    id: reqId,
    category_id: 'cat-trash',
    client_id: clientId,
    executor_id: null,
    description: 'Тестовая заявка',
    address: 'Тюмень, ул. Тестовая 1',
    acceptable_price: null,
    payment_method: null,
    latitude: null,
    longitude: null,
    scheduled_at: null,
    status: 'new',
    is_urgent: false,
    is_paid: true,
    accepted_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  mockDb.insert('service_requests', request);
  return request;
}

export function createProposal(requestId: string, executorId: string, overrides: Partial<Row> = {}): Row {
  const proposal: Row = {
    id: generateUuid(),
    request_id: requestId,
    executor_id: executorId,
    price: 1500,
    scheduled_at: null,
    comment: null,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  mockDb.insert('request_responses', proposal);
  return proposal;
}

export function createChat(type: 'request' | 'support', participantIds: string[], requestId?: string): Row {
  const chatId = generateUuid();
  const chat: Row = {
    id: chatId,
    type,
    request_id: requestId || null,
    last_message_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  mockDb.insert('chats', chat);

  for (const uid of participantIds) {
    mockDb.insert('chat_participants', {
      id: generateUuid(),
      chat_id: chatId,
      user_id: uid,
      unread_count: 0,
    });
  }

  return chat;
}

export function sendTestMessage(chatId: string, senderId: string, text: string): Row {
  const now = mockDb.now();
  const msg: Row = {
    id: generateUuid(),
    chat_id: chatId,
    sender_id: senderId,
    text,
    is_read: false,
    created_at: now.toISOString(),
  };
  mockDb.insert('chat_messages', msg);

  mockDb.update('chats', (c) => c.id === chatId, { last_message_at: now.toISOString() });

  const participants = mockDb.find('chat_participants', (p) => p.chat_id === chatId && p.user_id !== senderId);
  for (const p of participants) {
    p.unread_count = (p.unread_count || 0) + 1;
  }

  return msg;
}

export { hashPassword, verifyPassword, generateDeviceKey, generateUuid };
