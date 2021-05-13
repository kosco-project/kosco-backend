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
        SELECT Ins1, Ins2, Ins3, Ins4, Ins5, Ins6, Ins7 FROM [GSVC_${path}_D1]
        WHERE CERTNO = @ct
      `);

    const { recordset: D2 } = await pool.request().input('path', sql.NChar, path).input('ct', sql.NChar, ct).query(`
      SELECT Manuf, Type, SerialNo, Remark FROM [GSVC_${path}_D2]
      WHERE CERTNO = @ct
    `);

    const { recordset: D3 } = await pool.request().input('path', sql.NChar, path).input('ct', sql.NChar, ct).query(`
      SELECT Value FROM [GSVC_${path}_D3]
      WHERE CERTNO = @ct
    `);

    const D1arr = D1.map((item, i) => {
      const { Ins1, Ins2, Ins3, Ins4, Ins5, Ins6, Ins7 } = item;
      return {
        [i]: {
          ins1: +Ins1,
          ins2: +Ins2,
          ins3: +Ins3,
          ins4: +Ins4,
          ins5: +Ins5,
          ins6: +Ins6,
          ins7: +Ins7,
        },
      };
    });
    const D1obj = D1arr.reduce((a, c) => ({ ...a, ...c }), {});

    const D2arr = D2.map(({ Manuf, Type, SerialNo, Remark }, i) => ({
      [i]: {
        Manuf,
        Type,
        SerialNo,
        Remark,
      },
    }));
    const D2obj = D2arr.reduce((a, c) => ({ ...a, ...c }), {});

    res.json({
      D1: D1obj,
      D2: D2obj,
      D3: D3[0].Value,
    });
  } catch (e) {
    console.log(e);
    res.status(500).send();
  }
};

exports.inspection = async (req, res) => {
  const path = req.path.split('/')[1];
  const token = req.headers.authorization.slice(7);
  const ID = jwt.decode(token).userId;
  const { H, D1, D2, D3 } = req.body;
  const { type } = req.params;
  const { VESSELNM, RCVNO } = H;
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
      .input('value', sql.NChar, D3)
      .input('VESSELNM', sql.NChar, VESSELNM).query(`
      MERGE INTO [GSVC_${path}_H]
        USING (values (1)) AS Source (Number)
          ON (CERTNO = @cert_no)
        WHEN MATCHED THEN
          UPDATE SET UP_ID = ${ID}, UP_DT = getDate()
        WHEN NOT MATCHED THEN
          INSERT (CERTNO, CERTDT, VESSELNM, IN_ID, UP_ID) VALUES(@CERTNO, ${CERTDT}, @VESSELNM, ${ID}, ${ID});

      MERGE INTO [GSVC_${path}_D3]
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

        SELECT * FROM [GSVC_${path}_D2] WHERE CERTNO = @CERTNO

        BEGIN TRAN
        DELETE FROM [GSVC_${path}_D2] WHERE CERTNO = @CERTNO
        SELECT * FROM [GSVC_${path}_D2] WHERE CERTNO = @CERTNO
        COMMIT TRAN
      `);
    }

    Object.values(D1).forEach(async (v, i) => {
      await pool
        .request()
        .input('path', sql.NChar, path)
        .input('CERTNO', sql.NChar, H.CERTNO || CERTNO[0][''])
        .input('CERTSEQ', sql.NChar, i + 1)
        .input('insertDt', sql.DateTimeOffset, insertDt)
        .input('ins1', sql.NChar, v.ins1)
        .input('ins2', sql.NChar, v.ins2)
        .input('ins3', sql.NChar, v.ins3)
        .input('ins4', sql.NChar, v.ins4)
        .input('ins5', sql.NChar, v.ins5)
        .input('ins6', sql.NChar, v.ins6)
        .input('ins7', sql.NChar, v.ins7)
        .input('ins8', sql.NChar, v.ins8).query(`
            INSERT [GSVC_${path}_D1] (CERTNO, CERTSEQ, ins1, ins2, ins3, ins4, ins5, ins6, ins7, ins8, IN_ID, IN_DT, UP_ID)
            VALUES(@CERTNO, @CERTSEQ, @ins1, @ins2, @ins3, @ins4, @ins5, @ins6, @ins7, @ins8, ${ID}, @insertDt, ${ID});
      `);
    });

    Object.values(D2).forEach(async (v, i) => {
      await pool
        .request()
        .input('path', sql.NChar, path)
        .input('CERTNO', sql.NChar, H.CERTNO || CERTNO[0][''])
        .input('insertDt', sql.DateTimeOffset, insertDt)
        .input('CERTSEQ', sql.NChar, i + 1)
        .input('Manuf', sql.NChar, v.Manuf)
        .input('Type', sql.NChar, v.Type)
        .input('SerialNo', sql.NChar, v.SerialNo)
        .input('Remark', sql.NChar, v.Remark).query(`
            INSERT [GSVC_${path}_D2] (CERTNO, CERTSEQ, Manuf, Type, SerialNo, Remark, IN_ID, IN_DT, UP_ID)
            VALUES (@CERTNO, @CERTSEQ, @Manuf, @Type, @SerialNo, @Remark, ${ID}, @insertDt, ${ID});
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
