require("dotenv").config();

const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const path = require("path");
const Database = require("better-sqlite3");
const minecraftData = require("minecraft-data");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const VERSION = process.env.MINECRAFT_VERSION || "1.21.4";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password";

if (ADMIN_PASSWORD === "change-this-password") {
  console.warn("WARNUNG: Bitte ADMIN_PASSWORD in deiner .env-Datei ändern!");
}

const db = new Database(path.join(__dirname, "blockmarket.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player TEXT NOT NULL,
    items TEXT NOT NULL,
    note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "30kb" }));
app.use(session({
  secret: process.env.SESSION_SECRET || "development-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

// Separater Admin-Zugang: https://deine-domain.de/admin
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "Nicht angemeldet." });
}

function getCatalogue() {
  const mc = minecraftData(VERSION);
  if (!mc || !mc.items) throw new Error("Minecraft-Daten für Version " + VERSION + " nicht gefunden.");
  return Object.values(mc.items)
    .filter(item => item && item.name && !item.name.startsWith("unknown"))
    .map(item => ({
      id: item.name,
      name: item.displayName || item.name.replace(/_/g, " "),
      stackSize: item.stackSize || 64,
      category: categoryFor(item.name),
      image: `https://mcasset.cloud/${VERSION}/assets/minecraft/textures/item/${item.name}.png`
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function categoryFor(name) {
  if (/sword|axe|pickaxe|shovel|hoe|bow|crossbow|trident|shield|mace|arrow/.test(name)) return "Kampf & Werkzeuge";
  if (/food|beef|pork|chicken|mutton|cod|salmon|bread|apple|carrot|potato|stew|pie|cookie|melon_slice|berries/.test(name)) return "Nahrung";
  if (/redstone|repeater|comparator|piston|observer|hopper|dispenser|dropper|lever|button|pressure_plate|rail|target/.test(name)) return "Redstone";
  if (/helmet|chestplate|leggings|boots|elytra|turtle_helmet/.test(name)) return "Rüstung";
  if (/spawn_egg|bucket|boat|minecart|saddle|lead|name_tag|map|compass|clock|totem/.test(name)) return "Sonstiges";
  if (/flower|sapling|leaves|banner|painting|bed|candle|sign|decorated_pot|armor_stand|item_frame/.test(name)) return "Deko & Natur";
  return "Blöcke & Materialien";
}

let catalogueCache;
app.get("/api/items", (req, res) => {
  try {
    if (!catalogueCache) catalogueCache = getCatalogue();
    res.json({ version: VERSION, items: catalogueCache });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Die Minecraft-Itemliste konnte nicht geladen werden." });
  }
});

app.post("/api/orders", (req, res) => {
  const player = String(req.body.player || "").trim();
  const note = String(req.body.note || "").trim().slice(0, 500);
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  if (!/^[A-Za-z0-9_]{3,16}$/.test(player)) {
    return res.status(400).json({ error: "Bitte einen gültigen Minecraft-Java-Spielernamen (3–16 Zeichen) eingeben." });
  }
  if (!rawItems.length || rawItems.length > 60) return res.status(400).json({ error: "Bitte mindestens einen Artikel auswählen." });

  try {
    if (!catalogueCache) catalogueCache = getCatalogue();
    const allowed = new Map(catalogueCache.map(item => [item.id, item]));
    const cleanItems = [];
    for (const entry of rawItems) {
      const item = allowed.get(String(entry.id || ""));
      const quantity = Number(entry.quantity);
      if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
        return res.status(400).json({ error: "Eine Position in der Bestellung ist ungültig." });
      }
      cleanItems.push({ id: item.id, name: item.name, quantity });
    }
    const result = db.prepare("INSERT INTO orders (player, items, note) VALUES (?, ?, ?)")
      .run(player, JSON.stringify(cleanItems), note);
    res.status(201).json({ ok: true, orderId: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bestellung konnte nicht gespeichert werden." });
  }
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body.password || "");
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Falsches Passwort." });
  req.session.isAdmin = true;
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/me", (req, res) => res.json({ loggedIn: !!(req.session && req.session.isAdmin) }));

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 300").all();
  res.json(rows.map(row => ({ ...row, items: JSON.parse(row.items) })));
});

app.patch("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const status = String(req.body.status || "");
  if (!["accepted", "rejected", "delivered", "pending"].includes(status)) {
    return res.status(400).json({ error: "Ungültiger Bestellstatus." });
  }
  const result = db.prepare("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(status, Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Bestellung nicht gefunden." });
  res.json({ ok: true });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`BLOCKMARKET läuft auf http://localhost:${PORT}`));
