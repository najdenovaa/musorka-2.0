import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, supportProcedure } from "../create-context";
import sql from "@/backend/db/index";
import { generateUuid } from "@/backend/db/helpers";
import { sendPushToUser } from "@/backend/push";

export const chatsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const role = ctx.user.role;

    let chats: Record<string, any>[];

    if (role === "admin" || role === "support") {
      chats = await sql`
        SELECT DISTINCT c.id, c.type, c.request_id, c.last_message_at FROM chats c
        LEFT JOIN chat_participants cp ON cp.chat_id = c.id
        WHERE cp.user_id = ${userId} OR c.type = 'support'
        ORDER BY c.last_message_at DESC NULLS LAST
      `;
    } else {
      chats = await sql`
        SELECT c.id, c.type, c.request_id, c.last_message_at FROM chats c
        INNER JOIN chat_participants cp ON cp.chat_id = c.id
        WHERE cp.user_id = ${userId}
        ORDER BY c.last_message_at DESC NULLS LAST
      `;
    }

    if (chats.length === 0) return [];

    const chatIds = chats.map((c) => c.id);

    const [allParticipants, allLastMessages] = await Promise.all([
      sql`
        SELECT cp.chat_id, cp.user_id, cp.unread_count, u.first_name, u.last_name, u.avatar_url
        FROM chat_participants cp
        INNER JOIN users u ON u.id = cp.user_id
        WHERE cp.chat_id IN ${sql(chatIds)}
      `,
      sql`
        SELECT DISTINCT ON (chat_id) chat_id, text, attachment_type
        FROM chat_messages
        WHERE chat_id IN ${sql(chatIds)}
        ORDER BY chat_id, created_at DESC
      `,
    ]);

    const participantsMap = new Map<string, Record<string, any>[]>();
    for (const p of allParticipants) {
      const key = String(p.chat_id);
      if (!participantsMap.has(key)) participantsMap.set(key, []);
      participantsMap.get(key)!.push(p);
    }

    const lastMsgMap = new Map<string, { text: string; attachmentType: string | null }>();
    for (const m of allLastMessages) {
      lastMsgMap.set(String(m.chat_id), { text: m.text, attachmentType: m.attachment_type || null });
    }

    return chats.map((chat) => {
      const cid = String(chat.id);
      const participants = participantsMap.get(cid) || [];
      const myParticipant = participants.find((p: any) => p.user_id === userId);
      const lastMsg = lastMsgMap.get(cid);
      let lastMessageText = lastMsg?.text || null;
      if (lastMsg?.attachmentType === 'image' && (!lastMessageText || lastMessageText === '\ud83d\udcf7 \u0424\u043e\u0442\u043e')) {
        lastMessageText = '\ud83d\udcf7 \u0424\u043e\u0442\u043e';
      } else if (lastMsg?.attachmentType === 'file' && (!lastMessageText || lastMessageText === '\ud83d\udcce \u0424\u0430\u0439\u043b')) {
        lastMessageText = '\ud83d\udcce \u0424\u0430\u0439\u043b';
      }

      return {
        id: chat.id,
        type: chat.type,
        requestId: chat.request_id,
        participants: participants.map((p: any) => p.user_id),
        participantNames: participants.map((p: any) =>
          [p.last_name, p.first_name].filter(Boolean).join(" ") || "Пользователь"
        ),
        participantAvatars: participants.map((p: any) => p.avatar_url || null),
        lastMessage: lastMessageText,
        lastMessageTime: chat.last_message_at,
        unreadCount: myParticipant?.unread_count || 0,
      };
    });
  }),

  messages: protectedProcedure
    .input(z.object({ chatId: z.string(), limit: z.number().min(1).max(200).optional(), before: z.string().optional() }))
    .query(async ({ input }) => {
      const msgLimit = input.limit || 30;
      const beforeFilter = input.before
        ? sql`AND cm.created_at < (SELECT created_at FROM chat_messages WHERE id = ${input.before}::uuid)`
        : sql``;

      const messages = await sql`
        SELECT cm.id, cm.chat_id, cm.sender_id, cm.text, cm.created_at, cm.is_read,
          cm.attachment_url, cm.attachment_type, cm.attachment_name, cm.audio_duration_ms,
          u.first_name, u.last_name, u.role as sender_role, u.avatar_url,
          c.type as chat_type
        FROM chat_messages cm
        INNER JOIN users u ON u.id = cm.sender_id
        INNER JOIN chats c ON c.id = cm.chat_id
        WHERE cm.chat_id = ${input.chatId}::uuid
        ${beforeFilter}
        ORDER BY cm.created_at DESC
        LIMIT ${msgLimit}
      `;
      const isSupportChat = messages.length > 0 ? messages[0].chat_type === 'support' : false;
      messages.reverse();

      const reactionsMap = new Map<string, Map<string, string[]>>();
      if (messages.length > 0) {
        try {
          const messageIds = messages.map((m: any) => m.id);
          const reactionsRows = await sql`
            SELECT message_id, emoji, user_id
            FROM chat_message_reactions
            WHERE message_id IN ${sql(messageIds)}
          `;
          for (const r of reactionsRows) {
            const mid = String(r.message_id);
            if (!reactionsMap.has(mid)) reactionsMap.set(mid, new Map());
            const emojiMap = reactionsMap.get(mid)!;
            if (!emojiMap.has(r.emoji)) emojiMap.set(r.emoji, []);
            emojiMap.get(r.emoji)!.push(String(r.user_id));
          }
        } catch (e: any) {
          console.error('[Chats] Reactions fetch failed (continuing without reactions):', e?.message || e);
          try {
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
            console.log('[Chats] Created chat_message_reactions table on demand');
          } catch (createErr: any) {
            console.error('[Chats] Failed to auto-create reactions table:', createErr?.message || createErr);
          }
        }
      }

      return messages.map((m: any) => {
        const isStaffSender = m.sender_role === "admin" || m.sender_role === "support";
        const senderRole = isStaffSender ? "support" : m.sender_role;
        const senderName = isSupportChat && isStaffSender
          ? "Сотрудник Поддержки"
          : [m.last_name, m.first_name].filter(Boolean).join(" ") || "Пользователь";
        return {
          id: m.id,
          chatId: m.chat_id,
          senderId: m.sender_id,
          senderName,
          senderAvatar: m.avatar_url || null,
          senderRole,
          text: m.text,
          timestamp: m.created_at,
          read: m.is_read,
          attachmentUrl: m.attachment_url || null,
          attachmentType: m.attachment_type || null,
          attachmentName: m.attachment_name || null,
          audioDurationMs: m.audio_duration_ms || null,
          reactions: (() => {
            const emojiMap = reactionsMap.get(String(m.id));
            if (!emojiMap) return [] as { emoji: string; userIds: string[] }[];
            return Array.from(emojiMap.entries()).map(([emoji, userIds]) => ({ emoji, userIds }));
          })(),
        };
      });
    }),

  toggleReaction: protectedProcedure
    .input(z.object({ messageId: z.string(), emoji: z.string().min(1).max(16) }))
    .mutation(async ({ ctx, input }) => {
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
      const existing = await sql`
        SELECT id FROM chat_message_reactions
        WHERE message_id = ${input.messageId}::uuid
          AND user_id = ${ctx.user.id}
          AND emoji = ${input.emoji}
        LIMIT 1
      `;
      if (existing.length > 0) {
        await sql`
          DELETE FROM chat_message_reactions
          WHERE message_id = ${input.messageId}::uuid
            AND user_id = ${ctx.user.id}
            AND emoji = ${input.emoji}
        `;
        return { added: false };
      }
      const rid = generateUuid();
      await sql`
        INSERT INTO chat_message_reactions (id, message_id, user_id, emoji)
        VALUES (${rid}::uuid, ${input.messageId}::uuid, ${ctx.user.id}, ${input.emoji})
        ON CONFLICT (message_id, user_id, emoji) DO NOTHING
      `;
      return { added: true };
    }),

  sendMessage: protectedProcedure
    .input(
      z.object({
        chatId: z.string(),
        text: z.string().min(1),
        attachmentUrl: z.string().optional(),
        attachmentType: z.enum(['image', 'file', 'audio', 'video']).optional(),
        attachmentName: z.string().optional(),
        audioDurationMs: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const senderName = [ctx.user.last_name, ctx.user.first_name].filter(Boolean).join(" ") || "Пользователь";
      const senderRole = ctx.user.role === "admin" || ctx.user.role === "support" ? "support" : ctx.user.role;

      const msgId = generateUuid();
      const [message] = await sql`
        INSERT INTO chat_messages (id, chat_id, sender_id, text, attachment_url, attachment_type, attachment_name, audio_duration_ms)
        VALUES (${msgId}::uuid, ${input.chatId}::uuid, ${ctx.user.id}, ${input.text}, ${input.attachmentUrl || null}, ${input.attachmentType || null}, ${input.attachmentName || null}, ${input.audioDurationMs || null})
        RETURNING *
      `;

      await sql`
        UPDATE chats SET last_message_at = NOW() WHERE id = ${input.chatId}::uuid
      `;

      // Fire-and-forget: unread counts + notifications
      void (async () => {
        try {
          await sql`
            UPDATE chat_participants SET unread_count = unread_count + 1
            WHERE chat_id = ${input.chatId}::uuid AND user_id != ${ctx.user.id}
          `;
          const otherParticipants = await sql`
            SELECT user_id FROM chat_participants
            WHERE chat_id = ${input.chatId}::uuid AND user_id != ${ctx.user.id}
          `;
          const notifBody = `${senderName}: ${input.text.substring(0, 100)}`;
          const payload = sql.json({ chatId: input.chatId });
          await Promise.all(otherParticipants.map((p) => {
            const nId = generateUuid();
            return sql`
              INSERT INTO notifications (id, title, body, type, payload, recipient_id, is_read)
              VALUES (${nId}::uuid, ${'Новое сообщение'}, ${notifBody}, ${'new_message'}, ${payload}, ${p.user_id}, ${false})
            `.catch((e) => console.error("[Chats] Notification error:", e));
          }));
          for (const p of otherParticipants) {
            void sendPushToUser(p.user_id, 'Новое сообщение', notifBody, { chatId: input.chatId }, 'new_message');
          }
        } catch (e) {
          console.error("[Chats] Post-send error:", e);
        }
      })();

      return {
        id: message.id,
        chatId: message.chat_id,
        senderId: message.sender_id,
        senderName,
        senderRole,
        text: message.text,
        timestamp: message.created_at,
        read: false,
        attachmentUrl: message.attachment_url || null,
        attachmentType: message.attachment_type || null,
        attachmentName: message.attachment_name || null,
      };
    }),

  markAsRead: protectedProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await Promise.all([
        sql`
          UPDATE chat_participants SET unread_count = 0
          WHERE chat_id = ${input.chatId}::uuid AND user_id = ${ctx.user.id}
        `,
        sql`
          UPDATE chat_messages SET is_read = true
          WHERE chat_id = ${input.chatId}::uuid AND sender_id != ${ctx.user.id} AND is_read = false
        `,
      ]);
      return { success: true };
    }),

  getOrCreateRequestChat: protectedProcedure
    .input(
      z.object({
        requestId: z.string(),
        participantIds: z.array(z.string()),
        participantNames: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const existingChats = await sql`
        SELECT c.* FROM chats c
        WHERE c.request_id = ${input.requestId}::uuid AND c.type = 'request'
      `;

      for (const chat of existingChats) {
        const participants = await sql`
          SELECT user_id FROM chat_participants WHERE chat_id = ${chat.id}
        `;
        const participantUserIds = participants.map((p: any) => String(p.user_id));
        const allMatch = input.participantIds.every((id: string) => participantUserIds.includes(id));
        if (allMatch && participantUserIds.length >= input.participantIds.length) {
          console.log("[Chats] Found existing request chat:", chat.id);
          return String(chat.id);
        }
      }

      const chatId = generateUuid();
      const [chat] = await sql`
        INSERT INTO chats (id, type, request_id, last_message_at)
        VALUES (${chatId}::uuid, ${'request'}, ${input.requestId}::uuid, NOW())
        RETURNING *
      `;

      for (let i = 0; i < input.participantIds.length; i++) {
        const cpId = generateUuid();
        await sql`
          INSERT INTO chat_participants (id, chat_id, user_id)
          VALUES (${cpId}::uuid, ${chat.id}, ${input.participantIds[i]}::uuid)
          ON CONFLICT (chat_id, user_id) DO NOTHING
        `;
      }

      console.log("[Chats] Created new request chat:", chat.id, "for request:", input.requestId);
      return String(chat.id);
    }),

  getOrCreateSupportChat: protectedProcedure.mutation(async ({ ctx }) => {
    const existing = await sql`
      SELECT c.id FROM chats c
      INNER JOIN chat_participants cp ON cp.chat_id = c.id
      WHERE c.type = 'support' AND cp.user_id = ${ctx.user.id}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return String(existing[0].id);
    }

    const supChatId = generateUuid();
    const [chat] = await sql`
      INSERT INTO chats (id, type, last_message_at)
      VALUES (${supChatId}::uuid, ${'support'}, NOW())
      RETURNING *
    `;

    const cpId1 = generateUuid();
    await sql`
      INSERT INTO chat_participants (id, chat_id, user_id)
      VALUES (${cpId1}::uuid, ${chat.id}, ${ctx.user.id})
    `;

    const supportUsers = await sql`
      SELECT id FROM users WHERE role IN ('admin', 'support') AND is_blocked = false LIMIT 1
    `;
    for (const su of supportUsers) {
      const cpId2 = generateUuid();
      await sql`
        INSERT INTO chat_participants (id, chat_id, user_id)
        VALUES (${cpId2}::uuid, ${chat.id}, ${su.id})
        ON CONFLICT (chat_id, user_id) DO NOTHING
      `;
    }

    return String(chat.id);
  }),

  getOrCreateDirectChat: protectedProcedure
    .input(z.object({ peerUserId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const peerId = input.peerUserId;
      if (userId === peerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Нельзя написать самому себе" });
      }
      const peerRows = await sql`
        SELECT id, is_blocked FROM users WHERE id = ${peerId}::uuid LIMIT 1
      `;
      if (peerRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
      }
      if (peerRows[0].is_blocked) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Пользователь недоступен" });
      }
      const existing = await sql`
        SELECT c.id FROM chats c
        INNER JOIN chat_participants cp1 ON cp1.chat_id = c.id AND cp1.user_id = ${userId}::uuid
        INNER JOIN chat_participants cp2 ON cp2.chat_id = c.id AND cp2.user_id = ${peerId}::uuid
        WHERE c.type = 'direct'
        LIMIT 1
      `;
      if (existing.length > 0) {
        console.log("[Chats] Found existing direct chat:", existing[0].id);
        return String(existing[0].id);
      }
      const chatId = generateUuid();
      const [chat] = await sql`
        INSERT INTO chats (id, type, last_message_at)
        VALUES (${chatId}::uuid, ${"direct"}, NOW())
        RETURNING *
      `;
      for (const uid of [userId, peerId]) {
        const cpId = generateUuid();
        await sql`
          INSERT INTO chat_participants (id, chat_id, user_id)
          VALUES (${cpId}::uuid, ${chat.id}, ${uid}::uuid)
          ON CONFLICT (chat_id, user_id) DO NOTHING
        `;
      }
      console.log("[Chats] Created new direct chat:", chat.id, "between:", userId, "and:", peerId);
      return String(chat.id);
    }),

  supportChats: supportProcedure.query(async ({ ctx }) => {
    const chats = await sql`
      SELECT c.id, c.type, c.request_id, c.last_message_at FROM chats c WHERE c.type = 'support'
      ORDER BY c.last_message_at DESC NULLS LAST
    `;

    if (chats.length === 0) return [];

    const chatIds = chats.map((c) => c.id);

    const [allParticipants, allLastMessages] = await Promise.all([
      sql`
        SELECT cp.chat_id, cp.user_id, cp.unread_count, u.first_name, u.last_name, u.avatar_url
        FROM chat_participants cp
        INNER JOIN users u ON u.id = cp.user_id
        WHERE cp.chat_id IN ${sql(chatIds)}
      `,
      sql`
        SELECT DISTINCT ON (chat_id) chat_id, text, attachment_type
        FROM chat_messages
        WHERE chat_id IN ${sql(chatIds)}
        ORDER BY chat_id, created_at DESC
      `,
    ]);

    const participantsMap = new Map<string, Record<string, any>[]>();
    for (const p of allParticipants) {
      const key = String(p.chat_id);
      if (!participantsMap.has(key)) participantsMap.set(key, []);
      participantsMap.get(key)!.push(p);
    }

    const lastMsgMap = new Map<string, { text: string; attachmentType: string | null }>();
    for (const m of allLastMessages) {
      lastMsgMap.set(String(m.chat_id), { text: m.text, attachmentType: m.attachment_type || null });
    }

    return chats.map((chat) => {
      const cid = String(chat.id);
      const participants = participantsMap.get(cid) || [];
      const myParticipant = participants.find((p: any) => String(p.user_id) === ctx.user.id);
      const lastMsg = lastMsgMap.get(cid);
      let lastMessageText = lastMsg?.text || null;
      if (lastMsg?.attachmentType === 'image' && (!lastMessageText || lastMessageText === '\ud83d\udcf7 \u0424\u043e\u0442\u043e')) {
        lastMessageText = '\ud83d\udcf7 \u0424\u043e\u0442\u043e';
      } else if (lastMsg?.attachmentType === 'file' && (!lastMessageText || lastMessageText === '\ud83d\udcce \u0424\u0430\u0439\u043b')) {
        lastMessageText = '\ud83d\udcce \u0424\u0430\u0439\u043b';
      }

      return {
        id: chat.id,
        type: chat.type,
        requestId: chat.request_id,
        participants: participants.map((p: any) => p.user_id),
        participantNames: participants.map((p: any) =>
          [p.last_name, p.first_name].filter(Boolean).join(" ") || "Пользователь"
        ),
        participantAvatars: participants.map((p: any) => p.avatar_url || null),
        lastMessage: lastMessageText,
        lastMessageTime: chat.last_message_at,
        unreadCount: myParticipant?.unread_count || 0,
      };
    });
  }),
});
