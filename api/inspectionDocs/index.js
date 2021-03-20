const express = require('express');
const A1A2 = require('./A1A2.ctrl');

const router = express.Router();

router.post('/:category/save', A1A2.save);
// router.post('/:category/complete', A1A2.complete);

module.exports = router;
