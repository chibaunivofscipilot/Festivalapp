const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const PORT = 3000;

// ミドルウェア設定
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ルートページ
app.get('/', (req, res) => {
  res.render('Home');
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT} で起動中`);
});