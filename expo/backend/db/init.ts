import sql from "./index";
import { generateUuid } from "./helpers";

async function safeExec(query: any, label: string) {
  try {
    await query;
    console.log("[Migration] OK:", label);
  } catch (e: any) {
    if (
      e.message?.includes("already exists") ||
      e.message?.includes("duplicate") ||
      e.message?.includes("multiple primary")
    ) {
      console.log("[Migration] Skipped (already exists):", label);
    } else {
      console.warn("[Migration] Warning:", label, e.message);
    }
  }
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
    LIMIT 1
  `;
  return result.length > 0;
}

async function safeRenameColumn(table: string, oldName: string, newName: string) {
  const oldExists = await columnExists(table, oldName);
  const newExists = await columnExists(table, newName);
  if (oldExists && !newExists) {
    await safeExec(
      sql.unsafe(`ALTER TABLE "${table}" RENAME COLUMN "${oldName}" TO "${newName}"`),
      `Rename ${table}.${oldName} → ${newName}`
    );
  } else if (!oldExists && !newExists) {
    console.log(`[Migration] Neither ${oldName} nor ${newName} exists on ${table}, will be added later`);
  } else {
    console.log(`[Migration] ${table}.${newName} already exists, skip rename`);
  }
}

async function safeAddColumn(table: string, column: string, definition: string) {
  const exists = await columnExists(table, column);
  if (!exists) {
    await safeExec(
      sql.unsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`),
      `Add ${table}.${column}`
    );
  }
}

