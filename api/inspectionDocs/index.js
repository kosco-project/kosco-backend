const express = require('express');
const A1A2 = require('./A1A2.ctrl');
const A3 = require('./A3.ctrl');

const B1 = require('./B1.ctrl');
const B3 = require('./B3.ctrl');

const C = require('./C.ctrl');

const H2A = require('./H2-A.ctrl');

const router = express.Router();

router.post('/A3/inspection/:type', A3.inspection);
router.post('/B1/inspection/:type', B1.inspection);
router.post('/B3/inspection/:type', B3.inspection);
router.post('/C/inspection/:type', C.inspection);
router.post('/H2-A/inspection/:type', H2A.inspection);

router.post('/:category/inspection/:type', A1A2.inspection);

module.exports = router;
