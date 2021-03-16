const express = require('express');
const inspectionListCtrl = require('./inspectionList.ctrl');

const router = express.Router();

router.get('/units', inspectionListCtrl.units);
router.get('/:startDate/:endDate/:process', inspectionListCtrl.find);

module.exports = router;
