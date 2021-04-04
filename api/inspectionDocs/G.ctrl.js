const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.inspection = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D2, D3 } = req.body;
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
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'G')
      `;
    } else {
      // complete -> 검사완료 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'G')
      `;
    }

    // GSVC 테이블에 데이터 삽입
    await pool.request().query`
      merge into GSVC_G_H
      using(values (1))
        as Source (Number)
        on (CERTNO IS NOT NULL)
      when matched then
        update set UP_ID = ${ID}, UP_DT = GetDate()
      when not matched then
        insert (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) values(${CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});
      `;

    Object.values(D2).forEach(async (v, i) => {
      const TestDt = new Date(v.TestDt.substring(0, 10)).toFormat('MMM.YY');
      await pool.request().query`
        MERGE INTO GSVC_G_D2
        USING(values (1))
          AS Source (Number)
          ON (CERTNO = ${CERTNO[0]['']} AND CERTSEQ = ${i + 1})
        WHEN MATCHED AND (Qty != ${v.Qty} OR SerialNo != ${v.SerialNo} OR Manuf != ${v.Manuf} OR Type != ${v.Type} OR Capacity != ${
        v.Capacity
      } OR TestDt != ${TestDt} OR Perform != ${v.Perform}) THEN
          UPDATE SET UP_ID = ${ID}, UP_DT = GetDate(), Qty = ${v.Qty}, SerialNo = ${v.SerialNo}, Manuf = ${v.Manuf}, Type = ${v.Type}, Capacity = ${
        v.Capacity
      }, TestDt = ${TestDt}, Perform = ${v.Perform}
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTSEQ, Qty, SerialNo, Manuf, Type, Capacity, TestDt, Perform, IN_ID, UP_ID) VALUES(${CERTNO[0]['']}, ${i + 1}, ${
        v.Qty
      }, ${v.SerialNo}, ${v.Manuf}, ${v.Type}, ${v.Capacity}, ${TestDt}, ${v.Perform}, ${ID}, ${ID});
      `;
    });

    await pool.request().query`
      MERGE INTO GSVC_G_D3
      USING(values (1))
        AS Source (Number)
        ON (CERTNO = ${CERTNO[0]['']} and CERTSEQ = 1)
      WHEN MATCHED AND (Value != ${D3}) THEN
        UPDATE SET Value = ${D3}, UP_ID = ${ID}, UP_DT = GetDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES(${CERTNO[0]['']}, 1, ${D3}, ${ID}, ${ID});
    `;

    res.status(200).send();
  } catch (e) {
    console.error(e);
    if (e.name === 'TokenExpiredError') {
      return res.status(419).json({ code: 419, message: '토큰이 만료되었습니다.' });
    } else if (e.name === 'JsonWebTokenError') {
      return res.status(401).json({ code: 401, message: '유효하지 않은 토큰입니다.' });
    } else {
      res.status(500).send();
    }
  }
};
