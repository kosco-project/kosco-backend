const sql = require('mssql');
// const jwt = require('jsonwebtoken');
const config = require('../../lib/dbConfig');

require('dotenv').config();

exports.find = async (req, res) => {
  const { userId, userPw } = req.body;

  try {
    const pool = await sql.connect(config);
    const { recordset, rowsAffected } = await pool.request()
      .query`select EmpNo, EmpNm from dbo.GMSTUSER where EmpNo=${userId} and PassWord=${userPw} and OutDt=''`;

    if (!rowsAffected[0]) {
      res.send({ message: 'find fail', error: '존재하지 않은 사용자입니다.' });
      return;
    }

    req.session.userId = recordset[0].EmpNo;
    req.session.userPw = recordset[0].EmpNm;
  } catch (e) {
    console.error(e);
    res.status(500).send();
  }
  res.send({ message: 'find success' });
};

exports.check = async (req, res) => {
  try {
    console.log(req.headers);
  } catch (e) {
    console.error(e);
    res.status(500).send();
  }

  res.send({ message: 'find success' });
};
