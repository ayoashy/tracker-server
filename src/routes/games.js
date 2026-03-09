const router = require('express').Router();
const { getTrackedGames, getHistory } = require('../controllers/gamesController');

// GET /api/games/tracked  — live filtered games
router.get('/tracked', getTrackedGames);

// GET /api/games/history  — previously tracked games from DB
router.get('/history', getHistory);

module.exports = router;
