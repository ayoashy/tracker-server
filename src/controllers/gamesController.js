const { getFilteredGames } = require('../services/sportybet');
const TrackedGame = require('../models/TrackedGame');

exports.getTrackedGames = async (req, res) => {
  try {
    const games = await getFilteredGames();

    // Upsert each matched game into MongoDB for history/logging
    const upsertOps = games.map((game) =>
      TrackedGame.findOneAndUpdate(
        { eventId: game.eventId },
        {
          ...game,
          lastSeenAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    );

    await Promise.all(upsertOps);

    return res.json({
      games,
      total: games.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Controller] getTrackedGames error:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch live games',
      details: err.message,
    });
  }
};

// Returns the full historical list from DB (games that were ever tracked)
exports.getHistory = async (req, res) => {
  try {
    const history = await TrackedGame.find().sort({ lastSeenAt: -1 }).limit(100);
    return res.json({ games: history, total: history.length });
  } catch (err) {
    console.error('[Controller] getHistory error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
};
