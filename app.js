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


// ===== Database.json（商品データ） =====
let items = [];
function loadData() {
  const data = fs.readFileSync('Database.json', 'utf8');
  items = JSON.parse(data);
}
function saveData() {
  fs.writeFileSync('Database.json', JSON.stringify(items, null, 2));
}
loadData();

// ===== Order.json（注文データ） =====
let order = [];
function loadOrder() {
  const data = fs.readFileSync('Order.json', 'utf8');
  order = JSON.parse(data);
}
function saveOrder() {
  fs.writeFileSync('Order.json', JSON.stringify(order, null, 2));
}
loadOrder();

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


app.post('/sell', requireLogin, (req, res) => {
  const index = parseInt(req.body.index);
  const user = req.session.user || { username: '不明なユーザー' };

  // --- 入力チェック ---
  if (index < 0 || index >= items.length) {
    writeLog(user, `販売失敗: 無効な商品インデックス (${index})`);
    return res.redirect('/sales-home');
  }

  const item = items[index];

  // --- 在庫チェック ---
  if (item.stock <= 0) {
    writeLog(user, `販売失敗: 商品「${item.name}」の在庫がありません`);
    return res.redirect('/sales-home');
  }

  // --- ① Datebase.jsonを更新 ---
  item.stock--;
  item.sold++;
  saveData(); // ← Datebase.json保存

  // --- ② Order.jsonを更新（Orderを1減らす）---
  try {
    const orderData = JSON.parse(fs.readFileSync('Order.json', 'utf8'));

    // 同じ商品名を探す
    const target = orderData.find(p => p.name === item.name);

    if (target) {
      if (target.Order >= 0) {
        target.Order++;
        fs.writeFileSync('Order.json', JSON.stringify(orderData, null, 2));
        writeLog(user, `販売成功: ${item.name} の注文数を1減らしました（残り ${target.Order}）`);
      } else {
        writeLog(user, `販売成功: ${item.name} は販売されたが、注文数は既に0`);
      }
    } else {
      writeLog(user, `販売成功: ${item.name} は販売されたが、Order.jsonに該当商品が存在しません`);
    }

  } catch (err) {
    console.error('Order.json書き込みエラー:', err);
    writeLog(user, `販売: 商品「${item.name}」は売れたが、Order.json更新に失敗`);
  }

  // --- 完了後、ホームへ戻る ---
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
  if (newSize > lastNotifySize) {
    const stream = fs.createReadStream(logPath, {
      start: lastNotifySize,
      end: newSize,
      encoding: "utf8"
    });

    let newContent = "";
    stream.on("data", chunk => {
      newContent += chunk;
    });

    stream.on("end", () => {
      // 改行ごとに分割して配信
      const newLines = newContent.trim().split("\n").filter(l => l.length > 0);
      newLines.forEach(line => {
        const match = line.match(/^\[(.+?)\] \[ユーザー: (.+?)\] (.+)$/);
        if (match) {
          const [, time, user, message] = match;
          io.emit("newLog", { time, user, message });
        } else {
          io.emit("newLog", { time: "", user: "", message: line });
        }
      });
    });

    lastNotifySize = newSize;
  }
});


// ===== /notification（GET：画面表示）=====
app.get("/notification", (req, res) => {
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
  res.render("notification", { items, order, logs });
});


// ===== /notification（POST：販売操作）=====
app.post("/notification", (req, res) => {
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

  // ページ再読み込みではなく、Socket.IOで即座に反映される
  res.redirect("/notification");
});

// ===== 焼き上がり処理 =====
app.post('/complete', requireLogin, (req, res) => {
  const index = parseInt(req.body.index);
  const user = req.session.user || { username: '不明なユーザー' };

  if (index >= 0 && index < order.length) {
    if (order[index].Order > 0) {
      order[index].Order--;
      saveOrder();
      writeLog(user, `焼き上がり: 商品「${order[index].name}」が完成しました。残り注文: ${order[index].order}`);
    } else {
      writeLog(user, `焼き上がり失敗: 商品「${order[index].name}」の注文がありません。`);
    }
  }
  res.redirect('/notification');
});

// サーバー起動
server.listen(PORT, () => {
  console.log(`http://localhost:${PORT} で起動中`);
});