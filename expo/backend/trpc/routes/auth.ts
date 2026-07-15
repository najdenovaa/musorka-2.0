import { z } from "zod";
import { TRPCError } from "../../trpc-vendor";
import { createTRPCRouter, publicProcedure, protectedProcedure, invalidateUserCache } from "../create-context";
import sql from "@/backend/db/index";
import { hashPassword, verifyPassword, generateDeviceKey, generateUuid } from "@/backend/db/helpers";
import { sendVerificationEmail, generateVerificationCode } from "@/backend/email";

const CODE_EXPIRY_MINUTES = 5;
const CODE_RESEND_SECONDS = 60;
const MAX_CODE_ATTEMPTS = 5;

function isTRPCError(err: any): boolean {
  if (!err) return false;
  if (err instanceof TRPCError) return true;
  if (typeof err === 'object' && (err.name === 'TRPCError' || (typeof err.code === 'string' && 'message' in err))) {
    const knownCodes = ['BAD_REQUEST','UNAUTHORIZED','FORBIDDEN','NOT_FOUND','CONFLICT','TOO_MANY_REQUESTS','PRECONDITION_FAILED','PAYLOAD_TOO_LARGE','UNPROCESSABLE_CONTENT','INTERNAL_SERVER_ERROR','TIMEOUT'];
    return knownCodes.includes(err.code);
  }
  return false;
}

function maskEmailForLog(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.indexOf("@");
  if (at <= 0) return "[email]";
  return `${e[0]}***@${e.slice(at + 1)}`;
}

function maskPhoneForLog(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length < 4) return "[phone]";
  return `***${d.slice(-4)}`;
}

function getDemoPhones(): string[] {
  const raw = process.env.DEMO_PHONES || "";
  return raw
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => phoneVariants(p));
}

function isDemoPhone(phone: string | null | undefined): boolean {
  const p = (phone || "").trim();
  if (!p) return false;
  const variants = new Set(phoneVariants(p));
  const demo = new Set(getDemoPhones());
  for (const v of variants) {
    if (demo.has(v)) return true;
  }
  return false;
}

function isDemoUser(user: { phone?: string | null; is_demo?: boolean | null } | null | undefined): boolean {
  if (!user) return false;
  if (user.is_demo === true) return true;
  return isDemoPhone(user.phone);
}

function getDemoEmails(): string[] {
  const raw = process.env.DEMO_EMAILS || "";
  return raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isDemoEmail(email: string | null | undefined): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  return getDemoEmails().includes(e);
}

function getFixedDemoCode(): string {
  const raw = (process.env.DEMO_VERIFICATION_CODE || "123456").trim();
  return /^\d{6}$/.test(raw) ? raw : "123456";
}

function phoneVariants(raw: string): string[] {
  const trimmed = (raw || "").trim();
  const digits = trimmed.replace(/\D/g, "");
  const set = new Set<string>();
  if (trimmed) set.add(trimmed);
  if (digits) set.add(digits);
  if (digits.length === 11) {
    const rest = digits.slice(1);
    set.add("7" + rest);
    set.add("8" + rest);
    set.add("+7" + rest);
  } else if (digits.length === 10) {
    set.add("7" + digits);
    set.add("8" + digits);
    set.add("+7" + digits);
  }
  return Array.from(set);
}

async function findUserByPhone(raw: string): Promise<any | null> {
  const variants = phoneVariants(raw);
  if (variants.length === 0) return null;
  for (const v of variants) {
    try {
      const rows = await sql`SELECT * FROM users WHERE phone = ${v} LIMIT 1`;
      if (rows && rows.length > 0) return rows[0];
    } catch (e: any) {
      console.error("[Auth] findUserByPhone variant failed:", v, e?.message);
    }
  }
  try {
    const digits = (raw || "").replace(/\D/g, "");
    if (digits.length >= 10) {
      const tail = digits.slice(-10);
      const rows = await sql`SELECT * FROM users WHERE RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = ${tail} LIMIT 1`;
      if (rows && rows.length > 0) return rows[0];
    }
  } catch (e: any) {
    console.error("[Auth] findUserByPhone tail fallback failed:", e?.message);
  }
  return null;
}

