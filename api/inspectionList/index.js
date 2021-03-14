const express = require('express');
const inspectionListCtrl = require('./inspectionList.ctrl');

const router = express.Router();

router.get('/units', inspectionListCtrl.units);

module.exports = router;
