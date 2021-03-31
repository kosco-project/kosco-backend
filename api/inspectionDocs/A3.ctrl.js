const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

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
    if (type === 'save') {
      // 임시저장 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${CERTNO[0]['']}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'A3')
      `;
    } else {
      // complete -> 검사완료 시 GRCV_CT 테이블에 데이터 삽입
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = 'A3')
      `;
    }

    // GSVC 테이블에 데이터 삽입
    await pool.request().query`
      MERGE INTO GSVC_A3_H
      USING(values (1))
        AS Source (Number)
        ON (CERTNO = ${CERTNO[0]['']})
      WHEN MATCHED THEN
        UPDATE SET UP_ID = ${ID}, UP_DT = GetDate()
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES(${CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});
    `;

    Object.values(D1).forEach(async (v, i) => {
      await pool.request().query`
        MERGE INTO GSVC_A3_D1
        USING(values (1))
          AS Source (Number)
          ON (CERTNO = ${CERTNO[0]['']} AND CERTSEQ = ${i + 1})
        WHEN MATCHED AND (Unit != ${v.unit} OR Remark != ${v.remarks} OR Value != ${v.value}) THEN
          UPDATE SET UP_ID = ${ID}, UP_DT = GetDate(), Value = ${v.value}, Unit = ${v.unit}, Remark = ${v.remarks}
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTSEQ, Value, Unit, Remark, IN_ID, UP_ID) values(${CERTNO[0]['']}, ${i + 1}, ${v.value}, ${v.unit}, ${
        v.remarks
      }, ${ID}, ${ID});
      `;
    });

    Object.values(D2).forEach(async (v, i) => {
      await pool.request().query`
      MERGE INTO GSVC_A3_D2 
      USING(values (1)) 
        AS Source (Number)
        ON (CERTNO = ${CERTNO[0]['']} and CERTSEQ = ${i + 1})
      WHEN MATCHED AND (CarriedOut != ${v.carriedOut.toString()} OR NotCarried != ${v.notCarried.toString()} OR Remark != ${v.remarks}) THEN 
        UPDATE SET CarriedOut = ${v.carriedOut}, NotCarried = ${v.notCarried}, Remark = ${v.remarks}, UP_ID = ${ID}, UP_DT = GetDate() 
      WHEN NOT MATCHED THEN
        INSERT (CERTNO, CERTSEQ, CarriedOut, NotCarried, Remark, IN_ID, UP_ID) values(${CERTNO[0]['']}, ${i + 1}, ${v.carriedOut}, ${v.notCarried}, ${
        v.remarks
      }, ${ID}, ${ID});
  `;
    });
    res.status(200).send();
  } catch (e) {
    console.error(e);
    res.status(500).send();
  }
};
