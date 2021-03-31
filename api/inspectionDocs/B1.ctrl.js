const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.inspection = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1 } = req.body;
  const { type } = req.params;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');
  console.log(new Date());

  const pool = await sql.connect(config);
  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001',${CERTDT}, ${ID})`;
  const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  try {
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
      await pool.request().query`
              MERGE INTO GSVC_B1_D1
                USING (values(1))
                  AS Source (Number)
                  ON (CERTNO = ${CERTNO[0]['']} AND CERTSEQ = ${i + 1})
                WHEN MATCHED THEN
                  UPDATE SET CERTNO = ${CERTNO[0]['']}, GasType = ${v.GasType}, SerialNo = ${v.SerialNo}, TestDt = ${new Date().toFormat(
        'MMM.YY'
      )}, TareWT = ${v.TareWT}, GrossWT = ${v.GrossWT}, Capacity = ${v.Capacity}, Press = ${v.Press}, Temp = ${v.Temp}, Perform = ${
        v.Perform
      }, UP_ID = ${ID}, UP_DT = GetDate()
              WHEN NOT MATCHED THEN
                INSERT (CERTNO, CERTSEQ, GasType, SerialNo, TestDt, TareWT, GrossWT, Capacity, Press, Temp, Perform, IN_ID, UP_ID) VALUES(${
                  CERTNO[0]['']
                }, ${i + 1}, ${v.GasType}, ${v.SerialNo}, ${new Date().toFormat('MMM.YY')}, ${v.TareWT}, ${v.GrossWT}, ${v.Capacity}, ${v.Press}, ${
        v.Temp
      }, ${v.Perform}, ${ID}, ${ID});
            `;
    });

    res.status(200).send();
  } catch (e) {
    console.log(e);
    res.status(500).send();
  }
};
