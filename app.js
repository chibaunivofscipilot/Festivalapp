const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs');
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

//inventory
app.get('/inventory',(req,res) => {
res.render('inventory');
});

//sell時の動作
app.post('/sell', (req, res) => {
  const index = parseInt(req.body.index);
  if (items[index] && items[index].stock > 0) {
    items[index].stock -= 1;
    items[index].sold += 1;
    saveData(); // ← ここで保存
  }
  res.redirect('/sales');
});
//取り消し動作(警告音を足すべき)
app.post('/delete-sale', (req, res) => {
  const index = parseInt(req.body.index);
  if (items[index] && items[index].sold > 0) {
    items[index].stock += 1;
    items[index].sold -= 1;
    saveData(); // ← 忘れずに保存
  }
  res.redirect('/sales');
});

// サーバー起動
app.listen(PORT, () => {
console.log(`http://localhost:${PORT} で起動中`);
});