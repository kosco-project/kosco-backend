const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

exports.inspection = async (req, res) => {
  const path = req.path.split('/')[1];
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1, D2, D3 } = req.body;
  const { type } = req.params;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;
  const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  try {
    if (type === 'save') {
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${CERTNO[0]['']}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = ${path})
    `;
    } else {
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = ${path})
      `;
    }

    await pool.request().input('path', sql.NChar, path).input('value', sql.NChar, D3).input('CERTNO', sql.NChar, CERTNO[0]['']).query(`
      MERGE INTO GSVC_${path}_H
        USING (values (1)) AS Source (Number)
          ON (CERTNO IS NOT NULL)
        WHEN MATCHED THEN
          UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES (@CERTNO, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});

      MERGE INTO GSVC_${path}_D3
        USING (values (1)) AS Source (Number)
          ON (CERTNO = @CERTNO)
      WHEN MATCHED THEN
        UPDATE SET Value = @value, UP_ID = ${ID}, UP_DT = getDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES (@CERTNO, 1, @value, ${ID}, ${ID});
    `);

    Object.values(D1).forEach(async (v, i) => {
      await pool
        .request()
        .input('path', sql.NChar, path)
        .input('value', sql.NChar, v)
        .input('CERTNO', sql.NChar, CERTNO[0][''])
        .input('CERTSEQ', sql.NChar, i + 1).query(`
        MERGE INTO GSVC_${path}_D1
          USING (values (1)) AS Source (Number)
          ON (CERTNO = @CERTNO AND CERTSEQ = @CERTSEQ)
        WHEN MATCHED AND (Value != @value) THEN
          UPDATE SET Value = @value, UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES (@CERTNO, @CERTSEQ, @value, ${ID}, ${ID});
      `);
    });

    Object.values(D2).forEach(async (v, i) => {
      await pool
        .request()
        .input('path', sql.NChar, path)
        .input('CERTNO', sql.NChar, CERTNO[0][''])
        .input('CarriedOut', sql.NChar, v.CarriedOut)
        .input('NotCarried', sql.NChar, v.NotCarried)
        .input('NotApp', sql.NChar, v.NotApp)
        .input('Comm', sql.NChar, v.Comm)
        .input('CERTSEQ', sql.NChar, i + 1).query(`
          MERGE INTO GSVC_${path}_D2
            USING (values (1)) AS Source (Number)
            ON (CERTNO = @CERTNO AND CERTSEQ = @CERTSEQ)
          WHEN MATCHED AND (CarriedOut != @CarriedOut OR NotCarried != @NotCarried OR NotApp != @NotApp OR Comm != @Comm) THEN
            UPDATE SET CarriedOut = @CarriedOut, NotCarried = @NotCarried, NotApp = @NotApp, Comm = @Comm, UP_ID = ${ID}, UP_DT = getDate()
          WHEN NOT MATCHED THEN
            INSERT (CERTNO, CERTSEQ, CarriedOut, NotCarried, NotApp, Comm, IN_ID, UP_ID) VALUES (@CERTNO, @CERTSEQ, @CarriedOut, @NotCarried, @NotApp, @Comm, ${ID}, ${ID});
        `);

      res.status(200).send();
    });
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
