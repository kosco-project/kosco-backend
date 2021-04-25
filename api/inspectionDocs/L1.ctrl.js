const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

exports.inspection = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D2 } = req.body;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;
  const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  const { type } = req.params;

  const ExpiryDate = Object.values(D2[2])
    .slice(1, 5)
    .map(date => new Date(date.substring(0, 10)).toFormat('MMM.YY'));

  const ExpiryDateDESCT = D2[2].DESCT;

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    if (type === 'save') {
      // 임시저장 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${CERTNO[0]['']}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'L1')
      `;
    } else {
      // complete -> 검사완료 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'L1')
      `;
    }

    // GSVC 테이블에 데이터 삽입
    await pool.request().query`
      MERGE INTO GSVC_L1_H
        USING(values (1))
          AS Source (Number)
          ON (CERTNO IS NOT NULL)
        WHEN MATCHED THEN
          UPDATE SET UP_ID = ${ID}, UP_DT = GetDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES(${CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});
      `;

    Object.values(D2)
      .slice(0, 2)
      .forEach(async (v, i) => {
        await pool.request().query`
          MERGE INTO GSVC_L1_D2
            USING(values (1))
              AS Source (Number)
              ON (CERTNO = ${CERTNO[0]['']} AND CERTSEQ = ${i + 1})
            WHEN MATCHED AND (Value1 != ${v.Value1} OR Value2 != ${v.Value2} OR Value3 != ${v.Value3} OR Value4 != ${v.Value4}) THEN
              UPDATE SET UP_ID = ${ID}, UP_DT = GetDate(), DESCT = ${v.DESCT}, Value1 = ${v.Value1}, Value2 = ${v.Value2}, Value3 = ${
          v.Value3
        }, Value4 = ${v.Value4}
            WHEN NOT MATCHED THEN
              INSERT (CERTNO, CERTSEQ, DESCT, Value1, Value2, Value3, Value4, IN_ID, UP_ID) VALUES(${CERTNO[0]['']}, ${i + 1}, ${v.DESCT}, ${
          v.Value1
        }, ${v.Value2}, ${v.Value3}, ${v.Value4}, ${ID}, ${ID});
        `;
      });

    await pool.request().query`
          MERGE INTO GSVC_L1_D2
            USING(values (1))
              AS Source (Number)
              ON (CERTNO = ${CERTNO[0]['']} AND CERTSEQ = 3)
            WHEN MATCHED AND (Value1 != ${ExpiryDate[0]} OR Value2 != ${ExpiryDate[1]} OR Value3 != ${ExpiryDate[2]} OR Value4 != ${ExpiryDate[3]}) THEN
              UPDATE SET UP_ID = ${ID}, UP_DT = GetDate(), DESCT = ${ExpiryDateDESCT}, Value1 = ${ExpiryDate[0]}, Value2 = ${ExpiryDate[1]}, Value3 = ${ExpiryDate[2]}, Value4 = ${ExpiryDate[3]}
            WHEN NOT MATCHED THEN
              INSERT (CERTNO, CERTSEQ, DESCT, Value1, Value2, Value3, Value4, IN_ID, UP_ID) VALUES(${CERTNO[0]['']}, 3, ${ExpiryDateDESCT}, ${ExpiryDate[0]}, ${ExpiryDate[1]}, ${ExpiryDate[2]}, ${ExpiryDate[3]}, ${ID}, ${ID});
        `;

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
