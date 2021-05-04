const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();

exports.find = async (req, res) => {
  try {
    const token = req.headers.authorization.slice(7);
    jwt.verify(token, process.env.JWT_SECRET);

    const pool = await sql.connect(config);
    const { recordset } = await pool.request().query`SELECT CD, CdNm FROM GMSTCODE WHERE (UpCd = 'SC-H2')`;

    res.send({ message: 'find success', data: recordset });
  } catch (e) {
    console.error(e);
    if (e.name === 'TokenExpiredError') {
      return res.status(419).json({ code: 419, message: '토큰이 만료되었습니다.' });
    }
    if (e.name === 'JsonWebTokenError') {
      return res.status(401).json({ code: 401, message: '유효하지 않은 토큰입니다.' });
    }
    res.status(500).send();
  }
};
