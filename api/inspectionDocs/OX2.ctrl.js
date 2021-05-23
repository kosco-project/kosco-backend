const sql = require('mssql');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.details = async (req, res) => {
  const { ct } = req.query;

  try {
    const pool = await sql.connect(config);

    const { recordset: D1 } = await pool.request().query`
        SELECT SetNo1, SetNo2, SetNo3, SetNo4, SetNo5, SetNo6, SetNo7, SetNo8 FROM GSVC_OX2_D1
        WHERE CERTNO = ${ct}
      `;
    const { recordset: D2 } = await pool.request().query`
        SELECT Manuf, Volume, WorkPress, SerialNo, TestDt, Perform FROM GSVC_OX2_D2
        WHERE CERTNO = ${ct}
    `;

    const { recordset: D3 } = await pool.request().query`
        SELECT Value FROM GSVC_OX2_D3
        WHERE CERTNO = ${ct}
    `;

    const D1arr = D1.map((item, i) => ({
      [i]: {
        SetNo1: +item.SetNo1,
        SetNo2: +item.SetNo2,
        SetNo3: +item.SetNo3,
        SetNo4: +item.SetNo4,
        SetNo5: +item.SetNo5,
        SetNo6: +item.SetNo6,
        SetNo7: +item.SetNo7,
        SetNo8: +item.SetNo8,
      },
    }));
    const D1obj = D1arr.reduce((a, c) => ({ ...a, ...c }), {});

    const D2arr = D2.map(({ Manuf, Volume, WorkPress, SerialNo, TestDt, Perform }, i) => ({
      [i]: {
        Manuf,
        Volume,
        WorkPress,
        SerialNo,
        TestDt,
        Perform,
      },
    }));
    const D2obj = D2arr.reduce((a, c) => ({ ...a, ...c }), {});

    res.json({
      D1: D1obj,
      D2: D2obj,
      D3: D3[0].Value,
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
    WHERE (RcvNo = ${RCVNO} AND Doc_No = 'OX2')
  `;

    if (!magamYn[0].MagamYn) {
      await pool.request().query`
      INSERT GDOC_3 (Cert_NO, Doc_No, Doc_Seq, Seq, IN_ID, UP_ID)
      VALUES (${CERTNO[0]['']}, 'OX2', 1, 1, ${ID}, ${ID})
    `;
    }

    if (type === 'save') {
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${H.CERTNO || CERTNO[0]['']}, MagamYn = 0, MagamDt = '', UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RCVNO} AND Doc_No = 'OX2')
      `;
    } else {
      await pool.request().query`
        UPDATE GRCV_CT SET Cert_No = ${H.CERTNO || CERTNO[0]['']}, MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RCVNO} AND Doc_No = 'OX2')
      `;
    }

    await pool.request().query`
      MERGE INTO GSVC_OX2_H
        USING (values (1)) AS Source (Number)
        ON (CERTNO = ${H.CERTNO})
      WHEN MATCHED THEN
        UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});
      
      MERGE INTO GSVC_OX2_D3
        USING (values (1)) AS Source (Number)
        ON (CERTNO = ${H.CERTNO})
      WHEN MATCHED THEN
        UPDATE SET Value = ${D3}, UP_ID = ${ID}, UP_DT = getDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, 1, ${D3}, ${ID}, ${ID});
    `;

    let insertDt = moment().format('YYYY-MM-DD HH:mm:ss');

    if (H.CERTNO) {
      const { recordset: insertInfo } = await pool.request().query`
        SELECT IN_DT FROM GSVC_OX2_D1
        WHERE (CERTNO = ${H.CERTNO} AND CERTSEQ = 1)
      `;

      insertDt = insertInfo[0].IN_DT;

      await pool.request().query`
        SELECT * FROM GSVC_OX2_D1 WHERE CERTNO = ${H.CERTNO}

        BEGIN TRAN
        DELETE FROM GSVC_OX2_D1 WHERE CERTNO = ${H.CERTNO}
        SELECT * FROM GSVC_OX2_D1 WHERE CERTNO = ${H.CERTNO}
        COMMIT TRAN

        SELECT * FROM GSVC_OX2_D2 WHERE CERTNO = ${H.CERTNO}

        BEGIN TRAN
        DELETE FROM GSVC_OX2_D2 WHERE CERTNO = ${H.CERTNO}
        SELECT * FROM GSVC_OX2_D2 WHERE CERTNO = ${H.CERTNO}
        COMMIT TRAN
      `;
    }

    Object.values(D1).forEach(async (v, i) => {
      await pool.request().query`
          INSERT GSVC_OX2_D1 (CERTNO, CERTSEQ, SetNo1, SetNo2, SetNo3, SetNo4, SetNo5, SetNo6, SetNo7, SetNo8, IN_ID, IN_DT, UP_ID)
          VALUES (${H.CERTNO || CERTNO[0]['']}, ${i + 1}, ${v.SetNo1}, ${v.SetNo2}, ${v.SetNo3}, ${v.SetNo4}, ${v.SetNo5}, ${v.SetNo6}, ${
        v.SetNo7
      }, ${v.SetNo8}, ${ID}, ${insertDt}, ${ID});
      `;
    });

    Object.values(D2).forEach(async (v, i) => {
      await pool.request().query`
          INSERT GSVC_OX2_D2 (CERTNO, CERTSEQ, Manuf, Volume, WorkPress, SerialNo, TestDt, Perform, IN_ID, IN_DT, UP_ID)
          VALUES (${H.CERTNO || CERTNO[0]['']}, ${i + 1}, ${v.Manuf}, ${v.Volume}, ${v.WorkPress}, ${v.SerialNo}, ${v.TestDt}, ${
        v.Perform
      }, ${ID}, ${insertDt}, ${ID});
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
