const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

exports.inspection = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1, D2 } = req.body;
  const { type } = req.params;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;
  const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  const expiry_date = new Date(D2.expiry_date.substring(0, 10)).toFormat('MMM.YY');

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    if (type === 'save') {
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${CERTNO[0]['']}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'F2')
    `;
    } else {
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'F2')
      `;
    }

    await pool.request().query`
      MERGE INTO GSVC_F2_H
        USING (values (1)) AS Source (Number)
        ON (CERTNO IS NOT NULL)
      WHEN MATCHED THEN
        UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});

      MERGE INTO GSVC_F2_D2
        USING (values (1)) AS Source (Number)
        ON (CERTNO IS NOT NULL)
      WHEN MATCHED AND (confirm != ${D2.confirm} OR f_pressure != ${D2.f_pressure} OR f_depth != ${D2.f_depth} OR expiry_date != ${expiry_date} OR value1 != ${D2.value1} OR value2 != ${D2.value2} OR recommend != ${D2.recommend}) THEN
        UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTSEQ, confirm, f_pressure, f_depth, expiry_date, value1, value2, recommend, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, 1, ${D2.confirm}, ${D2.f_pressure}, ${D2.f_depth}, ${expiry_date}, ${D2.value1}, ${D2.value2}, ${D2.recommend}, ${ID}, ${ID});
    `;

    Object.values(D1).forEach(async (v, i) => {
      await pool.request().query`
        MERGE INTO GSVC_F2_D1
          USING (values (1)) AS Source (Number)
          ON (CERTNO = ${CERTNO[0]['']} AND CERTSEQ = ${i + 1})
        WHEN MATCHED AND (manuf != ${v.manuf} OR type != ${v.type} OR s_no != ${v.s_no} OR remark != ${v.remark}) THEN
          UPDATE SET manuf = ${v.manuf}, type = ${v.type}, s_no = ${v.s_no}, remark = ${v.remark}, UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTSEQ, manuf, type, s_no, remark, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, ${i + 1}, ${v.manuf}, ${v.type}, ${v.s_no}, ${
        v.remark
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