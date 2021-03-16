const express = require('express');

// 코드 관리를 위해 라우터 분리
const router = express.Router();

const user = require('./user');
const inspectionList = require('./inspectionList');
// const inspectionDocs = require('./inspectionDocs');

router.use('/user', user);
router.use('/inspectionList', inspectionList);
// router.use('/doc/:docType', inspectionDocs);

module.exports = router;
