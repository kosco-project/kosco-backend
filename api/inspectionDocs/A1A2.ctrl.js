const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.save = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { category } = req.params;
  const { H, D1, D2 } = req.body;
  const { CERTNO, VESSELNM } = H;

  const pool = await sql.connect(config);

  if (category === 'A1' || category === 'A2') {
    try {
      const { recordset: CERT_NO } = await pool.request().input('category', sql.NChar, category).query(`
      SELECT CERTNO from GSVC_${category}_H
    `);

      if (!CERT_NO.length) {
        await pool
          .request()
          .input('category', sql.NChar, category)
          .input('CERTNO', sql.NChar, CERTNO)
          .input('CERTDT', sql.NChar, new Date().toFormat('YYYYMMDD'))
          .input('VESSELNM', sql.NChar, VESSELNM)
          .input('ID', sql.NChar, ID)
          .query(`insert GSVC_${category}_H(CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) values(@CERTNO, @CERTDT, @VESSELNM, @ID, @ID)`);

        Object.values(D1).forEach(async (v, i) => {
          await pool
            .request()
            .input('ID', sql.NChar, ID)
            .input('category', sql.NChar, category)
            .input('CERTNO', sql.NChar, CERTNO)
            .input('value', sql.NChar, v)
            .query(`insert GSVC_${category}_D1(CERTNO, CERTSEQ, Value, IN_ID, UP_ID) values(@CERTNO, ${i + 1}, @value, @ID, @ID)`);
        });
        // D2
        Object.values(D2).forEach(async (value, i) => {
          await pool
            .request()
            .input('input_parameter', sql.NChar, category)
            .input('CERTNO', sql.NChar, CERTNO)
            .input('CERTSEQ', sql.NChar, i + 1)
            .input('Value', sql.NChar, value)
            .input('ID', sql.NChar, ID)
            .query(`insert GSVC_${category}_D2(CERTNO, CERTSEQ, Value, IN_ID, UP_ID) values(@CERTNO, @CERTSEQ, @Value, @ID, @ID)`);
        });

        res.status(200).send();
      } else {
        await pool
          .request()
          .input('category', sql.NChar, category)
          .input('ID', sql.NChar, ID)
          .input('date', sql.DateTimeOffset, new Date())
          .query(`update GSVC_${category}_H set UP_ID = @ID, UP_DT = @date`);

        const { recordset: D1DATA } = await pool.request().input('category', sql.NChar, category).query(`
          SELECT Value from GSVC_${category}_D1
        `);

        Object.values(D1).forEach(async (v, i) => {
          if (D1DATA[i].Value === v) {
            await pool
              .request()
              .input('ID', sql.NChar, ID)
              .input('date', sql.DateTimeOffset, new Date())
              .input('certseq', sql.NChar, i + 1)
              .input('category', sql.NChar, category)
              .input('value', sql.NChar, v).query(`
              select * from GSVC_${category}_D1 where CERTSEQ = @certseq
              update GSVC_${category}_D1 set UP_ID = @ID, UP_DT = @date, Value = @value where CERTSEQ = @certseq
              `);
          }
        });
        // D2
        Object.values(D2).forEach(async (value, i) => {
          await pool
            .request()
            .input('input_parameter', sql.NChar, category)
            .input('CERTSEQ', sql.NChar, i + 1)
            .input('Value', sql.NChar, value)
            .input('ID', sql.NChar, ID)
            .input('date', sql.DateTimeOffset, new Date())
            .query(`update GSVC_${category}_D2 set Value = @Value, UP_ID = @ID, UP_DT = @date where CERTSEQ = @CERTSEQ`);
        });
      }
      res.status(200).send();
    } catch (e) {
      console.error(e);
      res.status(500).send();
    }
  }
};

exports.complete = async (req, res) => {};
