const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.save = async (req, res) => {
  const { category } = req.params;
  const { H, D1 } = req.body;
  const { CERTDT, VESSELNM, ID } = H;
  const date = new Date();

  const pool = await sql.connect(config);
  const { recordset } = await pool.request().query`
  SELECT dbo.GD_F_NO('CT','002001','${new Date().toFormat('YYYYMMDD')}','${ID}')
  `;

  if (category === 'A1' || category === 'A2') {
    try {
      // await sql.connect(config);
      // const isCertno = await sql.query`select CERTNO from GSVC_A1_H`;

      // await sql.query`insert GSVC_${category}_H(CERTNO, CERTDT, VESSELNM, IN_ID, IN_DT, UP_ID, UP_DT) values(${'sdfsdr'}, ${H.CERTDT}, ${
      //   H.VESSELNM
      // }, ${ID}, ${new Date().toFormat('YYYY-MM-DD')}, ${ID}, ${new Date().toFormat('YYYY-MM-DD')})`;
      const { recordset: CERTNO } = await pool.request().input('input_parameter', sql.NChar, category).query(`
      SELECT CERTNO from GSVC_${category}_H
    `);

      if (!CERTNO.length) {
        const result1 = await pool
          .request()
          .input('input_parameter', sql.NChar, category)
          .input('CERTNO', sql.NChar, recordset[0][''])
          .input('CERTDT', sql.NChar, CERTDT)
          .input('VESSELNM', sql.NChar, VESSELNM)
          .input('date', sql.DateTime, date)
          .input('ID', sql.NChar, ID)
          .query(`insert GSVC_${category}_H(CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) values(@CERTNO, @CERTDT, @VESSELNM, @ID, @ID)`);

        console.log(result1);

        res.status(200).send();
      } else {
        await pool
          .request()
          .input('input_parameter', sql.NChar, category)
          .input('ID', sql.NChar, ID)
          .input('date', sql.DateTimeOffset, date)
          .query(`update GSVC_${category}_H set UP_ID = @ID, UP_DT = @date`);

        res.status(200).send();
      }
    } catch (e) {
      console.error(e);
      res.status(500).send();
    }
  }
};
