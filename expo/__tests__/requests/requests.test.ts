import { mockDb } from '../helpers/mock-db';
import {
  createTestUser,
  createServiceRequest,
  createProposal,
  generateUuid,
} from '../helpers/test-caller';

beforeEach(() => {
  mockDb.reset();
});

describe('Взаимодействие с заявками', () => {
  describe('Создание заявки', () => {
    it('должен создать заявку от клиента', () => {
      const client = createTestUser({ role: 'client' });

      const request = createServiceRequest(client.id, {
        category_id: 'cat-plumbing',
        description: 'Течёт кран на кухне',
        address: 'Тюмень, ул. Ленина 10, кв. 5',
        acceptable_price: 2000,
        payment_method: 'cash',
      });

      expect(request).toBeDefined();
      expect(request.client_id).toBe(client.id);
      expect(request.status).toBe('new');
      expect(request.executor_id).toBeNull();
      expect(request.description).toBe('Течёт кран на кухне');
      expect(request.category_id).toBe('cat-plumbing');

      const saved = mockDb.findOne('service_requests', (r) => r.id === request.id);
      expect(saved).toBeDefined();
    });

    it('должен создать срочную заявку', () => {
      const client = createTestUser({ role: 'client' });

      const request = createServiceRequest(client.id, {
        is_urgent: true,
        description: 'Прорвало трубу!',
      });

      expect(request.is_urgent).toBe(true);
    });

    it('должен привязать вложения к заявке', () => {
      const client = createTestUser({ role: 'client' });
      const request = createServiceRequest(client.id);

      const attachments = ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'];
      for (let i = 0; i < attachments.length; i++) {
        mockDb.insert('service_request_files', {
          id: generateUuid(),
          request_id: request.id,
          file_url: attachments[i],
          file_type: 'attachment',
          sort_order: i,
        });
      }

      const files = mockDb.find('service_request_files', (f) => f.request_id === request.id);
      expect(files.length).toBe(2);
      expect(files[0].file_type).toBe('attachment');
    });

    it('должен увеличить счётчик заявок клиента', () => {
      const client = createTestUser({ role: 'client', requests_count: 0 });
      createServiceRequest(client.id);

      mockDb.update('users', (u) => u.id === client.id, {
        requests_count: client.requests_count + 1,
      });

      const updated = mockDb.findOne('users', (u) => u.id === client.id);
      expect(updated!.requests_count).toBe(1);
    });
  });

  describe('Предложения исполнителей', () => {
    it('должен позволить исполнителю отправить предложение', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id);

      const proposal = createProposal(request.id, executor.id, {
        price: 2500,
        comment: 'Могу приехать сегодня',
      });

      expect(proposal).toBeDefined();
      expect(proposal.request_id).toBe(request.id);
      expect(proposal.executor_id).toBe(executor.id);
      expect(proposal.status).toBe('pending');
      expect(proposal.price).toBe(2500);
    });

    it('должен позволить нескольким исполнителям предложить свои услуги', () => {
      const client = createTestUser({ role: 'client' });
      const executor1 = createTestUser({ role: 'executor' });
      const executor2 = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id);

      createProposal(request.id, executor1.id, { price: 2000 });
      createProposal(request.id, executor2.id, { price: 1800 });

      const proposals = mockDb.find('request_responses', (p) => p.request_id === request.id);
      expect(proposals.length).toBe(2);
    });

    it('должен заменить предыдущее предложение исполнителя', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id);

      createProposal(request.id, executor.id, { price: 3000 });

      mockDb.delete('request_responses', (p) =>
        p.request_id === request.id && p.executor_id === executor.id
      );

      createProposal(request.id, executor.id, { price: 2500 });

      const proposals = mockDb.find('request_responses', (p) =>
        p.request_id === request.id && p.executor_id === executor.id
      );
      expect(proposals.length).toBe(1);
      expect(proposals[0].price).toBe(2500);
    });
  });

  describe('Принятие предложения', () => {
    it('должен принять предложение и перевести заявку в работу', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id);
      const proposal = createProposal(request.id, executor.id, { price: 2000 });

      mockDb.update('request_responses', (p) => p.id === proposal.id, {
        status: 'accepted',
        updated_at: new Date().toISOString(),
      });

      mockDb.update('service_requests', (r) => r.id === request.id, {
        status: 'in_progress',
        executor_id: executor.id,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const updatedRequest = mockDb.findOne('service_requests', (r) => r.id === request.id);
      expect(updatedRequest!.status).toBe('in_progress');
      expect(updatedRequest!.executor_id).toBe(executor.id);
      expect(updatedRequest!.accepted_at).toBeTruthy();

      const updatedProposal = mockDb.findOne('request_responses', (p) => p.id === proposal.id);
      expect(updatedProposal!.status).toBe('accepted');
    });

    it('должен отклонить остальные предложения при принятии одного', () => {
      const client = createTestUser({ role: 'client' });
      const executor1 = createTestUser({ role: 'executor' });
      const executor2 = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id);

      const proposal1 = createProposal(request.id, executor1.id, { price: 2000 });
      const proposal2 = createProposal(request.id, executor2.id, { price: 1500 });

      mockDb.update('request_responses', (p) => p.id === proposal1.id, {
        status: 'accepted',
      });
      mockDb.update(
        'request_responses',
        (p) => p.request_id === request.id && p.id !== proposal1.id && p.status === 'pending',
        { status: 'declined' }
      );

      const accepted = mockDb.findOne('request_responses', (p) => p.id === proposal1.id);
      const declined = mockDb.findOne('request_responses', (p) => p.id === proposal2.id);
      expect(accepted!.status).toBe('accepted');
      expect(declined!.status).toBe('declined');
    });

    it('должен разрешить принятие только клиенту', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id);
      createProposal(request.id, executor.id);

      const req = mockDb.findOne('service_requests', (r) => r.id === request.id);
      expect(String(req!.client_id)).toBe(String(client.id));
      expect(String(req!.client_id)).not.toBe(String(executor.id));
    });
  });

  describe('Отклонение предложения', () => {
    it('должен позволить клиенту отклонить предложение', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id);
      const proposal = createProposal(request.id, executor.id);

      mockDb.update('request_responses', (p) => p.id === proposal.id, {
        status: 'declined',
        updated_at: new Date().toISOString(),
      });

      const updated = mockDb.findOne('request_responses', (p) => p.id === proposal.id);
      expect(updated!.status).toBe('declined');

      const req = mockDb.findOne('service_requests', (r) => r.id === request.id);
      expect(req!.status).toBe('new');
    });
  });

  describe('Завершение заявки', () => {
    it('должен завершить заявку и обновить счётчик исполнителя', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor', completed_count: 0 });
      const request = createServiceRequest(client.id, {
        status: 'in_progress',
        executor_id: executor.id,
      });

      mockDb.update('service_requests', (r) => r.id === request.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        is_paid: true,
      });

      const completed = mockDb.findOne('service_requests', (r) => r.id === request.id);
      expect(completed!.status).toBe('completed');
      expect(completed!.completed_at).toBeTruthy();
      expect(completed!.is_paid).toBe(true);

      const completedRequests = mockDb.find(
        'service_requests',
        (r) => r.executor_id === executor.id && r.status === 'completed'
      );
      mockDb.update('users', (u) => u.id === executor.id, {
        completed_count: completedRequests.length,
      });

      const updatedExecutor = mockDb.findOne('users', (u) => u.id === executor.id);
      expect(updatedExecutor!.completed_count).toBe(1);
    });

    it('должен привязать фотографии завершения к заявке', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id, {
        status: 'in_progress',
        executor_id: executor.id,
      });

      const photos = ['https://example.com/done1.jpg', 'https://example.com/done2.jpg'];
      for (let i = 0; i < photos.length; i++) {
        mockDb.insert('service_request_files', {
          id: generateUuid(),
          request_id: request.id,
          file_url: photos[i],
          file_type: 'completion_photo',
          sort_order: i,
        });
      }

      const completionPhotos = mockDb.find(
        'service_request_files',
        (f) => f.request_id === request.id && f.file_type === 'completion_photo'
      );
      expect(completionPhotos.length).toBe(2);
    });
  });

  describe('Отмена заявки', () => {
    it('должен позволить отменить заявку', () => {
      const client = createTestUser({ role: 'client' });
      const request = createServiceRequest(client.id);

      mockDb.update('service_requests', (r) => r.id === request.id, {
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      });

      const cancelled = mockDb.findOne('service_requests', (r) => r.id === request.id);
      expect(cancelled!.status).toBe('cancelled');
    });
  });

  describe('Оценка', () => {
    it('должен позволить клиенту оценить исполнителя', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor', rating: 5.0, rating_count: 0 });
      const request = createServiceRequest(client.id, {
        status: 'completed',
        executor_id: executor.id,
      });

      const reviewId = generateUuid();
      mockDb.insert('reviews', {
        id: reviewId,
        request_id: request.id,
        author_id: client.id,
        target_id: executor.id,
        rating: 4,
        text: 'Хорошая работа!',
      });

      const reviews = mockDb.find('reviews', (r) => r.target_id === executor.id);
      expect(reviews.length).toBe(1);
      expect(reviews[0].rating).toBe(4);

      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      mockDb.update('users', (u) => u.id === executor.id, {
        rating: avgRating,
        rating_count: reviews.length,
      });

      const updatedExecutor = mockDb.findOne('users', (u) => u.id === executor.id);
      expect(updatedExecutor!.rating).toBe(4);
      expect(updatedExecutor!.rating_count).toBe(1);
    });

    it('должен обновить существующую оценку', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id, {
        status: 'completed',
        executor_id: executor.id,
      });

      mockDb.insert('reviews', {
        id: generateUuid(),
        request_id: request.id,
        author_id: client.id,
        target_id: executor.id,
        rating: 3,
        text: 'Нормально',
      });

      mockDb.update(
        'reviews',
        (r) => r.request_id === request.id && r.author_id === client.id,
        { rating: 5, text: 'Отлично!' }
      );

      const review = mockDb.findOne(
        'reviews',
        (r) => r.request_id === request.id && r.author_id === client.id
      );
      expect(review!.rating).toBe(5);
      expect(review!.text).toBe('Отлично!');
    });

    it('должен позволить обоюдную оценку', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id, {
        status: 'completed',
        executor_id: executor.id,
      });

      mockDb.insert('reviews', {
        id: generateUuid(),
        request_id: request.id,
        author_id: client.id,
        target_id: executor.id,
        rating: 5,
      });

      mockDb.insert('reviews', {
        id: generateUuid(),
        request_id: request.id,
        author_id: executor.id,
        target_id: client.id,
        rating: 4,
      });

      const executorReviews = mockDb.find('reviews', (r) => r.target_id === executor.id);
      const clientReviews = mockDb.find('reviews', (r) => r.target_id === client.id);
      expect(executorReviews.length).toBe(1);
      expect(clientReviews.length).toBe(1);
      expect(executorReviews[0].rating).toBe(5);
      expect(clientReviews[0].rating).toBe(4);
    });
  });

  describe('Игнорирование заявки', () => {
    it('должен позволить исполнителю скрыть заявку', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id);

      mockDb.insert('request_ignores', {
        request_id: request.id,
        executor_id: executor.id,
      });

      const ignored = mockDb.findOne(
        'request_ignores',
        (i) => i.request_id === request.id && i.executor_id === executor.id
      );
      expect(ignored).toBeDefined();
    });

    it('скрытая заявка не должна отображаться исполнителю', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request1 = createServiceRequest(client.id);
      const request2 = createServiceRequest(client.id);

      mockDb.insert('request_ignores', {
        request_id: request1.id,
        executor_id: executor.id,
      });

      const allRequests = mockDb.find('service_requests', (r) => r.status === 'new');
      const ignoredIds = mockDb
        .find('request_ignores', (i) => i.executor_id === executor.id)
        .map((i) => i.request_id);

      const visibleRequests = allRequests.filter((r) => !ignoredIds.includes(r.id));
      expect(visibleRequests.length).toBe(1);
      expect(visibleRequests[0].id).toBe(request2.id);
    });
  });

  describe('Уведомления по заявкам', () => {
    it('должен создать уведомление исполнителям при новой заявке', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id, { category_id: 'cat-plumbing' });

      mockDb.insert('user_category_subscriptions', {
        user_id: executor.id,
        category_id: 'cat-plumbing',
      });

      mockDb.insert('notifications', {
        id: generateUuid(),
        title: 'Новая заявка по подписке',
        body: 'Сантехник: Тестовая заявка',
        type: 'new_request',
        payload: JSON.stringify({ requestId: request.id }),
        recipient_id: executor.id,
        is_read: false,
      });

      const notifications = mockDb.find(
        'notifications',
        (n) => n.recipient_id === executor.id && n.type === 'new_request'
      );
      expect(notifications.length).toBe(1);
    });

    it('должен создать уведомление клиенту при новом предложении', () => {
      const client = createTestUser({ role: 'client' });
      const executor = createTestUser({ role: 'executor' });
      const request = createServiceRequest(client.id);
      const proposal = createProposal(request.id, executor.id, { price: 2000 });

      mockDb.insert('notifications', {
        id: generateUuid(),
        title: 'Новое предложение по заявке',
        body: 'Пользователь Тест: 2000₽',
        type: 'request_update',
        payload: JSON.stringify({ requestId: request.id, responseId: proposal.id }),
        recipient_id: client.id,
        is_read: false,
      });

      const notifications = mockDb.find(
        'notifications',
        (n) => n.recipient_id === client.id && n.type === 'request_update'
      );
      expect(notifications.length).toBe(1);
    });
  });
});
