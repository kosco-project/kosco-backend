const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.save = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1, D2 } = req.body;
  const { VESSELNM } = H;
  const date = new Date();
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;

  try {
    await pool.request().query`
      merge into GSVC_A3_H
      using(values (1))
        as Source (Number)
        on (CERTNO = ${CERTNO[0]['']})
      when matched then
        update set UP_ID = ${ID}, UP_DT = GetDate()
      when not matched then
        insert (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) values(${CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});
      `;

    Object.values(D1).forEach(async (v, i) => {
      await pool.request().query`
        merge into GSVC_A3_D1
        using(values (1))
          as Source (Number)
          on (CERTNO = ${CERTNO[0]['']} and CERTSEQ = ${i + 1})
        when matched and (Unit != ${v.unit} or Remark != ${v.remarks} or Value != ${v.value}) then
          update set UP_ID = ${ID}, UP_DT = GetDate(), Value = ${v.value}, Unit = ${v.unit}, Remark = ${v.remarks}
        when not matched then
          insert (CERTNO, CERTSEQ, Value, Unit, Remark, IN_ID, UP_ID) values(${CERTNO[0]['']}, ${i + 1}, ${v.value}, ${v.unit}, ${
        v.remarks
      }, ${ID}, ${ID});
      `;
    });

    Object.values(D2).forEach(async (v, i) => {
      await pool.request().query`merge into GSVC_A3_D2 
      using(values (1)) 
        as Source (Number)
        on (CERTNO = ${CERTNO[0]['']} and CERTSEQ = ${i + 1})
      when matched and (CarriedOut != ${v.carriedOut.toString()} or NotCarried != ${v.notCarried.toString()} or Remark != ${v.remarks}) then 
        update set CarriedOut = ${v.carriedOut.toString()}, NotCarried = ${v.notCarried}, Remark = ${v.remarks}, UP_ID = ${ID}, UP_DT = GetDate() 
      when not matched then
        insert (CERTNO, CERTSEQ, CarriedOut, NotCarried, Remark, IN_ID, UP_ID) values(${CERTNO[0]['']}, ${i + 1}, ${v.carriedOut}, ${v.notCarried}, ${
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
