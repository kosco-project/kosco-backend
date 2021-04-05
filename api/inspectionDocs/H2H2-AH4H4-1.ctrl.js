const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

const updateQuery = async (D1, D2, url, CERTNO, CERTDT, VESSELNM, ID) => {
  const pool = await sql.connect(config);

  Object.values(D1).forEach(async (v, i) => {
    const TestDt = new Date(v.TestDt.substring(0, 10)).toFormat('MMM.YY');
    await pool
      .request()
      .input('url', sql.NChar, url)
      .input('CERTNO', sql.NChar, CERTNO[0][''])
      .input('CERTSEQ', sql.NChar, i + 1)
      .input('VESSELNM', sql.NChar, VESSELNM)
      .input('CylnType', sql.NChar, v.CylnType)
      .input('Volume', sql.NChar, v.Volume)
      .input('WorkPress', sql.NChar, v.WorkPress)
      .input('SerialNo', sql.NChar, v.SerialNo)
      .input('TestDt', sql.Date, TestDt)
      .input('Perform', sql.NChar, v.Perform)
      .input('D2', sql.NChar, D2)
      .input('ID', sql.NChar, ID).query(`
        MERGE INTO [GSVC_${url}_H]
          USING(values (1))
            AS Source (Number)
            ON (CERTNO IS NOT NULL)
          WHEN MATCHED THEN
            UPDATE SET UP_ID = @ID, UP_DT = GetDate()
          WHEN NOT MATCHED THEN
            INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES(@CERTNO, ${CERTDT}, @VESSELNM, @ID, @ID);

        MERGE INTO [GSVC_${url}_D1]
          USING(values (1))
            AS Source (Number)
            ON (CERTNO = @CERTNO AND CERTSEQ = @CERTSEQ)
          WHEN MATCHED AND (CylnType != @CylnType OR Volume != @Volume OR WorkPress != @WorkPress OR SerialNo != @SerialNo OR TestDt != @TestDt OR Perform != @Perform) THEN
            UPDATE SET UP_ID = @ID, UP_DT = GetDate(), CylnType = @CylnType, Volume = @Volume, WorkPress = @WorkPress, SerialNo = @SerialNo, TestDt = @TestDt, Perform = @Perform
          WHEN NOT MATCHED THEN
            INSERT (CERTNO, CERTSEQ, CylnType, Volume, WorkPress, SerialNo, TestDt, Perform, IN_ID, UP_ID) VALUES(@CERTNO, @CERTSEQ, @CylnType, @Volume, @WorkPress, @SerialNo, @TestDt, @Perform, @ID, @ID);

        MERGE INTO [GSVC_${url}_D2]
          USING(values (1))
            AS Source (Number)
            ON (CERTNO = @CERTNO and CERTSEQ = 1)
          WHEN MATCHED AND (Value != @D2) THEN
            UPDATE SET Value = @D2, UP_ID = @ID, UP_DT = GetDate()
          WHEN NOT MATCHED THEN
            INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES(@CERTNO, 1, @D2, @ID, @ID);
    `);
  });
};

exports.inspection = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1, D2 } = req.body;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;
  const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  const url = req.url.split('/')[1];

  const { type } = req.params;

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    if (type === 'save') {
      // 임시저장 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${CERTNO[0]['']}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = ${url})
      `;
    } else {
      // complete -> 검사완료 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = ${url})
      `;
    }

    await updateQuery(D1, D2, url, CERTNO, CERTDT, VESSELNM, ID);

    res.status(200).send();
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
