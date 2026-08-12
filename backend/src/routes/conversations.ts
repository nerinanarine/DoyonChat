import { Request, Router } from 'express';
import { AppError } from '../middleware/errorHandler';
import * as service from '../services/conversationService';

const router = Router();

function getUserId(req: Request): string {
  if (!req.userId) {
    throw new AppError(401, 'Unauthorized: user identifier not found');
  }
  return req.userId;
}

router.get('/', async (req, res, next) => {
  try {
    const conversations = await service.listConversations(getUserId(req));
    res.json(conversations);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, model } = req.body || {};
    const conversation = await service.createConversation(title, model, getUserId(req));
    res.status(201).json(conversation);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const conversation = await service.getConversation(req.params.id, userId);
    if (!conversation) {
      throw new AppError(404, 'Conversation not found');
    }
    const messages = await service.listMessages(req.params.id, userId);
    res.json({ conversation, messages });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const ok = await service.deleteConversation(req.params.id, getUserId(req));
    if (!ok) {
      throw new AppError(404, 'Conversation not found');
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.put('/:id/model', async (req, res, next) => {
  try {
    const { model } = req.body || {};
    if (!model) {
      throw new AppError(400, 'model is required');
    }
    const updated = await service.updateConversationModel(
      req.params.id,
      model,
      getUserId(req),
    );
    if (!updated) {
      throw new AppError(404, 'Conversation not found');
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const conversation = await service.getConversation(req.params.id, userId);
    if (!conversation) {
      throw new AppError(404, 'Conversation not found');
    }
    const messages = await service.listMessages(req.params.id, userId);
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

export default router;
