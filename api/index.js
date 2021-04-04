const express = require('express');

// 코드 관리를 위해 라우터 분리
const router = express.Router();

const user = require('./user');
const inspectionList = require('./inspectionList');
const inspectionDocs = require('./inspectionDocs');
const checkedInfo = require('./checkedInfo');

router.use('/user', user);
router.use('/inspectionList', inspectionList);
router.use('/doc', inspectionDocs);
router.use('/checkedInfo', checkedInfo);

module.exports = router;
