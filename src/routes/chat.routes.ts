import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All chat routes require authentication
router.use(authMiddleware);

// Get predefined messages
router.get('/v1/predefined-messages', ChatController.getPredefinedMessages);

// Initiate chat between shipment owner and traveller
router.post('/v1/initiate', ChatController.initiateChat);

// Send message (supports file upload)
router.post('/v1/message', ChatController.sendMessage);

// Get chat messages
router.get('/v1/:matchId/messages', ChatController.getChatMessages);

// Unlock chat with payment
router.post('/v1/unlock', ChatController.unlockChat);

// Get user's chat list
router.get('/v1/chats', ChatController.getUserChats);

// Invite user to group chat
router.post('/v1/invite', ChatController.inviteToChat);

// Respond to chat invitation
router.post('/v1/invitation/respond', ChatController.respondToInvitation);

// Get user's invitations
router.get('/v1/invitations', ChatController.getUserInvitations);

export default router;