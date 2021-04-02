const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.inspection = async (req, res) => {
  const path = req.path.split('/')[1];
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1, D2, D3 } = req.body;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;
  const { recordset: RcvNos } = await pool.request().query`SELECT RcvNo FROM GRCV_CT WHERE (RcvNo = ${RCVNO})`;
  const RcvNo = RcvNos.map(({ RcvNo }) => RcvNo)[0];

  const { type } = req.params;
  try {
    if (type === 'save') {
      await pool.request().query`
        UPDATE GRCV_CT SET CERT_NO = ${CERTNO[0]['']}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = ${path})
      `;
    } else {
      await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RcvNo} AND Doc_No = ${path})
      `;
    }

    await pool.request().input('path', sql.NChar, path).input('CERTNO', sql.NChar, CERTNO[0]['']).input('value', sql.NChar, D3).query(`
      MERGE INTO [GSVC_${path}_H]
        USING (values (1)) AS Source (Number)
          ON (CERTNO IS NOT NULL)
        WHEN MATCHED THEN
          UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES(@CERTNO, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});

      MERGE INTO [GSVC_${path}_D3]
        USING (values (1)) AS Source (Number)
          ON (CERTNO = @CERTNO)
        WHEN MATCHED THEN
          UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES(@CERTNO, 1, @value, ${ID}, ${ID});
    `);

    Object.values(D1).forEach(async (v, i) => {
      await pool
        .request()
        .input('path', sql.NChar, path)
        .input('CERTNO', sql.NChar, CERTNO[0][''])
        .input('ins1', sql.NChar, v.ins1)
        .input('ins2', sql.NChar, v.ins2)
        .input('ins3', sql.NChar, v.ins3)
        .input('ins4', sql.NChar, v.ins4)
        .input('ins5', sql.NChar, v.ins5)
        .input('ins6', sql.NChar, v.ins6)
        .input('ins7', sql.NChar, v.ins7)
        .input('ins8', sql.NChar, v.ins8).query(`
        MERGE INTO [GSVC_${path}_D1]
          USING (values (1)) AS Source (Number)
          ON (CERTNO = @CERTNO)
          WHEN MATCHED AND (ins1 != @ins1 OR ins2 != @ins2 OR ins3 != @ins3 OR ins4 != @ins4 OR ins5 != @ins5 OR ins6 != @ins6 OR ins7 != @ins7 OR ins8 != @ins8) THEN
          UPDATE SET ins1 = @ins1, ins2 = @ins2, ins3 = @ins3, ins4 = @ins4, ins5 = @ins5, ins6 = @ins6, ins7 = @ins7, ins8 = @ins8, UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTSEQ, ins1, ins2, ins3, ins4, ins5, ins6, ins7, ins8, IN_ID, UP_ID) VALUES(@CERTNO, 1, @ins1, @ins2, @ins3, @ins4, @ins5, @ins6, @ins7, @ins8, ${ID}, ${ID});
      `);
    });

    Object.values(D2).forEach(async (v, i) => {
      await pool
        .request()
        .input('path', sql.NChar, path)
        .input('CERTNO', sql.NChar, CERTNO[0][''])
        .input('CERTSEQ', sql.NChar, i + 1)
        .input('Manuf', sql.NChar, v.Manuf)
        .input('Type', sql.NChar, v.Type)
        .input('SerialNo', sql.NChar, v.SerialNo)
        .input('Remark', sql.NChar, v.Remark).query(`
        MERGE INTO [GSVC_${path}_D2]
          USING (values (1)) AS Source (Number)
          ON (CERTNO = @CERTNO AND CERTSEQ = @CERTSEQ)
          WHEN MATCHED AND (Manuf != @Manuf OR Type != @Type OR SerialNo != @SerialNo OR Remark != @Remark) THEN
            UPDATE SET Manuf = @Manuf, Type = @Type, SerialNo = @SerialNo, Remark = @Remark, UP_ID = ${ID}, UP_DT = getDate()
          WHEN NOT MATCHED THEN
            INSERT (CERTNO, CERTSEQ, Manuf, Type, SerialNo, Remark, IN_ID, UP_ID) VALUES (@CERTNO, @CERTSEQ, @Manuf, @Type, @SerialNo, @Remark, ${ID}, ${ID});
      `);
    });

    res.status(200).send();
  } catch (e) {
    console.log(e);
    res.status(500).send();
  }
};