export const authRouter = createTRPCRouter({
  register: publicProcedure
    .input(
      z.object({
        role: z.enum(["client", "executor"]),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().min(1),
        email: z.string().min(1),
        password: z.string().min(1),
        verificationCode: z.string().length(6),
        city: z.string().optional(),
        region: z.string().optional(),
        addressDetails: z
          .object({
            city: z.string().optional(),
            street: z.string().optional(),
            house: z.string().optional(),
            building: z.string().optional(),
            apartment: z.string().optional(),
            entrance: z.string().optional(),
            floor: z.string().optional(),
            intercom: z.string().optional(),
          })
          .optional(),
        subscribedServiceIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        console.log("[Auth] Register attempt:", maskPhoneForLog(input.phone.trim()), input.role);

        const emailLower = input.email.trim().toLowerCase();
        const [codeRecord] = await sql`
          SELECT * FROM verification_codes
          WHERE email = ${emailLower}
            AND type = 'registration'
            AND used = true
          ORDER BY created_at DESC
          LIMIT 1
        `;

        if (!codeRecord) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 email. \u041a\u043e\u0434 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d." });
        }

        const codeAge = Date.now() - new Date(codeRecord.created_at).getTime();
        if (codeAge > 10 * 60 * 1000) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "\u0412\u0440\u0435\u043c\u044f \u0441\u0435\u0441\u0441\u0438\u0438 \u0438\u0441\u0442\u0435\u043a\u043b\u043e. \u041d\u0430\u0447\u043d\u0438\u0442\u0435 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044e \u0437\u0430\u043d\u043e\u0432\u043e." });
        }

        console.log("[Auth] Registration code verified for:", maskEmailForLog(emailLower));

        const existing = await sql`SELECT id FROM users WHERE phone = ${input.phone.trim()}`;
        if (existing.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "PHONE_EXISTS" });
        }

        const existingEmail = await sql`SELECT id FROM users WHERE LOWER(email) = ${emailLower}`;
        if (existingEmail.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "EMAIL_EXISTS" });
        }

        const passwordHash = hashPassword(input.password);
        const deviceKey = generateDeviceKey();
        const city = (input.addressDetails?.city?.trim() || input.city?.trim() || "");
        const region = input.region?.trim() || "";

        let user: any;
        try {
          const rows = await sql`
            INSERT INTO users (first_name, last_name, phone, email, password_hash, role, city, region, rating, rating_count, requests_count, completed_count, is_blocked, email_verified)
            VALUES (
              ${input.firstName?.trim() || null},
              ${input.lastName?.trim() || null},
              ${input.phone.trim()},
              ${emailLower},
              ${passwordHash},
              ${input.role},
              ${city},
              ${region},
              ${5.0},
              ${0},
              ${0},
              ${0},
              ${false},
              ${true}
            )
            RETURNING *
          `;
          user = rows[0];
        } catch (insErr: any) {
          const msg = String(insErr?.message || '').toLowerCase();
          const detail = String(insErr?.detail || '').toLowerCase();
          if (msg.includes('unique') || detail.includes('phone')) {
            throw new TRPCError({ code: "CONFLICT", message: "PHONE_EXISTS" });
          }
          if (detail.includes('email')) {
            throw new TRPCError({ code: "CONFLICT", message: "EMAIL_EXISTS" });
          }
          console.error('[Auth] INSERT users failed:', insErr?.message, insErr?.detail, insErr?.code);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Не удалось создать пользователя: ${insErr?.message ?? 'db error'}` });
        }

        try {
          await sql`
            INSERT INTO user_devices (user_id, device_key, device_name, platform, is_revoked)
            VALUES (${user.id}, ${deviceKey}, ${'Registered device'}, ${'app'}, ${false})
          `;
        } catch (devErr: any) {
          console.error('[Auth] INSERT user_devices failed:', devErr?.message);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Не удалось создать сессию: ${devErr?.message ?? 'db error'}` });
        }

        if (input.role === "executor" && input.subscribedServiceIds && input.subscribedServiceIds.length > 0) {
          try {
            const cats = await sql`SELECT id, slug FROM service_categories WHERE slug IN ${sql(input.subscribedServiceIds)}`;
            if (cats.length > 0) {
              await Promise.all(cats.map((cat: any) =>
                sql`INSERT INTO user_category_subscriptions (user_id, category_id) VALUES (${user.id}, ${cat.id}) ON CONFLICT DO NOTHING`
              ));
            }
          } catch (subErr: any) {
            console.error('[Auth] Subscribe categories failed (non-fatal):', subErr?.message);
          }
        }

        if (input.addressDetails) {
          const parts = [
            input.addressDetails.city,
            input.addressDetails.street,
            input.addressDetails.house ? `д. ${input.addressDetails.house}` : "",
            input.addressDetails.building ? `корп. ${input.addressDetails.building}` : "",
            input.addressDetails.apartment ? `кв. ${input.addressDetails.apartment}` : "",
            input.addressDetails.entrance ? `подъезд ${input.addressDetails.entrance}` : "",
            input.addressDetails.floor ? `этаж ${input.addressDetails.floor}` : "",
            input.addressDetails.intercom ? `домофон ${input.addressDetails.intercom}` : "",
          ].filter(Boolean);
          const fullAddress = parts.join(", ");

          if (fullAddress) {
            try {
              const addrId = generateUuid();
              await sql`
                INSERT INTO user_addresses (id, user_id, label, full_address, city, street, house, building, apartment, entrance, floor, intercom)
                VALUES (
                  ${addrId}::uuid, ${user.id}, 'Дом', ${fullAddress},
                  ${input.addressDetails.city || null},
                  ${input.addressDetails.street || null},
                  ${input.addressDetails.house || null},
                  ${input.addressDetails.building || null},
                  ${input.addressDetails.apartment || null},
                  ${input.addressDetails.entrance || null},
                  ${input.addressDetails.floor || null},
                  ${input.addressDetails.intercom || null}
                )
              `;
            } catch (addrErr: any) {
              console.error('[Auth] INSERT user_addresses failed (non-fatal):', addrErr?.message);
            }
          }
        }

        const [addresses, subscribedSlugs, portfolioCount] = await Promise.all([
          sql`SELECT * FROM user_addresses WHERE user_id = ${user.id}`,
          getSubscribedSlugs(user.id),
          getPortfolioCount(user.id),
        ]);

        await sql`DELETE FROM verification_codes WHERE email = ${emailLower} AND type = 'registration'`;

        console.log("[Auth] Registered user:", user.id, input.role);
        return {
          user: formatUser(user, addresses, subscribedSlugs, portfolioCount),
          token: deviceKey,
        };
      } catch (err: any) {
        if (isTRPCError(err)) throw err;
        console.error("[Auth] Register error:", err?.message, err?.detail, err?.code, err?.stack);
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('unique') && msg.includes('phone')) {
          throw new TRPCError({ code: "CONFLICT", message: "PHONE_EXISTS" });
        }
        if (msg.includes('unique') && msg.includes('email')) {
          throw new TRPCError({ code: "CONFLICT", message: "EMAIL_EXISTS" });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Не удалось завершить регистрацию: ${err?.message ?? 'unknown'}` });
      }
    }),

  loginByEmail: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const emailLower = input.email.trim().toLowerCase();
        console.log("[Auth] Login by email attempt:", maskEmailForLog(emailLower));
        const [user] = await sql`SELECT * FROM users WHERE LOWER(email) = ${emailLower}`;
        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
        }

        if (user.is_blocked) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Аккаунт заблокирован" });
        }

        if (!user.password_hash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Этот аккаунт использует вход через соцсети. Используйте Google или Яндекс." });
        }

        if (!verifyPassword(input.password, user.password_hash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный пароль" });
        }

        const deviceKey = generateDeviceKey();
        await sql`
          INSERT INTO user_devices (user_id, device_key, device_name, platform, is_revoked)
          VALUES (${user.id}, ${deviceKey}, ${'Login device'}, ${'app'}, ${false})
        `;

        await sql`UPDATE users SET updated_at = NOW() WHERE id = ${user.id}`;

        const [addresses, subscribedSlugs, portfolioCount] = await Promise.all([
          sql`SELECT * FROM user_addresses WHERE user_id = ${user.id}`,
          getSubscribedSlugs(user.id),
          getPortfolioCount(user.id),
        ]);

        console.log("[Auth] Login by email:", user.id, user.role);
        return {
          user: formatUser(user, addresses, subscribedSlugs, portfolioCount),
          token: deviceKey,
        };
      } catch (err) {
        if (isTRPCError(err)) throw err;
        console.error("[Auth] LoginByEmail error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Ошибка при входе" });
      }
    }),

  oauthLogin: publicProcedure
    .input(
      z.object({
        provider: z.enum(["google", "yandex"]),
        providerToken: z.string().min(1),
        email: z.string().email().optional(),
        name: z.string().optional(),
        oauthId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        console.log("[Auth] OAuth login attempt:", input.provider);

        let email = input.email?.trim().toLowerCase() || "";
        let name = input.name || "";
        let oauthId = input.oauthId || "";

        if (input.provider === "google") {
          try {
            const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${input.providerToken}` },
            });
            if (resp.ok) {
              const data = await resp.json();
              email = email || (data.email || "").toLowerCase();
              name = name || [data.family_name, data.given_name].filter(Boolean).join(" ") || data.name || "";
              oauthId = oauthId || data.sub || "";
              console.log("[Auth] Google userinfo:", maskEmailForLog(String(email)), name);
            } else {
              console.error("[Auth] Google userinfo failed:", resp.status);
            }
          } catch (e: any) {
            console.error("[Auth] Google userinfo error:", e?.message);
          }
        } else if (input.provider === "yandex") {
          try {
            const resp = await fetch("https://login.yandex.ru/info?format=json", {
              headers: { Authorization: `OAuth ${input.providerToken}` },
            });
            if (resp.ok) {
              const data = await resp.json();
              email = email || (data.default_email || data.emails?.[0] || "").toLowerCase();
              name = name || [data.last_name, data.first_name].filter(Boolean).join(" ") || data.display_name || data.real_name || "";
              oauthId = oauthId || data.id || "";
              console.log("[Auth] Yandex userinfo:", maskEmailForLog(String(email)), name);
            } else {
              console.error("[Auth] Yandex userinfo failed:", resp.status);
            }
          } catch (e: any) {
            console.error("[Auth] Yandex userinfo error:", e?.message);
          }
        }

        if (!email) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Не удалось получить email от провайдера. Попробуйте другой способ входа." });
        }

        let [user] = await sql`SELECT * FROM users WHERE oauth_provider = ${input.provider} AND oauth_id = ${oauthId}`;

        if (!user && email) {
          [user] = await sql`SELECT * FROM users WHERE LOWER(email) = ${email}`;
          if (user && !user.oauth_provider) {
            await sql`UPDATE users SET oauth_provider = ${input.provider}, oauth_id = ${oauthId}, email_verified = true, updated_at = NOW() WHERE id = ${user.id}`;
            console.log("[Auth] Linked OAuth to existing user:", user.id);
          }
        }

        if (!user) {
          const nameParts = name.split(" ");
          const lastName = nameParts[0] || null;
          const firstName = nameParts.slice(1).join(" ") || null;

          [user] = await sql`
            INSERT INTO users (first_name, last_name, phone, email, password_hash, role, city, rating, rating_count, requests_count, completed_count, is_blocked, oauth_provider, oauth_id, email_verified)
            VALUES (
              ${firstName},
              ${lastName},
              ${''},
              ${email},
              ${null},
              ${'client'},
              ${''},
              ${5.0},
              ${0},
              ${0},
              ${0},
              ${false},
              ${input.provider},
              ${oauthId},
              ${true}
            )
            RETURNING *
          `;
          console.log("[Auth] Created OAuth user:", user.id, input.provider);
        }

        if (user.is_blocked) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Аккаунт заблокирован" });
        }

        const deviceKey = generateDeviceKey();
        await sql`
          INSERT INTO user_devices (user_id, device_key, device_name, platform, is_revoked)
          VALUES (${user.id}, ${deviceKey}, ${input.provider + ' OAuth'}, ${'app'}, ${false})
        `;

        await sql`UPDATE users SET updated_at = NOW() WHERE id = ${user.id}`;

        const [addresses, subscribedSlugs, portfolioCount] = await Promise.all([
          sql`SELECT * FROM user_addresses WHERE user_id = ${user.id}`,
          getSubscribedSlugs(user.id),
          getPortfolioCount(user.id),
        ]);

        console.log("[Auth] OAuth login success:", user.id, input.provider);
        return {
          user: formatUser(user, addresses, subscribedSlugs, portfolioCount),
          token: deviceKey,
          isNewUser: !user.phone,
        };
      } catch (err) {
        if (isTRPCError(err)) throw err;
        console.error("[Auth] OAuth login error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Ошибка OAuth входа" });
      }
    }),

  login: publicProcedure
    .input(
      z.object({
        phone: z.string().min(1),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        console.log("[Auth] Login attempt:", maskPhoneForLog(input.phone.trim()));
        const loginPhoneVariants = phoneVariants(input.phone);
        let user: any = await findUserByPhone(input.phone);

        if (!user) {
          const DEMO_SEEDS: { phone: string; password: string; role: 'client' | 'executor'; firstName: string; lastName: string; email: string }[] = [
            { phone: '89000000000', password: '12345', role: 'client', firstName: 'Apple', lastName: 'Review', email: 'applereview@musorka.su' },
            { phone: '20000000000', password: '12345', role: 'executor', firstName: 'Тест', lastName: 'Исполнитель', email: 'testexecutor@musorka.su' },
            { phone: '10000000000', password: '12345', role: 'client', firstName: 'Тест', lastName: 'Клиент', email: 'testclient@musorka.su' },
          ];
          const matchedSeed = DEMO_SEEDS.find((s) => loginPhoneVariants.includes(s.phone) && s.password === input.password);
          if (matchedSeed) {
            try {
              console.log('[Auth] Self-healing demo user seed:', maskPhoneForLog(matchedSeed.phone));
              const pwdHash = hashPassword(matchedSeed.password);
              const newId = generateUuid();
              await sql`
                INSERT INTO users (id, first_name, last_name, phone, email, password_hash, role, city, region, rating, rating_count, requests_count, completed_count, is_blocked, email_verified, two_fa_enabled)
                VALUES (${newId}::uuid, ${matchedSeed.firstName}, ${matchedSeed.lastName}, ${matchedSeed.phone}, ${matchedSeed.email}, ${pwdHash}, ${matchedSeed.role}, 'Тюмень', 'Тюменская область', ${5.0}, ${0}, ${0}, ${0}, ${false}, ${true}, ${false})
                ON CONFLICT (phone) DO NOTHING
              `;
              try {
                const allCategories = await sql`SELECT id FROM service_categories`;
                for (const cat of allCategories) {
                  await sql`
                    INSERT INTO user_category_subscriptions (user_id, category_id)
                    VALUES (${newId}::uuid, ${cat.id})
                    ON CONFLICT DO NOTHING
                  `;
                }
              } catch (subErr: any) {
                console.log('[Auth] Demo seed subs skipped:', subErr?.message);
              }
              user = await findUserByPhone(input.phone);
            } catch (seedErr: any) {
              console.error('[Auth] Demo self-heal failed:', seedErr?.message);
            }
          }
        }

        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
        }

        if (user.is_blocked) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Аккаунт заблокирован" });
        }

        if (!user.password_hash) {
          console.error("[Auth] User has no password hash:", user.id);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Ошибка данных аккаунта" });
        }

        if (!verifyPassword(input.password, user.password_hash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный пароль" });
        }

        const deviceKey = generateDeviceKey();
        await sql`
          INSERT INTO user_devices (user_id, device_key, device_name, platform, is_revoked)
          VALUES (${user.id}, ${deviceKey}, ${'Login device'}, ${'app'}, ${false})
        `;

        await sql`UPDATE users SET updated_at = NOW() WHERE id = ${user.id}`;

        const [addresses, subscribedSlugs, portfolioCount] = await Promise.all([
          sql`SELECT * FROM user_addresses WHERE user_id = ${user.id}`,
          getSubscribedSlugs(user.id),
          getPortfolioCount(user.id),
        ]);

        console.log("[Auth] Login:", user.id, user.role);
        return {
          user: formatUser(user, addresses, subscribedSlugs, portfolioCount),
          token: deviceKey,
        };
      } catch (err: any) {
        if (isTRPCError(err)) throw err;
        console.error("[Auth] Login UNEXPECTED error:", {
          message: err?.message,
          name: err?.name,
          code: err?.code,
          detail: err?.detail,
          stack: err?.stack?.split('\n').slice(0, 6).join('\n'),
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Ошибка при входе: ${err?.message ?? 'unknown'}` });
      }
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const [[freshUser], addresses, subscribedSlugs, [countsRow], portfolioCount] = await Promise.all([
      sql`SELECT id, first_name, last_name, phone, email, role, city, rating, rating_count,
        requests_count, completed_count, avatar_url, is_blocked, is_demo, about, status_text,
        oauth_provider, email_verified, created_at, updated_at,
        (password_hash IS NOT NULL) AS has_password
        FROM users WHERE id = ${ctx.user.id}`,
      sql`SELECT id, label, full_address, city, street, house, building, apartment, entrance, floor, intercom
        FROM user_addresses WHERE user_id = ${ctx.user.id}`,
      getSubscribedSlugs(ctx.user.id),
      sql`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)::int as completed_cnt,
          COALESCE(SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0)::int as in_progress_cnt
        FROM service_requests
        WHERE executor_id = ${ctx.user.id}::uuid AND status IN ('completed', 'in_progress')
      `,
      getPortfolioCount(ctx.user.id),
    ]);

    const userRow = freshUser || ctx.user;
    const actualCompleted = countsRow?.completed_cnt ?? 0;
    const storedCompleted = userRow.completed_count ?? 0;

    if (actualCompleted !== storedCompleted) {
      sql`UPDATE users SET completed_count = ${actualCompleted} WHERE id = ${ctx.user.id}::uuid`.catch((e: any) =>
        console.error('[Auth] Failed to sync completed_count:', e?.message)
      );
      userRow.completed_count = actualCompleted;
    }

    const result = formatUser(userRow, addresses, subscribedSlugs, portfolioCount);
    result.inProgressCount = countsRow?.in_progress_cnt ?? 0;
    return result;
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        city: z.string().optional(),
        region: z.string().optional(),
        avatar: z.string().optional(),
        about: z.string().optional(),
        statusText: z.string().optional(),
        subscribedServiceIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.subscribedServiceIds !== undefined) {
        await sql`DELETE FROM user_category_subscriptions WHERE user_id = ${ctx.user.id}`;
        if (input.subscribedServiceIds.length > 0) {
          const cats = await sql`SELECT id, slug FROM service_categories WHERE slug IN ${sql(input.subscribedServiceIds)}`;
          if (cats.length > 0) {
            await Promise.all(cats.map((cat: any) =>
              sql`INSERT INTO user_category_subscriptions (user_id, category_id) VALUES (${ctx.user.id}, ${cat.id}) ON CONFLICT DO NOTHING`
            ));
          }
        }
      }

      if (input.phone) {
        const phoneExists = await sql`SELECT id FROM users WHERE phone = ${input.phone.trim()} AND id != ${ctx.user.id}`;
        if (phoneExists.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Этот номер телефона уже используется" });
        }
      }

      await sql`
        UPDATE users SET
          first_name = COALESCE(${input.firstName ?? null}, first_name),
          last_name = COALESCE(${input.lastName ?? null}, last_name),
          phone = COALESCE(${input.phone?.trim() ?? null}, phone),
          email = COALESCE(${input.email ?? null}, email),
          city = COALESCE(${input.city?.trim() ?? null}, city),
          region = COALESCE(${input.region?.trim() ?? null}, region),
          avatar_url = COALESCE(${input.avatar ?? null}, avatar_url),
          about = COALESCE(${input.about ?? null}, about),
          status_text = COALESCE(${input.statusText ?? null}, status_text),
          updated_at = NOW()
        WHERE id = ${ctx.user.id}
      `;

      const [[updated], addresses, subscribedSlugs, portfolioCount] = await Promise.all([
        sql`SELECT * FROM users WHERE id = ${ctx.user.id}`,
        sql`SELECT * FROM user_addresses WHERE user_id = ${ctx.user.id}`,
        getSubscribedSlugs(ctx.user.id),
        getPortfolioCount(ctx.user.id),
      ]);
      if (ctx.token) invalidateUserCache(ctx.token);
      return formatUser(updated, addresses, subscribedSlugs, portfolioCount);
    }),

  addAddress: protectedProcedure
    .input(
      z.object({
        label: z.string().optional(),
        fullAddress: z.string().optional(),
        city: z.string().optional(),
        street: z.string().optional(),
        house: z.string().optional(),
        building: z.string().optional(),
        apartment: z.string().optional(),
        entrance: z.string().optional(),
        floor: z.string().optional(),
        intercom: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [addr] = await sql`
        INSERT INTO user_addresses (user_id, label, full_address, city, street, house, building, apartment, entrance, floor, intercom)
        VALUES (
          ${ctx.user.id},
          ${input.label || "Дом"},
          ${input.fullAddress || ""},
          ${input.city || null},
          ${input.street || null},
          ${input.house || null},
          ${input.building || null},
          ${input.apartment || null},
          ${input.entrance || null},
          ${input.floor || null},
          ${input.intercom || null}
        )
        RETURNING *
      `;
      return formatAddress(addr);
    }),

  removeAddress: protectedProcedure
    .input(z.object({ addressId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await sql`DELETE FROM user_addresses WHERE id = ${input.addressId}::uuid AND user_id = ${ctx.user.id}`;
      return { success: true };
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.token) {
      await sql`UPDATE user_devices SET is_revoked = true WHERE device_key = ${ctx.token} AND user_id = ${ctx.user.id}`;
      invalidateUserCache(ctx.token);
    }
    const bioRows = await sql`
      SELECT device_key FROM user_devices
      WHERE user_id = ${ctx.user.id} AND is_revoked = false AND COALESCE(is_biometric_unlock, false) = true
    `;
    for (const row of bioRows as unknown as { device_key: string }[]) {
      invalidateUserCache(row.device_key);
    }
    await sql`
      UPDATE user_devices SET is_revoked = true
      WHERE user_id = ${ctx.user.id} AND COALESCE(is_biometric_unlock, false) = true
    `;
    console.log("[Auth] Logout:", ctx.user.id);
    return { success: true };
  }),

  registerBiometricUnlock: protectedProcedure
    .input(z.object({ currentPassword: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [userRow] = await sql`SELECT id, password_hash FROM users WHERE id = ${ctx.user.id}`;
      if (!userRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
      }
      if (userRow.password_hash) {
        const pwd = input.currentPassword?.trim() ?? "";
        if (!pwd || !verifyPassword(pwd, userRow.password_hash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный пароль" });
        }
      }

      const existingBio = await sql`
        SELECT device_key FROM user_devices
        WHERE user_id = ${ctx.user.id} AND is_revoked = false AND COALESCE(is_biometric_unlock, false) = true
      `;
      for (const row of existingBio as unknown as { device_key: string }[]) {
        invalidateUserCache(row.device_key);
      }
      await sql`
        UPDATE user_devices SET is_revoked = true
        WHERE user_id = ${ctx.user.id} AND COALESCE(is_biometric_unlock, false) = true
      `;

      const unlockKey = generateDeviceKey();
      await sql`
        INSERT INTO user_devices (user_id, device_key, device_name, platform, is_revoked, is_biometric_unlock)
        VALUES (${ctx.user.id}, ${unlockKey}, ${"Biometric unlock"}, ${"app"}, ${false}, ${true})
      `;
      return { unlockToken: unlockKey };
    }),

  loginWithBiometricUnlock: publicProcedure
    .input(z.object({ unlockToken: z.string().min(16) }))
    .mutation(async ({ input }) => {
      try {
        const rows = await sql`
          SELECT u.* FROM users u
          INNER JOIN user_devices ud ON ud.user_id = u.id
          WHERE ud.device_key = ${input.unlockToken}
            AND ud.is_revoked = false
            AND COALESCE(ud.is_biometric_unlock, false) = true
            AND u.is_blocked = false
        `;
        const user = rows[0] as Record<string, any> | undefined;
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Быстрый вход недоступен. Войдите с паролем." });
        }

        await sql`UPDATE user_devices SET is_revoked = true WHERE device_key = ${input.unlockToken}`;
        invalidateUserCache(input.unlockToken);

        const sessionKey = generateDeviceKey();
        await sql`
          INSERT INTO user_devices (user_id, device_key, device_name, platform, is_revoked, is_biometric_unlock)
          VALUES (${user.id}, ${sessionKey}, ${"Biometric session"}, ${"app"}, ${false}, ${false})
        `;

        const nextUnlockKey = generateDeviceKey();
        await sql`
          INSERT INTO user_devices (user_id, device_key, device_name, platform, is_revoked, is_biometric_unlock)
          VALUES (${user.id}, ${nextUnlockKey}, ${"Biometric unlock"}, ${"app"}, ${false}, ${true})
        `;

        const [addresses, subscribedSlugs, portfolioCount] = await Promise.all([
          sql`SELECT * FROM user_addresses WHERE user_id = ${user.id}`,
          getSubscribedSlugs(user.id),
          getPortfolioCount(user.id),
        ]);

        await sql`UPDATE users SET updated_at = NOW() WHERE id = ${user.id}`;

        return {
          user: formatUser(user, addresses, subscribedSlugs, portfolioCount),
          token: sessionKey,
          nextUnlockToken: nextUnlockKey,
        };
      } catch (err) {
        if (isTRPCError(err)) throw err;
        console.error("[Auth] loginWithBiometricUnlock error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Ошибка быстрого входа" });
      }
    }),

  sendVerificationCode: publicProcedure
    .input(z.object({
      email: z.string().email(),
      type: z.enum(["email_verify", "password_reset", "registration", "login"]).default("email_verify"),
    }))
    .mutation(async ({ input }) => {
      try {
        const emailLower = input.email.trim().toLowerCase();
        console.log("[Auth] sendVerificationCode:", maskEmailForLog(emailLower), input.type);

        if (input.type === 'password_reset') {
          const [existingUser] = await sql`SELECT id FROM users WHERE LOWER(email) = ${emailLower}`;
          if (!existingUser) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Аккаунт с таким email не найден. Проверьте правильность адреса." });
          }
        }

        if (input.type === 'login') {
          const [existingUser] = await sql`SELECT id FROM users WHERE LOWER(email) = ${emailLower}`;
          if (!existingUser) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Аккаунт с таким email не найден." });
          }
        }

        if (input.type === 'registration') {
          const [existingUser] = await sql`SELECT id FROM users WHERE LOWER(email) = ${emailLower}`;
          if (existingUser) {
            throw new TRPCError({ code: "CONFLICT", message: "Пользователь с таким email уже зарегистрирован." });
          }
        }

        const recent = await sql`
          SELECT created_at FROM verification_codes
          WHERE email = ${emailLower} AND type = ${input.type}
          ORDER BY created_at DESC LIMIT 1
        `;
        if (recent.length > 0) {
          const lastSent = new Date(recent[0].created_at).getTime();
          const now = Date.now();
          if (now - lastSent < CODE_RESEND_SECONDS * 1000) {
            const waitSec = Math.ceil((CODE_RESEND_SECONDS * 1000 - (now - lastSent)) / 1000);
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `Подождите ${waitSec} сек. перед повторной отправкой`,
            });
          }
        }

        const demoEmail = isDemoEmail(emailLower);
        const code = demoEmail ? getFixedDemoCode() : generateVerificationCode();
        const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

        await sql`DELETE FROM verification_codes WHERE email = ${emailLower} AND type = ${input.type}`;

        await sql`
          INSERT INTO verification_codes (email, code, type, attempts, used, expires_at)
          VALUES (${emailLower}, ${code}, ${input.type}, ${0}, ${false}, ${expiresAt})
        `;

        if (!demoEmail) {
          const sent = await sendVerificationEmail(emailLower, code);
          if (!sent) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось отправить письмо. Попробуйте позже." });
          }
        } else {
          console.log("[Auth] Demo email detected, skipping send and using fixed code for:", maskEmailForLog(emailLower));
        }

        console.log("[Auth] Verification code sent to:", maskEmailForLog(emailLower));
        return { success: true, message: "Код отправлен на email" };
      } catch (err) {
        if (isTRPCError(err)) throw err;
        console.error("[Auth] sendVerificationCode error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Ошибка отправки кода" });
      }
    }),

  verifyCode: publicProcedure
    .input(z.object({
      email: z.string().email(),
      code: z.string().length(6),
      type: z.enum(["email_verify", "password_reset", "registration", "login"]).default("email_verify"),
    }))
    .mutation(async ({ input }) => {
      try {
        const emailLower = input.email.trim().toLowerCase();
        console.log("[Auth] verifyCode:", maskEmailForLog(emailLower), input.type);

        const inputCode = String(input.code || "").trim();

        const matchingRows = await sql`
          SELECT * FROM verification_codes
          WHERE email = ${emailLower}
            AND type = ${input.type}
            AND used = false
            AND code = ${inputCode}
          ORDER BY created_at DESC
          LIMIT 1
        `;

        let codeRecord = matchingRows[0];

        if (!codeRecord) {
          const [latest] = await sql`
            SELECT * FROM verification_codes
            WHERE email = ${emailLower}
              AND type = ${input.type}
              AND used = false
            ORDER BY created_at DESC
            LIMIT 1
          `;

          if (!latest) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Код не найден. Запросите новый." });
          }

          if (new Date(latest.expires_at).getTime() < Date.now()) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Код истёк. Запросите новый." });
          }

          if (latest.attempts >= MAX_CODE_ATTEMPTS) {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Превышено количество попыток. Запросите новый код." });
          }

          await sql`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ${latest.id}`;
          throw new TRPCError({ code: "BAD_REQUEST", message: "Неверный код" });
        }

        if (new Date(codeRecord.expires_at).getTime() < Date.now()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Код истёк. Запросите новый." });
        }

        if (codeRecord.attempts >= MAX_CODE_ATTEMPTS) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Превышено количество попыток. Запросите новый код." });
        }

        await sql`UPDATE verification_codes SET used = true WHERE id = ${codeRecord.id}`;

        if (input.type === "email_verify") {
          await sql`UPDATE users SET email_verified = true WHERE LOWER(email) = ${emailLower}`;
        }

        if (input.type === "registration") {
          console.log("[Auth] Registration code verified for:", maskEmailForLog(emailLower));
        }

        console.log("[Auth] Code verified for:", maskEmailForLog(emailLower), input.type);
        return { success: true, verified: true };
      } catch (err) {
        if (isTRPCError(err)) throw err;
        console.error("[Auth] verifyCode error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Ошибка проверки кода" });
      }
    }),

  loginSendCode: publicProcedure
    .input(
      z.object({
        method: z.enum(["phone", "email"]),
        phone: z.string().optional(),
        email: z.string().optional(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      let stage: string = 'init';
      try {
        let user: any;
        if (input.method === "email") {
          stage = 'lookup_email';
          const emailLower = (input.email || "").trim().toLowerCase();
          console.log("[Auth] loginSendCode by email:", maskEmailForLog(emailLower));
          if (!emailLower) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Укажите email" });
          }
          [user] = await sql`SELECT * FROM users WHERE LOWER(email) = ${emailLower}`;
          if (!user) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
          }
        } else {
          stage = 'lookup_phone';
          const phone = (input.phone || "").trim();
          console.log("[Auth] loginSendCode by phone:", maskPhoneForLog(phone));
          if (!phone) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Укажите телефон" });
          }
          user = await findUserByPhone(phone);
          if (!user) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
          }
        }

        stage = 'check_blocked';
        if (user.is_blocked) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Аккаунт заблокирован" });
        }

        stage = 'check_password';
        if (!user.password_hash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Этот аккаунт использует вход через соцсети." });
        }

        if (!verifyPassword(input.password, user.password_hash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный пароль" });
        }

        stage = 'resolve_2fa';
        const rawTwoFa = user.two_fa_enabled;
        const twoFaDisabled = rawTwoFa === false || rawTwoFa === 0 || rawTwoFa === 'f' || rawTwoFa === 'false' || rawTwoFa === null || rawTwoFa === undefined;
        const twoFaEnabled = !twoFaDisabled;
        const TEST_PHONES_NO_2FA = ['10000000000', '20000000000', '89000000000'];
        const userPhone = (user.phone || "").trim();
        const demoBypass = isDemoUser(user);
        const isPhoneLogin = input.method === "phone";
        console.log("[Auth] loginSendCode resolved user:", {
          userId: user.id,
          phone: maskPhoneForLog(userPhone),
          email: maskEmailForLog(user.email || ""),
          twoFaRaw: rawTwoFa,
          twoFaEnabled,
          isPhoneLogin,
          demoBypass,
        });
        if (!twoFaEnabled || TEST_PHONES_NO_2FA.includes(userPhone) || demoBypass) {
          stage = 'direct_login';
          console.log("[Auth] 2FA bypassed for:", maskPhoneForLog(userPhone), "two_fa_enabled raw:", rawTwoFa, "resolved:", twoFaEnabled, "phoneLogin:", isPhoneLogin);
          const deviceKey = generateDeviceKey();
          stage = 'direct_login_insert_device';
          await sql`
            INSERT INTO user_devices (user_id, device_key, device_name, platform, is_revoked)
            VALUES (${user.id}, ${deviceKey}, ${'Test login'}, ${'app'}, ${false})
          `;
          stage = 'direct_login_update_user';
          await sql`UPDATE users SET updated_at = NOW() WHERE id = ${user.id}`;
          stage = 'direct_login_fetch_extras';
          const [addresses, subscribedSlugs, portfolioCount] = await Promise.all([
            sql`SELECT * FROM user_addresses WHERE user_id = ${user.id}`,
            getSubscribedSlugs(user.id),
            getPortfolioCount(user.id),
          ]);
          stage = 'direct_login_format';
          return {
            success: true,
            verified: true,
            directLogin: true,
            user: formatUser(user, addresses, subscribedSlugs, portfolioCount),
            token: deviceKey,
          };
        }

        stage = 'check_email_for_2fa';
        const userEmail = (user.email || "").toLowerCase().trim();
        if (!userEmail) {
          console.error("[Auth] loginSendCode: user has no email, cannot send 2FA code. userId:", user.id, "method:", input.method);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: isPhoneLogin
              ? "У аккаунта не указан email, на который можно отправить код. Войдите по email или отключите двухфакторную защиту через поддержку."
              : "У аккаунта не указан email. Обратитесь в поддержку.",
          });
        }

        stage = 'check_recent_code';
        const recent = await sql`
          SELECT created_at FROM verification_codes
          WHERE email = ${userEmail} AND type = 'login'
          ORDER BY created_at DESC LIMIT 1
        `;
        if (recent.length > 0) {
          const lastSent = new Date(recent[0].created_at).getTime();
          const now = Date.now();
          if (now - lastSent < CODE_RESEND_SECONDS * 1000) {
            const waitSec = Math.ceil((CODE_RESEND_SECONDS * 1000 - (now - lastSent)) / 1000);
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `Подождите ${waitSec} сек. перед повторной отправкой`,
            });
          }
        }

        stage = 'generate_code';
        const demoEmail = isDemoEmail(userEmail);
        const code = demoEmail ? getFixedDemoCode() : generateVerificationCode();
        const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

        stage = 'insert_code';
        try {
          await sql`
            INSERT INTO verification_codes (email, code, type, attempts, used, expires_at)
            VALUES (${userEmail}, ${code}, ${'login'}, ${0}, ${false}, ${expiresAt})
          `;
        } catch (insErr: any) {
          console.error("[Auth] loginSendCode: failed to insert verification code:", insErr?.message, insErr?.detail);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Не удалось сохранить код: ${insErr?.message || 'db error'}` });
        }

        if (!demoEmail) {
          stage = 'send_email';
          console.log("[Auth] loginSendCode: sending email to", maskEmailForLog(userEmail), "for method:", input.method);
          const sent = await sendVerificationEmail(userEmail, code);
          if (!sent) {
            console.error("[Auth] loginSendCode: sendVerificationEmail returned false for", maskEmailForLog(userEmail));
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "SMTP не смог отправить письмо. Проверьте email в профиле или обратитесь в поддержку." });
          }
        } else {
          console.log("[Auth] Demo email detected, skipping login email send for:", maskEmailForLog(userEmail));
        }

        stage = 'respond';
        const maskedEmail = userEmail.replace(/^(.{2})(.*)(@.*)$/, (_m: string, a: string, b: string, c: string) => a + b.replace(/./g, '*') + c);
        console.log("[Auth] Login verification code sent to:", maskEmailForLog(userEmail), "method:", input.method);
        return { success: true, verified: false, email: maskedEmail, userId: user.id };
      } catch (err: any) {
        if (isTRPCError(err)) throw err;
        const rawMsg = (err && (err.message || err.toString?.())) || 'unknown';
        const errName = err?.name || 'Error';
        const errCode = err?.code || '';
        console.error("[Auth] loginSendCode UNEXPECTED error at stage", stage, ":", {
          message: err?.message,
          name: errName,
          code: errCode,
          detail: err?.detail,
          hint: err?.hint,
          position: err?.position,
          stack: err?.stack?.split('\n').slice(0, 6).join('\n'),
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Ошибка отправки кода [${stage}] ${errName}${errCode ? '/' + errCode : ''}: ${rawMsg}` });
      }
    }),

  loginVerifyComplete: publicProcedure
    .input(
      z.object({
        method: z.enum(["phone", "email"]),
        phone: z.string().optional(),
        email: z.string().optional(),
        password: z.string().min(1),
        code: z.string().length(6),
      })
    )
    .mutation(async ({ input }) => {
      try {
        let user: any;
        if (input.method === "email") {
          const emailLower = (input.email || "").trim().toLowerCase();
          [user] = await sql`SELECT * FROM users WHERE LOWER(email) = ${emailLower}`;
        } else {
          const phone = (input.phone || "").trim();
          user = await findUserByPhone(phone);
        }

        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
        }
        if (user.is_blocked) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Аккаунт заблокирован" });
        }
        if (!user.password_hash || !verifyPassword(input.password, user.password_hash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный пароль" });
        }

        const userEmail = (user.email || "").toLowerCase();
        const [codeRecord] = await sql`
          SELECT * FROM verification_codes
          WHERE email = ${userEmail}
            AND type = 'login'
            AND used = false
          ORDER BY created_at DESC
          LIMIT 1
        `;

        if (!codeRecord) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Код не найден. Запросите новый." });
        }
        if (new Date(codeRecord.expires_at).getTime() < Date.now()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Код истёк. Запросите новый." });
        }
        if (codeRecord.attempts >= MAX_CODE_ATTEMPTS) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Превышено количество попыток. Запросите новый код." });
        }
        if (codeRecord.code !== input.code) {
          await sql`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ${codeRecord.id}`;
          throw new TRPCError({ code: "BAD_REQUEST", message: "Неверный код" });
        }

        await sql`UPDATE verification_codes SET used = true WHERE id = ${codeRecord.id}`;
        await sql`DELETE FROM verification_codes WHERE email = ${userEmail} AND type = 'login' AND id != ${codeRecord.id}`;

        const deviceKey = generateDeviceKey();
        await sql`
          INSERT INTO user_devices (user_id, device_key, device_name, platform, is_revoked)
          VALUES (${user.id}, ${deviceKey}, ${'Login device'}, ${'app'}, ${false})
        `;
        await sql`UPDATE users SET updated_at = NOW() WHERE id = ${user.id}`;

        const [addresses, subscribedSlugs, portfolioCount] = await Promise.all([
          sql`SELECT * FROM user_addresses WHERE user_id = ${user.id}`,
          getSubscribedSlugs(user.id),
          getPortfolioCount(user.id),
        ]);

        console.log("[Auth] Login verified and completed:", user.id, user.role);
        return {
          user: formatUser(user, addresses, subscribedSlugs, portfolioCount),
          token: deviceKey,
        };
      } catch (err: any) {
        if (isTRPCError(err)) throw err;
        console.error("[Auth] loginVerifyComplete UNEXPECTED error:", {
          message: err?.message,
          name: err?.name,
          code: err?.code,
          detail: err?.detail,
          stack: err?.stack?.split('\n').slice(0, 6).join('\n'),
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Ошибка при входе: ${err?.message ?? 'unknown'}` });
      }
    }),

  resetPassword: publicProcedure
    .input(z.object({
      email: z.string().email(),
      code: z.string().length(6),
      newPassword: z.string().min(4),
    }))
    .mutation(async ({ input }) => {
      try {
        const emailLower = input.email.trim().toLowerCase();
        console.log("[Auth] resetPassword for:", maskEmailForLog(emailLower));

        const [codeRecord] = await sql`
          SELECT * FROM verification_codes
          WHERE email = ${emailLower}
            AND type = 'password_reset'
            AND used = true
          ORDER BY created_at DESC
          LIMIT 1
        `;

        if (!codeRecord) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Сначала подтвердите код" });
        }

        const codeAge = Date.now() - new Date(codeRecord.created_at).getTime();
        if (codeAge > 10 * 60 * 1000) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Время сессии истекло. Начните заново." });
        }

        const [user] = await sql`SELECT id FROM users WHERE LOWER(email) = ${emailLower}`;
        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
        }

        const newHash = hashPassword(input.newPassword);
        await sql`UPDATE users SET password_hash = ${newHash}, updated_at = NOW() WHERE id = ${user.id}`;

        await sql`DELETE FROM verification_codes WHERE email = ${emailLower} AND type = 'password_reset'`;

        console.log("[Auth] Password reset successful for:", maskEmailForLog(emailLower));
        return { success: true, message: "Пароль успешно изменён" };
      } catch (err) {
        if (isTRPCError(err)) throw err;
        console.error("[Auth] resetPassword error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Ошибка смены пароля" });
      }
    }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(4),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [userRow] = await sql`SELECT id, password_hash FROM users WHERE id = ${ctx.user.id}`;
        if (!userRow) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
        }
        if (!userRow.password_hash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "У этого аккаунта нет пароля (OAuth аккаунт)" });
        }
        if (!verifyPassword(input.currentPassword, userRow.password_hash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный текущий пароль" });
        }
        const newHash = hashPassword(input.newPassword);
        await sql`UPDATE users SET password_hash = ${newHash}, updated_at = NOW() WHERE id = ${ctx.user.id}`;
        console.log("[Auth] Password changed for user:", ctx.user.id);
        return { success: true, message: "Пароль успешно изменён" };
      } catch (err) {
        if (isTRPCError(err)) throw err;
        console.error("[Auth] changePassword error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Ошибка смены пароля" });
      }
    }),

  updateAddress: protectedProcedure
    .input(z.object({
      addressId: z.string(),
      label: z.string().optional(),
      fullAddress: z.string().optional(),
      city: z.string().optional(),
      street: z.string().optional(),
      house: z.string().optional(),
      building: z.string().optional(),
      apartment: z.string().optional(),
      entrance: z.string().optional(),
      floor: z.string().optional(),
      intercom: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await sql`SELECT id FROM user_addresses WHERE id = ${input.addressId}::uuid AND user_id = ${ctx.user.id}`;
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Адрес не найден" });
      }
      await sql`
        UPDATE user_addresses SET
          label = COALESCE(${input.label ?? null}, label),
          full_address = COALESCE(${input.fullAddress ?? null}, full_address),
          city = COALESCE(${input.city ?? null}, city),
          street = COALESCE(${input.street ?? null}, street),
          house = COALESCE(${input.house ?? null}, house),
          building = COALESCE(${input.building ?? null}, building),
          apartment = COALESCE(${input.apartment ?? null}, apartment),
          entrance = COALESCE(${input.entrance ?? null}, entrance),
          floor = COALESCE(${input.floor ?? null}, floor),
          intercom = COALESCE(${input.intercom ?? null}, intercom)
        WHERE id = ${input.addressId}::uuid AND user_id = ${ctx.user.id}
      `;
      const [updated] = await sql`SELECT * FROM user_addresses WHERE id = ${input.addressId}::uuid`;
      return formatAddress(updated);
    }),

  registerPushToken: protectedProcedure
    .input(z.object({ token: z.string(), platform: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await sql`
        INSERT INTO push_tokens (user_id, token, platform)
        VALUES (${ctx.user.id}, ${input.token}, ${input.platform || null})
        ON CONFLICT (token) DO UPDATE SET user_id = ${ctx.user.id}
      `;
      console.log('[Auth] Push token registered for user:', ctx.user.id, 'platform:', input.platform);
      return { success: true };
    }),

  unregisterPushToken: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await sql`
        DELETE FROM push_tokens WHERE token = ${input.token} AND user_id = ${ctx.user.id}
      `;
      console.log('[Auth] Push token unregistered for user:', ctx.user.id);
      return { success: true };
    }),

  addPortfolioPhoto: protectedProcedure
    .input(z.object({ photoUrl: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [photo] = await sql`
        INSERT INTO executor_portfolio_photos (user_id, photo_url, sort_order)
        VALUES (${ctx.user.id}, ${input.photoUrl}, (
          SELECT COALESCE(MAX(sort_order), 0) + 1 FROM executor_portfolio_photos WHERE user_id = ${ctx.user.id}
        ))
        RETURNING *
      `;
      console.log('[Auth] Portfolio photo added for user:', ctx.user.id);
      return { id: photo.id, photoUrl: photo.photo_url, sortOrder: photo.sort_order };
    }),

  removePortfolioPhoto: protectedProcedure
    .input(z.object({ photoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await sql`DELETE FROM executor_portfolio_photos WHERE id = ${input.photoId}::uuid AND user_id = ${ctx.user.id}`;
      console.log('[Auth] Portfolio photo removed:', input.photoId);
      return { success: true };
    }),

  getPortfolioPhotos: protectedProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const targetId = input?.userId || ctx.user.id;
      const photos = await sql`
        SELECT id, photo_url, sort_order FROM executor_portfolio_photos
        WHERE user_id = ${targetId}::uuid
        ORDER BY sort_order ASC
      `;
      return photos.map((p: any) => ({ id: p.id, photoUrl: p.photo_url, sortOrder: p.sort_order }));
    }),

  deleteAccount: protectedProcedure
    .input(z.object({ confirmPassword: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        console.log("[Auth] deleteAccount requested by:", ctx.user.id, ctx.user.role);
        const [userRow] = await sql`SELECT id, password_hash, role FROM users WHERE id = ${ctx.user.id}`;
        if (!userRow) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
        }
        if (userRow.role === 'admin') {
          throw new TRPCError({ code: "FORBIDDEN", message: "Администратор не может удалить свой аккаунт через приложение" });
        }
        if (userRow.password_hash && input.confirmPassword) {
          if (!verifyPassword(input.confirmPassword, userRow.password_hash)) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный пароль" });
          }
        }
        await sql`DELETE FROM users WHERE id = ${ctx.user.id}`;
        if (ctx.token) invalidateUserCache(ctx.token);
        console.log("[Auth] Account deleted:", ctx.user.id);
        return { success: true };
      } catch (err) {
        if (isTRPCError(err)) throw err;
        console.error("[Auth] deleteAccount error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось удалить аккаунт" });
      }
    }),

  publicProfile: protectedProcedure
    .input(z.object({
      userId: z.string(),
      requestId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      console.log('[Auth] publicProfile for userId:', input.userId);

      const queries: Promise<any>[] = [
        sql`
          SELECT id, first_name, last_name, avatar_url, rating, rating_count,
            requests_count, completed_count, role, city, about, status_text, phone, created_at
          FROM users WHERE id = ${input.userId}::uuid
        `,
        sql`
          SELECT id, photo_url, sort_order FROM executor_portfolio_photos
          WHERE user_id = ${input.userId}::uuid
          ORDER BY sort_order ASC
          LIMIT 20
        `,
        sql`
          SELECT r.rating, r.text, r.created_at,
            u.first_name as author_first_name, u.last_name as author_last_name,
            u.avatar_url as author_avatar, u.role as author_role
          FROM reviews r
          INNER JOIN users u ON u.id = r.author_id
          WHERE r.target_id = ${input.userId}::uuid
          ORDER BY r.created_at DESC
          LIMIT 50
        `,
      ];

      if (input.requestId) {
        queries.push(
          sql`
            SELECT client_id, executor_id, status FROM service_requests
            WHERE id = ${input.requestId}::uuid
          `
        );
      }

      const results = await Promise.all(queries);
      const userRows = results[0];
      const portfolioPhotos = results[1];
      const reviews = results[2];
      const requestRows = input.requestId ? results[3] : [];

      const user = userRows[0];
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });

      const firstName = user.first_name || '';
      const lastName = user.last_name || '';
      const name = [lastName, firstName].filter(Boolean).join(' ') || 'Пользователь';
      const hasAbout = !!user.about && user.about.trim().length > 0;
      const hasAvatar = !!user.avatar_url;
      const hasPortfolio = portfolioPhotos.length > 0;
      const hasName = !!firstName && !!lastName;

      let canSeePhone = false;
      if (input.requestId && requestRows.length > 0) {
        const request = requestRows[0];
        const isAccepted = request.status === 'in_progress' || request.status === 'completed';
        const isParticipant = String(request.client_id) === String(ctx.user.id) || String(request.executor_id) === String(ctx.user.id);
        canSeePhone = isAccepted && isParticipant;
      }

      const isFullyVerified = user.role === 'executor' && hasAbout && hasAvatar && hasPortfolio && hasName;

      return {
        id: user.id,
        name,
        avatar: user.avatar_url || null,
        role: user.role,
        city: user.city || null,
        about: user.about || null,
        statusText: user.status_text || null,
        rating: user.rating != null ? Number(user.rating) : null,
        ratingCount: user.rating_count ? Number(user.rating_count) : 0,
        requestsCount: user.requests_count ? Number(user.requests_count) : 0,
        completedCount: user.completed_count ? Number(user.completed_count) : 0,
        isFullyVerified,
        createdAt: user.created_at,
        phone: canSeePhone ? (user.phone || null) : null,
        canSeePhone,
        portfolio: portfolioPhotos.map((p: any) => ({ id: p.id, photoUrl: p.photo_url, sortOrder: p.sort_order })),
        reviews: reviews.map((r: any) => ({
          rating: Number(r.rating),
          text: r.text || null,
          createdAt: r.created_at,
          authorName: [r.author_last_name, r.author_first_name].filter(Boolean).join(' ') || 'Пользователь',
          authorAvatar: r.author_avatar || null,
          authorRole: r.author_role,
        })),
      };
    }),
  toggle2FA: protectedProcedure
    .input(z.object({
      enabled: z.boolean(),
      verificationCode: z.string().length(6).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [userRow] = await sql`SELECT id, email, two_fa_enabled FROM users WHERE id = ${ctx.user.id}`;
        if (!userRow) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
        }

        if (!input.enabled) {
          if (!input.verificationCode) {
            const userEmail = (userRow.email || "").toLowerCase();
            if (!userEmail) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "У аккаунта не указан email" });
            }
            const demoEmail = isDemoEmail(userEmail);
            const code = demoEmail ? getFixedDemoCode() : generateVerificationCode();
            const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
            await sql`
              INSERT INTO verification_codes (email, code, type, attempts, used, expires_at)
              VALUES (${userEmail}, ${code}, ${'disable_2fa'}, ${0}, ${false}, ${expiresAt})
            `;
            if (!demoEmail) {
              const sent = await sendVerificationEmail(userEmail, code);
              if (!sent) {
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось отправить код" });
              }
            }
            const maskedEmail = userEmail.replace(/^(.{2})(.*)(@.*)$/, (_m: string, a: string, b: string, c: string) => a + b.replace(/./g, '*') + c);
            return { needsVerification: true, email: maskedEmail };
          }

          const userEmail = (userRow.email || "").toLowerCase();
          const [codeRecord] = await sql`
            SELECT * FROM verification_codes
            WHERE email = ${userEmail} AND type = 'disable_2fa' AND used = false
            ORDER BY created_at DESC LIMIT 1
          `;
          if (!codeRecord) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Код не найден. Запросите новый." });
          }
          if (new Date(codeRecord.expires_at).getTime() < Date.now()) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Код истёк" });
          }
          if (codeRecord.code !== input.verificationCode) {
            await sql`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ${codeRecord.id}`;
            throw new TRPCError({ code: "BAD_REQUEST", message: "Неверный код" });
          }
          await sql`UPDATE verification_codes SET used = true WHERE id = ${codeRecord.id}`;
        }

        await sql`UPDATE users SET two_fa_enabled = ${input.enabled}, updated_at = NOW() WHERE id = ${ctx.user.id}`;
        console.log("[Auth] 2FA toggled for user:", ctx.user.id, "enabled:", input.enabled);
        return { success: true, enabled: input.enabled };
      } catch (err) {
        if (isTRPCError(err)) throw err;
        console.error("[Auth] toggle2FA error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Ошибка изменения настроек 2FA" });
      }
    }),

  switchDemoRole: protectedProcedure
    .input(z.object({ role: z.enum(["client", "executor"]) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await sql`SELECT phone, role, is_demo FROM users WHERE id = ${ctx.user.id}`;
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
      }
      if (!isDemoUser(row)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Переключение роли доступно только для демо-аккаунта" });
      }
      if (row.role === input.role) {
        return { success: true, role: input.role };
      }
      await sql`UPDATE users SET role = ${input.role}, updated_at = NOW() WHERE id = ${ctx.user.id}`;
      if (ctx.token) invalidateUserCache(ctx.token);
      console.log("[Auth] Demo role switched:", ctx.user.id, row.role, "->", input.role);
      return { success: true, role: input.role };
    }),

  get2FAStatus: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await sql`SELECT two_fa_enabled FROM users WHERE id = ${ctx.user.id}`;
    return { enabled: row?.two_fa_enabled !== false };
  }),

  heartbeat: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    await sql`UPDATE users SET last_seen_at = NOW() WHERE id = ${userId}`;
    return { ok: true };
  }),

  onlineStatus: protectedProcedure
    .input(z.object({ userIds: z.array(z.string()).max(50) }))
    .query(async ({ input }) => {
      if (input.userIds.length === 0) return {};
      const rows = await sql`
        SELECT id, last_seen_at FROM users
        WHERE id IN ${sql(input.userIds)}
      `;
      const result: Record<string, boolean> = {};
      const now = Date.now();
      for (const row of rows) {
        const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
        result[row.id] = (now - lastSeen) < 3 * 60 * 1000;
      }
      return result;
    }),
});

