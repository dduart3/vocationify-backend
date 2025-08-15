import express from 'express';
import { ConversationalSessionService } from '../services/ConversationalSessionService';

const router = express.Router();
const conversationalService = new ConversationalSessionService();

/**
 * POST /api/conversations/sessions
 * Create a new conversational session
 */
router.post('/sessions', async (req, res) => {
  try {
    const { user_id } = req.body;
    const result = await conversationalService.createConversationalSession(user_id);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error creating conversational session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create conversational session'
    });
  }
});

/**
 * POST /api/conversations/sessions/:sessionId/messages
 * Send a message to the conversational session
 */
router.post('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const response = await conversationalService.processUserMessage(sessionId, message);
    
    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('Error processing user message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process user message'
    });
  }
});

/**
 * GET /api/conversations/sessions/:sessionId
 * Get session details for resumption
 */
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionDetails = await conversationalService.getSessionDetails(sessionId);
    
    res.json({
      success: true,
      data: sessionDetails
    });
  } catch (error) {
    console.error('Error getting session details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session details'
    });
  }
});

/**
 * PUT /api/conversations/sessions/:sessionId/heartbeat
 * Update session timestamp to indicate activity
 */
router.put('/sessions/:sessionId/heartbeat', async (req, res) => {
  try {
    const { sessionId } = req.params;
    await conversationalService.updateSessionHeartbeat(sessionId);
    
    res.json({
      success: true,
      message: 'Session heartbeat updated'
    });
  } catch (error) {
    console.error('Error updating session heartbeat:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update session heartbeat'
    });
  }
});

/**
 * GET /api/conversations/sessions/:sessionId/results
 * Get conversational session results
 */
router.get('/sessions/:sessionId/results', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const results = await conversationalService.getSessionResults(sessionId);
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error getting session results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session results'
    });
  }
});

export default router;