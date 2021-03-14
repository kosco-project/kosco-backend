// require === import
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const api = require('./api');
const { JsonWebTokenError } = require('jsonwebtoken');

require('dotenv').config();
// node_modules에서 express 모듈을 활용한다.

// app에 express 함수의 반환 값을 저장
// 이 app이라는 변수로 REST End Point들을 생성하게 된다.
// End Point === 'api/post'같은 url
const app = express();

// morgan = 요청과 응답을 기록

// 개발시엔 dev, 실무에선 combined(더 자세함)
app.use(morgan('dev'));

// dotenv를 불러오는 방법
require('dotenv').config();

// 서버에 변수를 만듦 port = 3000
app.set('port', process.env.PORT || 3050);

// 클라이언트에서 json data를 보냈을 때 json body를 파싱해서 req body로 넣어준다.
app.use(express.json());
// urlencoded = form 파싱
app.use(express.urlencoded({ extended: true })); // true면 qs, false면 querystring
app.use(cookieParser(process.env.COOKIE_ID));

// session 기본 설정
// app.use(
//   session({
//     resave: false,
//     saveUninitialized: true,
//     secret: process.env.SESSION_ID,
//     cookie: {
//       httpOnly: true,
//     },
//   })
// );

app.use('/api', api);
app.use(express.static(path.join(__dirname, 'public')));

// express 서버를 실행할 때 필요한 포트 정의와 실행 시 callback 함수를 받는다.
app.listen(app.get('port'), () => {
  console.log(`http://localhost:${app.get('port')}`);
});
