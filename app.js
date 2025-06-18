const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs');
const app = express();
const PORT = 3000;

// ミドルウェア
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: false
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

// ログインページ
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// ログイン処理
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
  const user = users.find(u => u.username === username && u.password === password);
  
  if (user) {
    req.session.user = user;
    res.redirect('/');
  } else {
    res.render('login', { error: 'ユーザー名またはパスワードが違います' });
  }
});

// ログアウト
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// 認証チェックミドルウェア
function requireLogin(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
}

//データベース読み込み関数
let items = [];

function loadData() {
  const data = fs.readFileSync('Datebase.json', 'utf8');
  items = JSON.parse(data);
}
//データベースの書き出し関数
function saveData() {
  fs.writeFileSync('Datebase.json', JSON.stringify(items, null, 2));
}

//データベースの読み込み
loadData();


// ミドルウェア設定
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// ログイン後にアクセスできるページ例
app.get('/', requireLogin, (req, res) => {
  res.render('Home', { user: req.session.user });
});


//inventory
app.get('/inventory',(req,res) => {
res.render('inventory');
});

//売り上げ管理ページ
app.get('/sales-home', (req, res) => {
  res.render('sales-home', { items }); 
});

//sell時の動作
app.post('/sell', (req, res) => {
  const index = parseInt(req.body.index);
  if (items[index] && items[index].stock > 0) {
    items[index].stock -= 1;
    items[index].sold += 1;
    saveData(); // ← ここで保存
  }
  res.redirect('/sales-home');
});
//取り消し動作(警告音を足すべき)
app.post('/delete-sale', (req, res) => {
  const index = parseInt(req.body.index);
  if (items[index] && items[index].sold > 0) {
    items[index].stock += 1;
    items[index].sold -= 1;
    saveData(); // ← 忘れずに保存
  }
  res.redirect('/sales-home');
});

// サーバー起動
app.listen(PORT, () => {
console.log(`http://localhost:${PORT} で起動中`);
});