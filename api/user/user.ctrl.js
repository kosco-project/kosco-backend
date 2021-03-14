const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

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
    const token = jwt.sign(
      {
        userId: recordset[0].EmpNo,
        userNm: recordset[0].EmpNm,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
    );
    res.send({ message: 'find success', token });

    // console.log(req);
    // req.session.userId = recordset[0].EmpNo;
    // req.session.userNm = recordset[0].EmpNm;
  } catch (e) {
    console.error(e);
    res.status(500).send();
  }
  // res.send({ message: 'find success' });
};

exports.check = (req, res) => {
  try {
    jwt.verify(req.headers.authorization, process.env.JWT_SECRET);
    req.send({ message: 'check success' });
  } catch (e) {
    console.error(e);
    res.status(500).send();
  }
  // res.send({ message: 'check success' });
};
