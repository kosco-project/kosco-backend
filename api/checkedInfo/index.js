const express = require('express');
const checkedCtrl = require('./checked.ctrl');

const router = express.Router();

router.get('/', checkedCtrl.find);

module.exports = router;
