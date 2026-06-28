import { Router } from 'express';
import { AppError } from '../middleware/errorHandler';
import * as service from '../services/conversationService';
import { streamChat, formatMessagesForApi } from '../services/opencodeGo';
import { OpenCodeGoMessage } from '../types';

const router = Router();

const MOCK_RESPONSE = [
  'こんにちは！DoyonChatへようこそ。\n\n',
  '私はAIアシスタントです。',
  'テキストチャット、',
  '画像解析、',
  'コード生成など、',
  '様々なタスクをお手伝いできます。\n\n',
  '何かお話ししましょう！',
];

router.post('/', async (req, res, next) => {
  try {
    const { conversationId, message, imageBase64 } = req.body || {};
    if (!conversationId || !message) {
      throw new AppError(400, 'conversationId and message are required');
    }

    const conversation = await service.getConversation(conversationId);
    if (!conversation) {
      throw new AppError(404, 'Conversation not found');
    }

    // Save user message
    await service.addMessage({
      conversationId,
      role: 'user',
      content: message,
      imageUrl: imageBase64 || undefined,
    });

    // Update title on first message
    const messages = await service.listMessages(conversationId);
    if (messages.length <= 2 && conversation.title === 'New Chat') {
      conversation.title = message.slice(0, 30) || 'New Chat';
      conversation.updatedAt = new Date().toISOString();
    }

    // Build history for API
    const history: OpenCodeGoMessage[] = formatMessagesForApi(messages);

    // If last message wasn't the user one we just saved, append it
    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      if (imageBase64) {
        history.push({
          role: 'user',
          content: [
            { type: 'text', text: message },
            { type: 'image_url', image_url: { url: imageBase64 } },
          ],
        });
      } else {
        history.push({ role: 'user', content: message });
      }
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullContent = '';

    try {
      const apiKey = process.env.OPENCODE_GO_API_KEY || '';
      const useMock = !apiKey || apiKey === 'sk-opencode-test-key' || apiKey.startsWith('sk-test');

      if (useMock) {
        // Mock streaming
        for (const chunk of MOCK_RESPONSE) {
          await new Promise((r) => setTimeout(r, 120));
          fullContent += chunk;
          res.write(`data: ${JSON.stringify({ content: chunk, done: false })}\n\n`);
        }
      } else {
        for await (const chunk of streamChat(history, { model: conversation.model })) {
          if (chunk.done) break;
          fullContent += chunk.content;
          res.write(`data: ${JSON.stringify({ content: chunk.content, done: false })}\n\n`);
        }
      }
    } catch (streamErr) {
      console.error('[chat] stream error:', streamErr);
      res.write(`data: ${JSON.stringify({ content: '\n\n(エラーが発生しました)', done: false })}\n\n`);
    }

    // Save assistant message
    await service.addMessage({
      conversationId,
      role: 'assistant',
      content: fullContent || '(No response)',
    });

    res.write(`data: ${JSON.stringify({ content: '', done: true })}\n\n`);
    res.end();
  } catch (err) {
    next(err);
  }
});

export default router;