async function isSchemaReady(): Promise<boolean> {
  try {
    const result = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('users', 'user_devices', 'service_categories', 'service_requests', 'chats', 'chat_messages')
        ) as table_count,
        (SELECT COUNT(*)::int FROM information_schema.columns
         WHERE table_name = 'users' AND column_name IN ('first_name', 'is_blocked')
        ) as user_cols,
        (SELECT COUNT(*)::int FROM information_schema.columns
         WHERE table_name = 'user_devices' AND column_name = 'device_key'
        ) as device_cols,
        (SELECT COUNT(*)::int FROM service_categories WHERE slug IS NOT NULL) as cat_count
    `;
    const r = result[0];
    if (!r) return false;
    if (!(r.table_count >= 6 && r.user_cols >= 2 && r.device_cols >= 1 && r.cat_count >= 10)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function initDatabase() {
  console.log("[DB] Initializing database schema (migration mode)...");

  const ready = await isSchemaReady();
  if (ready) {
    console.log("[DB] Schema ready, running hotfixes...");
    try {
      await sql.unsafe(`ALTER TABLE "user_devices" ALTER COLUMN "platform" DROP NOT NULL`);
      console.log("[Hotfix] Dropped NOT NULL on user_devices.platform");
    } catch (e: any) {
      console.log("[Hotfix] platform NOT NULL already ok:", e.message);
    }
    try {
      await sql.unsafe(`ALTER TABLE "user_devices" ALTER COLUMN "platform" SET DEFAULT 'app'`);
      console.log("[Hotfix] Set default on user_devices.platform");
    } catch (e: any) {
      console.log("[Hotfix] platform default already ok:", e.message);
    }
    try {
      await sql.unsafe(`ALTER TABLE "user_devices" DROP CONSTRAINT IF EXISTS "ck_user_devices_platform"`);
      console.log("[Hotfix] Dropped ck_user_devices_platform");
    } catch (e: any) {
      console.log("[Hotfix] ck_user_devices_platform already ok:", e.message);
    }
    try {
      await sql.unsafe(`UPDATE "user_devices" SET "platform" = 'app' WHERE "platform" IS NULL`);
      console.log("[Hotfix] Filled null platforms");
    } catch (e: any) {
      console.log("[Hotfix] Fill null platforms error:", e.message);
    }

    // Hotfix: ensure critical columns have proper defaults
    const defaultFixes = [
      `ALTER TABLE "service_requests" ALTER COLUMN "status" SET DEFAULT 'new'`,
      `ALTER TABLE "request_responses" ALTER COLUMN "status" SET DEFAULT 'pending'`,
      `ALTER TABLE "notifications" ALTER COLUMN "is_read" SET DEFAULT false`,
      `ALTER TABLE "chats" ALTER COLUMN "type" SET DEFAULT 'request'`,
      `ALTER TABLE "chat_messages" ALTER COLUMN "is_read" SET DEFAULT false`,
      `ALTER TABLE "chat_participants" ALTER COLUMN "unread_count" SET DEFAULT 0`,
    ];
    for (const fix of defaultFixes) {
      try {
        await sql.unsafe(fix);
      } catch (e: any) {
        console.log("[Hotfix] Default fix skipped:", e.message);
      }
    }
    console.log("[Hotfix] Column defaults verified");

    await safeAddColumn("users", "email_verified", "BOOL DEFAULT false");
    await safeAddColumn("users", "oauth_provider", "VARCHAR(32)");
    await safeAddColumn("users", "oauth_id", "VARCHAR(255)");
    await safeAddColumn("users", "region", "VARCHAR(255)");
    await safeAddColumn("users", "user_number", "SERIAL");
    await safeExec(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_number ON users(user_number)`, "idx_users_user_number");
    await safeExec(
      sql.unsafe(`
        DO $ BEGIN
          IF EXISTS (SELECT 1 FROM users WHERE user_number IS NULL OR user_number = 0 LIMIT 1) THEN
            WITH numbered AS (
              SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
              FROM users WHERE user_number IS NULL OR user_number = 0
            )
            UPDATE users SET user_number = (SELECT COALESCE(MAX(user_number), 0) FROM users WHERE user_number > 0) + numbered.rn
            FROM numbered WHERE users.id = numbered.id;
          END IF;
        END $
      `),
      "Backfill user_number for existing users"
    );
    await safeAddColumn("service_requests", "city", "VARCHAR(128)");
    await safeAddColumn("service_requests", "region", "VARCHAR(255)");

    try {
      await sql`UPDATE users SET email = 'info@musorka.su' WHERE phone = '70000000000' AND (email IS NULL OR email != 'info@musorka.su')`;
      console.log("[Hotfix] Set email info@musorka.su for admin 70000000000");
    } catch (e: any) {
      console.log("[Hotfix] Admin email update skipped:", e.message);
    }

    try {
      const { hashPassword } = await import("./helpers");
      const newHash = hashPassword("admin12345");
      await sql`UPDATE users SET password_hash = ${newHash} WHERE phone = '70000000000'`;
      console.log("[Hotfix] Reset password for admin 70000000000");
    } catch (e: any) {
      console.log("[Hotfix] Admin password reset skipped:", e.message);
    }
    try {
      await sql.unsafe(`ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL`);
      console.log("[Hotfix] Dropped NOT NULL on users.password_hash for OAuth users");
    } catch (e: any) {
      console.log("[Hotfix] password_hash NOT NULL already ok:", e.message);
    }
    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`, "idx_users_email");
    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id)`, "idx_users_oauth");

    await safeExec(
      sql`CREATE TABLE IF NOT EXISTS verification_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        code VARCHAR(6) NOT NULL,
        type VARCHAR(32) NOT NULL DEFAULT 'email_verify',
        attempts INT DEFAULT 0,
        used BOOL DEFAULT false,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      "Create verification_codes table"
    );
    await safeAddColumn("verification_codes", "type", "VARCHAR(32) NOT NULL DEFAULT 'email_verify'");
    await safeAddColumn("verification_codes", "attempts", "INT DEFAULT 0");
    await safeAddColumn("verification_codes", "used", "BOOL DEFAULT false");
    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_vc_email ON verification_codes(email)`, "idx_vc_email");
    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_vc_expires ON verification_codes(expires_at)`, "idx_vc_expires");

    await safeAddColumn("service_requests", "is_urgent", "BOOL DEFAULT false");
    await safeAddColumn("service_requests", "is_paid", "BOOL DEFAULT true");

    await safeAddColumn("users", "about", "TEXT");
    await safeAddColumn("users", "portfolio_photos", "TEXT[] DEFAULT '{}'");
    await safeAddColumn("users", "status_text", "VARCHAR(100)");

    await safeExec(
      sql`CREATE TABLE IF NOT EXISTS executor_portfolio_photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        photo_url TEXT NOT NULL,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      "Create executor_portfolio_photos table"
    );
    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_epp_user_id ON executor_portfolio_photos(user_id)`, "idx_epp_user_id");

    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_requests_status_category ON service_requests(status, category_id)`, "idx_requests_status_category");
    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_requests_client_status ON service_requests(client_id, status, created_at DESC)`, "idx_requests_client_status");
    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_requests_executor_status ON service_requests(executor_id, status, created_at DESC)`, "idx_requests_executor_status");
    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_rr_request_status ON request_responses(request_id, status)`, "idx_rr_request_status");
    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_ri_executor_request ON request_ignores(executor_id, request_id)`, "idx_ri_executor_request");
    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_reviews_request_author ON reviews(request_id, author_id)`, "idx_reviews_request_author_idx");
    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_ud_device_key_revoked ON user_devices(device_key, is_revoked)`, "idx_ud_device_key_revoked");
    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_notif_recipient_read ON notifications(recipient_id, is_read, created_at DESC)`, "idx_notif_recipient_read");
    console.log("[Hotfix] Performance indexes verified");

    await safeAddColumn("user_devices", "is_biometric_unlock", "BOOL DEFAULT false");
    await safeExec(
      sql`UPDATE user_devices SET is_biometric_unlock = false WHERE is_biometric_unlock IS NULL`,
      "Fill null is_biometric_unlock"
    );

    await safeExec(
      sql`CREATE TABLE IF NOT EXISTS user_notification_settings (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        new_messages BOOL DEFAULT true,
        request_updates BOOL DEFAULT true,
        promotions BOOL DEFAULT true,
        system_alerts BOOL DEFAULT true,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      "Create user_notification_settings table"
    );

    await safeAddColumn("chat_messages", "attachment_url", "TEXT");
    await safeAddColumn("chat_messages", "attachment_type", "VARCHAR(32)");
    await safeAddColumn("chat_messages", "attachment_name", "VARCHAR(255)");
    await safeAddColumn("chat_messages", "audio_duration_ms", "INT");

    await safeAddColumn("users", "last_seen_at", "TIMESTAMPTZ");
    await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at)`, "idx_users_last_seen");

    await safeExec(
      sql`CREATE TABLE IF NOT EXISTS live_likes (
        request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (request_id, user_id)
      )`,
      "Create live_likes table (hotfix)"
    );

    await safeAddColumn("users", "two_fa_enabled", "BOOL DEFAULT true");
    await safeExec(
      sql`UPDATE users SET two_fa_enabled = true WHERE two_fa_enabled IS NULL`,
      "Fill null two_fa_enabled"
    );

    try {
      const { hashPassword } = await import("./helpers");
      const existingAppleReviewClient = await sql`SELECT id FROM users WHERE phone = '89000000000'`;
      if (existingAppleReviewClient.length === 0) {
        const passwordHash = hashPassword("12345");
        const id = generateUuid();
        await sql`
          INSERT INTO users (id, first_name, last_name, phone, email, password_hash, role, city, region, rating, rating_count, requests_count, completed_count, is_blocked, email_verified, two_fa_enabled)
          VALUES (${id}::uuid, 'Apple', 'Review', '89000000000', 'applereview@musorka.su', ${passwordHash}, 'client', 'Тюмень', 'Тюменская область', ${5.0}, ${0}, ${0}, ${0}, ${false}, ${true}, ${false})
        `;
        try {
          const addrId = generateUuid();
          await sql`
            INSERT INTO user_addresses (id, user_id, label, full_address, city, street, house)
            VALUES (${addrId}::uuid, ${id}::uuid, 'Дом', 'Тюмень, ул. Демо 1', 'Тюмень', 'Демо', '1')
          `;
        } catch (e: any) {
          console.log("[Hotfix] Apple review address skipped:", e.message);
        }
        try {
          const allCategories = await sql`SELECT id FROM service_categories`;
          for (const cat of allCategories) {
            await sql`
              INSERT INTO user_category_subscriptions (user_id, category_id)
              VALUES (${id}::uuid, ${cat.id})
              ON CONFLICT DO NOTHING
            `;
          }
        } catch (e: any) {
          console.log("[Hotfix] Apple review subs skipped:", e.message);
        }
        console.log("[Hotfix] Created Apple review user 89000000000 / 12345");
      } else {
        const newHash = hashPassword("12345");
        await sql`UPDATE users SET password_hash = ${newHash}, two_fa_enabled = false, is_blocked = false, email_verified = true WHERE phone = '89000000000'`;
        console.log("[Hotfix] Reset Apple review user 89000000000 (password=12345, 2FA off, unblocked)");
      }
    } catch (e: any) {
      console.log("[Hotfix] Apple review user seed skipped:", e.message);
    }

    try {
      const { hashPassword } = await import("./helpers");
      const existingTestExec = await sql`SELECT id FROM users WHERE phone = '20000000000'`;
      if (existingTestExec.length === 0) {
        const passwordHash = hashPassword("12345");
        const id = generateUuid();
        await sql`
          INSERT INTO users (id, first_name, last_name, phone, email, password_hash, role, city, region, rating, rating_count, requests_count, completed_count, is_blocked, email_verified, two_fa_enabled)
          VALUES (${id}::uuid, 'Тест', 'Исполнитель', '20000000000', 'testexecutor@musorka.su', ${passwordHash}, 'executor', 'Тюмень', 'Тюменская область', ${5.0}, ${0}, ${0}, ${0}, ${false}, ${true}, ${false})
        `;
        try {
          const allCategories = await sql`SELECT id FROM service_categories`;
          for (const cat of allCategories) {
            await sql`
              INSERT INTO user_category_subscriptions (user_id, category_id)
              VALUES (${id}::uuid, ${cat.id})
              ON CONFLICT DO NOTHING
            `;
          }
        } catch (e: any) {
          console.log("[Hotfix] Test executor subs skipped:", e.message);
        }
        console.log("[Hotfix] Created test executor user 20000000000 / 12345");
      } else {
        const newHash = hashPassword("12345");
        await sql`UPDATE users SET password_hash = ${newHash}, two_fa_enabled = false, is_blocked = false, email_verified = true WHERE phone = '20000000000'`;
        console.log("[Hotfix] Reset test executor 20000000000 (password=12345, 2FA off)");
      }
    } catch (e: any) {
      console.log("[Hotfix] Test executor seed skipped:", e.message);
    }

    return { success: true, skipped: true };
  }

  try {
    await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;
    console.log("[DB] pgcrypto extension ready");
  } catch (e) {
    console.warn("[DB] pgcrypto not available:", e);
    try {
      await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
      console.log("[DB] uuid-ossp extension ready");
    } catch {
      console.warn("[DB] uuid-ossp also not available");
    }
  }

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      first_name VARCHAR(128),
      last_name VARCHAR(128),
      phone VARCHAR(32) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'client',
      city VARCHAR(128) DEFAULT 'Тюмень',
      rating NUMERIC(3,2) DEFAULT 5.00,
      rating_count INT DEFAULT 0,
      requests_count INT DEFAULT 0,
      completed_count INT DEFAULT 0,
      avatar_url TEXT,
      is_blocked BOOL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("[Migration] Migrating users table...");
  await safeAddColumn("users", "first_name", "VARCHAR(128)");
  await safeAddColumn("users", "last_name", "VARCHAR(128)");
  await safeAddColumn("users", "email", "VARCHAR(255)");
  await safeAddColumn("users", "city", "VARCHAR(128) DEFAULT 'Тюмень'");
  await safeAddColumn("users", "region", "VARCHAR(255)");
  await safeAddColumn("users", "user_number", "SERIAL");
  await safeExec(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_number ON users(user_number)`, "idx_users_user_number");
  await safeAddColumn("users", "rating_count", "INT DEFAULT 0");
  await safeAddColumn("users", "requests_count", "INT DEFAULT 0");
  await safeAddColumn("users", "completed_count", "INT DEFAULT 0");
  await safeAddColumn("users", "avatar_url", "TEXT");

  const hasIsActive = await columnExists("users", "is_active");
  const hasIsBlocked = await columnExists("users", "is_blocked");
  if (hasIsActive && !hasIsBlocked) {
    await safeAddColumn("users", "is_blocked", "BOOL DEFAULT false");
    try {
      await sql`UPDATE users SET is_blocked = NOT is_active WHERE is_blocked IS NULL`;
      console.log("[Migration] OK: Sync is_blocked from is_active");
    } catch (e: any) {
      console.warn("[Migration] Warning syncing is_blocked:", e.message);
    }
  } else if (!hasIsBlocked) {
    await safeAddColumn("users", "is_blocked", "BOOL DEFAULT false");
  }

  if (!(await columnExists("users", "rating"))) {
    await safeAddColumn("users", "rating", "NUMERIC(3,2) NOT NULL DEFAULT 5.00");
  } else {
    await safeExec(
      sql.unsafe(`ALTER TABLE "users" ALTER COLUMN "rating" SET DEFAULT 5.00`),
      "Set default 5.00 on users.rating"
    );
    await safeExec(
      sql.unsafe(`UPDATE "users" SET "rating" = 5.00 WHERE "rating" IS NULL`),
      "Fill null ratings with 5.00"
    );
  }

  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`, "idx_users_role");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`, "idx_users_phone");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_users_is_blocked ON users(is_blocked)`, "idx_users_is_blocked");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)`, "idx_users_created_at");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`, "idx_users_email");
  await safeAddColumn("users", "oauth_provider", "VARCHAR(32)");
  await safeAddColumn("users", "oauth_id", "VARCHAR(255)");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id)`, "idx_users_oauth");

  await sql`
    CREATE TABLE IF NOT EXISTS service_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(128) NOT NULL,
      slug VARCHAR(128),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("[Migration] Migrating service_categories table...");
  await safeAddColumn("service_categories", "slug", "VARCHAR(128)");
  await safeAddColumn("service_categories", "created_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeAddColumn("service_categories", "icon", "VARCHAR(64)");
  await safeAddColumn("service_categories", "color", "VARCHAR(16)");
  await safeAddColumn("service_categories", "bg_color", "VARCHAR(16)");
  await safeAddColumn("service_categories", "description", "TEXT");
  await safeAddColumn("service_categories", "is_active", "BOOLEAN DEFAULT TRUE");
  await safeAddColumn("service_categories", "sort_order", "INT DEFAULT 0");

  const catsWithoutSlug = await sql`SELECT id, name FROM service_categories WHERE slug IS NULL`;
  for (const cat of catsWithoutSlug) {
    const slug = generateSlugFromName(cat.name);
    await safeExec(
      sql`UPDATE service_categories SET slug = ${slug} WHERE id = ${cat.id}`,
      `Set slug for category ${cat.name} → ${slug}`
    );
  }

  await safeExec(
    sql.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sc_slug') THEN
          CREATE UNIQUE INDEX idx_sc_slug ON service_categories(slug);
        END IF;
      END $$
    `),
    "unique idx on service_categories.slug"
  );

  await sql`
    CREATE TABLE IF NOT EXISTS user_addresses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label VARCHAR(64) DEFAULT 'Дом',
      full_address TEXT NOT NULL DEFAULT '',
      city VARCHAR(128),
      street VARCHAR(128),
      house VARCHAR(32),
      building VARCHAR(32),
      apartment VARCHAR(32),
      entrance VARCHAR(32),
      floor VARCHAR(32),
      intercom VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("[Migration] Migrating user_addresses table...");
  const hasAddrOld = await columnExists("user_addresses", "address");
  const hasFullAddress = await columnExists("user_addresses", "full_address");
  if (hasAddrOld && !hasFullAddress) {
    await safeRenameColumn("user_addresses", "address", "full_address");
  } else if (!hasFullAddress) {
    await safeAddColumn("user_addresses", "full_address", "TEXT NOT NULL DEFAULT ''");
  }
  await safeAddColumn("user_addresses", "label", "VARCHAR(64) DEFAULT 'Дом'");
  await safeAddColumn("user_addresses", "city", "VARCHAR(128)");
  await safeAddColumn("user_addresses", "street", "VARCHAR(128)");
  await safeAddColumn("user_addresses", "house", "VARCHAR(32)");
  await safeAddColumn("user_addresses", "building", "VARCHAR(32)");
  await safeAddColumn("user_addresses", "apartment", "VARCHAR(32)");
  await safeAddColumn("user_addresses", "entrance", "VARCHAR(32)");
  await safeAddColumn("user_addresses", "floor", "VARCHAR(32)");
  await safeAddColumn("user_addresses", "intercom", "VARCHAR(64)");
  await safeAddColumn("user_addresses", "created_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id)`, "idx_user_addresses_user_id");

  await sql`
    CREATE TABLE IF NOT EXISTS user_category_subscriptions (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, category_id)
    )
  `;
  await safeAddColumn("user_category_subscriptions", "created_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_ucs_user_id ON user_category_subscriptions(user_id)`, "idx_ucs_user_id");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_ucs_category_id ON user_category_subscriptions(category_id)`, "idx_ucs_category_id");

  await sql`
    CREATE TABLE IF NOT EXISTS user_devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_key VARCHAR(255) NOT NULL,
      platform VARCHAR(32),
      device_name VARCHAR(255),
      app_version VARCHAR(64),
      is_revoked BOOL DEFAULT false,
      last_seen_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("[Migration] Migrating user_devices table...");
  const hasDeviceId = await columnExists("user_devices", "device_id");
  const hasDeviceKey = await columnExists("user_devices", "device_key");
  if (hasDeviceId && !hasDeviceKey) {
    await safeRenameColumn("user_devices", "device_id", "device_key");
  } else if (!hasDeviceKey) {
    await safeAddColumn("user_devices", "device_key", "VARCHAR(255) NOT NULL DEFAULT ''");
  }
  await safeAddColumn("user_devices", "platform", "VARCHAR(32) DEFAULT 'app'");
  await safeExec(
    sql.unsafe(`ALTER TABLE "user_devices" ALTER COLUMN "platform" DROP NOT NULL`),
    "Drop NOT NULL on user_devices.platform"
  );
  await safeExec(
    sql.unsafe(`ALTER TABLE "user_devices" ALTER COLUMN "platform" SET DEFAULT 'app'`),
    "Set default 'app' on user_devices.platform"
  );
  await safeExec(
    sql.unsafe(`ALTER TABLE "user_devices" DROP CONSTRAINT IF EXISTS "ck_user_devices_platform"`),
    "Drop check constraint ck_user_devices_platform"
  );
  await safeExec(
    sql.unsafe(`UPDATE "user_devices" SET "platform" = 'app' WHERE "platform" IS NULL`),
    "Fill null platform with 'app'"
  );
  await safeAddColumn("user_devices", "device_name", "VARCHAR(255)");
  await safeAddColumn("user_devices", "app_version", "VARCHAR(64)");
  await safeAddColumn("user_devices", "is_revoked", "BOOL DEFAULT false");
  await safeExec(
    sql.unsafe(`ALTER TABLE "user_devices" ALTER COLUMN "is_revoked" SET DEFAULT false`),
    "Set default false on user_devices.is_revoked"
  );
  await safeExec(
    sql.unsafe(`UPDATE "user_devices" SET "is_revoked" = false WHERE "is_revoked" IS NULL`),
    "Fill null is_revoked with false"
  );
  await safeAddColumn("user_devices", "last_seen_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeAddColumn("user_devices", "created_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id)`, "idx_user_devices_user_id");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_user_devices_device_key ON user_devices(device_key)`, "idx_user_devices_device_key");
  await safeAddColumn("user_devices", "is_biometric_unlock", "BOOL DEFAULT false");
  await safeExec(
    sql`UPDATE user_devices SET is_biometric_unlock = false WHERE is_biometric_unlock IS NULL`,
    "Fill null is_biometric_unlock"
  );

  await sql`
    CREATE TABLE IF NOT EXISTS user_notification_settings (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      new_messages BOOL DEFAULT true,
      request_updates BOOL DEFAULT true,
      promotions BOOL DEFAULT true,
      system_alerts BOOL DEFAULT true,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("[Migration] user_notification_settings table ready");

  await sql`
    CREATE TABLE IF NOT EXISTS service_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
      client_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      executor_id UUID REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(255),
      description TEXT,
      address TEXT NOT NULL DEFAULT 'Не указан',
      acceptable_price NUMERIC(12,2),
      payment_method VARCHAR(32),
      latitude FLOAT,
      longitude FLOAT,
      scheduled_at TIMESTAMPTZ,
      status VARCHAR(32) NOT NULL DEFAULT 'new',
      accepted_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("[Migration] Migrating service_requests table...");
  await safeAddColumn("service_requests", "executor_id", "UUID REFERENCES users(id) ON DELETE SET NULL");
  await safeAddColumn("service_requests", "address", "TEXT NOT NULL DEFAULT 'Не указан'");
  await safeAddColumn("service_requests", "acceptable_price", "NUMERIC(12,2)");
  await safeAddColumn("service_requests", "payment_method", "VARCHAR(32)");
  await safeAddColumn("service_requests", "latitude", "FLOAT");
  await safeAddColumn("service_requests", "longitude", "FLOAT");
  await safeAddColumn("service_requests", "scheduled_at", "TIMESTAMPTZ");
  await safeAddColumn("service_requests", "status", "VARCHAR(32) NOT NULL DEFAULT 'new'");
  await safeAddColumn("service_requests", "accepted_at", "TIMESTAMPTZ");
  await safeAddColumn("service_requests", "completed_at", "TIMESTAMPTZ");
  await safeAddColumn("service_requests", "updated_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeAddColumn("service_requests", "title", "VARCHAR(255)");
  await safeAddColumn("service_requests", "is_urgent", "BOOL DEFAULT false");
  await safeAddColumn("service_requests", "is_paid", "BOOL DEFAULT true");
  await safeAddColumn("service_requests", "city", "VARCHAR(128)");
  await safeAddColumn("service_requests", "region", "VARCHAR(255)");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_requests_city ON service_requests(city)`, "idx_requests_city");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_requests_status ON service_requests(status)`, "idx_requests_status");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_requests_client_id ON service_requests(client_id)`, "idx_requests_client_id");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_requests_executor_id ON service_requests(executor_id)`, "idx_requests_executor_id");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_requests_category_id ON service_requests(category_id)`, "idx_requests_category_id");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_requests_created_at ON service_requests(created_at DESC)`, "idx_requests_created_at");

  await sql`
    CREATE TABLE IF NOT EXISTS service_request_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      file_url TEXT NOT NULL,
      file_type VARCHAR(32) NOT NULL DEFAULT 'attachment',
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await safeAddColumn("service_request_files", "file_url", "TEXT NOT NULL DEFAULT ''");
  await safeAddColumn("service_request_files", "file_type", "VARCHAR(32) NOT NULL DEFAULT 'attachment'");
  await safeAddColumn("service_request_files", "sort_order", "INT DEFAULT 0");
  await safeAddColumn("service_request_files", "created_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_srf_request_id ON service_request_files(request_id)`, "idx_srf_request_id");

  await sql`
    CREATE TABLE IF NOT EXISTS request_responses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      executor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      price NUMERIC(12,2),
      scheduled_at TIMESTAMPTZ,
      comment TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("[Migration] Migrating request_responses table...");
  const hasRrMessage = await columnExists("request_responses", "message");
  const hasRrComment = await columnExists("request_responses", "comment");
  if (hasRrMessage && !hasRrComment) {
    await safeRenameColumn("request_responses", "message", "comment");
  } else if (!hasRrComment) {
    await safeAddColumn("request_responses", "comment", "TEXT");
  }
  await safeAddColumn("request_responses", "price", "NUMERIC(12,2)");
  await safeAddColumn("request_responses", "scheduled_at", "TIMESTAMPTZ");
  await safeAddColumn("request_responses", "status", "VARCHAR(32) NOT NULL DEFAULT 'pending'");
  await safeAddColumn("request_responses", "created_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeAddColumn("request_responses", "updated_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_rr_request_id ON request_responses(request_id)`, "idx_rr_request_id");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_rr_executor_id ON request_responses(executor_id)`, "idx_rr_executor_id");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_rr_status ON request_responses(status)`, "idx_rr_status");

  await sql`
    CREATE TABLE IF NOT EXISTS request_ignores (
      request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      executor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (request_id, executor_id)
    )
  `;
  await safeAddColumn("request_ignores", "created_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_ri_executor_id ON request_ignores(executor_id)`, "idx_ri_executor_id");

  await sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID REFERENCES service_requests(id) ON DELETE CASCADE,
      author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
      text TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("[Migration] Migrating reviews table...");
  const hasFromUserId = await columnExists("reviews", "from_user_id");
  const hasAuthorId = await columnExists("reviews", "author_id");
  if (hasFromUserId && !hasAuthorId) {
    await safeRenameColumn("reviews", "from_user_id", "author_id");
  } else if (!hasAuthorId) {
    await safeAddColumn("reviews", "author_id", "UUID REFERENCES users(id) ON DELETE CASCADE");
  }

  const hasToUserId = await columnExists("reviews", "to_user_id");
  const hasTargetId = await columnExists("reviews", "target_id");
  if (hasToUserId && !hasTargetId) {
    await safeRenameColumn("reviews", "to_user_id", "target_id");
  } else if (!hasTargetId) {
    await safeAddColumn("reviews", "target_id", "UUID REFERENCES users(id) ON DELETE CASCADE");
  }

  const hasRevComment = await columnExists("reviews", "comment");
  const hasRevText = await columnExists("reviews", "text");
  if (hasRevComment && !hasRevText) {
    await safeRenameColumn("reviews", "comment", "text");
  } else if (!hasRevText) {
    await safeAddColumn("reviews", "text", "TEXT");
  }

  await safeAddColumn("reviews", "request_id", "UUID REFERENCES service_requests(id) ON DELETE CASCADE");
  await safeAddColumn("reviews", "created_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_reviews_target_id ON reviews(target_id)`, "idx_reviews_target_id");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_reviews_author_id ON reviews(author_id)`, "idx_reviews_author_id");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_reviews_request ON reviews(request_id)`, "idx_reviews_request");
  await safeExec(
    sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_request_author ON reviews(request_id, author_id)`),
    "unique idx on reviews(request_id, author_id)"
  );

  await sql`
    CREATE TABLE IF NOT EXISTS chats (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type VARCHAR(32) NOT NULL DEFAULT 'request',
      request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
      last_message_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("[Migration] Migrating chats table...");
  await safeAddColumn("chats", "type", "VARCHAR(32) NOT NULL DEFAULT 'request'");
  await safeAddColumn("chats", "request_id", "UUID REFERENCES service_requests(id) ON DELETE SET NULL");
  await safeAddColumn("chats", "last_message_at", "TIMESTAMPTZ");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_chats_type ON chats(type)`, "idx_chats_type");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_chats_request_id ON chats(request_id)`, "idx_chats_request_id");

  await sql`
    CREATE TABLE IF NOT EXISTS chat_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      unread_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (chat_id, user_id)
    )
  `;
  await safeAddColumn("chat_participants", "unread_count", "INT DEFAULT 0");
  await safeAddColumn("chat_participants", "created_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_cp_user_id ON chat_participants(user_id)`, "idx_cp_user_id");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_cp_chat_id ON chat_participants(chat_id)`, "idx_cp_chat_id");

  await sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL DEFAULT '',
      is_read BOOL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("[Migration] Migrating chat_messages table...");
  const hasCmMessage = await columnExists("chat_messages", "message");
  const hasCmText = await columnExists("chat_messages", "text");
  if (hasCmMessage && !hasCmText) {
    await safeRenameColumn("chat_messages", "message", "text");
  } else if (!hasCmText) {
    await safeAddColumn("chat_messages", "text", "TEXT NOT NULL DEFAULT ''");
  }
  await safeAddColumn("chat_messages", "is_read", "BOOL DEFAULT false");
  await safeAddColumn("chat_messages", "attachment_url", "TEXT");
  await safeAddColumn("chat_messages", "attachment_type", "VARCHAR(32)");
  await safeAddColumn("chat_messages", "attachment_name", "VARCHAR(255)");
  await safeAddColumn("chat_messages", "audio_duration_ms", "INT");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_cm_chat_id ON chat_messages(chat_id)`, "idx_cm_chat_id");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_cm_chat_created ON chat_messages(chat_id, created_at)`, "idx_cm_chat_created");

  await sql`
    CREATE TABLE IF NOT EXISTS chat_message_reactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji VARCHAR(16) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (message_id, user_id, emoji)
    )
  `;
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_cmr_message_id ON chat_message_reactions(message_id)`, "idx_cmr_message_id");

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL DEFAULT '',
      body TEXT,
      type VARCHAR(32) NOT NULL DEFAULT 'system',
      payload JSONB DEFAULT '{}',
      is_read BOOL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("[Migration] Migrating notifications table...");
  const hasNotifUserId = await columnExists("notifications", "user_id");
  const hasRecipientId = await columnExists("notifications", "recipient_id");
  if (hasNotifUserId && !hasRecipientId) {
    await safeRenameColumn("notifications", "user_id", "recipient_id");
  } else if (!hasRecipientId) {
    await safeAddColumn("notifications", "recipient_id", "UUID REFERENCES users(id) ON DELETE CASCADE");
  }

  const hasNotifText = await columnExists("notifications", "text");
  if (hasNotifText && !(await columnExists("notifications", "body"))) {
    await safeRenameColumn("notifications", "text", "body");
  }
  await safeAddColumn("notifications", "title", "VARCHAR(255) NOT NULL DEFAULT ''");
  await safeAddColumn("notifications", "body", "TEXT");
  await safeAddColumn("notifications", "type", "VARCHAR(32) NOT NULL DEFAULT 'system'");
  await safeAddColumn("notifications", "payload", "JSONB DEFAULT '{}'");
  await safeAddColumn("notifications", "is_read", "BOOL DEFAULT false");
  await safeAddColumn("notifications", "created_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_id)`, "idx_notif_recipient");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC)`, "idx_notif_created");

  await sql`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      platform VARCHAR(32),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await safeAddColumn("push_tokens", "platform", "VARCHAR(32)");
  await safeAddColumn("push_tokens", "created_at", "TIMESTAMPTZ DEFAULT NOW()");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id)`, "idx_push_tokens_user_id");

  await sql`
    CREATE TABLE IF NOT EXISTS admin_action_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      action VARCHAR(128) NOT NULL,
      target_type VARCHAR(64),
      target_id UUID,
      details JSONB DEFAULT '{}',
      ip_address VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("[Migration] Migrating admin_action_logs table...");
  const hasAalMeta = await columnExists("admin_action_logs", "meta");
  const hasAalDetails = await columnExists("admin_action_logs", "details");
  if (hasAalMeta && !hasAalDetails) {
    await safeRenameColumn("admin_action_logs", "meta", "details");
  } else if (!hasAalDetails) {
    await safeAddColumn("admin_action_logs", "details", "JSONB DEFAULT '{}'");
  }
  await safeAddColumn("admin_action_logs", "target_type", "VARCHAR(64)");
  await safeAddColumn("admin_action_logs", "target_id", "UUID");
  await safeAddColumn("admin_action_logs", "ip_address", "VARCHAR(64)");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_aal_admin_id ON admin_action_logs(admin_id)`, "idx_aal_admin_id");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_aal_action ON admin_action_logs(action)`, "idx_aal_action");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_aal_created_at ON admin_action_logs(created_at DESC)`, "idx_aal_created_at");

  console.log("[Migration] Setting server-side UUID defaults on id columns...");
  const tablesWithId = [
    "users", "service_categories", "user_addresses", "user_devices",
    "service_requests", "service_request_files", "request_responses",
    "reviews", "chats", "chat_participants", "chat_messages",
    "notifications", "push_tokens", "admin_action_logs",
  ];
  for (const table of tablesWithId) {
    await safeExec(
      sql.unsafe(`ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`),
      `Set default gen_random_uuid() on ${table}.id`
    );
  }

  await safeExec(
    sql.unsafe(`ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT NOW()`),
    "Set default NOW() on users.created_at"
  );
  await safeExec(
    sql.unsafe(`ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT NOW()`),
    "Set default NOW() on users.updated_at"
  );

  await sql`
    CREATE TABLE IF NOT EXISTS verification_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      code VARCHAR(6) NOT NULL,
      type VARCHAR(32) NOT NULL DEFAULT 'email_verify',
      attempts INT DEFAULT 0,
      used BOOL DEFAULT false,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await safeAddColumn("verification_codes", "type", "VARCHAR(32) NOT NULL DEFAULT 'email_verify'");
  await safeAddColumn("verification_codes", "attempts", "INT DEFAULT 0");
  await safeAddColumn("verification_codes", "used", "BOOL DEFAULT false");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_vc_email ON verification_codes(email)`, "idx_vc_email");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_vc_expires ON verification_codes(expires_at)`, "idx_vc_expires");

  await safeAddColumn("users", "email_verified", "BOOL DEFAULT false");
  await safeAddColumn("users", "about", "TEXT");
  await safeAddColumn("users", "portfolio_photos", "TEXT[] DEFAULT '{}'");
  await safeAddColumn("users", "status_text", "VARCHAR(100)");

  await sql`
    CREATE TABLE IF NOT EXISTS executor_portfolio_photos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      photo_url TEXT NOT NULL,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_epp_user_id ON executor_portfolio_photos(user_id)`, "idx_epp_user_id");

  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_requests_updated_at ON service_requests(updated_at DESC)`, "idx_requests_updated_at");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_requests_completed_at ON service_requests(completed_at DESC NULLS LAST)`, "idx_requests_completed_at");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_rr_request_executor ON request_responses(request_id, executor_id)`, "idx_rr_request_executor");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_cm_chat_created_desc ON chat_messages(chat_id, created_at DESC)`, "idx_cm_chat_created_desc");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_chats_last_msg ON chats(last_message_at DESC NULLS LAST)`, "idx_chats_last_msg");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_notif_recipient_created ON notifications(recipient_id, created_at DESC)`, "idx_notif_recipient_created");
  await safeExec(sql`CREATE INDEX IF NOT EXISTS idx_reviews_target_created ON reviews(target_id, created_at DESC)`, "idx_reviews_target_created");

  console.log("[DB] All tables created/migrated");

  await seedCategories();
  await seedTestUsers();

  console.log("[DB] Schema initialized successfully");
  return { success: true };
}

