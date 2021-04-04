const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

exports.inspection = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1, D2 } = req.body;
  const { type } = req.params;
  const { SHIPNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;
  const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    if (type === 'save') {
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${CERTNO[0]['']}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'P1')
    `;
    } else {
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'P1')
      `;
    }

    await pool.request().query`
      MERGE INTO GSVC_P1_H
        USING (values (1)) AS Source (Number)
        ON (CERTNO IS NOT NULL)
      WHEN MATCHED THEN
        UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTDT, ShipNm, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, ${CERTDT}, ${SHIPNM}, ${ID}, ${ID});

      MERGE INTO GSVC_P1_D2
        USING (values (1)) AS Source (Number)
        ON (CERTNO = ${CERTNO[0]['']})
      WHEN MATCHED AND (Value != ${D2}) THEN
        UPDATE SET Value = ${D2}, UP_ID = ${ID}, UP_DT = getDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, 1, ${D2}, ${ID}, ${ID});
    `;

    Object.values(D1).forEach(async (v, i) => {
      await pool.request().query`
        MERGE INTO GSVC_P1_D1
          USING (values (1)) AS Source (Number)
          ON (CERTNO = ${CERTNO[0]['']} AND CERTSEQ = ${i + 1})
        WHEN MATCHED AND (ProductType != ${v.ProductType} OR Qty != ${v.Qty} OR Size != ${v.Size} OR Perform != ${v.Perform}) THEN
          UPDATE SET ProductType = ${v.ProductType}, Qty = ${v.Qty}, Size = ${v.Size}, Perform = ${v.Perform}, UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTSEQ, ProductType, Qty, Size, Perform, IN_ID, UP_ID) VALUES (${CERTNO[0]['']}, ${i + 1}, ${v.ProductType}, ${v.Qty}, ${
        v.Size
      }, ${v.Perform}, ${ID}, ${ID});
      `;
    });

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
