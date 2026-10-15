const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const { requireCustomer } = require('../middleware/authMiddleware');
const { getRoute, autocompletePlaces, getPlace } = require('../controllers/mapsController');

// Every map in the app is behind login (riders and mobile admins hold a
// customer session too), so the Google key is only ever spent for a known user.
router.use(requireCustomer);

// Per user, on top of services/googleMaps.js's daily cap. A route is asked
// for at most every 30s per open map; typing in the search box sends one
// request per pause, so both stay far below these.
const perUser = (max) => rateLimit({
  windowMs: 60 * 1000,
  max,
  keyGenerator: (req) => `maps:${req.user.id}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many map requests. Wait a minute and try again.' },
});

router.post('/route', perUser(20), asyncHandler(getRoute));
router.get('/places/autocomplete', perUser(60), asyncHandler(autocompletePlaces));
router.get('/places/:placeId', perUser(30), asyncHandler(getPlace));

module.exports = router;