function generateSlugFromName(name: string): string {
  const slugMap: Record<string, string> = {
    "Вынос бытового мусора": "trash_takeout",
    "Сантехник": "plumbing",
    "Электрик": "electrician",
    "Клининг": "cleaning",
    "Уборка снега": "snow_cleanup",
    "Мелкосрочный ремонт": "minor_repair",
    "Грузчик": "loader",
    "Покос травы": "grass_mowing",
    "Курьерские поручения": "courier_tasks",
    "Сборка/разборка мебели": "furniture_assembly",
    "Ремонт бытовой техники": "appliance_repair",
    "Настройка компьютерной техники": "computer_setup",
    "Очистка авто от снега": "car_snow_cleanup",
    "Химчистка мебели": "furniture_dry_cleaning",
    "Москитные сетки": "mosquito_nets",
  };
  return slugMap[name] || name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "_").replace(/^_|_$/g, "");
}

async function seedCategories() {
  console.log("[DB] Seeding service categories...");

  const categories = [
    { slug: "trash_takeout", name: "Вынос бытового мусора", icon: "Trash2", color: "#0F766E", bgColor: "#CCFBF1", description: "Вынос бытового мусора от двери до бака по Тюмени" },
    { slug: "plumbing", name: "Сантехник", icon: "Droplets", color: "#2563EB", bgColor: "#DBEAFE", description: "Ремонт сантехники, устранение протечек, установка оборудования" },
    { slug: "electrician", name: "Электрик", icon: "Zap", color: "#DC2626", bgColor: "#FEE2E2", description: "Диагностика и ремонт электрики, замена розеток и света" },
    { slug: "cleaning", name: "Клининг", icon: "Sparkles", color: "#D97706", bgColor: "#FEF3C7", description: "Поддерживающая и генеральная уборка квартир и домов" },
    { slug: "snow_cleanup", name: "Уборка снега", icon: "HardHat", color: "#1D4ED8", bgColor: "#E0F2FE", description: "Очистка дворов, дорожек и входных групп от снега" },
    { slug: "minor_repair", name: "Мелкосрочный ремонт", icon: "Hammer", color: "#7C3AED", bgColor: "#EDE9FE", description: "Небольшие бытовые ремонтные работы в квартире и доме" },
    { slug: "loader", name: "Грузчик", icon: "Package", color: "#BE123C", bgColor: "#FFE4E6", description: "Подъём, перенос и погрузка вещей и бытовых грузов" },
    { slug: "grass_mowing", name: "Покос травы", icon: "Recycle", color: "#15803D", bgColor: "#DCFCE7", description: "Покос травы на придомовых участках и территориях" },
    { slug: "courier_tasks", name: "Курьерские поручения", icon: "Bike", color: "#0891B2", bgColor: "#CFFAFE", description: "Мелкие доставки и поручения по городу Тюмень" },
    { slug: "furniture_assembly", name: "Сборка/разборка мебели", icon: "Armchair", color: "#92400E", bgColor: "#FDE68A", description: "Сборка и разборка корпусной и мягкой мебели" },
    { slug: "appliance_repair", name: "Ремонт бытовой техники", icon: "Wrench", color: "#475569", bgColor: "#E2E8F0", description: "Диагностика и ремонт бытовой техники на дому" },
    { slug: "computer_setup", name: "Настройка компьютерной техники", icon: "Monitor", color: "#0369A1", bgColor: "#DBEAFE", description: "Настройка ПК, ноутбуков, роутеров и программ" },
    { slug: "car_snow_cleanup", name: "Очистка авто от снега", icon: "Truck", color: "#1F2937", bgColor: "#E5E7EB", description: "Очистка и откопка автомобиля от снега" },
    { slug: "furniture_dry_cleaning", name: "Химчистка мебели", icon: "Armchair", color: "#6D28D9", bgColor: "#EDE9FE", description: "Химчистка диванов, кресел, стульев и матрасов" },
    { slug: "mosquito_nets", name: "Москитные сетки", icon: "KeyRound", color: "#0E7490", bgColor: "#CFFAFE", description: "Установка и замер москитных сеток" },
  ];

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const existing = await sql`SELECT id, icon FROM service_categories WHERE slug = ${cat.slug}`;
    if (existing.length === 0) {
      const existingByName = await sql`SELECT id FROM service_categories WHERE name = ${cat.name}`;
      if (existingByName.length > 0) {
        await sql`
          UPDATE service_categories
          SET slug = ${cat.slug}, icon = COALESCE(icon, ${cat.icon}), color = COALESCE(color, ${cat.color}),
              bg_color = COALESCE(bg_color, ${cat.bgColor}), description = COALESCE(description, ${cat.description}),
              sort_order = COALESCE(NULLIF(sort_order, 0), ${i})
          WHERE id = ${existingByName[0].id}
        `;
        console.log("[Seed] Updated slug for existing category:", cat.name, "→", cat.slug);
      } else {
        const id = generateUuid();
        console.log("[Seed] Inserting category:", cat.slug, "with id:", id);
        await sql`
          INSERT INTO service_categories (id, name, slug, icon, color, bg_color, description, is_active, sort_order)
          VALUES (${id}::uuid, ${cat.name}, ${cat.slug}, ${cat.icon}, ${cat.color}, ${cat.bgColor}, ${cat.description}, true, ${i})
        `;
      }
    } else if (!existing[0].icon) {
      await sql`
        UPDATE service_categories
        SET icon = ${cat.icon}, color = ${cat.color}, bg_color = ${cat.bgColor},
            description = COALESCE(description, ${cat.description}), sort_order = COALESCE(NULLIF(sort_order, 0), ${i})
        WHERE id = ${existing[0].id}
      `;
      console.log("[Seed] Backfilled visuals for category:", cat.slug);
    }
  }

  const count = await sql`SELECT COUNT(*) as cnt FROM service_categories`;
  console.log("[DB] Service categories seeded, total:", count[0]?.cnt);
}

