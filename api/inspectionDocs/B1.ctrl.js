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
        SELECT GSVC_B1_D1.Value FROM GSVC_B1_D1
        WHERE GSVC_B1_D1.CERTNO = ${ct}
      `;
    const { recordset: D2 } = await pool.request().query`
        SELECT GSVC_B1_D2.Value FROM GSVC_B1_D2
        WHERE GSVC_B1_D2.CERTNO = ${ct}
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
  const { H, D1 } = req.body;
  const { type } = req.params;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);
  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001',${CERTDT}, ${ID})`;
  const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    if (type === 'save') {
      await pool.request().query`
      UPDATE GRCV_CT SET CERT_NO = ${CERTNO[0]['']}, UP_ID = ${ID}, UP_DT = getDate()
      WHERE (RcvNo = ${RcvNo} AND Doc_No = 'B1')
    `;
    } else {
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'B1')
      `;
    }

    await pool.request().query`
      MERGE INTO GSVC_B1_H
        USING (values(1))
          AS Source (Number)
          ON (CERTNO IS NOT NULL)
        WHEN MATCHED THEN
          UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES(${CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});
      `;

    Object.values(D1).forEach(async (v, i) => {
      const TestDt = new Date(v.TestDt.substring(0, 10)).toFormat('MMM.YY');
      await pool.request().query`
              MERGE INTO GSVC_B1_D1
                USING (values(1))
                  AS Source (Number)
                  ON (CERTNO = ${CERTNO[0]['']} AND CERTSEQ = ${i + 1})
                WHEN MATCHED AND (GasType != ${v.GasType} OR SerialNo != ${v.SerialNo} OR TestDt != ${TestDt} OR TareWT != ${
        v.TareWT
      } OR GrossWT != ${v.GrossWT} OR Capacity != ${v.Capacity} OR Press != ${v.Press} OR Temp != ${v.Temp} OR Perform != ${v.Perform}) THEN
                  UPDATE SET GasType = ${v.GasType}, SerialNo = ${v.SerialNo}, TestDt = ${TestDt}, TareWT = ${v.TareWT}, GrossWT = ${
        v.GrossWT
      }, Capacity = ${v.Capacity}, Press = ${v.Press}, Temp = ${v.Temp}, Perform = ${v.Perform}, UP_ID = ${ID}, UP_DT = GetDate()
              WHEN NOT MATCHED THEN
                INSERT (CERTNO, CERTSEQ, GasType, SerialNo, TestDt, TareWT, GrossWT, Capacity, Press, Temp, Perform, IN_ID, UP_ID) VALUES(${
                  CERTNO[0]['']
                }, ${i + 1}, ${v.GasType}, ${v.SerialNo}, ${TestDt}, ${v.TareWT}, ${v.GrossWT}, ${v.Capacity}, ${v.Press}, ${v.Temp}, ${
        v.Perform
      }, ${ID}, ${ID});
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
