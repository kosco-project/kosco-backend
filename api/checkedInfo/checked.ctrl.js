const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();

exports.find = async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const { recordset } = await pool.request().query`SELECT CD, CdNm FROM GMSTCODE WHERE (UpCd = 'SC-H2')`;

    res.send({ message: 'find success', data: recordset });
  } catch (e) {
    console.error(e);
    res.status(500).send();
  }
};
