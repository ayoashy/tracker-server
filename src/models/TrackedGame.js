const mongoose = require('mongoose');

const trackedGameSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  homeTeam: { type: String, required: true },
  awayTeam: { type: String, required: true },
  homeScore: { type: Number, default: 0 },
  awayScore: { type: Number, default: 0 },
  minute: { type: Number, default: 0 },
  homeOdd: { type: Number, default: null },
  drawOdd: { type: Number, default: null },
  awayOdd: { type: Number, default: null },
  firstTrackedAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('TrackedGame', trackedGameSchema);