async function seedTestUsers() {
  const { hashPassword } = await import("./helpers");

  const existingExecutor = await sql`SELECT id FROM users WHERE phone = '89227740775'`;
  if (existingExecutor.length === 0) {
    const passwordHash = hashPassword("12345");
    const id = generateUuid();
    await sql`
      INSERT INTO users (id, first_name, last_name, phone, password_hash, role, city, rating, rating_count, requests_count, completed_count, is_blocked)
      VALUES (${id}::uuid, 'Исполнитель', 'Тест', '89227740775', ${passwordHash}, 'executor', 'Тюмень', ${5.0}, ${0}, ${0}, ${0}, ${false})
    `;

    const allCategories = await sql`SELECT id FROM service_categories`;
    for (const cat of allCategories) {
      await sql`
        INSERT INTO user_category_subscriptions (user_id, category_id)
        VALUES (${id}::uuid, ${cat.id})
        ON CONFLICT DO NOTHING
      `;
    }
    console.log("[Seed] Created executor user 89227740775 with all category subscriptions");
  }

  await sql`UPDATE users SET two_fa_enabled = false WHERE phone = '89227740775'`;
  console.log("[Seed] 2FA disabled for executor 89227740775");

  const existingAdmin = await sql`SELECT id FROM users WHERE phone = '70000000000'`;
  if (existingAdmin.length === 0) {
    const passwordHash = hashPassword("admin12345");
    const id = generateUuid();
    await sql`
      INSERT INTO users (id, first_name, last_name, phone, password_hash, role, city, rating, rating_count, requests_count, completed_count, is_blocked)
      VALUES (${id}::uuid, 'Админ', 'Система', '70000000000', ${passwordHash}, 'admin', 'Тюмень', ${5.0}, ${0}, ${0}, ${0}, ${false})
    `;
    console.log("[Seed] Created admin user 70000000000");
  }

  const existingClient = await sql`SELECT id FROM users WHERE phone = '89044931590'`;
  if (existingClient.length === 0) {
    const passwordHash = hashPassword("12345");
    const id = generateUuid();
    await sql`
      INSERT INTO users (id, first_name, last_name, phone, password_hash, role, city, rating, rating_count, requests_count, completed_count, is_blocked)
      VALUES (${id}::uuid, 'Клиент', 'Тест', '89044931590', ${passwordHash}, 'client', 'Тюмень', ${5.0}, ${0}, ${0}, ${0}, ${false})
    `;

    const addrId = generateUuid();
    await sql`
      INSERT INTO user_addresses (id, user_id, label, full_address, city, street, house, building, apartment, entrance, floor, intercom)
      VALUES (
        ${addrId}::uuid, ${id}::uuid, 'Дом',
        'Тюмень, Краснооктябрьская 14К2, кв. 70, 1 этаж, домофон 35579',
        'Тюмень', 'Краснооктябрьская', '14', 'К2', '70', null, '1', '35579'
      )
    `;
    console.log("[Seed] Created client user 89044931590 with address");
  }

  const existingTestClient = await sql`SELECT id FROM users WHERE phone = '10000000000'`;
  if (existingTestClient.length === 0) {
    const passwordHash = hashPassword("12345");
    const id = generateUuid();
    await sql`
      INSERT INTO users (id, first_name, last_name, phone, email, password_hash, role, city, region, rating, rating_count, requests_count, completed_count, is_blocked, email_verified)
      VALUES (${id}::uuid, 'Тест', 'Клиент', '10000000000', 'testclient@musorka.su', ${passwordHash}, 'client', 'Тюмень', 'Тюменская область', ${5.0}, ${0}, ${0}, ${0}, ${false}, ${true})
    `;
    const addrId = generateUuid();
    await sql`
      INSERT INTO user_addresses (id, user_id, label, full_address, city, street, house)
      VALUES (${addrId}::uuid, ${id}::uuid, 'Дом', 'Тюмень, ул. Тестовая 1', 'Тюмень', 'Тестовая', '1')
    `;
    console.log("[Seed] Created test client user 10000000000");
  }

  const existingTestExecutor = await sql`SELECT id FROM users WHERE phone = '20000000000'`;
  if (existingTestExecutor.length === 0) {
    const passwordHash = hashPassword("12345");
    const id = generateUuid();
    await sql`
      INSERT INTO users (id, first_name, last_name, phone, email, password_hash, role, city, region, rating, rating_count, requests_count, completed_count, is_blocked, email_verified)
      VALUES (${id}::uuid, 'Тест', 'Исполнитель', '20000000000', 'testexecutor@musorka.su', ${passwordHash}, 'executor', 'Тюмень', 'Тюменская область', ${5.0}, ${0}, ${0}, ${0}, ${false}, ${true})
    `;
    const allCategories = await sql`SELECT id FROM service_categories`;
    for (const cat of allCategories) {
      await sql`
        INSERT INTO user_category_subscriptions (user_id, category_id)
        VALUES (${id}::uuid, ${cat.id})
        ON CONFLICT DO NOTHING
      `;
    }
    console.log("[Seed] Created test executor user 20000000000 with all category subscriptions");
  }

  const existingAppleReviewClient = await sql`SELECT id FROM users WHERE phone = '89000000000'`;
  if (existingAppleReviewClient.length === 0) {
    const passwordHash = hashPassword("12345");
    const id = generateUuid();
    await sql`
      INSERT INTO users (id, first_name, last_name, phone, email, password_hash, role, city, region, rating, rating_count, requests_count, completed_count, is_blocked, email_verified, two_fa_enabled)
      VALUES (${id}::uuid, 'Apple', 'Review', '89000000000', 'applereview@musorka.su', ${passwordHash}, 'client', 'Тюмень', 'Тюменская область', ${5.0}, ${0}, ${0}, ${0}, ${false}, ${true}, ${false})
    `;
    const addrId = generateUuid();
    await sql`
      INSERT INTO user_addresses (id, user_id, label, full_address, city, street, house)
      VALUES (${addrId}::uuid, ${id}::uuid, 'Дом', 'Тюмень, ул. Демо 1', 'Тюмень', 'Демо', '1')
    `;
    const allCategories = await sql`SELECT id FROM service_categories`;
    for (const cat of allCategories) {
      await sql`
        INSERT INTO user_category_subscriptions (user_id, category_id)
        VALUES (${id}::uuid, ${cat.id})
        ON CONFLICT DO NOTHING
      `;
    }
    console.log("[Seed] Created Apple review user 89000000000");
  } else {
    await sql`UPDATE users SET two_fa_enabled = false, is_blocked = false WHERE phone = '89000000000'`;
    console.log("[Seed] Reset Apple review user 89000000000 (2FA off, unblocked)");
  }

  const userCount = await sql`SELECT COUNT(*) as cnt FROM users`;
  console.log("[DB] Total users after seed:", userCount[0]?.cnt);
}
