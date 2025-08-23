// Clean Vocational Test API Routes
// Simple REST endpoints with proper error handling

import express from 'express'
import { VocationalTestService } from '../services/VocationalTestService'

const router = express.Router()
const vocationalTestService = new VocationalTestService()

// Start new vocational test session
router.post('/start', async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required',
        code: 'MISSING_USER_ID'
      })
    }

    const session = await vocationalTestService.startSession(userId)
    
    res.status(201).json({
      success: true,
      session,
      message: 'Vocational test session started successfully'
    })

  } catch (error: any) {
    console.error('❌ Start session error:', error)
    res.status(500).json({
      error: 'Failed to start vocational test session',
      code: 'START_SESSION_FAILED',
      details: error.message
    })
  }
})

// Get existing session
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required',
        code: 'MISSING_SESSION_ID'
      })
    }

    const session = await vocationalTestService.getSession(sessionId)
    
    res.json({
      success: true,
      session
    })

  } catch (error: any) {
    console.error('❌ Get session error:', error)
    
    if (error.message === 'Session not found') {
      return res.status(404).json({
        error: 'Vocational test session not found',
        code: 'SESSION_NOT_FOUND'
      })
    }

    res.status(500).json({
      error: 'Failed to retrieve session',
      code: 'GET_SESSION_FAILED',
      details: error.message
    })
  }
})

// Send message to session
router.post('/message', async (req, res) => {
  try {
    const { sessionId, message } = req.body

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required',
        code: 'MISSING_SESSION_ID'
      })
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Valid message is required',
        code: 'INVALID_MESSAGE'
      })
    }

    const result = await vocationalTestService.processMessage(sessionId, message.trim())
    
    res.json({
      success: true,
      session: result.session,
      aiResponse: result.aiResponse,
      message: 'Message processed successfully'
    })

  } catch (error: any) {
    console.error('❌ Process message error:', error)
    
    if (error.message === 'Session not found') {
      return res.status(404).json({
        error: 'Vocational test session not found',
        code: 'SESSION_NOT_FOUND'
      })
    }

    res.status(500).json({
      error: 'Failed to process message',
      code: 'PROCESS_MESSAGE_FAILED',
      details: error.message
    })
  }
})

// Transition to specific phase
router.post('/transition', async (req, res) => {
  try {
    const { sessionId, targetPhase } = req.body

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required',
        code: 'MISSING_SESSION_ID'
      })
    }

    const validPhases = ['exploration', 'career_matching', 'reality_check', 'complete']
    if (!targetPhase || !validPhases.includes(targetPhase)) {
      return res.status(400).json({
        error: 'Valid target phase is required',
        code: 'INVALID_PHASE',
        validPhases
      })
    }

    const session = await vocationalTestService.transitionToPhase(sessionId, targetPhase)
    
    res.json({
      success: true,
      session,
      message: `Phase transitioned to ${targetPhase}`
    })

  } catch (error: any) {
    console.error('❌ Phase transition error:', error)
    
    if (error.message === 'Session not found') {
      return res.status(404).json({
        error: 'Vocational test session not found',
        code: 'SESSION_NOT_FOUND'
      })
    }

    res.status(500).json({
      error: 'Failed to transition phase',
      code: 'PHASE_TRANSITION_FAILED',
      details: error.message
    })
  }
})

// Get session statistics
router.get('/stats/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required',
        code: 'MISSING_SESSION_ID'
      })
    }

    const stats = await vocationalTestService.getSessionStats(sessionId)
    
    res.json({
      success: true,
      stats
    })

  } catch (error: any) {
    console.error('❌ Get stats error:', error)
    
    if (error.message === 'Session not found') {
      return res.status(404).json({
        error: 'Vocational test session not found',
        code: 'SESSION_NOT_FOUND'
      })
    }

    res.status(500).json({
      error: 'Failed to get session statistics',
      code: 'GET_STATS_FAILED',
      details: error.message
    })
  }
})

export default router