// require === import

// node_modules에서 express 모듈을 활용한다.
const express = require('express');

// app에 express 함수의 반환 값을 저장
// 이 app이라는 변수로 REST End Point들을 생성하게 된다.
// End Point === 'api/post'같은 url
const app = express();

// dotenv를 불러오는 방법
require('dotenv').config();

// process.env는 환경 변수를 가져올때 사용된다.
// 환경 변수가 없을 경우 기본값은 3050 포트
const port = process.env.PORT || 3050;

// 서버에 변수를 만듦 port = 3000
app.set('port', 3000);

// const api = require('./api');

// end point 생성
/*
end point를 생성할때는 두 개의 파라미터를 받는다.
첫 번째는 url 정의, 두 번째는 함수 => 요청에 해당하는 req, 응답에 해당하는 res 정보 송신
*/
// app.get('/', (req, res) => {
//   // res 파라미터에 json 형태의 객체를 전송하는 코드이다.
//   res.json({
//     success: true,
//   });
// });

// app.use('/api', api);

// express 서버를 실행할 때 필요한 포트 정의와 실행 시 callback 함수를 받는다.
app.listen(port, () => {
  console.log(`server is listening at localhost:${process.env.PORT}`);
});
