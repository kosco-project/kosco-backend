const express = require('express');
const userCtrl = require('./user.ctrl');

const router = express.Router();

router.post('/', userCtrl.find);
router.get('/check', userCtrl.check);

module.exports = router;
