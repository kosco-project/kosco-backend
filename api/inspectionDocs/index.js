const express = require('express');
const A1A2 = require('./A1A2.ctrl');
const A3 = require('./A3.ctrl');

const B1 = require('./B1.ctrl');
const B3 = require('./B3.ctrl');

const router = express.Router();

router.post('/A3/inspection/:type', A3.inspection);
router.post('/B1/save', B1.save);
router.post('/B3/inspection/:type', B3.inspection);

router.post('/:category/save', A1A2.save);
router.post('/:category/complete', A1A2.complete);

module.exports = router;
