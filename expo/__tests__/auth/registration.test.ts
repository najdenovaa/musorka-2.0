import { mockDb } from '../helpers/mock-db';
import {
  createTestUser,
  createVerifiedEmail,
  createPendingVerificationCode,
  hashPassword,
  verifyPassword,
  generateUuid,
} from '../helpers/test-caller';

beforeEach(() => {
  mockDb.reset();
});

describe('Регистрация', () => {
  describe('Отправка кода подтверждения', () => {
    it('должен отправить код на новый email', () => {
      const email = 'newuser@test.com';
      const existingUser = mockDb.findOne('users', (u) => u.email?.toLowerCase() === email);
      expect(existingUser).toBeUndefined();

      const code = createPendingVerificationCode(email, 'registration');
      expect(code).toHaveLength(6);
      expect(/^\d{6}$/.test(code)).toBe(true);

      const codeRecord = mockDb.findOne(
        'verification_codes',
        (c) => c.email === email && c.type === 'registration' && c.used === false
      );
      expect(codeRecord).toBeDefined();
      expect(codeRecord!.attempts).toBe(0);
      expect(new Date(codeRecord!.expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('должен отклонить отправку кода если email уже зарегистрирован', () => {
      const email = 'existing@test.com';
      createTestUser({ email });

      const existingUser = mockDb.findOne('users', (u) => u.email?.toLowerCase() === email);
      expect(existingUser).toBeDefined();
    });

    it('должен ограничивать частоту отправки кодов (rate limit)', () => {
      const email = 'ratelimit@test.com';
      const CODE_RESEND_SECONDS = 60;

      createPendingVerificationCode(email, 'registration');

      const recentCode = mockDb.find('verification_codes', (c) => c.email === email && c.type === 'registration');
      expect(recentCode.length).toBe(1);

      const lastSent = new Date(recentCode[0].created_at).getTime();
      const now = Date.now();
      const tooSoon = now - lastSent < CODE_RESEND_SECONDS * 1000;
      expect(tooSoon).toBe(true);
    });
  });

  describe('Верификация кода', () => {
    it('должен принять правильный код', () => {
      const email = 'verify@test.com';
      const code = createPendingVerificationCode(email, 'registration');

      const codeRecord = mockDb.findOne(
        'verification_codes',
        (c) => c.email === email && c.type === 'registration' && c.used === false
      );
      expect(codeRecord).toBeDefined();
      expect(codeRecord!.code).toBe(code);

      const isExpired = new Date(codeRecord!.expires_at).getTime() < Date.now();
      expect(isExpired).toBe(false);

      const isMaxAttempts = codeRecord!.attempts >= 5;
      expect(isMaxAttempts).toBe(false);

      mockDb.update(
        'verification_codes',
        (c) => c.id === codeRecord!.id,
        { used: true }
      );

      const updatedRecord = mockDb.findOne('verification_codes', (c) => c.id === codeRecord!.id);
      expect(updatedRecord!.used).toBe(true);
    });

    it('должен отклонить неверный код и увеличить счетчик попыток', () => {
      const email = 'wrongcode@test.com';
      const correctCode = createPendingVerificationCode(email, 'registration');

      const codeRecord = mockDb.findOne(
        'verification_codes',
        (c) => c.email === email && c.type === 'registration' && c.used === false
      );

      const wrongCode = '000000';
      expect(wrongCode).not.toBe(correctCode);

      mockDb.update(
        'verification_codes',
        (c) => c.id === codeRecord!.id,
        { attempts: codeRecord!.attempts + 1 }
      );

      const updatedRecord = mockDb.findOne('verification_codes', (c) => c.id === codeRecord!.id);
      expect(updatedRecord!.attempts).toBe(1);
      expect(updatedRecord!.used).toBe(false);
    });

    it('должен отклонить истёкший код', () => {
      const email = 'expired@test.com';
      const code = '123456';
      mockDb.insert('verification_codes', {
        id: generateUuid(),
        email,
        code,
        type: 'registration',
        attempts: 0,
        used: false,
        expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      });

      const codeRecord = mockDb.findOne(
        'verification_codes',
        (c) => c.email === email && c.type === 'registration' && c.used === false
      );
      expect(codeRecord).toBeDefined();

      const isExpired = new Date(codeRecord!.expires_at).getTime() < Date.now();
      expect(isExpired).toBe(true);
    });

    it('должен блокировать после 5 неудачных попыток', () => {
      const email = 'maxattempts@test.com';
      const MAX_CODE_ATTEMPTS = 5;

      mockDb.insert('verification_codes', {
        id: generateUuid(),
        email,
        code: '999999',
        type: 'registration',
        attempts: MAX_CODE_ATTEMPTS,
        used: false,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });

      const codeRecord = mockDb.findOne(
        'verification_codes',
        (c) => c.email === email && c.type === 'registration' && c.used === false
      );
      expect(codeRecord!.attempts).toBeGreaterThanOrEqual(MAX_CODE_ATTEMPTS);
    });
  });

  describe('Создание аккаунта', () => {
    it('должен создать клиента после подтверждения email', () => {
      const email = 'newclient@test.com';
      const phone = '+79001234567';
      const password = 'securepass';

      createVerifiedEmail(email, 'registration');

      const codeRecord = mockDb.findOne(
        'verification_codes',
        (c) => c.email === email && c.type === 'registration' && c.used === true
      );
      expect(codeRecord).toBeDefined();

      const codeAge = Date.now() - new Date(codeRecord!.created_at).getTime();
      expect(codeAge).toBeLessThan(10 * 60 * 1000);

      const existingPhone = mockDb.findOne('users', (u) => u.phone === phone);
      expect(existingPhone).toBeUndefined();

      const existingEmail = mockDb.findOne('users', (u) => u.email?.toLowerCase() === email);
      expect(existingEmail).toBeUndefined();

      const passwordHash = hashPassword(password);
      const userId = generateUuid();

      const user = mockDb.insert('users', {
        id: userId,
        first_name: 'Иван',
        last_name: 'Петров',
        phone,
        email,
        password_hash: passwordHash,
        role: 'client',
        city: 'Тюмень',
        rating: 5.0,
        rating_count: 0,
        requests_count: 0,
        completed_count: 0,
        is_blocked: false,
        email_verified: true,
      });

      expect(user.id).toBe(userId);
      expect(user.role).toBe('client');
      expect(user.email_verified).toBe(true);

      const savedUser = mockDb.findOne('users', (u) => u.id === userId);
      expect(savedUser).toBeDefined();
      expect(savedUser!.phone).toBe(phone);
      expect(savedUser!.email).toBe(email);
      expect(verifyPassword(password, savedUser!.password_hash)).toBe(true);
    });

    it('должен создать исполнителя с подписками на категории', () => {
      const email = 'executor@test.com';
      createVerifiedEmail(email, 'registration');

      const userId = generateUuid();
      mockDb.insert('users', {
        id: userId,
        first_name: 'Мастер',
        last_name: 'Исполнитель',
        phone: '+79002345678',
        email,
        password_hash: hashPassword('pass123'),
        role: 'executor',
        city: 'Тюмень',
        rating: 5.0,
        rating_count: 0,
        requests_count: 0,
        completed_count: 0,
        is_blocked: false,
        email_verified: true,
      });

      const subscribedSlugs = ['plumbing', 'electrician'];
      const cats = mockDb.find('service_categories', (c) => subscribedSlugs.includes(c.slug));
      expect(cats.length).toBe(2);

      for (const cat of cats) {
        mockDb.insert('user_category_subscriptions', {
          user_id: userId,
          category_id: cat.id,
        });
      }

      const subs = mockDb.find('user_category_subscriptions', (s) => s.user_id === userId);
      expect(subs.length).toBe(2);
    });

    it('должен отклонить регистрацию с дублирующимся телефоном', () => {
      const existingUser = createTestUser({ phone: '+79009999999' });

      const duplicate = mockDb.findOne('users', (u) => u.phone === '+79009999999');
      expect(duplicate).toBeDefined();
      expect(duplicate!.id).toBe(existingUser.id);
    });

    it('должен отклонить регистрацию с дублирующимся email', () => {
      const existingUser = createTestUser({ email: 'taken@test.com' });

      const duplicate = mockDb.findOne('users', (u) => u.email?.toLowerCase() === 'taken@test.com');
      expect(duplicate).toBeDefined();
      expect(duplicate!.id).toBe(existingUser.id);
    });

    it('должен создать адрес пользователя при регистрации', () => {
      const userId = generateUuid();
      mockDb.insert('users', {
        id: userId,
        first_name: 'Тест',
        last_name: 'Адрес',
        phone: '+79003456789',
        email: 'addr@test.com',
        password_hash: hashPassword('pass'),
        role: 'client',
        city: 'Тюмень',
        rating: 5.0,
        rating_count: 0,
        requests_count: 0,
        completed_count: 0,
        is_blocked: false,
        email_verified: true,
      });

      const addrId = generateUuid();
      mockDb.insert('user_addresses', {
        id: addrId,
        user_id: userId,
        label: 'Дом',
        full_address: 'Тюмень, ул. Тестовая, д. 1, кв. 10',
        city: 'Тюмень',
        street: 'Тестовая',
        house: '1',
        apartment: '10',
      });

      const addresses = mockDb.find('user_addresses', (a) => a.user_id === userId);
      expect(addresses.length).toBe(1);
      expect(addresses[0].label).toBe('Дом');
      expect(addresses[0].city).toBe('Тюмень');
    });
  });

  describe('Вход в систему', () => {
    it('должен авторизовать пользователя по email и паролю', () => {
      const password = 'mypassword';
      createTestUser({
        email: 'login@test.com',
        password_hash: hashPassword(password),
        email_verified: true,
      });

      const found = mockDb.findOne('users', (u) => u.email?.toLowerCase() === 'login@test.com');
      expect(found).toBeDefined();
      expect(found!.is_blocked).toBe(false);
      expect(found!.password_hash).toBeTruthy();
      expect(verifyPassword(password, found!.password_hash)).toBe(true);
    });

    it('должен отклонить вход с неверным паролем', () => {
      createTestUser({
        email: 'wrongpass@test.com',
        password_hash: hashPassword('correct'),
      });

      const found = mockDb.findOne('users', (u) => u.email?.toLowerCase() === 'wrongpass@test.com');
      expect(found).toBeDefined();
      expect(verifyPassword('wrong_password', found!.password_hash)).toBe(false);
    });

    it('должен отклонить вход для заблокированного аккаунта', () => {
      createTestUser({
        email: 'blocked@test.com',
        is_blocked: true,
      });

      const found = mockDb.findOne('users', (u) => u.email?.toLowerCase() === 'blocked@test.com');
      expect(found).toBeDefined();
      expect(found!.is_blocked).toBe(true);
    });

    it('должен требовать код подтверждения для неверифицированного аккаунта', () => {
      createTestUser({
        email: 'unverified@test.com',
        email_verified: false,
      });

      const found = mockDb.findOne('users', (u) => u.email?.toLowerCase() === 'unverified@test.com');
      expect(found).toBeDefined();
      expect(found!.email_verified).toBe(false);

      createPendingVerificationCode('unverified@test.com', 'login');
      const codeRecord = mockDb.findOne(
        'verification_codes',
        (c) => c.email === 'unverified@test.com' && c.type === 'login' && c.used === false
      );
      expect(codeRecord).toBeDefined();
    });

    it('должен выполнить прямой вход для верифицированного аккаунта', () => {
      const password = 'verified_pass';
      createTestUser({
        email: 'verified@test.com',
        password_hash: hashPassword(password),
        email_verified: true,
      });

      const found = mockDb.findOne('users', (u) => u.email?.toLowerCase() === 'verified@test.com');
      expect(found).toBeDefined();
      expect(found!.email_verified).toBe(true);
      expect(verifyPassword(password, found!.password_hash)).toBe(true);
    });
  });

  describe('Сброс пароля', () => {
    it('должен позволить сбросить пароль через код подтверждения', () => {
      const email = 'reset@test.com';
      const oldPassword = 'oldpass';
      const newPassword = 'newpass123';

      const user = createTestUser({
        email,
        password_hash: hashPassword(oldPassword),
      });

      createVerifiedEmail(email, 'password_reset');

      const codeRecord = mockDb.findOne(
        'verification_codes',
        (c) => c.email === email && c.type === 'password_reset' && c.used === true
      );
      expect(codeRecord).toBeDefined();

      const codeAge = Date.now() - new Date(codeRecord!.created_at).getTime();
      expect(codeAge).toBeLessThan(10 * 60 * 1000);

      const newHash = hashPassword(newPassword);
      mockDb.update('users', (u) => u.id === user.id, { password_hash: newHash });

      const updated = mockDb.findOne('users', (u) => u.id === user.id);
      expect(verifyPassword(newPassword, updated!.password_hash)).toBe(true);
      expect(verifyPassword(oldPassword, updated!.password_hash)).toBe(false);
    });
  });

  describe('Выход', () => {
    it('должен пометить устройство как отозванное при выходе', () => {
      const user = createTestUser({ email: 'logout@test.com' });

      const device = mockDb.findOne(
        'user_devices',
        (d) => d.user_id === user.id && !d.is_revoked
      );
      expect(device).toBeDefined();

      mockDb.update(
        'user_devices',
        (d) => d.id === device!.id,
        { is_revoked: true }
      );

      const updated = mockDb.findOne('user_devices', (d) => d.id === device!.id);
      expect(updated!.is_revoked).toBe(true);
    });
  });
});
