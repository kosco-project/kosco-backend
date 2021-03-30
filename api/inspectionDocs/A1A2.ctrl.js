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
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);
  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001',${CERTDT}, ${ID})`;
  const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  if (category === 'A1' || category === 'A2') {
    try {
      // GRCV_CT 테이블에서 CERT_NO 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${CERTNO[0]['']}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = ${category})
      `;

      // GSVC 테이블에 데이터 삽입
      await pool.request().input('category', sql.NChar, category).input('VESSELNM', sql.NChar, VESSELNM).input('CERTNO', sql.NChar, CERTNO[0][''])
        .query(`
      MERGE INTO GSVC_${category}_H
        USING(values (1))
          AS Source (Number)
          ON (CERTNO = @CERTNO)
        WHEN MATCHED THEN
         UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES(@CERTNO, ${CERTDT}, @VESSELNM, ${ID}, ${ID});
      `);

      Object.values(D1).forEach(async (v, i) => {
        await pool
          .request()
          .input('category', sql.NChar, category)
          .input('ID', sql.NChar, ID)
          .input('CERTSEQ', sql.NChar, i + 1)
          .input('CERTNO', sql.NChar, CERTNO[0][''])
          .input('value', sql.NChar, v).query(`
          MERGE INTO GSVC_${category}_D1
            USING(values (1))
              AS Source (Number)
            ON (CERTNO = @CERTNO)
              WHEN MATCHED AND (Value != @value AND CERTSEQ = @CERTSEQ) THEN
                UPDATE SET Value = @value, UP_ID = @ID, UP_DT = getDate()
              WHEN NOT MATCHED THEN
                INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES(@CERTNO, ${i + 1}, @value, ${ID}, ${ID});
        `);
      });

      Object.values(D2).forEach(async (v, i) => {
        await pool
          .request()
          .input('category', sql.NChar, category)
          .input('ID', sql.NChar, ID)
          .input('CERTSEQ', sql.NChar, i + 1)
          .input('CERTNO', sql.NChar, CERTNO[0][''])
          .input('value', sql.NChar, v).query(`
          MERGE INTO GSVC_${category}_D2
            USING(values (1))
              AS Source (Number)
            ON (CERTNO = @CERTNO)
              WHEN MATCHED AND (Value != @value AND CERTSEQ = @CERTSEQ) THEN
                UPDATE SET Value = @value, UP_ID = @ID, UP_DT = getDate()
              WHEN NOT MATCHED THEN
                INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES(@CERTNO, ${i + 1}, @value, ${ID}, ${ID});
        `);
      });

      res.status(200).send();
    } catch (e) {
      console.log(e);
      res.status(500).send();
    }
  }
};

exports.complete = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { category } = req.params;
  const { H, D1, D2 } = req.body;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);
  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001',${CERTDT}, ${ID})`;
  const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  if (category === 'A1' || category === 'A2') {
    try {
      // GRCV_CT 테이블에서 CERT_NO 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = ${category})
      `;

      // GSVC 테이블에 데이터 삽입
      await pool.request().input('category', sql.NChar, category).input('VESSELNM', sql.NChar, VESSELNM).input('CERTNO', sql.NChar, CERTNO[0][''])
        .query(`
      MERGE INTO GSVC_${category}_H
        USING(values (1))
          AS Source (Number)
          ON (CERTNO = @CERTNO)
        WHEN MATCHED THEN
         UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES(@CERTNO, ${CERTDT}, @VESSELNM, ${ID}, ${ID});
      `);

      Object.values(D1).forEach(async (v, i) => {
        await pool
          .request()
          .input('category', sql.NChar, category)
          .input('ID', sql.NChar, ID)
          .input('CERTSEQ', sql.NChar, i + 1)
          .input('CERTNO', sql.NChar, CERTNO[0][''])
          .input('value', sql.NChar, v).query(`
          MERGE INTO GSVC_${category}_D1
            USING(values (1))
              AS Source (Number)
            ON (CERTNO = @CERTNO)
              WHEN MATCHED AND (Value != @value AND CERTSEQ = @CERTSEQ) THEN
                UPDATE SET Value = @value, UP_ID = @ID, UP_DT = getDate()
              WHEN NOT MATCHED THEN
                INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES(@CERTNO, ${i + 1}, @value, ${ID}, ${ID});
        `);
      });

      Object.values(D2).forEach(async (v, i) => {
        await pool
          .request()
          .input('category', sql.NChar, category)
          .input('ID', sql.NChar, ID)
          .input('CERTSEQ', sql.NChar, i + 1)
          .input('CERTNO', sql.NChar, CERTNO[0][''])
          .input('value', sql.NChar, v).query(`
          MERGE INTO GSVC_${category}_D2
            USING(values (1))
              AS Source (Number)
            ON (CERTNO = @CERTNO)
              WHEN MATCHED AND (Value != @value AND CERTSEQ = @CERTSEQ) THEN
                UPDATE SET Value = @value, UP_ID = @ID, UP_DT = getDate()
              WHEN NOT MATCHED THEN
                INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES(@CERTNO, ${i + 1}, @value, ${ID}, ${ID});
        `);
      });

      res.status(200).send();
    } catch (e) {
      console.log(e);
      res.status(500).send();
    }
  }
};
