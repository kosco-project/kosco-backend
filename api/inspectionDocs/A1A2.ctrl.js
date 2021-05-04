const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

const updateQuery = async (table, data, path, CERTNO, ID, VESSELNM, CERTDT) => {
  const pool = await sql.connect(config);

  Object.values(data).forEach(async (v, i) => {
    await pool
      .request()
      .input('path', sql.NChar, path)
      .input('ID', sql.NChar, ID)
      .input('VESSELNM', sql.NChar, VESSELNM)
      .input('CERTSEQ', sql.NChar, i + 1)
      .input('CERTNO', sql.NChar, CERTNO)
      .input('value', sql.NChar, v).query(`
      MERGE INTO GSVC_${path}_H
        USING (values (1)) AS Source (Number)
        ON (CERTNO IS NOT NULL)
        WHEN MATCHED THEN
         UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES(@CERTNO, ${CERTDT}, @VESSELNM, ${ID}, ${ID});

      MERGE INTO GSVC_${path}_${table}
        USING (values (1)) AS Source (Number)
        ON (CERTNO = @CERTNO AND CERTSEQ = @CERTSEQ)
        WHEN MATCHED AND (Value != @value) THEN
          UPDATE SET Value = @value, UP_ID = @ID, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES(@CERTNO, ${i + 1}, @value, ${ID}, ${ID});
    `);
  });
};

exports.details = async (req, res) => {
  const path = req.path.split('/')[1];
  const { ct } = req.query;

  try {
    const pool = await sql.connect(config);

    const { recordset: D1 } = await pool.request().input('path', sql.NChar, path).input('ct', sql.NChar, ct).query(`
        SELECT GSVC_${path}_D1.Value FROM GSVC_${path}_D1
        WHERE GSVC_${path}_D1.CERTNO = @ct
      `);
    const { recordset: D2 } = await pool.request().input('category', sql.NChar, path).input('ct', sql.NChar, ct).query(`
        SELECT GSVC_${path}_D2.Value FROM GSVC_${path}_D2
        WHERE GSVC_${path}_D2.CERTNO = @ct
    `);

    // 가져온 데이터를 프론트엔드 상태와 동일하게 주기 위한 작업
    const D1arr = D1.map((item, i) => ({ [i]: item.Value }));
    const D1obj = D1arr.reduce((a, c) => ({ ...a, ...c }), {});

    const D2arr = D2.map((item, i) => ({ [i]: +item.Value }));
    const D2obj = D2arr.reduce((a, c) => ({ ...a, ...c }), {});

    res.json({
      D1: D1obj,
      D2: D2obj,
    });
  } catch (e) {
    console.log(e);
    res.status(500).send();
  }
};

exports.inspection = async (req, res) => {
  const path = req.path.split('/')[1];
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { type } = req.params;
  const { H, D1, D2 } = req.body;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);
  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001',${CERTDT}, ${ID})`;
  // const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  // const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  try {
    jwt.verify(token, process.env.JWT_SECRET);

    // H, D1, D2 데이터베이스 업데이트
    await updateQuery('D1', D1, path, H.CERTNO || CERTNO[0][''], ID, VESSELNM, CERTDT);
    await updateQuery('D2', D2, path, H.CERTNO || CERTNO[0][''], ID, VESSELNM, CERTDT);

    if (type === 'save') {
      // GRCV_CT 테이블에서 CERT_NO 삽입
      // 이전에 검사 완료된 문서인지 확인
      const { recordset: magamYn } = await pool
        .request()
        .input('path', sql.NChar, path)
        .input('CERTNO', sql.NChar, H.CERTNO || CERTNO[0][''])
        .input('RCVNO', sql.NChar, RCVNO).query(`
          UPDATE GRCV_CT SET CERT_NO = @CERTNO, UP_ID = ${ID}, UP_DT = getDate()
          WHERE (RcvNo = @RCVNO AND Doc_No = @path)

          SELECT MagamYn FROM GRCV_CT
          WHERE (RcvNo = @RCVNO AND Doc_No = @path)
      `);

      // 만약 이전에 검사완료 한 문서를 임시저장한다면 MagamYn을 0으로 변경
      if (magamYn[0].MagamYn) {
        await pool.request().input('path', sql.NChar, path).input('RCVNO', sql.NChar, RCVNO).query(`
          UPDATE GRCV_CT SET MagamYn = 0, MagamDt = ''
          WHERE (RcvNo = @RCVNO AND Doc_No = @path)
        `);
      }
    } else {
      // COMPLETE -> 검사완료 시 GRCV_CT 테이블에 데이터 삽입
      await pool
        .request()
        .input('CERTNO', sql.NChar, H.CERTNO || CERTNO[0][''])
        .input('RCVNO', sql.NChar, RCVNO)
        .input('path', sql.NChar, path).query(`
          UPDATE GRCV_CT SET CERT_NO = @CERTNO, MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
          WHERE (RcvNo = @RCVNO AND Doc_No = @path)
      `);
    }

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
