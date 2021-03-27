const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.save = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1 } = req.body;
  const { CERTNO, VESSELNM } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  try {
    const { recordset: CERT_NO } = await pool.request().query('SELECT CERTNO from GSVC_B1_H');

    if (!CERT_NO.length) {
      await pool.request().query`insert GSVC_B1_H(CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) values(${CERTNO}, ${CERTDT},${VESSELNM}, ${ID}, ${ID})`;

      Object.values(D1).forEach(async (v, i) => {
        await pool.request()
          .query`insert into GSVC_B1_D1(CERTNO, CERTSEQ, GasType, SerialNo, TestDt, TareWT, GrossWT, Capacity, Press, Temp, Perform, IN_ID, UP_ID) values (${CERTNO}, ${
          i + 1
        }, ${v.GasType}, ${v.SerialNo}, ${v.TestDt.toFormat('MMM.YY')}, ${v.TareWT}, ${v.GrossWT}, ${v.Capacity}, ${v.Press}, ${v.Temp}, ${
          v.Perform
        }, ${ID}, ${ID})`;
      });
    } else {
      await pool.request().query`update GSVC_B1_H set UP_ID = ${ID}, UP_DT = GetDate()`;

      Object.values(D1).forEach(async (v, i) => {
        await pool.request().query`update GSVC_B1_D1 set CERTNO = ${CERTNO}, CERTSEQ = ${i + 1}, GasType = ${v.GasType}, SerialNo = ${
          v.SerialNo
        }, TestDt = ${v.TestDt}, TareWT = ${v.TareWT.toFormat('MMM.YY')}, GrossWT = ${v.GrossWT}, Capacity = ${v.Capacity}, Press = ${
          v.Press
        }, Temp = ${v.Temp}, Perform = ${v.Perform}, UP_ID = ${ID}, UP_DT = GetDate()`;
      });
    }
    res.status(200).send();
  } catch (e) {
    res.status(500).send(e);
  }
};
