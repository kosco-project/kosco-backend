const express = require('express');

// 코드 관리를 위해 라우터 분리
const router = express.Router();

const user = require('./user');
const inspectionList = require('./inspectionList');

router.use('/user', user);
router.use('/inspectionList', inspectionList);

module.exports = router;
