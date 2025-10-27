const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs');
const http = require('http');
const socketIO = require('socket.io');
const app = express();
const server = http.createServer(app); // ← appをhttpサーバー化
const io = socketIO(server);           // ← Socket.IOを紐づけ
const PORT = 3000;

// writeLog関数定義（ログファイルに操作記録を書き込む）
function writeLog(user, message) {
  const logPath = path.join(__dirname, 'operation.log');
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [ユーザー: ${user.username || user}] ${message}\n`;
  fs.appendFile(logPath, logMessage, (err) => {
    if (err) {
      console.error('ログ書き込みエラー:', err);
    }
  });
}

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

// 認証チェックミドルウェア
function requireLogin(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
}

// データベース読み込み関数
let items = [];
function loadData() {
  const data = fs.readFileSync('Datebase.json', 'utf8');
  items = JSON.parse(data);
}
// データベース書き出し関数
function saveData() {
  fs.writeFileSync('Datebase.json', JSON.stringify(items, null, 2));
}
// 初回ロード
loadData();

// --- ルーティング ---
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
    writeLog(user, 'ログインしました');
    res.redirect('/');
  } else {
    res.render('login', { error: 'ユーザー名またはパスワードが違います' });
  }
});

// ログアウト
app.get('/logout', (req, res) => {
  if(req.session.user) {
    writeLog(req.session.user, 'ログアウトしました');
  }
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// ホームページ（ログイン必須）
app.get('/', requireLogin, (req, res) => {
  res.render('Home', { user: req.session.user });
});

// 売上管理ページ（ログイン必須）
app.get('/sales-home', requireLogin, (req, res) => {
  res.render('sales-home', { items, user: req.session.user, title: "売上管理" });
});

// 売る処理（ログイン必須、ログも書き込み）
app.post('/sell', requireLogin, (req, res) => {
  const index = parseInt(req.body.index);
  const user = req.session.user || { username: '不明なユーザー' };

  if (index >= 0 && index < items.length) {
    if (items[index].stock > 0) {
      items[index].stock--;
      items[index].sold++;
      saveData();

      writeLog(user, `販売: 商品「${items[index].name}」が1つ売れました。残在庫: ${items[index].stock}`);
    } else {
      writeLog(user, `販売失敗: 商品「${items[index].name}」の在庫がありません。`);
    }
  }
  res.redirect('/sales-home');
});

// 取り消し処理（ログイン必須、ログも書き込み）
app.post('/delete-sale', requireLogin, (req, res) => {
  const index = parseInt(req.body.index);
  const user = req.session.user || { username: '不明なユーザー' };

  if (index >= 0 && index < items.length) {
    if (items[index].sold > 0) {
      items[index].stock++;
      items[index].sold--;
      saveData();

      writeLog(user, `取り消し: 商品「${items[index].name}」の販売を1つ取り消しました。現在の在庫: ${items[index].stock}`);
    } else {
      writeLog(user, `取り消し失敗: 商品「${items[index].name}」の売上がありません。`);
    }
  }
  res.redirect('/sales-home');
});

// 在庫編集ページ表示
app.get('/inventory', requireLogin, (req, res) => {
  res.render('inventory', { items, user: req.session.user });
});

// 在庫数更新処理（POST）
app.post('/inventory/update', requireLogin, (req, res) => {
  const index = parseInt(req.body.index);
  const newStock = parseInt(req.body.stock);
  const user = req.session.user || { username: '不明なユーザー' };

  if (!isNaN(index) && !isNaN(newStock) && index >= 0 && index < items.length) {
    const oldStock = items[index].stock;
    items[index].stock = newStock;
    saveData();

    // ログ記録
    writeLog(user, `在庫編集: 商品「${items[index].name}」の在庫を ${oldStock} → ${newStock} に変更`);
  } else {
    writeLog(user, `在庫編集失敗: index=${index}, stock=${newStock}（無効な入力）`);
  }

  res.redirect('/inventory');
});

// ===== Socket.IO設定 =====
const logPath = path.join(__dirname, 'operation.log');
let lastNotifySize = 0;

io.on("connection", (socket) => {
  console.log("通知ページにクライアントが接続しました");
  socket.on("disconnect", () => console.log("クライアントが切断しました"));
});

// operation.log の更新監視
fs.watchFile(logPath, (curr, prev) => {
  const newSize = curr.size;
  if (newSize > lastNotifySize) {   // ← ここを lastNotifySize に
    const stream = fs.createReadStream(logPath, {
      start: lastNotifySize,        // ← ここも lastNotifySize
      end: newSize,
      encoding: "utf8"
    });

    let newContent = "";
    stream.on("data", chunk => {
      newContent += chunk;
    });

    stream.on("end", () => {
      io.emit("newLog", { message: newContent.trim() });
    });

    lastNotifySize = newSize;       // ← 更新も lastNotifySize
  }
});

//通知
app.get("/notification", (req, res) => {
  const logPath = path.join(__dirname, "operation.log");

  // logs を初期化
  let logs = [];

  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, "utf8").trim();

    logs = content.split("\n").map(line => {
      const match = line.match(/^\[(.+?)\] \[ユーザー: (.+?)\] (.+)$/);
      if (match) {
        const [, time, user, message] = match;
        return { time, user, message };
      } else {
        return { time: "", user: "", message: line };
      }
    });
  }

  res.render("notification", { logs });
});

// サーバー起動
server.listen(PORT, () => {
  console.log(`http://localhost:${PORT} で起動中`);
});