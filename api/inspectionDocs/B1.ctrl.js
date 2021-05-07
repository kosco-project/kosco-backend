const sql = require('mssql');
const jwt = require('jsonwebtoken');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.details = async (req, res) => {
  const { ct } = req.query;

  try {
    const pool = await sql.connect(config);

    const { recordset: D1 } = await pool.request().query`
        SELECT GasType, SerialNo, TestDt, TareWT, GrossWT, Capacity, Press, Temp, Perform FROM GSVC_B1_D1
        WHERE GSVC_B1_D1.CERTNO = ${ct}
      `;

    const D1arr = D1.map((item, i) => {
      const { GasType, SerialNo, TestDt, TareWT, GrossWT, Capacity, Press, Temp, Perform } = item;
      return {
        [i]: {
          GasType,
          SerialNo,
          TestDt,
          TareWT,
          GrossWT,
          Capacity,
          Press,
          Temp,
          Perform,
        },
      };
    });
    const D1obj = D1arr.reduce((a, c) => ({ ...a, ...c }), {});

    res.json({
      D1: D1obj,
    });
  } catch (e) {
    console.log(e);
    res.status(500).send();
  }
};

exports.inspection = async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1 } = req.body;
  const { type } = req.params;
  const { VESSELNM, RCVNO } = H;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);
  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001',${CERTDT}, ${ID})`;

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    if (type === 'save') {
      // 마감 한 문서 => 임시 저장 => 임시 저장 문서로 변경
      const { recordset: magamYn } = await pool.request().query`
      UPDATE GRCV_CT SET CERT_NO = ${H.CERTNO || CERTNO[0]['']}, UP_ID = ${ID}, UP_DT = getDate()
      WHERE (RcvNo = ${RCVNO} AND Doc_No = 'B1')

      SELECT MagamYn FROM GRCV_CT
      WHERE (RcvNo = ${RCVNO} AND Doc_No = 'B1')
    `;
      const { recordset: magam } = await pool.request().query`
    SELECT MagamYn FROM GRCV_CT
    WHERE (RcvNo = 'SN2012050002' AND Doc_No = 'B1')
  `;
      // 완료한 문서를 임시 저장하면 magam을 다시 0으로
      if (magamYn[0].MagamYn === '1') {
        await pool.request().query`
        UPDATE GRCV_CT SET MagamYn = 0, MagamDt = ''
        WHERE (RcvNo = ${RCVNO} AND Doc_No = 'B1')
      `;
      }
    } else {
      // 검사 완료
      await pool.request().query`
        UPDATE GRCV_CT SET Cert_No = ${H.CERTNO || CERTNO[0]['']}, MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = ${RCVNO} AND Doc_No = 'B1')
      `;
    }

    // B1_H
    await pool.request().query`
      MERGE INTO GSVC_B1_H
        USING (values(1))
          AS Source (Number)
          ON (CERTNO IS NOT NULL)
        WHEN MATCHED THEN
          UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES(${H.CERTNO || CERTNO[0]['']}, ${CERTDT}, ${VESSELNM}, ${ID}, ${ID});
      `;

    // request로 받지 않은 내용은 행 삭제를 해야 한다.
    let insertDt = '';
    if (H.CERTNO) {
      const { recordset: insertInfo } = await pool.request().query`
        SELECT IN_DT FROM GSVC_B1_D1
        WHERE (CERTNO = ${H.CERTNO} AND CERTSEQ = 1)
      `;
      insertDt = insertInfo[0].IN_DT;

      await pool.request().query`
        SELECT * FROM GSVC_B1_D1 WHERE CERTNO = ${H.CERTNO}

        BEGIN TRAN
        DELETE FROM GSVC_B1_D1 WHERE CERTNO = ${H.CERTNO}
        SELECT * FROM GSVC_B1_D1 WHERE CERTNO = ${H.CERTNO}
        COMMIT TRAN
      `;
    }

    Object.values(D1).forEach(async (v, i) => {
      const { GasType, SerialNo, TestDt, TareWT, GrossWT, Capacity, Press, Temp, Perform } = v;

      await pool.request().query`
        INSERT GSVC_B1_D1 (CERTNO, CERTSEQ, GasType, SerialNo, TestDt, TareWT, GrossWT, Capacity, Press, Temp, Perform, IN_ID, IN_DT, UP_ID)
        VALUES(${H.CERTNO || CERTNO[0]['']}, ${
        i + 1
      }, ${GasType}, ${SerialNo}, ${TestDt}, ${TareWT}, ${GrossWT}, ${Capacity}, ${Press}, ${Temp}, ${Perform}, ${ID}, ${
        insertDt || new Date()
      }, ${ID});
      `;

      // await pool.request().query`
      //         MERGE INTO GSVC_B1_D1
      //           USING (values(1))
      //             AS Source (Number)
      //             ON (CERTNO = ${H.CERTNO || CERTNO[0]['']} AND CERTSEQ = ${i + 1})
      //           WHEN MATCHED AND (GasType != ${GasType} OR SerialNo != ${SerialNo} OR TestDt != ${TestDt} OR TareWT != ${TareWT} OR GrossWT != ${GrossWT} OR Capacity != ${Capacity} OR Press != ${Press} OR Temp != ${Temp} OR Perform != ${Perform}) THEN
      //             UPDATE SET GasType = ${GasType}, SerialNo = ${SerialNo}, TestDt = ${TestDt}, TareWT = ${TareWT}, GrossWT = ${GrossWT}, Capacity = ${Capacity}, Press = ${Press}, Temp = ${Temp}, Perform = ${Perform}, UP_ID = ${ID}, UP_DT = GetDate()
      //         WHEN NOT MATCHED THEN
      //           INSERT (CERTNO, CERTSEQ, GasType, SerialNo, TestDt, TareWT, GrossWT, Capacity, Press, Temp, Perform, IN_ID, UP_ID) VALUES(${
      //             H.CERTNO || CERTNO[0]['']
      //           }, ${i + 1}, ${GasType}, ${SerialNo}, ${TestDt}, ${TareWT}, ${GrossWT}, ${Capacity}, ${Press}, ${Temp}, ${Perform}, ${ID}, ${ID});
      //       `;
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
