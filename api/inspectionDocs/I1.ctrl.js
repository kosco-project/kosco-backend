const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.details = async (req, res) => {
  const { ct } = req.query;

  try {
    const pool = await sql.connect(config);

    const { recordset: D1 } = await pool.request().query`
        SELECT [GSVC_I-1_D1].Value FROM [GSVC_I-1_D1]
        WHERE [GSVC_I-1_D1].CERTNO = ${ct}
      `;
    const { recordset: D2 } = await pool.request().query`
        SELECT [GSVC_I-1_D1].Value FROM [GSVC_I-1_D1]
        WHERE [GSVC_I-1_D1].CERTNO = ${ct}
    `;

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
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1, D2 } = req.body;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;
  const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  const { type } = req.params;

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    if (type === 'save') {
      // 임시저장 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${CERTNO[0]['']}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'I-1')
      `;
    } else {
      // complete -> 검사완료 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'I-1')
      `;
    }

    // GSVC 테이블에 데이터 삽입
    await pool.request().query`
      MERGE INTO [GSVC_I-1_H]
        USING(values (1))
          AS Source (Number)
          ON (CERTNO IS NOT NULL)
        WHEN MATCHED THEN
          UPDATE SET UP_ID = ${ID}, UP_DT = GetDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES(${CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});

      MERGE INTO [GSVC_I-1_D2]
        USING(values (1))
          AS Source (Number)
          ON (CERTNO = ${CERTNO[0]['']} AND CERTSEQ = 1)
        WHEN MATCHED AND (Value != ${D2}) THEN
          UPDATE SET UP_ID = ${ID}, UP_DT = GetDate(), Value = ${D2}
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES(${CERTNO[0]['']}, 1, ${D2}, ${ID}, ${ID});
    `;

    Object.values(D1).forEach(async (v, i) => {
      const MFGDt = new Date(v.MFGDt.substring(0, 10)).toFormat('MMM.YY');
      await pool.request().query`
        MERGE INTO [GSVC_I-1_D1]
          USING(values (1))
            AS Source (Number)
            ON (CERTNO = ${CERTNO[0]['']} AND CERTSEQ = ${i + 1})
          WHEN MATCHED AND (CylnType != ${v.CylnType} OR Type != ${v.Type} OR MFGDt != ${MFGDt} OR SerialNo != ${v.SerialNo} OR Pressure != ${
        v.Pressure
      } OR Perform != ${v.Perform}) THEN
            UPDATE SET UP_ID = ${ID}, UP_DT = GetDate(), CylnType = ${v.CylnType}, Type = ${v.Type}, MFGDt = ${MFGDt}, SerialNo = ${
        v.SerialNo
      }, Pressure = ${v.Pressure}, Perform = ${v.Perform}
          WHEN NOT MATCHED THEN
            INSERT (CERTNO, CERTSEQ, CylnType, Type, MFGDt, SerialNo, Pressure, Perform, IN_ID, UP_ID) VALUES(${CERTNO[0]['']}, ${i + 1}, ${
        v.CylnType
      }, ${v.Type}, ${MFGDt}, ${v.SerialNo}, ${v.Pressure}, ${v.Perform},  ${ID}, ${ID});
      `;
    });

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
