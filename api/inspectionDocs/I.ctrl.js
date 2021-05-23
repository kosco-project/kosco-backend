const sql = require('mssql');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.details = async (req, res) => {
  const { ct } = req.query;

  try {
    const pool = await sql.connect(config);

    const { recordset: D1 } = await pool.request().query`
        SELECT SerNo, ManufType, ManufDt FROM GSVC_I_D1
        WHERE CERTNO = ${ct}
      `;
    const { recordset: D2 } = await pool.request().query`
        SELECT Value FROM GSVC_I_D2
        WHERE CERTNO = ${ct}
    `;

    const { recordset: D3 } = await pool.request().query`
        SELECT Normal, Abnormal FROM GSVC_I_D3
        WHERE CERTNO = ${ct}
    `;

    const D1arr = D1.map(({ SerNo, ManufType, ManufDt }, i) => ({
      [i]: {
        SerNo,
        ManufType,
        ManufDt,
      },
    }));
    const D1obj = D1arr.reduce((a, c) => ({ ...a, ...c }), {});

    const D2arr = D2.map(({ Value }, i) => ({ [i]: Value }));
    const D2obj = D2arr.reduce((a, c) => ({ ...a, ...c }), {});

    const D3arr = D3.map((item, i) => ({
      [i]: {
        Normal: +item.Normal,
        Abnormal: +item.Abnormal,
      },
    }));
    const D3obj = D3arr.reduce((a, c) => ({ ...a, ...c }), {});

    res.json({
      D1: D1obj,
      D2: D2obj,
      D3: D3obj,
    });
  } catch (e) {
    console.log(e);
    res.status(500).send();
  }
};

exports.inspection = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1, D2, D3 } = req.body;
  const { type } = req.params;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;

  try {
    jwt.verify(token, process.env.JWT_SECRET);

    const { recordset: magamYn } = await pool.request().query`
    SELECT MagamYn FROM GRCV_CT
    WHERE (RcvNo = ${RCVNO} AND Doc_No = 'I')
  `;

    if (!magamYn[0].MagamYn) {
      await pool.request().query`
      INSERT GDOC_3 (Cert_NO, Doc_No, Doc_Seq, Seq, IN_ID, UP_ID)
      VALUES (${CERTNO[0]['']}, 'I', 1, 1, ${ID}, ${ID})
    `;
    }

    if (type === 'save') {
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${H.CERTNO || CERTNO[0]['']}, MagamYn = 0, MagamDt = '', UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RCVNO} AND Doc_No = 'I')
      `;
    } else {
      await pool.request().query`
        UPDATE GRCV_CT SET Cert_No = ${H.CERTNO || CERTNO[0]['']}, MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RCVNO} AND Doc_No = 'I')
      `;
    }

    await pool.request().query`
      MERGE INTO GSVC_I_H
        USING (values (1)) AS Source (Number)
          ON (CERTNO = ${H.CERTNO})
        WHEN MATCHED THEN
          UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});
    `;

    let insertDt = moment().format('YYYY-MM-DD HH:mm:ss');

    if (H.CERTNO) {
      const { recordset: insertInfo } = await pool.request().query`
        SELECT IN_DT FROM GSVC_I_D1
        WHERE (CERTNO = ${H.CERTNO} AND CERTSEQ = 1)
      `;
      insertDt = insertInfo[0].IN_DT;

      await pool.request().query`
        SELECT * FROM GSVC_I_D1 WHERE CERTNO = ${H.CERTNO}

        BEGIN TRAN
        DELETE FROM GSVC_I_D1 WHERE CERTNO = ${H.CERTNO}
        SELECT * FROM GSVC_I_D1 WHERE CERTNO = ${H.CERTNO}
        COMMIT TRAN
      `;
    }

    Object.values(D1).forEach(async (v, i) => {
      const ManufDt = moment(v.ManufDt).format('YYYY-MM');
      await pool.request().query`
        INSERT GSVC_I_D1 (CERTNO, CERTSEQ, SerNo, ManufType, ManufDt, IN_ID, IN_DT, UP_ID) VALUES (${H.CERTNO || CERTNO[0]['']}, ${i + 1}, ${
        v.SerNo
      }, ${v.ManufType}, ${ManufDt}, ${ID}, ${insertDt}, ${ID});
      `;
    });

    Object.values(D2).forEach(async (v, i) => {
      await pool.request().query`
        MERGE INTO GSVC_I_D2
          USING (values (1)) AS Source (Number)
            ON (CERTNO = ${H.CERTNO} AND CERTSEQ = ${i + 1})
          WHEN MATCHED AND (Value != ${v}) THEN
            UPDATE SET Value = ${v}, UP_ID = ${ID}, UP_DT = getDate()
          WHEN NOT MATCHED THEN
            INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, ${i + 1}, ${v}, ${ID}, ${ID});
      `;
    });

    Object.values(D3).forEach(async (v, i) => {
      await pool.request().query`
        MERGE INTO GSVC_I_D3
          USING (values (1)) AS Source (Number)
            ON (CERTNO = ${H.CERTNO} AND CERTSEQ = ${i + 1})
          WHEN MATCHED AND (Normal != ${v.Normal}) THEN
            UPDATE SET Normal = ${v.Normal}, Abnormal = ${v.Abnormal}, UP_ID = ${ID}, UP_DT = getDate()
          WHEN NOT MATCHED THEN
            INSERT (CERTNO, CERTSEQ, Normal, Abnormal, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, ${i + 1}, ${v.Normal}, ${v.Abnormal}, ${ID}, ${ID});
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
