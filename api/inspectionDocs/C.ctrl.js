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
        SELECT GSVC_C_D1.Value FROM GSVC_C_D1
        WHERE GSVC_C_D1.CERTNO = ${ct}
      `;
    const { recordset: D2 } = await pool.request().query`
        SELECT GSVC_C_D2.Value FROM GSVC_C_D2
        WHERE GSVC_C_D2.CERTNO = ${ct}
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
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'C')
      `;
    } else {
      // complete -> 검사완료 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'C')
      `;
    }

    // GSVC 테이블에 데이터 삽입
    await pool.request().query`
      merge into GSVC_C_H
      using(values (1))
        as Source (Number)
        on (CERTNO IS NOT NULL)
      when matched then
        update set UP_ID = ${ID}, UP_DT = GetDate()
      when not matched then
        insert (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) values(${CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});
      `;

    Object.values(D1).forEach(async (v, i) => {
      await pool.request().query`
        merge into GSVC_C_D1
        using(values (1))
          as Source (Number)
          on (CERTNO = ${CERTNO[0]['']} and CERTSEQ = ${i + 1})
        when matched and (Value != ${v}) then
          update set Value = ${v}, UP_ID = ${ID}, UP_DT = GetDate()
        when not matched then
          insert (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) values(${CERTNO[0]['']}, ${i + 1}, ${v}, ${ID}, ${ID});
      `;
    });

    Object.values(D2).forEach(async (v, i) => {
      await pool.request().query`merge into GSVC_C_D2
        using(values (1))
          as Source (Number)
          on (CERTNO = ${CERTNO[0]['']} and CERTSEQ = ${i + 1})
        when matched and (CarriedOut != ${v.CarriedOut.toString()} or NotCarried != ${v.NotCarried.toString()} or NotApp != ${v.NotApp.toString()} or Comm != ${
        v.Comm
      }) then
          update set CarriedOut = ${v.CarriedOut}, NotCarried = ${v.NotCarried}, NotApp = ${v.NotApp}, Comm = ${
        v.Comm
      }, UP_ID = ${ID}, UP_DT = GetDate()
        when not matched then
          insert (CERTNO, CERTSEQ, CarriedOut, NotCarried, NotApp, Comm, IN_ID, UP_ID) values(${CERTNO[0]['']}, ${i + 1}, ${v.CarriedOut}, ${
        v.NotCarried
      }, ${v.NotApp}, ${v.Comm}, ${ID}, ${ID});
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