async function getSubscribedSlugs(userId: string): Promise<string[]> {
  const subs = await sql`
    SELECT sc.slug FROM user_category_subscriptions ucs
    INNER JOIN service_categories sc ON sc.id = ucs.category_id
    WHERE ucs.user_id = ${userId}
  `;
  return subs.map((s: Record<string, any>) => s.slug as string);
}

async function getPortfolioCount(userId: string): Promise<number> {
  const [row] = await sql`SELECT COUNT(*)::int as cnt FROM executor_portfolio_photos WHERE user_id = ${userId}::uuid`;
  return row?.cnt ?? 0;
}

function formatUser(user: Record<string, any>, addresses: Record<string, any>[], subscribedSlugs: string[], portfolioCount?: number): any {
  const firstName = user.first_name || "";
  const lastName = user.last_name || "";
  const name = [lastName, firstName].filter(Boolean).join(" ") || "Пользователь";

  const hasAbout = !!user.about && user.about.trim().length > 0;
  const hasAvatar = !!user.avatar_url;
  const hasPortfolio = (portfolioCount ?? 0) > 0;
  const hasName = !!firstName && !!lastName;
  const hasPhone = !!user.phone && user.phone.trim().length > 0;
  const hasEmail = !!user.email && user.email.trim().length > 0;
  const isFullyVerified = user.role === 'executor' && hasAbout && hasAvatar && hasPortfolio && hasName && hasPhone && hasEmail;

  return {
    id: user.id,
    userNumber: user.user_number || null,
    name,
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.phone,
    email: user.email,
    emailVerified: user.email_verified ?? false,
    role: user.role,
    city: user.city || '',
    region: user.region || '',
    rating: parseFloat(user.rating) || 5,
    ratingCount: user.rating_count || 0,
    requestsCount: user.requests_count || 0,
    completedCount: user.completed_count || 0,
    subscribedServiceIds: subscribedSlugs,
    avatar: user.avatar_url,
    about: user.about || '',
    portfolioCount: portfolioCount ?? 0,
    isFullyVerified,
    statusText: user.status_text || '',
    isBlocked: user.is_blocked,
    isDemo: isDemoUser(user),
    addresses: addresses.map(formatAddress),
    createdAt: user.created_at,
    ...(typeof user.has_password === "boolean" ? { hasPassword: user.has_password } : {}),
  };
}

function formatAddress(addr: Record<string, any>): any {
  return {
    id: addr.id,
    label: addr.label,
    address: addr.full_address || "",
    city: addr.city,
    street: addr.street,
    house: addr.house,
    building: addr.building,
    apartment: addr.apartment,
    entrance: addr.entrance,
    floor: addr.floor,
    intercom: addr.intercom,
  };
}
