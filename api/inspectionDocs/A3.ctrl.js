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
        SELECT Value, Unit, Remark FROM GSVC_A3_D1
        WHERE GSVC_A3_D1.CERTNO = ${ct}
      `;
    const { recordset: D2 } = await pool.request().query`
        SELECT CarriedOut, NotCarried, Remark FROM GSVC_A3_D2
        WHERE GSVC_A3_D2.CERTNO = ${ct}
    `;

    const D1arr = D1.map(({ Value, Unit, Remark }, i) => ({ [i]: { Value, Unit, Remark } }));
    const D1obj = D1arr.reduce((a, c) => ({ ...a, ...c }), {});

    const D2arr = D2.map((item, i) => ({
      [i]: {
        CarriedOut: +item.CarriedOut,
        NotCarried: +item.NotCarried,
        Remark: item.Remark,
      },
    }));
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
  const { type } = req.params;
  const { H, D1, D2 } = req.body;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);
  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;

  try {
    jwt.verify(token, process.env.JWT_SECRET);

    const { recordset: magamYn } = await pool.request().query`
      SELECT MagamYn FROM GRCV_CT
      WHERE (RcvNo = ${RCVNO} AND Doc_No = 'A3')
  `;

    if (!magamYn[0].MagamYn) {
      await pool.request().query`
      INSERT GDOC_3 (Cert_NO, Doc_No, Doc_Seq, Seq, IN_ID, UP_ID)
      VALUES (${CERTNO[0]['']}, 'A3', 1, 1, ${ID}, ${ID})
    `;
    }

    if (type === 'save') {
      // 임시저장 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${H.CERTNO || CERTNO[0]['']}, MagamYn = 0, MagamDt = '', UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RCVNO} AND Doc_No = 'A3')
      `;
    } else {
      // complete -> 검사완료 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET Cert_No = ${H.CERTNO || CERTNO[0]['']}, MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RCVNO} AND Doc_No = 'A3')
      `;
    }
    // GSVC 테이블에 데이터 삽입
    await pool.request().query`
      MERGE INTO GSVC_A3_H
      USING(values (1))
        AS Source (Number)
        ON (CERTNO IS NOT NULL)
      WHEN MATCHED THEN
        UPDATE SET UP_ID = ${ID}, UP_DT = GetDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES(${H.CERTNO || CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});
    `;

    Object.values(D1).forEach(async (v, i) => {
      await pool.request().query`
        MERGE INTO GSVC_A3_D1
        USING(values (1))
          AS Source (Number)
          ON (CERTNO = ${H.CERTNO || CERTNO[0]['']} AND CERTSEQ = ${i + 1})
        WHEN MATCHED AND (Unit != ${v.Unit} OR Remark != ${v.Remarks} OR Value != ${v.Value}) THEN
          UPDATE SET UP_ID = ${ID}, UP_DT = GetDate(), Value = ${v.Value}, Unit = ${v.Unit}, Remark = ${v.Remark}
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTSEQ, Value, Unit, Remark, IN_ID, UP_ID) values(${H.CERTNO || CERTNO[0]['']}, ${i + 1}, ${v.Value}, ${v.Unit}, ${
        v.Remark
      }, ${ID}, ${ID});
      `;
    });

    Object.values(D2).forEach(async (v, i) => {
      // D2에서 17번째 항목만 양식이 다름
      if (i === 16) {
        await pool.request().query`
          MERGE INTO GSVC_A3_D2
          USING(values (1))
            AS Source (Number)
            ON (CERTNO = ${H.CERTNO || CERTNO[0]['']} and CERTSEQ = ${i + 1})
      WHEN MATCHED AND (CarriedOut != ${v.CarriedOut.toString()}) THEN 
        UPDATE SET CarriedOut = ${v.CarriedOut}, UP_ID = ${ID}, UP_DT = GetDate() 
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTSEQ, CarriedOut, IN_ID, UP_ID) values(${H.CERTNO || CERTNO[0]['']}, ${i + 1}, ${v.CarriedOut}, ${ID}, ${ID});
        `;
      } else {
        await pool.request().query`
      MERGE INTO GSVC_A3_D2 
      USING(values (1)) 
        AS Source (Number)
        ON (CERTNO = ${H.CERTNO || CERTNO[0]['']} and CERTSEQ = ${i + 1})
      WHEN MATCHED AND (CarriedOut != ${v.CarriedOut.toString()} OR NotCarried != ${v.NotCarried.toString()} OR Remark != ${v.Remark}) THEN 
        UPDATE SET CarriedOut = ${v.CarriedOut}, NotCarried = ${v.NotCarried}, Remark = ${v.Remark}, UP_ID = ${ID}, UP_DT = GetDate() 
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTSEQ, CarriedOut, NotCarried, Remark, IN_ID, UP_ID) values(${H.CERTNO || CERTNO[0]['']}, ${i + 1}, ${v.CarriedOut}, ${
          v.NotCarried
        }, ${v.Remark}, ${ID}, ${ID});
  `;
      }
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
