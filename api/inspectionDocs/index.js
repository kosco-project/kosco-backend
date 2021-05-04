const express = require('express');
const A1A2 = require('./A1A2.ctrl');
const A3 = require('./A3.ctrl');

const B1 = require('./B1.ctrl');
const B3 = require('./B3.ctrl');

const C = require('./C.ctrl');

const F = require('./F.ctrl');
const F2 = require('./F2.ctrl');

const G = require('./G.ctrl');

const H1H3H3_1 = require('./H1H3H3-1.ctrl');

const H2H2AH4H41 = require('./H2H2-AH4H4-1.ctrl');

const I = require('./I.ctrl');

const I1 = require('./I1.ctrl');

const L1 = require('./L1.ctrl');

const OX2 = require('./OX2.ctrl');

const P1 = require('./P1.ctrl');

const WW1 = require('./WW1.ctrl');

const router = express.Router();

// A1, A2
router.get('/A1', A1A2.details);
router.get('/A2', A1A2.details);

router.post('/A1/inspection/:type', A1A2.inspection);
router.post('/A2/inspection/:type', A1A2.inspection);

// A3
router.get('/A3', A3.details);

router.post('/A3/inspection/:type', A3.inspection);

// B1, B3
router.get('/B1', B1.details);
router.get('/B3', B3.details);

router.post('/B1/inspection/:type', B1.inspection);
router.post('/B3/inspection/:type', B3.inspection);

router.post('/C/inspection/:type', C.inspection);

router.post('/F/inspection/:type', F.inspection);
router.post('/F2/inspection/:type', F2.inspection);

router.post('/G/inspection/:type', G.inspection);

router.post('/H1/inspection/:type', H1H3H3_1.inspection);

router.post('/H2/inspection/:type', H2H2AH4H41.inspection);
router.post('/H2-A/inspection/:type', H2H2AH4H41.inspection);

router.post('/H3/inspection/:type', H1H3H3_1.inspection);
router.post('/H3-1/inspection/:type', H1H3H3_1.inspection);

router.post('/H4/inspection/:type', H2H2AH4H41.inspection);
router.post('/H4-1/inspection/:type', H2H2AH4H41.inspection);

router.post('/I/inspection/:type', I.inspection);

router.post('/I-1/inspection/:type', I1.inspection);

router.post('/L1/inspection/:type', L1.inspection);

router.post('/OX2/inspection/:type', OX2.inspection);

router.post('/P1/inspection/:type', P1.inspection);

router.post('/W/inspection/:type', WW1.inspection);
router.post('/W1/inspection/:type', WW1.inspection);

module.exports = router;
