const sql = require('mssql');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const config = require('../../lib/configDB');

require('dotenv').config();
require('date-utils');

exports.details = async (req, res) => {
  const path = req.path.split('/')[1];
  const { ct } = req.query;

  try {
    const pool = await sql.connect(config);

    const { recordset: D1 } = await pool.request().input('path', sql.NChar, path).input('ct', sql.NChar, ct).query(`
        SELECT CylnType, Volume, WorkPress, SerialNo, TestDt, Perform FROM [GSVC_${path}_D1]
        WHERE CERTNO = @ct
      `);

    const { recordset: D2 } = await pool.request().input('path', sql.NChar, path).input('ct', sql.NChar, ct).query(`
      SELECT Value FROM [GSVC_${path}_D2]
      WHERE CERTNO = @ct
    `);

    const D1arr = D1.map((item, i) => {
      const { CylnType, Volume, WorkPress, SerialNo, TestDt, Perform } = item;
      return {
        [i]: {
          CylnType,
          Volume,
          WorkPress,
          SerialNo,
          TestDt,
          Perform,
        },
      };
    });
    const D1obj = D1arr.reduce((a, c) => ({ ...a, ...c }), {});

    console.log(D2);
    // const D2arr = D2.map(({  }, i) => ({
    //   [i]: {
    //     Manuf,
    //     Type,
    //     SerialNo,
    //     Remark,
    //   },
    // }));
    // const D2obj = D2arr.reduce((a, c) => ({ ...a, ...c }), {});

    res.json({
      D1: D1obj,
      D2: D2[0].Value,
    });
  } catch (e) {
    console.log(e);
    res.status(500).send();
  }
};

const updateQuery = async (D1, D2, path, CERTNO, CERTDT, VESSELNM, ID) => {
  const pool = await sql.connect(config);
};

exports.inspection = async (req, res) => {
  const path = req.path.split('/')[1];
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1, D2 } = req.body;
  const { VESSELNM, RCVNO } = H;
  const { type } = req.params;
  const CERTDT = new Date().toFormat('YYYYMMDD');

  const pool = await sql.connect(config);

  const { recordset: CERTNO } = await pool.request().query`SELECT dbo.GD_F_NO('CT','002001', ${CERTDT}, ${ID})`;

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    if (type === 'save') {
      const { recordset: magamYn } = await pool.request().input('path', sql.NChar, path).input('RCVNO', sql.NChar, RCVNO).query(`
      SELECT MagamYn FROM GRCV_CT
      WHERE (RcvNo = @RCVNO AND Doc_No = @path)
    `);
      console.log(magamYn, RCVNO, path);
      if (!magamYn[0].MagamYn) {
        await pool.request().input('CERTNO', sql.NChar, CERTNO[0]['']).input('path', sql.NChar, path).input('RCVNO', sql.NChar, RCVNO).query(`
          INSERT GDOC_3 (Cert_NO, Doc_No, Doc_Seq, Seq, IN_ID, UP_ID)
          VALUES (@CERTNO, @path, 1, 1, ${ID}, ${ID})

          UPDATE GRCV_CT SET Cert_No = @CERTNO, MagamYn = 0, IN_ID = ${ID}
          WHERE (RcvNo = @RCVNO AND Doc_No = @path)
        `);
      }

      // 완료한 문서를 임시 저장하면 magam을 다시 0으로
      if (magamYn[0].MagamYn === '1') {
        await pool.request().input('path', sql.NChar, path).input('RCVNO', sql.NChar, RCVNO).query(`
        UPDATE GRCV_CT SET MagamYn = 0, MagamDt = ''
        WHERE (RcvNo = @RCVNO AND Doc_No = @path)
      `);
      }
    } else {
      // complete -> 검사완료 시 GRCV_CT 테이블에 데이터 삽입
      await pool
        .request()
        .input('CERTNO', sql.NChar, H.CERTNO || CERTNO[0][''])
        .input('path', sql.NChar, path)
        .input('RCVNO', sql.NChar, RCVNO).query(`
        UPDATE GRCV_CT SET Cert_No = @CERTNO, MagamYn = 1, MagamDt = ${CERTDT}, UP_ID = ${ID}, UP_DT = getDate()
        WHERE (RcvNo = @RCVNO AND Doc_No = @path)
      `);
    }

    await pool
      .request()
      .input('path', sql.NChar, path)
      .input('CERTNO', sql.NChar, CERTNO[0][''])
      .input('cert_no', sql.NChar, H.CERTNO)
      .input('value', sql.NChar, D2)
      .input('VESSELNM', sql.NChar, VESSELNM).query(`
         MERGE INTO [GSVC_${path}_H]
         USING (values (1)) AS Source (Number)
           ON (CERTNO = @cert_no)
         WHEN MATCHED THEN
           UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
         WHEN NOT MATCHED THEN
           INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES(@CERTNO, ${CERTDT}, @VESSELNM, ${ID}, ${ID});

         MERGE INTO [GSVC_${path}_D2]
         USING (values (1)) AS Source (Number)
           ON (CERTNO = @cert_no)
         WHEN MATCHED THEN
           UPDATE SET Value = @value, UP_ID = ${ID}, UP_DT = getDate()
         WHEN NOT MATCHED THEN
           INSERT (CERTNO, CERTSEQ, Value, IN_ID, UP_ID) VALUES(@CERTNO, 1, @value, ${ID}, ${ID});        

      `);

    let insertDt = moment().format('YYYY-MM-DD HH:mm:ss');

    if (H.CERTNO) {
      const { recordset: insertInfo } = await pool.request().input('CERTNO', sql.NChar, H.CERTNO).input('path', sql.NChar, path).query(`
          SELECT IN_DT FROM [GSVC_${path}_D1]
          WHERE (CERTNO = @CERTNO AND CERTSEQ = 1)
        `);

      insertDt = insertInfo[0].IN_DT;
      console.log(insertDt, new Date(insertDt));
      await pool.request().input('CERTNO', sql.NChar, H.CERTNO).input('path', sql.NChar, path).query(`
          SELECT * FROM [GSVC_${path}_D1] WHERE CERTNO = @CERTNO
  
          BEGIN TRAN
          DELETE FROM [GSVC_${path}_D1] WHERE CERTNO = @CERTNO
          SELECT * FROM [GSVC_${path}_D1] WHERE CERTNO = @CERTNO
          COMMIT TRAN
        `);
    }

    Object.values(D1).forEach(async (v, i) => {
      const TestDt = new Date(v.TestDt).toFormat('YYYY-MM');

      await pool
        .request()
        .input('path', sql.NChar, path)
        .input('CERTNO', sql.NChar, H.CERTNO || CERTNO[0][''])
        .input('CERTSEQ', sql.NChar, i + 1)
        .input('insertDt', sql.DateTimeOffset, insertDt)
        .input('CylnType', sql.NChar, v.CylnType)
        .input('Volume', sql.NChar, v.Volume)
        .input('WorkPress', sql.NChar, v.WorkPress)
        .input('SerialNo', sql.NChar, v.SerialNo)
        .input('TestDt', sql.NChar, TestDt)
        .input('Perform', sql.NChar, v.Perform)
        .input('ID', sql.NChar, ID).query(`
              INSERT [GSVC_${path}_D1] (CERTNO, CERTSEQ, CylnType, Volume, WorkPress, SerialNo, TestDt, Perform, IN_ID, IN_DT, UP_ID)
              VALUES(@CERTNO, @CERTSEQ, @CylnType, @Volume, @WorkPress, @SerialNo, @TestDt, @Perform, @ID, @insertDt, @ID);
      `);
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
