

/* eslint-disable no-undef */
import fs from "fs";
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { Transform } from 'node:stream'
import {book, songs, verses} from './db/schema.js'
import db from './db/db.js';
import { eq, sql, and } from 'drizzle-orm';

const isProduction = process.env.NODE_ENV === "production";
const Port = process.env.PORT || 5173;
const Base = process.env.BASE || "/";

const templateHtml = isProduction
    ? fs.readFileSync("./dist/client/index.html", "utf-8")
    : "";

const ssrManifest = isProduction
    ? await fs.readFile("./dist/client/ssr-manifest.json", "utf-8")
    : undefined;

const app = express();
let vite;

// ? Add vite or respective production middlewares
if (!isProduction) {
    vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "custom",
    });

    app.use(vite.middlewares);
} else {
    const sirv = (await import("sirv")).default;
    const compression = (await import("compression")).default;
    app.use(compression());
    app.use(Base, sirv("./dist/client", {
        extensions: [],
        gzip: true,
    }));
}

app.use("/*", async (req, res, next) => {

  if (req.originalUrl.startsWith("/api/")){
    next();
    return;
  }

    // ! Favicon Fix
    if (req.originalUrl === "/favicon.ico") {
        return res.sendFile(path.resolve("./public/vite.svg"));
    }


    // ! SSR Render - Do not Edit if you don't know what heare whats going on
    let template, render;

    try {
        if (!isProduction) {
            template = fs.readFileSync(path.resolve("./index.html"), "utf-8");
            template = await vite.transformIndexHtml(req.originalUrl, template);
            render = (await vite.ssrLoadModule("/src/entry-server.tsx")).render;
        } else {
            template = templateHtml;
            render = (await import("./dist/server/entry-server.js")).render;
        }

        const rendered = await render({ path: req.originalUrl }, ssrManifest);
        const html = template.replace(`<!--app-html-->`, rendered ?? '');

        res.status(200).setHeader("Content-Type", "text/html").end(html);
    } catch (error) {
        vite.ssrFixStacktrace(error);
        next(error);
    }
});

app.get("/api/GetBooks", async (req, res) => {
  let t = db.select().from(book).all();
  res.json(t);
});




app.post("/api/addHymn", async(req, res) =>{
const body = JSON.parse(await getBody(req));
const {song_id, book_id, title, language, html, text } = body;
    let query = db.insert(songs).values({
      song_id,
      book_id,
      title,
      language,
      html,
      text
    }).onConflictDoNothing();
    const result = await query.execute();
    res.json(result);
})

app.post("/api/addVerse", async(req, res) =>{
  const body = JSON.parse(await getBody(req));
  const {song_id, book_id, verse_id,verse } = body;
      let query = db.insert(songs).values({
        song_id,
        book_id,
        verse_id,
        verse
      }).onConflictDoNothing();
      const result = await query.execute();
      res.json(result);
  })

app.post("/api/updateHymn", async(req, res) => {
let query = await db.update(songs)
.set({ language: 'English' })
.where(sql`${songs.song_id} = 7 and ${songs.book_id} = 1`);
const result = await query.execute();
res.json(result);
})


app.get("/api/getSongs", async (req, res) => {
  let query =  db.select().from(songs)
  .innerJoin(book, eq(songs.book_id, book.book_id));
  
  let where = [];

  let bookname = req.query['book'];
  console.log(bookname);
  if (bookname && bookname.length > 0)
    where.push(eq(book.name, bookname));
  
  let songnumber = req.query['number'];
  if (songnumber && songnumber.length > 0)
    where.push(eq(songs.song_id, songnumber))

  let language = req.query['language'];
  if (language && language.length > 0)
    where.push(eq(songs.language, language))

  if (where.length > 0)
    query = query.where(and(...where));
  
  query = query.orderBy(songs.song_id); 
  res.json(query.all().map(r => r.songs));
});


app.get("/api/getVerse", async (req, res) => {
  let query =  db.select().from(book)
  .innerJoin(songs, eq(songs.book_id, book.book_id))
  .leftJoin(verses, eq(verses.song_id, songs.song_id));

  let where = [];

  let bookname = req.query['book'];
  console.log(bookname);
  if (bookname && bookname.length > 0)
    where.push(eq(book.name, bookname));

  let songnumber = req.query['number'];
  if (songnumber && songnumber.length > 0)
    where.push(eq(songs.song_id, songnumber))

  query = query.where(and(...where)).orderBy(verses.song_id); 
  res.json(query.all().map(r => ({...r.verses, songtitle: r.songs.title }) ));
});



// ? Start http server
app.listen(Port, () => {
    console.log(`Server running on http://localhost:${Port}`);
});

// function:
function getBody(request) {
  return new Promise((resolve) => {
    const bodyParts = [];
    let body;
    request.on('data', (chunk) => {
      bodyParts.push(chunk);
    }).on('end', () => {
      body = Buffer.concat(bodyParts).toString();
      resolve(body)
    });
  });
}