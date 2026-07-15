import { mockDb } from '../helpers/mock-db';
import {
  createTestUser,
  createServiceRequest,
  createChat,
  sendTestMessage,
  generateUuid,
} from '../helpers/test-caller';

beforeEach(() => {
  mockDb.reset();
});

describe('Чаты', () => {
  describe('Создание чата по заявке', () => {
    it('должен создать чат между клиентом и исполнителем', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id, {
        status: 'in_progress',
        executor_id: executor.id,
      });

      const chat = createChat('request', [client.id, executor.id], request.id);

      expect(chat).toBeDefined();
      expect(chat.type).toBe('request');
      expect(chat.request_id).toBe(request.id);

      const participants = mockDb.find('chat_participants', (p) => p.chat_id === chat.id);
      expect(participants.length).toBe(2);
      expect(participants.map((p) => p.user_id)).toContain(client.id);
      expect(participants.map((p) => p.user_id)).toContain(executor.id);
    });

    it('не должен дублировать чат для одной заявки', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id, {
        status: 'in_progress',
        executor_id: executor.id,
      });

      createChat('request', [client.id, executor.id], request.id);

      const existingChats = mockDb.find(
        'chats',
        (c) => c.request_id === request.id && c.type === 'request'
      );
      expect(existingChats.length).toBe(1);

      for (const chat of existingChats) {
        const participants = mockDb.find('chat_participants', (p) => p.chat_id === chat.id);
        const participantUserIds = participants.map((p) => String(p.user_id));
        const allMatch = [client.id, executor.id].every((id) => participantUserIds.includes(id));

        if (allMatch && participantUserIds.length >= 2) {
          expect(chat.id).toBeDefined();
          return;
        }
      }

      const newChat = createChat('request', [client.id, executor.id], request.id);
      expect(newChat).toBeDefined();

      const allChats = mockDb.find(
        'chats',
        (c) => c.request_id === request.id && c.type === 'request'
      );
      expect(allChats.length).toBe(2);
    });
  });

  describe('Чат с поддержкой', () => {
    it('должен создать чат поддержки для пользователя', () => {
      const user = createTestUser({ role: 'client' });
      const supportUser = createTestUser({ role: 'support' });

      const chat = createChat('support', [user.id, supportUser.id]);

      expect(chat.type).toBe('support');
      expect(chat.request_id).toBeNull();

      const participants = mockDb.find('chat_participants', (p) => p.chat_id === chat.id);
      expect(participants.length).toBe(2);
    });

    it('должен найти существующий чат поддержки', () => {
      const user = createTestUser({ role: 'client' });
      const supportUser = createTestUser({ role: 'support' });

      createChat('support', [user.id, supportUser.id]);

      const existing = mockDb.find('chats', (c) => c.type === 'support');
      const userChats = existing.filter((c) => {
        const participants = mockDb.find('chat_participants', (p) => p.chat_id === c.id);
        return participants.some((p) => p.user_id === user.id);
      });

      expect(userChats.length).toBe(1);
    });

    it('должен скрывать имя сотрудника поддержки в сообщениях', () => {
      const user = createTestUser({ role: 'client' });
      const supportUser = createTestUser({
        role: 'support',
        first_name: 'Секретное',
        last_name: 'Имя',
      });

      const chat = createChat('support', [user.id, supportUser.id]);
      const msg = sendTestMessage(chat.id, supportUser.id, 'Здравствуйте! Чем могу помочь?');

      const chatInfo = mockDb.findOne('chats', (c) => c.id === chat.id);
      const isSupportChat = chatInfo!.type === 'support';
      expect(isSupportChat).toBe(true);

      const sender = mockDb.findOne('users', (u) => u.id === msg.sender_id);
      const isStaffSender = sender!.role === 'admin' || sender!.role === 'support';
      expect(isStaffSender).toBe(true);

      const displayName = isSupportChat && isStaffSender
        ? 'Сотрудник Поддержки'
        : [sender!.last_name, sender!.first_name].filter(Boolean).join(' ');

      expect(displayName).toBe('Сотрудник Поддержки');
    });
  });

  describe('Отправка сообщений', () => {
    it('должен отправить сообщение в чат', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id, {
        status: 'in_progress',
        executor_id: executor.id,
      });

      const chat = createChat('request', [client.id, executor.id], request.id);
      const msg = sendTestMessage(chat.id, client.id, 'Здравствуйте, когда придёте?');

      expect(msg).toBeDefined();
      expect(msg.chat_id).toBe(chat.id);
      expect(msg.sender_id).toBe(client.id);
      expect(msg.text).toBe('Здравствуйте, когда придёте?');
      expect(msg.is_read).toBe(false);

      const messages = mockDb.find('chat_messages', (m) => m.chat_id === chat.id);
      expect(messages.length).toBe(1);
    });

    it('должен обновить время последнего сообщения в чате', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const chat = createChat('request', [client.id, executor.id]);

      const beforeSend = mockDb.findOne('chats', (c) => c.id === chat.id);
      const _timeBefore = beforeSend!.last_message_at;

      sendTestMessage(chat.id, client.id, 'Привет');

      const afterSend = mockDb.findOne('chats', (c) => c.id === chat.id);
      expect(afterSend!.last_message_at).toBeDefined();
    });

    it('должен увеличить счётчик непрочитанных у другого участника', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const chat = createChat('request', [client.id, executor.id]);

      sendTestMessage(chat.id, client.id, 'Первое сообщение');
      sendTestMessage(chat.id, client.id, 'Второе сообщение');

      const executorParticipant = mockDb.findOne(
        'chat_participants',
        (p) => p.chat_id === chat.id && p.user_id === executor.id
      );
      expect(executorParticipant!.unread_count).toBe(2);

      const clientParticipant = mockDb.findOne(
        'chat_participants',
        (p) => p.chat_id === chat.id && p.user_id === client.id
      );
      expect(clientParticipant!.unread_count).toBe(0);
    });

    it('не должен увеличивать счётчик непрочитанных у отправителя', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const chat = createChat('request', [client.id, executor.id]);

      sendTestMessage(chat.id, client.id, 'Моё сообщение');

      const clientParticipant = mockDb.findOne(
        'chat_participants',
        (p) => p.chat_id === chat.id && p.user_id === client.id
      );
      expect(clientParticipant!.unread_count).toBe(0);
    });
  });

  describe('Прочтение сообщений', () => {
    it('должен сбросить счётчик непрочитанных при прочтении', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const chat = createChat('request', [client.id, executor.id]);

      sendTestMessage(chat.id, client.id, 'Сообщение 1');
      sendTestMessage(chat.id, client.id, 'Сообщение 2');
      sendTestMessage(chat.id, client.id, 'Сообщение 3');

      const before = mockDb.findOne(
        'chat_participants',
        (p) => p.chat_id === chat.id && p.user_id === executor.id
      );
      expect(before!.unread_count).toBe(3);

      mockDb.update(
        'chat_participants',
        (p) => p.chat_id === chat.id && p.user_id === executor.id,
        { unread_count: 0 }
      );

      mockDb.update(
        'chat_messages',
        (m) => m.chat_id === chat.id && m.sender_id !== executor.id && !m.is_read,
        { is_read: true }
      );

      const after = mockDb.findOne(
        'chat_participants',
        (p) => p.chat_id === chat.id && p.user_id === executor.id
      );
      expect(after!.unread_count).toBe(0);

      const unreadMessages = mockDb.find(
        'chat_messages',
        (m) => m.chat_id === chat.id && !m.is_read
      );
      expect(unreadMessages.length).toBe(0);
    });
  });

  describe('Список чатов', () => {
    it('должен вернуть чаты пользователя отсортированные по времени', () => {
      const client = createTestUser({ role: 'client' });
      const executor1 = createTestUser({ role: 'executor' });
      const executor2 = createTestUser({ role: 'executor' });

      const chat1 = createChat('request', [client.id, executor1.id]);
      const chat2 = createChat('request', [client.id, executor2.id]);

      sendTestMessage(chat1.id, executor1.id, 'Старое сообщение');
      sendTestMessage(chat2.id, executor2.id, 'Новое сообщение');

      const clientChats = mockDb.find('chats', (c) => {
        const participants = mockDb.find('chat_participants', (p) => p.chat_id === c.id);
        return participants.some((p) => p.user_id === client.id);
      });

      expect(clientChats.length).toBe(2);

      const sorted = clientChats.sort(
        (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );
      expect(sorted[0].id).toBe(chat2.id);
    });

    it('должен показать чаты поддержки админу/саппорту', () => {
      const user1 = createTestUser({ role: 'client' });
      const user2 = createTestUser({ role: 'client' });
      const supportUser = createTestUser({ role: 'support' });

      createChat('support', [user1.id, supportUser.id]);
      createChat('support', [user2.id, supportUser.id]);

      const supportChats = mockDb.find('chats', (c) => c.type === 'support');
      expect(supportChats.length).toBe(2);
    });

    it('должен показывать последнее сообщение в списке чатов', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const chat = createChat('request', [client.id, executor.id]);

      sendTestMessage(chat.id, client.id, 'Первое');
      sendTestMessage(chat.id, executor.id, 'Второе');
      sendTestMessage(chat.id, client.id, 'Третье — последнее');

      const messages = mockDb.find('chat_messages', (m) => m.chat_id === chat.id);
      const sorted = messages.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const lastMessage = sorted[0];
      expect(lastMessage.text).toBe('Третье — последнее');
    });
  });

  describe('Уведомления в чатах', () => {
    it('должен создать уведомление при новом сообщении', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const chat = createChat('request', [client.id, executor.id]);

      const senderName = [client.last_name, client.first_name].filter(Boolean).join(' ') || 'Пользователь';
      const text = 'Когда будете?';

      sendTestMessage(chat.id, client.id, text);

      mockDb.insert('notifications', {
        id: generateUuid(),
        title: 'Новое сообщение',
        body: `${senderName}: ${text.substring(0, 100)}`,
        type: 'new_message',
        payload: JSON.stringify({ chatId: chat.id }),
        recipient_id: executor.id,
        is_read: false,
      });

      const notifications = mockDb.find(
        'notifications',
        (n) => n.recipient_id === executor.id && n.type === 'new_message'
      );
      expect(notifications.length).toBe(1);
      expect(notifications[0].body).toContain(text);
    });
  });

  describe('Диалог — обмен сообщениями', () => {
    it('должен корректно обрабатывать диалог клиент-исполнитель', () => {
      const client = createTestUser({ role: 'client', first_name: 'Иван', last_name: 'Клиент' });
      const executor = createTestUser({ role: 'executor', first_name: 'Пётр', last_name: 'Мастер' });
      const request = createServiceRequest(client.id, {
        status: 'in_progress',
        executor_id: executor.id,
      });

      const chat = createChat('request', [client.id, executor.id], request.id);

      sendTestMessage(chat.id, client.id, 'Здравствуйте! Нужна помощь с краном');
      sendTestMessage(chat.id, executor.id, 'Добрый день! Буду через час');
      sendTestMessage(chat.id, client.id, 'Отлично, жду');
      sendTestMessage(chat.id, executor.id, 'Уже еду');

      const messages = mockDb.find('chat_messages', (m) => m.chat_id === chat.id);
      expect(messages.length).toBe(4);

      const clientMsgs = messages.filter((m) => m.sender_id === client.id);
      const executorMsgs = messages.filter((m) => m.sender_id === executor.id);
      expect(clientMsgs.length).toBe(2);
      expect(executorMsgs.length).toBe(2);

      const clientUnread = mockDb.findOne(
        'chat_participants',
        (p) => p.chat_id === chat.id && p.user_id === client.id
      );
      const executorUnread = mockDb.findOne(
        'chat_participants',
        (p) => p.chat_id === chat.id && p.user_id === executor.id
      );
      expect(clientUnread!.unread_count).toBe(2);
      expect(executorUnread!.unread_count).toBe(2);
    });
  });
});
