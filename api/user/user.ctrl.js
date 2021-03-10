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

    console.log(recordset, rowsAffected);

    if (!rowsAffected[0]) {
      res.send({ message: 'find fail', error: '존재하지 않은 사용자입니다.' });
      return;
    }

    // const token = jwt.sign(
    //   {
    //     userId: recordset[0].EmpNo,
    //     userPw: recordset[0].EmpNm,
    //   },
    //   process.env.JWT_SECRET,
    //   { expiresIn: '7d' }
    // );

    // res.send({ message: 'find success', token });
  } catch (e) {
    console.error(e);
    res.status(500).send();
  }
};

exports.check = (req, res) => {
  console.log(req, res);
  // try {
  //   jwt.verify(req.headers.authorization, process.env.JWT_SECRET);
  //   res.send({ message: 'check success' });
  // } catch (e) {
  //   if (e.name === 'TokenExpiredError') {
  //     return res.status(419).json({
  //       code: 419,
  //       message: 'fail check',
  //     });
  //   }

  //   return res.send({
  //     code: 401,
  //     message: 'fail check',
  //   });
  // }
};
